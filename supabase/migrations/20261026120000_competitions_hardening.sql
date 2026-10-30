DROP VIEW IF EXISTS public.v_standings;

CREATE OR REPLACE VIEW public.v_standings AS
WITH team_matches AS (
    -- Partidos como local
    SELECT 
        m.competition_id,
        m.home_team_id AS team_id,
        m.id AS match_id,
        m.home_sets_won AS sets_won,
        m.away_sets_won AS sets_lost,
        m.winner_team_id = m.home_team_id AS won_match,
        c.points_win_3_0, c.points_win_3_2, c.points_loss_2_3, c.points_loss_0_3
    FROM public.matches m
    JOIN public.competitions c ON c.id = m.competition_id
    WHERE m.status = 'FINALIZADO'
    
    UNION ALL
    
    -- Partidos como visitante
    SELECT 
        m.competition_id,
        m.away_team_id AS team_id,
        m.id AS match_id,
        m.away_sets_won AS sets_won,
        m.home_sets_won AS sets_lost,
        m.winner_team_id = m.away_team_id AS won_match,
        c.points_win_3_0, c.points_win_3_2, c.points_loss_2_3, c.points_loss_0_3
    FROM public.matches m
    JOIN public.competitions c ON c.id = m.competition_id
    WHERE m.status = 'FINALIZADO'
),
team_stats AS (
    SELECT 
        tm.competition_id,
        tm.team_id,
        COUNT(tm.match_id) AS matches_played,
        COUNT(tm.match_id) FILTER (WHERE tm.won_match = true) AS matches_won,
        COUNT(tm.match_id) FILTER (WHERE tm.won_match = false) AS matches_lost,
        COALESCE(SUM(tm.sets_won), 0) AS sets_won,
        COALESCE(SUM(tm.sets_lost), 0) AS sets_lost,
        COALESCE(SUM(
            CASE 
                WHEN tm.won_match = true AND tm.sets_lost = 0 THEN tm.points_win_3_0
                WHEN tm.won_match = true AND tm.sets_lost = 1 THEN tm.points_win_3_2
                WHEN tm.won_match = false AND tm.sets_won = 2 THEN tm.points_loss_2_3
                WHEN tm.won_match = false AND tm.sets_won = 3 THEN tm.points_loss_2_3 -- Caso raro en playa, pero por si acaso
                ELSE tm.points_loss_0_3
            END
        ), 0) AS total_points
    FROM team_matches tm
    GROUP BY tm.competition_id, tm.team_id
)

SELECT 
    ct.competition_id,
    ct.team_id,
    t.name AS team_name,
    COALESCE(ts.matches_played, 0) AS matches_played,
    COALESCE(ts.matches_won, 0) AS matches_won,
    COALESCE(ts.matches_lost, 0) AS matches_lost,
    COALESCE(ts.sets_won, 0) AS sets_won,
    COALESCE(ts.sets_lost, 0) AS sets_lost,
    COALESCE(ts.total_points, 0) AS total_points
FROM public.competition_teams ct
JOIN public.teams t ON t.id = ct.team_id
LEFT JOIN team_stats ts ON ts.competition_id = ct.competition_id AND ts.team_id = ct.team_id
WHERE ct.status = 'INSCRITO';

CREATE OR REPLACE FUNCTION public.sp_record_match_result(
    p_match_id UUID,
    p_admin_user VARCHAR
) RETURNS VOID AS $$
DECLARE
    v_home_id UUID;
    v_away_id UUID;
    v_home_sets INT := 0;
    v_away_sets INT := 0;
    v_winner UUID;
    r RECORD;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT home_team_id, away_team_id INTO v_home_id, v_away_id 
    FROM public.matches WHERE id = p_match_id;

    IF v_home_id IS NULL THEN
        RAISE EXCEPTION 'No existe el partido %', p_match_id;
    END IF;

    -- Calcula sets ganados
    FOR r IN SELECT home_points, away_points FROM public.match_sets WHERE match_id = p_match_id LOOP
        IF r.home_points > r.away_points THEN 
            v_home_sets := v_home_sets + 1;
        ELSIF r.away_points > r.home_points THEN 
            v_away_sets := v_away_sets + 1;
        END IF;
    END LOOP;

    -- Valida que no queden empatados en sets (un partido de voleibol siempre tiene ganador)
    IF v_home_sets = v_away_sets THEN
        RAISE EXCEPTION 'El partido no puede terminar en empate de sets (% - %)', v_home_sets, v_away_sets;
    END IF;

    IF v_home_sets > v_away_sets THEN 
        v_winner := v_home_id;
    ELSE 
        v_winner := v_away_id;
    END IF;

    UPDATE public.matches
    SET status = 'FINALIZADO',
        home_sets_won = v_home_sets,
        away_sets_won = v_away_sets,
        winner_team_id = v_winner,
        updated_at = NOW()
    WHERE id = p_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;