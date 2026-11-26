-- Retirar o reincorporar un equipo de una competencia queda en la bitácora con el usuario que lo
-- hizo. Antes el backend actualizaba competition_teams directamente y el disparador de auditoría
-- lo registraba como "Sistema (Proceso automático)".

CREATE OR REPLACE FUNCTION public.sp_set_competition_team_status(
    p_competition_id uuid,
    p_team_id uuid,
    p_status character varying,
    p_user character varying
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_user, true);

    IF p_status NOT IN ('INSCRITO', 'RETIRADO') THEN
        RAISE EXCEPTION 'Estado no válido para la inscripción: %', p_status;
    END IF;

    UPDATE public.competition_teams
    SET status = p_status
    WHERE competition_id = p_competition_id
      AND team_id = p_team_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        RAISE EXCEPTION 'El equipo no está inscrito en esta competencia';
    END IF;
    RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.sp_set_competition_team_status(uuid, uuid, character varying, character varying) FROM PUBLIC, anon, authenticated;
