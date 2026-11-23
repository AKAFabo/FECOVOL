-- Cierre del partido desde el entorno arbitral (RF-ARB-005) y evidencias con su responsable y
-- sus versiones (RF-ARB-006).
--
-- El árbitro principal confirmado registra el resultado (o el resultado especial) y lo envía a
-- FECOVOL. El envío deja los sets cargados y el acta en ENVIADA; el resultado solo es oficial
-- cuando el Personal de competencias valida el acta, como ya ocurre con el registro de FECOVOL.
-- Un cierre enviado no se modifica: FECOVOL puede devolverlo con un motivo.
--
-- Los disparadores de auditoría se adjuntan solos (event trigger de la migración inicial).

-- ==========================================
-- 1. CIERRE ARBITRAL
-- ==========================================

CREATE TABLE IF NOT EXISTS public.match_referee_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.persons(id),
    status VARCHAR(20) NOT NULL DEFAULT 'BORRADOR'
        CHECK (status IN ('BORRADOR', 'ENVIADO', 'DEVUELTO')),
    result_type VARCHAR(40) NOT NULL DEFAULT 'NORMAL'
        CHECK (result_type IN ('NORMAL', 'NO_PRESENTADO_LOCAL', 'NO_PRESENTADO_VISITANTE',
                               'GANADO_POR_DEFECTO_LOCAL', 'GANADO_POR_DEFECTO_VISITANTE',
                               'SUSPENDIDO_DEFINITIVO')),
    sets JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sets) = 'array'),
    observations TEXT CHECK (observations IS NULL OR length(observations) <= 2000),
    return_reason TEXT,
    submitted_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    returned_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_referee_reports_person ON public.match_referee_reports(person_id);

ALTER TABLE public.match_referee_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.match_referee_reports FROM anon, authenticated;

-- ==========================================
-- 2. EVIDENCIAS: QUIÉN LAS CARGÓ Y SUSTITUCIONES
-- ==========================================

ALTER TABLE public.match_evidence
    ADD COLUMN IF NOT EXISTS uploaded_by_person UUID REFERENCES public.persons(id),
    ADD COLUMN IF NOT EXISTS replaced_by UUID REFERENCES public.match_evidence(id),
    ADD COLUMN IF NOT EXISTS replaced_at TIMESTAMPTZ;

-- ==========================================
-- 3. GUARDAR O ENVIAR EL CIERRE
-- ==========================================

CREATE OR REPLACE FUNCTION public.sp_save_referee_report(
    p_match_id UUID,
    p_person_id UUID,
    p_result_type VARCHAR,
    p_sets JSONB,
    p_observations TEXT,
    p_enviar BOOLEAN,
    p_user VARCHAR
) RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_partido RECORD;
    v_estado_actual VARCHAR;
    v_nuevo_estado VARCHAR := CASE WHEN COALESCE(p_enviar, false) THEN 'ENVIADO' ELSE 'BORRADOR' END;
    v_sets INTEGER := COALESCE(jsonb_array_length(p_sets), 0);
BEGIN
    PERFORM set_config('app.current_user', p_user, true);

    -- Solo el árbitro principal con la designación confirmada cierra el partido.
    IF NOT EXISTS (
        SELECT 1
        FROM public.referee_assignments ra
        JOIN public.catalog_values cv ON cv.id = ra.official_type_value_id
        WHERE ra.match_id = p_match_id
          AND ra.person_id = p_person_id
          AND ra.status IN ('CONFIRMADA', 'CUMPLIDA')
          AND cv.code = 'PRI'
    ) THEN
        RAISE EXCEPTION 'Solo el árbitro principal con la designación confirmada puede registrar el cierre';
    END IF;

    SELECT id, status, acta_status, scheduled_date INTO v_partido
    FROM public.matches WHERE id = p_match_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe el partido %', p_match_id;
    END IF;
    IF v_partido.status = 'CANCELADO' THEN
        RAISE EXCEPTION 'El partido está cancelado';
    END IF;
    IF v_partido.acta_status = 'VALIDADA' THEN
        RAISE EXCEPTION 'El acta del partido ya fue validada por FECOVOL';
    END IF;
    IF v_partido.scheduled_date IS NULL OR v_partido.scheduled_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'El partido todavía no se ha disputado';
    END IF;

    SELECT status INTO v_estado_actual FROM public.match_referee_reports WHERE match_id = p_match_id FOR UPDATE;
    IF v_estado_actual = 'ENVIADO' THEN
        RAISE EXCEPTION 'El cierre ya fue enviado; FECOVOL debe devolverlo para modificarlo';
    END IF;

    IF p_result_type = 'NORMAL' AND COALESCE(p_enviar, false) AND (v_sets < 3 OR v_sets > 5) THEN
        RAISE EXCEPTION 'Un partido normal se envía con entre 3 y 5 sets';
    END IF;

    INSERT INTO public.match_referee_reports AS r
        (match_id, person_id, status, result_type, sets, observations, submitted_at, updated_at)
    VALUES
        (p_match_id, p_person_id, v_nuevo_estado, p_result_type,
         CASE WHEN p_result_type = 'NORMAL' THEN COALESCE(p_sets, '[]'::jsonb) ELSE '[]'::jsonb END,
         NULLIF(btrim(p_observations), ''),
         CASE WHEN v_nuevo_estado = 'ENVIADO' THEN NOW() END, NOW())
    ON CONFLICT (match_id) DO UPDATE
        SET person_id = EXCLUDED.person_id,
            status = EXCLUDED.status,
            result_type = EXCLUDED.result_type,
            sets = EXCLUDED.sets,
            observations = EXCLUDED.observations,
            submitted_at = EXCLUDED.submitted_at,
            updated_at = NOW();

    IF v_nuevo_estado = 'ENVIADO' THEN
        IF p_result_type = 'NORMAL' THEN
            DELETE FROM public.match_sets WHERE match_id = p_match_id;
            INSERT INTO public.match_sets (match_id, set_number, home_points, away_points)
            SELECT p_match_id, (s->>'set_number')::INTEGER, (s->>'home_points')::INTEGER, (s->>'away_points')::INTEGER
            FROM jsonb_array_elements(p_sets) s;
        END IF;
        -- El resultado queda a la espera de la validación de FECOVOL.
        UPDATE public.matches SET acta_status = 'ENVIADA', updated_at = NOW() WHERE id = p_match_id;
    END IF;

    RETURN v_nuevo_estado;
END;
$$;

-- ==========================================
-- 4. DEVOLVER UN CIERRE ENVIADO (FECOVOL)
-- ==========================================

CREATE OR REPLACE FUNCTION public.sp_return_referee_report(
    p_match_id UUID,
    p_reason TEXT,
    p_user VARCHAR
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM set_config('app.current_user', p_user, true);

    IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
        RAISE EXCEPTION 'Indique el motivo de la devolución (al menos 10 caracteres)';
    END IF;

    UPDATE public.match_referee_reports
    SET status = 'DEVUELTO', return_reason = btrim(p_reason), returned_at = NOW(),
        returned_by = p_user, updated_at = NOW()
    WHERE match_id = p_match_id AND status = 'ENVIADO';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El partido no tiene un cierre arbitral enviado';
    END IF;

    UPDATE public.matches SET acta_status = 'BORRADOR', updated_at = NOW()
    WHERE id = p_match_id AND acta_status = 'ENVIADA';
END;
$$;

REVOKE ALL ON FUNCTION public.sp_save_referee_report(UUID, UUID, VARCHAR, JSONB, TEXT, BOOLEAN, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sp_return_referee_report(UUID, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
