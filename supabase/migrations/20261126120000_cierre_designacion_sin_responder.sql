-- Cierre arbitral con una designación que quedó sin responder.
--
-- sp_respond_referee_assignment no deja confirmar una designación después de la fecha del partido.
-- Si el árbitro principal no la confirmó a tiempo, quedaba en PROPUESTA y tampoco podía cerrar el
-- partido: un callejón sin salida. Quien registra el cierre de un partido ya disputado es quien lo
-- pitó, así que ahora también se acepta una designación PROPUESTA cuando el partido ya se jugó, y al
-- enviar el cierre la designación del principal queda como CUMPLIDA.

CREATE OR REPLACE FUNCTION public.sp_save_referee_report(
    p_match_id uuid,
    p_person_id uuid,
    p_result_type character varying,
    p_sets jsonb,
    p_observations text,
    p_enviar boolean,
    p_user character varying
)
RETURNS character varying
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_partido RECORD;
    v_designacion UUID;
    v_estado_actual VARCHAR;
    v_nuevo_estado VARCHAR := CASE WHEN COALESCE(p_enviar, false) THEN 'ENVIADO' ELSE 'BORRADOR' END;
    v_sets INTEGER := COALESCE(jsonb_array_length(p_sets), 0);
BEGIN
    PERFORM set_config('app.current_user', p_user, true);

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

    -- Solo el árbitro principal: con la designación confirmada o cumplida, o propuesta sin
    -- responder (el partido ya se disputó, así que ya no podía confirmarla).
    SELECT ra.id INTO v_designacion
    FROM public.referee_assignments ra
    JOIN public.catalog_values cv ON cv.id = ra.official_type_value_id
    WHERE ra.match_id = p_match_id
      AND ra.person_id = p_person_id
      AND ra.status IN ('PROPUESTA', 'CONFIRMADA', 'CUMPLIDA')
      AND cv.code = 'PRI'
    LIMIT 1;
    IF v_designacion IS NULL THEN
        RAISE EXCEPTION 'Solo el árbitro principal designado puede registrar el cierre';
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
        -- Quien envía el cierre pitó el partido: su designación queda cumplida.
        UPDATE public.referee_assignments
        SET status = 'CUMPLIDA',
            responded_at = COALESCE(responded_at, NOW()),
            updated_at = NOW()
        WHERE id = v_designacion AND status IN ('PROPUESTA', 'CONFIRMADA');
    END IF;

    RETURN v_nuevo_estado;
END;
$function$;

REVOKE ALL ON FUNCTION public.sp_save_referee_report(uuid, uuid, character varying, jsonb, text, boolean, character varying) FROM PUBLIC, anon, authenticated;
