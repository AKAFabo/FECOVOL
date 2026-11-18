-- Arbitraje (RF-ARB): cursos, acreditaciones, designaciones y el entorno del cuerpo arbitral.
--
-- Las tablas de cursos y acreditaciones ya existían en la base (se crearon desde el editor SQL el
-- 16 nov 2026) pero no en el repositorio: aquí se dejan con CREATE ... IF NOT EXISTS para que una
-- base nueva quede igual y para que esta migración no cambie nada en la que ya las tiene.
--
-- Todas las tablas tienen RLS activado y ninguna política: solo el backend (service_role) las lee
-- y escribe. Las escrituras pasan por procedimientos que fijan app.current_user para la bitácora.

-- ─── Tablas ──────────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referee_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    course_type VARCHAR NOT NULL CHECK (course_type IN ('FORMACION_INICIAL', 'ACTUALIZACION_ANUAL', 'ASCENSO_NIVEL')),
    modality_value_id UUID REFERENCES public.catalog_values(id),
    format VARCHAR NOT NULL DEFAULT 'PRESENCIAL' CHECK (format IN ('PRESENCIAL', 'VIRTUAL', 'MIXTO')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    venue VARCHAR,
    capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
    instructor_person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
    passing_grade NUMERIC NOT NULL DEFAULT 70 CHECK (passing_grade >= 0 AND passing_grade <= 100),
    content TEXT,
    enrollment_opens DATE,
    enrollment_closes DATE,
    enrollment_open BOOLEAN NOT NULL DEFAULT true,
    only_current_accreditation BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR NOT NULL DEFAULT 'PUBLICADO' CHECK (status IN ('PUBLICADO', 'CERRADO', 'CANCELADO')),
    created_by VARCHAR,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_referee_courses_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_referee_courses_enrollment CHECK (enrollment_opens IS NULL OR enrollment_closes IS NULL OR enrollment_closes >= enrollment_opens)
);

