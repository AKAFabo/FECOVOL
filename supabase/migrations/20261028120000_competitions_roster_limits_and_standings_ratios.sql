-- Migration: 20261028120000_competitions_roster_limits_and_standings_ratios
-- Description:
--   - Agrega min_roster y max_roster a las competencias (punto 10).
--   - Reconstruye v_standings para exponer ratio_sets y ratio_puntos (punto 11).
-- Frente: Competencias y Resultados

-- Límites de nómina en competencias
ALTER TABLE public.competitions
    ADD COLUMN IF NOT EXISTS min_roster INT DEFAULT 12,
    ADD COLUMN IF NOT EXISTS max_roster INT DEFAULT 18;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'competitions_roster_limits_check'
    ) THEN
        ALTER TABLE public.competitions
            ADD CONSTRAINT competitions_roster_limits_check
            CHECK (
                min_roster IS NULL
                OR max_roster IS NULL
                OR min_roster <= max_roster
            );
    END IF;
END $$;

-- Reconstruye v_standings con ratios de sets y de puntos
DROP VIEW IF EXISTS public.v_standings;

CREATE OR REPLACE VIEW public.v_standings AS
WITH team_matches AS (
    -- Partidos jugados por el equipo local
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
    -- Partidos jugados por el equipo visitante
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
                WHEN tm.won_match = false AND tm.sets_won = 3 THEN tm.points_loss_2_3
                ELSE tm.points_loss_0_3
            END
        ), 0) AS total_points
    FROM team_matches tm
    GROUP BY tm.competition_id, tm.team_id
),
team_points AS (
    -- Suma los puntos anotados y recibidos por set para calcular el ratio de puntos
    SELECT 
        m.competition_id,
        m.home_team_id AS team_id,
        SUM(ms.home_points) AS points_for,
        SUM(ms.away_points) AS points_against
    FROM public.matches m
    JOIN public.match_sets ms ON ms.match_id = m.id
    WHERE m.status = 'FINALIZADO'
    GROUP BY m.competition_id, m.home_team_id
    UNION ALL
    SELECT 
        m.competition_id,
        m.away_team_id AS team_id,
        SUM(ms.away_points) AS points_for,
        SUM(ms.home_points) AS points_against
    FROM public.matches m
    JOIN public.match_sets ms ON ms.match_id = m.id
    WHERE m.status = 'FINALIZADO'
    GROUP BY m.competition_id, m.away_team_id
),
team_points_agg AS (
    SELECT 
        competition_id,
        team_id,
        SUM(points_for) AS points_for,
        SUM(points_against) AS points_against
    FROM team_points
    GROUP BY competition_id, team_id
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
    COALESCE(ts.total_points, 0) AS total_points,
    CASE 
        WHEN COALESCE(ts.sets_lost, 0) = 0 THEN 
            CASE WHEN COALESCE(ts.sets_won, 0) > 0 THEN COALESCE(ts.sets_won, 0)::numeric ELSE 0 END
        ELSE (COALESCE(ts.sets_won, 0)::numeric / ts.sets_lost::numeric)
    END AS ratio_sets,
    CASE 
        WHEN COALESCE(tpa.points_against, 0) = 0 THEN 
            CASE WHEN COALESCE(tpa.points_for, 0) > 0 THEN COALESCE(tpa.points_for, 0)::numeric ELSE 0 END
        ELSE (COALESCE(tpa.points_for, 0)::numeric / tpa.points_against::numeric)
    END AS ratio_puntos
FROM public.competition_teams ct
JOIN public.teams t ON t.id = ct.team_id
LEFT JOIN team_stats ts ON ts.competition_id = ct.competition_id AND ts.team_id = ct.team_id
LEFT JOIN team_points_agg tpa ON tpa.competition_id = ct.competition_id AND tpa.team_id = ct.team_id
WHERE ct.status = 'INSCRITO';