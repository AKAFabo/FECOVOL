-- Migration: acreditaciones y cursos del cuerpo arbitral
-- Módulo: Arbitraje (panel de administración)
--
-- Tablas nuevas:
--   referee_courses              cursos de formación, actualización o ascenso
--   referee_course_enrollments   inscritos de cada curso y su nota
--   referee_accreditations       acreditación que habilita a una persona para recibir designaciones
--
-- El estado "Al día / Por vencer / Vencida" no se guarda: se calcula con valid_until.
-- Los triggers de auditoría se adjuntan solos (event trigger de la migración inicial).
--
-- Es idempotente (IF NOT EXISTS): las tablas ya existen en la base, y 20261118120000_arbitraje.sql
-- las vuelve a declarar del mismo modo. Esta migración además carga el catálogo "Niveles arbitrales"
-- y el tipo de documento CUR que aquella usa.

-- ==========================================
-- 1. CATÁLOGOS
-- ==========================================

INSERT INTO public.catalogs (name, description)
VALUES ('Niveles arbitrales', 'Nivel de la acreditación de árbitros y oficiales')
ON CONFLICT (name) DO NOTHING;

DO $$
BEGIN
    PERFORM public.sp_upsert_catalog_value('Niveles arbitrales', 'NAC', 'Nacional', NULL, true, 'seed');
    PERFORM public.sp_upsert_catalog_value('Niveles arbitrales', 'NOR', 'NORCECA', NULL, true, 'seed');
    PERFORM public.sp_upsert_catalog_value('Niveles arbitrales', 'FIVB1', 'FIVB I', NULL, true, 'seed');
    PERFORM public.sp_upsert_catalog_value('Niveles arbitrales', 'FIVB2', 'FIVB II', NULL, true, 'seed');

    PERFORM public.sp_upsert_catalog_value('Tipos de documento', 'CUR', 'Certificado de curso arbitral', NULL, true, 'seed');
END $$;

-- ==========================================
-- 2. CURSOS
-- ==========================================

CREATE TABLE IF NOT EXISTS public.referee_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    course_type VARCHAR(30) NOT NULL
        CHECK (course_type IN ('FORMACION_INICIAL', 'ACTUALIZACION_ANUAL', 'ASCENSO_NIVEL')),
    modality_value_id UUID REFERENCES public.catalog_values(id),          -- catálogo Modalidades
    format VARCHAR(20) NOT NULL DEFAULT 'PRESENCIAL'
        CHECK (format IN ('PRESENCIAL', 'VIRTUAL', 'MIXTO')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    venue VARCHAR(255),
    capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
    instructor_person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
    passing_grade NUMERIC(5,2) NOT NULL DEFAULT 70 CHECK (passing_grade BETWEEN 0 AND 100),
    content TEXT,
    enrollment_opens DATE,
    enrollment_closes DATE,
    enrollment_open BOOLEAN NOT NULL DEFAULT true,
    only_current_accreditation BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'PUBLICADO'
        CHECK (status IN ('PUBLICADO', 'CERRADO', 'CANCELADO')),
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT chk_referee_courses_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_referee_courses_enrollment CHECK (
        enrollment_opens IS NULL OR enrollment_closes IS NULL OR enrollment_closes >= enrollment_opens
    )
);

CREATE INDEX IF NOT EXISTS idx_referee_courses_start ON public.referee_courses(start_date);