CREATE TABLE IF NOT EXISTS public.referee_course_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.referee_courses(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    grade NUMERIC CHECK (grade IS NULL OR (grade >= 0 AND grade <= 100)),
    result VARCHAR NOT NULL DEFAULT 'INSCRITO' CHECK (result IN ('INSCRITO', 'APROBADO', 'REPROBADO', 'AUSENTE')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (course_id, person_id)
);

CREATE TABLE IF NOT EXISTS public.referee_accreditations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    function_value_id UUID NOT NULL REFERENCES public.catalog_values(id),
    level_value_id UUID NOT NULL REFERENCES public.catalog_values(id),
    modality VARCHAR NOT NULL DEFAULT 'SALA' CHECK (modality IN ('SALA', 'PLAYA', 'SALA_PLAYA')),
    category_value_id UUID REFERENCES public.catalog_values(id),
    valid_from DATE NOT NULL,
    valid_until DATE NOT NULL,
    course_enrollment_id UUID REFERENCES public.referee_course_enrollments(id) ON DELETE SET NULL,
    practical_evaluation VARCHAR NOT NULL DEFAULT 'PENDIENTE' CHECK (practical_evaluation IN ('APROBADA', 'REPROBADA', 'PENDIENTE')),
    physical_test VARCHAR NOT NULL DEFAULT 'PENDIENTE' CHECK (physical_test IN ('APROBADA', 'REPROBADA', 'PENDIENTE')),
    certificate_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    medical_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    status VARCHAR NOT NULL DEFAULT 'ACTIVA' CHECK (status IN ('ACTIVA', 'REEMPLAZADA', 'REVOCADA')),
    notes TEXT,
    created_by VARCHAR,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_referee_accreditations_dates CHECK (valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_referee_courses_start ON public.referee_courses (start_date);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_person ON public.referee_course_enrollments (person_id);
CREATE INDEX IF NOT EXISTS idx_referee_accreditations_person ON public.referee_accreditations (person_id);
CREATE INDEX IF NOT EXISTS idx_referee_accreditations_until ON public.referee_accreditations (valid_until);
-- Una sola acreditación activa por persona.
CREATE UNIQUE INDEX IF NOT EXISTS uq_referee_accreditation_active ON public.referee_accreditations (person_id) WHERE status = 'ACTIVA';

-- Una cuenta de usuario corresponde a lo sumo a una persona del padrón (el árbitro ve SU ficha y
-- SUS designaciones a partir de este vínculo).
CREATE UNIQUE INDEX IF NOT EXISTS uq_persons_user_id ON public.persons (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.referee_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referee_course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referee_accreditations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS audit_referee_courses ON public.referee_courses;
CREATE TRIGGER audit_referee_courses AFTER INSERT OR UPDATE OR DELETE ON public.referee_courses
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();
DROP TRIGGER IF EXISTS audit_referee_course_enrollments ON public.referee_course_enrollments;
CREATE TRIGGER audit_referee_course_enrollments AFTER INSERT OR UPDATE OR DELETE ON public.referee_course_enrollments
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();
DROP TRIGGER IF EXISTS audit_referee_accreditations ON public.referee_accreditations;
CREATE TRIGGER audit_referee_accreditations AFTER INSERT OR UPDATE OR DELETE ON public.referee_accreditations
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();

-- ─── Vista del cuerpo arbitral ───────────────────────────────────────────────────────────────
-- Una fila por persona con el rol ARBITRO activo, con su acreditación activa (si tiene) y el
-- estado que ve FECOVOL: al día, por vencer (30 días o menos), vencida o sin acreditación.
-- security_invoker: quien la consulta necesita permiso sobre las tablas de base (con RLS y sin
-- políticas, solo el backend).
CREATE OR REPLACE VIEW public.v_cuerpo_arbitral WITH (security_invoker = true) AS
SELECT
    p.id AS person_id,
    p.first_name,
    p.last_name,
    p.document_number,
    p.province,
    p.email,
    p.phone,
    p.status AS persona_status,
    p.association_id,
    aso.name AS asociacion_name,
    aso.short_name AS asociacion_short_name,
    (p.user_id IS NOT NULL) AS tiene_cuenta,
    a.id AS accreditation_id,
    fn.code AS funcion_code,
    fn.value AS funcion_value,
    lv.code AS nivel_code,
    lv.value AS nivel_value,
    a.modality,
    cat.code AS categoria_code,
    cat.value AS categoria_value,
    a.valid_from,
    a.valid_until,
    CASE
        WHEN a.id IS NULL THEN 'SIN_ACREDITACION'
        WHEN a.valid_until < CURRENT_DATE THEN 'VENCIDA'
        WHEN a.valid_until <= CURRENT_DATE + 30 THEN 'POR_VENCER'
        ELSE 'AL_DIA'
    END AS estado,
    COALESCE(t.partidos, 0)::int AS partidos_temporada
FROM public.person_roles pr
JOIN public.persons p ON p.id = pr.person_id
LEFT JOIN public.associations aso ON aso.id = p.association_id
LEFT JOIN public.referee_accreditations a ON a.person_id = p.id AND a.status = 'ACTIVA'
LEFT JOIN public.catalog_values fn ON fn.id = a.function_value_id
LEFT JOIN public.catalog_values lv ON lv.id = a.level_value_id
LEFT JOIN public.catalog_values cat ON cat.id = a.category_value_id
LEFT JOIN LATERAL (
    SELECT count(*) AS partidos
    FROM public.referee_assignments ra
    JOIN public.matches m ON m.id = ra.match_id
    WHERE ra.person_id = p.id
      AND ra.status IN ('CONFIRMADA', 'CUMPLIDA')
      AND date_part('year', m.scheduled_date) = date_part('year', CURRENT_DATE)
) t ON true
WHERE pr.role_type = 'ARBITRO' AND pr.is_active;

REVOKE ALL ON public.v_cuerpo_arbitral FROM anon, authenticated;

-- ─── Acreditar ───────────────────────────────────────────────────────────────────────────────
-- Reemplaza la acreditación activa de la persona. Exige curso aprobado, evaluación práctica y
-- prueba física aprobadas; los documentos de respaldo (certificado del curso, constancia médica)
-- tienen que ser de la persona, del tipo correcto y no estar rechazados ni vencidos. Al acreditar,
-- FECOVOL da esos documentos por revisados. Si la persona ya tiene cuenta, recibe el rol Arbitro.
CREATE OR REPLACE FUNCTION public.sp_accredit_referee_v2(
    p_person_id UUID,
    p_function_code VARCHAR,
    p_level_code VARCHAR,
    p_modality VARCHAR,
    p_category_code VARCHAR,
    p_valid_from DATE,
    p_valid_until DATE,
    p_course_enrollment_id UUID,
    p_practical_evaluation VARCHAR,
    p_physical_test VARCHAR,
    p_certificate_document_id UUID,
    p_medical_document_id UUID,
    p_notes TEXT,
    p_admin_user VARCHAR
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id UUID;
    v_user_id UUID;
    v_role_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT user_id INTO v_user_id FROM public.persons WHERE id = p_person_id AND status = 'ACTIVA' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe una persona activa con id %', p_person_id;
    END IF;

    IF p_valid_until <= p_valid_from THEN
        RAISE EXCEPTION 'La fecha de vencimiento debe ser posterior a la fecha de inicio';
    END IF;
    IF p_valid_until < CURRENT_DATE THEN
        RAISE EXCEPTION 'La acreditación no puede registrarse ya vencida';
    END IF;
    IF p_modality NOT IN ('SALA', 'PLAYA', 'SALA_PLAYA') THEN
        RAISE EXCEPTION 'Modalidad no válida: %', p_modality;
    END IF;

    IF p_course_enrollment_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.referee_course_enrollments
        WHERE id = p_course_enrollment_id AND person_id = p_person_id AND result = 'APROBADO'
    ) THEN
        RAISE EXCEPTION 'Indique un curso que esta persona haya aprobado';
    END IF;

    IF p_practical_evaluation <> 'APROBADA' OR p_physical_test <> 'APROBADA' THEN
        RAISE EXCEPTION 'La evaluación práctica y la prueba física deben estar aprobadas';
    END IF;

    IF p_certificate_document_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.documents d
        JOIN public.catalog_values v ON v.id = d.document_type_value_id
        WHERE d.id = p_certificate_document_id AND d.person_id = p_person_id
          AND v.code = 'CUR' AND d.status IN ('EN_REVISION', 'VIGENTE')
    ) THEN
        RAISE EXCEPTION 'El certificado del curso no es de esta persona o no está vigente';
    END IF;

    IF p_medical_document_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.documents d
        JOIN public.catalog_values v ON v.id = d.document_type_value_id
        WHERE d.id = p_medical_document_id AND d.person_id = p_person_id
          AND v.code = 'MED' AND d.status IN ('EN_REVISION', 'VIGENTE')
          AND (d.expiry_date IS NULL OR d.expiry_date >= CURRENT_DATE)
    ) THEN
        RAISE EXCEPTION 'La constancia médica no es de esta persona o no está vigente';
    END IF;

    UPDATE public.documents
    SET status = 'VIGENTE', reviewed_by = p_admin_user, reviewed_at = NOW(), updated_at = NOW()
    WHERE id IN (p_certificate_document_id, p_medical_document_id) AND status = 'EN_REVISION';

    UPDATE public.referee_accreditations
    SET status = 'REEMPLAZADA', updated_at = NOW()
    WHERE person_id = p_person_id AND status = 'ACTIVA';

    INSERT INTO public.referee_accreditations (
        person_id, function_value_id, level_value_id, modality, category_value_id,
        valid_from, valid_until, course_enrollment_id, practical_evaluation, physical_test,
        certificate_document_id, medical_document_id, notes, created_by
    ) VALUES (
        p_person_id,
        public.fn_catalog_value_id('Tipos de oficial', p_function_code),
        public.fn_catalog_value_id('Niveles arbitrales', p_level_code),
        p_modality,
        CASE WHEN p_category_code IS NULL THEN NULL ELSE public.fn_catalog_value_id('Categorías', p_category_code) END,
        p_valid_from, p_valid_until, p_course_enrollment_id, p_practical_evaluation, p_physical_test,
        p_certificate_document_id, p_medical_document_id, p_notes, p_admin_user
    ) RETURNING id INTO v_id;

    INSERT INTO public.person_roles (person_id, role_type, is_active)
    VALUES (p_person_id, 'ARBITRO', true)
    ON CONFLICT (person_id, role_type) DO UPDATE SET is_active = true;

    IF v_user_id IS NOT NULL THEN
        SELECT id INTO v_role_id FROM public.roles WHERE lower(name) IN ('arbitro', 'árbitro') LIMIT 1;
        IF v_role_id IS NOT NULL THEN
            INSERT INTO public.user_roles (user_id, role_id) VALUES (v_user_id, v_role_id) ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    RETURN v_id;
END;
$$;

-- ─── Cuenta del árbitro ──────────────────────────────────────────────────────────────────────
-- Vincula una cuenta de usuario con la persona del padrón y le da el rol Arbitro. Falla si la
-- persona ya tiene otra cuenta o si la cuenta ya está vinculada con otra persona.
CREATE OR REPLACE FUNCTION public.sp_link_referee_account(
    p_person_id UUID,
    p_user_id UUID,
    p_admin_user VARCHAR
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actual UUID;
    v_role_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT user_id INTO v_actual FROM public.persons WHERE id = p_person_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la persona %', p_person_id;
    END IF;
    IF v_actual IS NOT NULL AND v_actual <> p_user_id THEN
        RAISE EXCEPTION 'La persona ya tiene otra cuenta vinculada';
    END IF;
    IF EXISTS (SELECT 1 FROM public.persons WHERE user_id = p_user_id AND id <> p_person_id) THEN
        RAISE EXCEPTION 'La cuenta ya está vinculada con otra persona del padrón';
    END IF;

    UPDATE public.persons SET user_id = p_user_id, updated_at = NOW() WHERE id = p_person_id;

    SELECT id INTO v_role_id FROM public.roles WHERE lower(name) IN ('arbitro', 'árbitro') LIMIT 1;
    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'No existe el rol Arbitro';
    END IF;
    INSERT INTO public.user_roles (user_id, role_id) VALUES (p_user_id, v_role_id) ON CONFLICT DO NOTHING;
END;
$$;

-- ─── Cursos ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sp_create_referee_course(
    p_name VARCHAR,
    p_course_type VARCHAR,
    p_modality_code VARCHAR,
    p_format VARCHAR,
    p_start_date DATE,
    p_end_date DATE,
    p_venue VARCHAR,
    p_capacity INTEGER,
    p_instructor_person_id UUID,
    p_passing_grade NUMERIC,
    p_content TEXT,
    p_enrollment_opens DATE,
    p_enrollment_closes DATE,
    p_enrollment_open BOOLEAN,
    p_only_current_accreditation BOOLEAN,
    p_admin_user VARCHAR
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF p_instructor_person_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.persons WHERE id = p_instructor_person_id AND status = 'ACTIVA'
    ) THEN
        RAISE EXCEPTION 'No existe una persona activa para el instructor';
    END IF;
    IF p_enrollment_closes IS NOT NULL AND p_enrollment_closes > p_end_date THEN
        RAISE EXCEPTION 'La inscripción debe cerrar a más tardar el último día del curso';
    END IF;

    INSERT INTO public.referee_courses (
        name, course_type, modality_value_id, format, start_date, end_date, venue, capacity,
        instructor_person_id, passing_grade, content, enrollment_opens, enrollment_closes,
        enrollment_open, only_current_accreditation, created_by
    ) VALUES (
        p_name, p_course_type,
        CASE WHEN p_modality_code IS NULL THEN NULL ELSE public.fn_catalog_value_id('Modalidades', p_modality_code) END,
        p_format, p_start_date, p_end_date, p_venue, p_capacity,
        p_instructor_person_id, p_passing_grade, p_content, p_enrollment_opens, p_enrollment_closes,
        COALESCE(p_enrollment_open, true), COALESCE(p_only_current_accreditation, false), p_admin_user
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Inscribe a una persona. FECOVOL puede inscribir aunque la inscripción en línea esté cerrada
-- (p_por_fecovol); el propio árbitro solo dentro del periodo abierto. Siempre se respetan el cupo
-- y la regla de acreditación vigente. El curso se bloquea mientras tanto para que dos
-- inscripciones simultáneas no pasen el cupo.
CREATE OR REPLACE FUNCTION public.sp_enroll_referee_course(
    p_course_id UUID,
    p_person_id UUID,
    p_por_fecovol BOOLEAN,
    p_admin_user VARCHAR
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_curso public.referee_courses%ROWTYPE;
    v_inscritos INTEGER;
    v_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT * INTO v_curso FROM public.referee_courses WHERE id = p_course_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe el curso %', p_course_id;
    END IF;
    IF v_curso.status <> 'PUBLICADO' THEN
        RAISE EXCEPTION 'El curso no admite inscripciones (está %)', lower(v_curso.status);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_person_id AND status = 'ACTIVA') THEN
        RAISE EXCEPTION 'No existe una persona activa con id %', p_person_id;
    END IF;

    IF NOT COALESCE(p_por_fecovol, false) THEN
        IF NOT v_curso.enrollment_open
           OR (v_curso.enrollment_opens IS NOT NULL AND CURRENT_DATE < v_curso.enrollment_opens)
           OR (v_curso.enrollment_closes IS NOT NULL AND CURRENT_DATE > v_curso.enrollment_closes) THEN
            RAISE EXCEPTION 'La inscripción de este curso no está abierta';
        END IF;
    END IF;

    IF v_curso.only_current_accreditation AND NOT EXISTS (
        SELECT 1 FROM public.referee_accreditations
        WHERE person_id = p_person_id AND status = 'ACTIVA' AND valid_until >= CURRENT_DATE
    ) THEN
        RAISE EXCEPTION 'Este curso es solo para árbitros con acreditación vigente';
    END IF;

    IF v_curso.capacity IS NOT NULL THEN
        SELECT count(*) INTO v_inscritos FROM public.referee_course_enrollments WHERE course_id = p_course_id;
        IF v_inscritos >= v_curso.capacity THEN
            RAISE EXCEPTION 'El curso ya completó su cupo de % personas', v_curso.capacity;
        END IF;
    END IF;

    INSERT INTO public.referee_course_enrollments (course_id, person_id)
    VALUES (p_course_id, p_person_id)
    RETURNING id INTO v_id;
    RETURN v_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'La persona ya está inscrita en este curso';
END;
$$;

-- Registra la nota (o la ausencia). El resultado sale de la nota mínima del curso.
CREATE OR REPLACE FUNCTION public.sp_grade_referee_enrollment(
    p_enrollment_id UUID,
    p_grade NUMERIC,
    p_absent BOOLEAN,
    p_admin_user VARCHAR
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_minima NUMERIC;
    v_estado VARCHAR;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT c.passing_grade, c.status INTO v_minima, v_estado
    FROM public.referee_course_enrollments e
    JOIN public.referee_courses c ON c.id = e.course_id
    WHERE e.id = p_enrollment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la inscripción %', p_enrollment_id;
    END IF;
    IF v_estado = 'CANCELADO' THEN
        RAISE EXCEPTION 'El curso está cancelado';
    END IF;

    IF COALESCE(p_absent, false) THEN
        UPDATE public.referee_course_enrollments
        SET grade = NULL, result = 'AUSENTE', updated_at = NOW()
        WHERE id = p_enrollment_id;
    ELSE
        IF p_grade IS NULL OR p_grade < 0 OR p_grade > 100 THEN
            RAISE EXCEPTION 'La nota debe estar entre 0 y 100';
        END IF;
        UPDATE public.referee_course_enrollments
        SET grade = p_grade,
            result = CASE WHEN p_grade >= v_minima THEN 'APROBADO' ELSE 'REPROBADO' END,
            updated_at = NOW()
        WHERE id = p_enrollment_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_set_referee_course_status(
    p_course_id UUID,
    p_status VARCHAR,
    p_admin_user VARCHAR
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);
    IF p_status NOT IN ('PUBLICADO', 'CERRADO', 'CANCELADO') THEN
        RAISE EXCEPTION 'Estado no válido para un curso: %', p_status;
    END IF;
    UPDATE public.referee_courses
    SET status = p_status,
        enrollment_open = CASE WHEN p_status = 'PUBLICADO' THEN enrollment_open ELSE false END,
        updated_at = NOW()
    WHERE id = p_course_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe el curso %', p_course_id;
    END IF;
END;
$$;

-- ─── Designaciones ───────────────────────────────────────────────────────────────────────────
-- Misma firma que antes, con las reglas del negocio en la base: el partido tiene que estar por
-- jugarse y la persona tener una acreditación activa que cubra la fecha del partido.
CREATE OR REPLACE FUNCTION public.sp_assign_referee(
    p_match_id UUID,
    p_person_id UUID,
    p_official_type_code VARCHAR,
    p_admin_user VARCHAR,
    p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id UUID;
    v_fecha DATE;
    v_estado VARCHAR;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT scheduled_date, status INTO v_fecha, v_estado FROM public.matches WHERE id = p_match_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe el partido %', p_match_id;
    END IF;
    IF v_estado NOT IN ('PROGRAMADO', 'REPROGRAMADO') THEN
        RAISE EXCEPTION 'Solo se designan oficiales en partidos programados (este está %)', lower(v_estado);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.person_roles
                   WHERE person_id = p_person_id AND role_type = 'ARBITRO' AND is_active) THEN
        RAISE EXCEPTION 'La persona no está registrada como árbitro';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.referee_accreditations
                   WHERE person_id = p_person_id AND status = 'ACTIVA'
                     AND valid_from <= v_fecha AND valid_until >= v_fecha) THEN
        RAISE EXCEPTION 'La persona no tiene una acreditación vigente para la fecha del partido';
    END IF;

    INSERT INTO public.referee_assignments (match_id, person_id, official_type_value_id, assigned_by, notes)
    VALUES (p_match_id, p_person_id,
            public.fn_catalog_value_id('Tipos de oficial', p_official_type_code),
            p_admin_user, p_notes)
    RETURNING id INTO v_id;

    RETURN v_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Ya existe una designación para esa persona o ese puesto en el partido';
END;
$$;

-- Respuesta del árbitro a su propia designación. La condición de dueño, estado PROPUESTA y
-- partido por jugarse va en el mismo UPDATE: dos respuestas simultáneas no se pisan.
CREATE OR REPLACE FUNCTION public.sp_respond_referee_assignment(
    p_id UUID,
    p_person_id UUID,
    p_status VARCHAR,
    p_notes TEXT,
    p_user VARCHAR
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM set_config('app.current_user', p_user, true);

    IF p_status NOT IN ('CONFIRMADA', 'RECHAZADA') THEN
        RAISE EXCEPTION 'Respuesta no válida: %', p_status;
    END IF;

    UPDATE public.referee_assignments ra
    SET status = p_status,
        notes = CASE WHEN p_notes IS NULL THEN ra.notes ELSE p_notes END,
        responded_at = NOW(),
        updated_at = NOW()
    FROM public.matches m
    WHERE ra.id = p_id
      AND m.id = ra.match_id
      AND ra.person_id = p_person_id
      AND ra.status = 'PROPUESTA'
      AND m.status IN ('PROGRAMADO', 'REPROGRAMADO')
      AND m.scheduled_date >= CURRENT_DATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La designación ya no se puede responder';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sp_accredit_referee_v2(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, DATE, UUID, VARCHAR, VARCHAR, UUID, UUID, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sp_link_referee_account(UUID, UUID, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sp_create_referee_course(VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, DATE, VARCHAR, INTEGER, UUID, NUMERIC, TEXT, DATE, DATE, BOOLEAN, BOOLEAN, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sp_enroll_referee_course(UUID, UUID, BOOLEAN, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sp_grade_referee_enrollment(UUID, NUMERIC, BOOLEAN, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sp_set_referee_course_status(UUID, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sp_assign_referee(UUID, UUID, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sp_respond_referee_assignment(UUID, UUID, VARCHAR, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
