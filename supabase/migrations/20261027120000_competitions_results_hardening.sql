-- Migration: 20261027120000_competitions_results_hardening
-- Description: Cierra brechas del módulo de Competencias y Resultados:
--   - Agrega el estado REPROGRAMADO al CHECK de matches.
--   - Agrega cupo máximo y fecha de cierre de inscripciones a las competencias.
--   - Refuerza el procedimiento de inscripción con validación de cupo.
-- Frente: Competencias y Resultados

-- Agrega REPROGRAMADO al CHECK de matches.status
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;

ALTER TABLE public.matches
    ADD CONSTRAINT matches_status_check
    CHECK (status IN ('PROGRAMADO', 'EN_CURSO', 'FINALIZADO', 'SUSPENDIDO', 'CANCELADO', 'REPROGRAMADO'));

-- Agrega cupo máximo y fecha de cierre de inscripciones a las competencias
ALTER TABLE public.competitions
    ADD COLUMN IF NOT EXISTS max_teams INT DEFAULT 12,
    ADD COLUMN IF NOT EXISTS registration_deadline DATE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'competitions_max_teams_check'
          AND conrelid = 'public.competitions'::regclass
    ) THEN
        ALTER TABLE public.competitions
            ADD CONSTRAINT competitions_max_teams_check
            CHECK (max_teams IS NULL OR max_teams > 0);
    END IF;
END $$;

-- Retroalimenta el cierre de inscripciones con la fecha de inicio por defecto
UPDATE public.competitions
SET registration_deadline = start_date
WHERE registration_deadline IS NULL;

-- Reemplaza el procedimiento de inscripción con la validación de cupo
DROP FUNCTION IF EXISTS public.sp_register_team_in_competition(UUID, UUID, VARCHAR);

CREATE OR REPLACE FUNCTION public.sp_register_team_in_competition(
    p_competition_id UUID,
    p_team_id UUID,
    p_admin_user VARCHAR,
    p_status VARCHAR DEFAULT 'INSCRITO'
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_max_teams INT;
    v_registered INT;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF NOT EXISTS (SELECT 1 FROM public.competitions WHERE id = p_competition_id) THEN
        RAISE EXCEPTION 'No existe la competencia %', p_competition_id;
    END IF;

    SELECT max_teams INTO v_max_teams
    FROM public.competitions
    WHERE id = p_competition_id;

    SELECT COUNT(*) INTO v_registered
    FROM public.competition_teams
    WHERE competition_id = p_competition_id
      AND status IN ('INSCRITO', 'PENDIENTE', 'POR_SUBSANAR', 'DEVUELTA');

    IF v_max_teams IS NOT NULL AND v_registered >= v_max_teams THEN
        RAISE EXCEPTION 'La competencia alcanzó el cupo máximo de % equipos', v_max_teams;
    END IF;

    INSERT INTO public.competition_teams (competition_id, team_id, status)
    VALUES (p_competition_id, p_team_id, p_status)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.sp_register_team_in_competition(UUID, UUID, VARCHAR, VARCHAR)
    SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.sp_register_team_in_competition(UUID, UUID, VARCHAR, VARCHAR)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sp_register_team_in_competition(UUID, UUID, VARCHAR, VARCHAR)
    TO service_role;