CREATE TABLE IF NOT EXISTS public.referee_course_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.referee_courses(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    grade NUMERIC(5,2) CHECK (grade IS NULL OR grade BETWEEN 0 AND 100),
    result VARCHAR(20) NOT NULL DEFAULT 'INSCRITO'
        CHECK (result IN ('INSCRITO', 'APROBADO', 'REPROBADO', 'AUSENTE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (course_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_person ON public.referee_course_enrollments(person_id);

-- ==========================================
-- 3. ACREDITACIONES
-- ==========================================

CREATE TABLE IF NOT EXISTS public.referee_accreditations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    function_value_id UUID NOT NULL REFERENCES public.catalog_values(id),  -- catálogo Tipos de oficial
    level_value_id UUID NOT NULL REFERENCES public.catalog_values(id),     -- catálogo Niveles arbitrales
    modality VARCHAR(12) NOT NULL DEFAULT 'SALA'
        CHECK (modality IN ('SALA', 'PLAYA', 'SALA_PLAYA')),
    category_value_id UUID REFERENCES public.catalog_values(id),           -- catálogo Categorías (NULL = todas)
    valid_from DATE NOT NULL,
    valid_until DATE NOT NULL,
    course_enrollment_id UUID REFERENCES public.referee_course_enrollments(id) ON DELETE SET NULL,
    practical_evaluation VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (practical_evaluation IN ('APROBADA', 'REPROBADA', 'PENDIENTE')),
    physical_test VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (physical_test IN ('APROBADA', 'REPROBADA', 'PENDIENTE')),
    certificate_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    medical_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    -- ACTIVA: la acreditación en uso. REEMPLAZADA: quedó atrás por una renovación.
    status VARCHAR(12) NOT NULL DEFAULT 'ACTIVA'
        CHECK (status IN ('ACTIVA', 'REEMPLAZADA', 'REVOCADA')),
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT chk_referee_accreditations_dates CHECK (valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_referee_accreditations_person ON public.referee_accreditations(person_id);
CREATE INDEX IF NOT EXISTS idx_referee_accreditations_until ON public.referee_accreditations(valid_until);

-- Una persona tiene a lo sumo una acreditación activa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_referee_accreditation_active
    ON public.referee_accreditations(person_id)
    WHERE status = 'ACTIVA';

-- ==========================================
-- 4. PROCEDIMIENTO: ACREDITAR O RENOVAR
-- ==========================================
-- En una sola transacción: guarda los documentos, reemplaza la acreditación anterior,
-- marca a la persona como árbitro y, si tiene cuenta, le da el rol de cuerpo arbitral.

CREATE OR REPLACE FUNCTION public.sp_accredit_referee(
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
    p_certificate_url TEXT,
    p_certificate_name VARCHAR,
    p_medical_url TEXT,
    p_medical_name VARCHAR,
    p_notes TEXT,
    p_admin_user VARCHAR
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_user_id UUID;
    v_role_id UUID;
    v_cert_id UUID;
    v_med_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT user_id INTO v_user_id FROM public.persons WHERE id = p_person_id AND status = 'ACTIVA';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe una persona activa con id %', p_person_id;
    END IF;

    IF p_valid_until <= p_valid_from THEN
        RAISE EXCEPTION 'La fecha de vencimiento debe ser posterior a la fecha de inicio';
    END IF;

    IF p_course_enrollment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.referee_course_enrollments
        WHERE id = p_course_enrollment_id AND person_id = p_person_id AND result = 'APROBADO'
    ) THEN
        RAISE EXCEPTION 'El curso indicado no está aprobado por esta persona';
    END IF;

    IF p_practical_evaluation <> 'APROBADA' OR p_physical_test <> 'APROBADA' THEN
        RAISE EXCEPTION 'La evaluación práctica y la prueba física deben estar aprobadas';
    END IF;

    IF p_certificate_url IS NOT NULL THEN
        INSERT INTO public.documents (document_type_value_id, person_id, file_url, file_name,
                                      issue_date, status, uploaded_by, reviewed_by, reviewed_at)
        VALUES (public.fn_catalog_value_id('Tipos de documento', 'CUR'), p_person_id, p_certificate_url,
                p_certificate_name, CURRENT_DATE, 'VIGENTE', p_admin_user, p_admin_user, NOW())
        RETURNING id INTO v_cert_id;
    END IF;

    IF p_medical_url IS NOT NULL THEN
        INSERT INTO public.documents (document_type_value_id, person_id, file_url, file_name,
                                      issue_date, expiry_date, status, uploaded_by, reviewed_by, reviewed_at)
        VALUES (public.fn_catalog_value_id('Tipos de documento', 'MED'), p_person_id, p_medical_url,
                p_medical_name, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year', 'VIGENTE',
                p_admin_user, p_admin_user, NOW())
        RETURNING id INTO v_med_id;
    END IF;

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
        CASE WHEN p_category_code IS NULL THEN NULL
             ELSE public.fn_catalog_value_id('Categorías', p_category_code) END,
        p_valid_from, p_valid_until, p_course_enrollment_id, p_practical_evaluation, p_physical_test,
        v_cert_id, v_med_id, p_notes, p_admin_user
    ) RETURNING id INTO v_id;

    INSERT INTO public.person_roles (person_id, role_type, is_active)
    VALUES (p_person_id, 'ARBITRO', true)
    ON CONFLICT (person_id, role_type) DO UPDATE SET is_active = true;

    IF v_user_id IS NOT NULL THEN
        SELECT id INTO v_role_id FROM public.roles WHERE lower(name) IN ('arbitro', 'árbitro') LIMIT 1;
        IF v_role_id IS NOT NULL THEN
            INSERT INTO public.user_roles (user_id, role_id)
            VALUES (v_user_id, v_role_id)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Solo el backend (service_role) puede ejecutarlo.
REVOKE EXECUTE ON FUNCTION public.sp_accredit_referee(
    UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, DATE, UUID, VARCHAR, VARCHAR,
    TEXT, VARCHAR, TEXT, VARCHAR, TEXT, VARCHAR
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_accredit_referee(
    UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, DATE, UUID, VARCHAR, VARCHAR,
    TEXT, VARCHAR, TEXT, VARCHAR, TEXT, VARCHAR
) TO service_role;

-- ==========================================
-- 5. RLS
-- ==========================================
-- Sin políticas: solo el backend (service role) lee y escribe.
ALTER TABLE public.referee_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referee_course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referee_accreditations ENABLE ROW LEVEL SECURITY;
