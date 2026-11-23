-- Tabla de posiciones (RF-COM-008, RF-DIV-004).
--
-- Corrige dos defectos de v_standings encontrados en las pruebas:
--   DEF-006: una victoria 3-1 recibía los puntos de un 3-2 y una victoria 3-2 recibía cero.
--            Ahora: victoria con 0 o 1 set perdido -> puntos de 3-0; con 2 sets perdidos -> 3-2;
--            derrota con 2 sets ganados -> 2-3; cualquier otra derrota -> 0-3.
--   DEF-007: contaba partidos finalizados con el acta en borrador. Solo cuentan las actas validadas
--            (los resultados especiales se registran ya validados).
-- Además la vista pasa a security_invoker: aplica los permisos de quien consulta y no los de su
-- creador (aviso de seguridad de Supabase). El backend la consulta con la llave de servicio.

CREATE OR REPLACE VIEW public.v_standings
WITH (security_invoker = true) AS
WITH partidos_oficiales AS (
    SELECT m.*
    FROM public.matches m
    WHERE m.status = 'FINALIZADO'
      AND m.acta_status = 'VALIDADA'
      AND m.winner_team_id IS NOT NULL
),
team_matches AS (
    SELECT m.competition_id, m.home_team_id AS team_id, m.id AS match_id,
           m.home_sets_won AS sets_won, m.away_sets_won AS sets_lost,
           m.winner_team_id = m.home_team_id AS won_match,
           c.points_win_3_0, c.points_win_3_2, c.points_loss_2_3, c.points_loss_0_3
    FROM partidos_oficiales m
    JOIN public.competitions c ON c.id = m.competition_id
    UNION ALL
    SELECT m.competition_id, m.away_team_id, m.id,
           m.away_sets_won, m.home_sets_won,
           m.winner_team_id = m.away_team_id,
           c.points_win_3_0, c.points_win_3_2, c.points_loss_2_3, c.points_loss_0_3
    FROM partidos_oficiales m
    JOIN public.competitions c ON c.id = m.competition_id
),
team_stats AS (
    SELECT tm.competition_id, tm.team_id,
           count(tm.match_id) AS matches_played,
           count(tm.match_id) FILTER (WHERE tm.won_match) AS matches_won,
           count(tm.match_id) FILTER (WHERE NOT tm.won_match) AS matches_lost,
           COALESCE(sum(tm.sets_won), 0::bigint) AS sets_won,
           COALESCE(sum(tm.sets_lost), 0::bigint) AS sets_lost,
           COALESCE(sum(
               CASE
                   WHEN tm.won_match AND COALESCE(tm.sets_lost, 0) <= 1 THEN tm.points_win_3_0
                   WHEN tm.won_match THEN tm.points_win_3_2
                   WHEN COALESCE(tm.sets_won, 0) = 2 THEN tm.points_loss_2_3
                   ELSE tm.points_loss_0_3
               END), 0::numeric) AS total_points
    FROM team_matches tm
    GROUP BY tm.competition_id, tm.team_id
),
team_points AS (
    SELECT m.competition_id, m.home_team_id AS team_id,
           sum(ms.home_points) AS points_for, sum(ms.away_points) AS points_against
    FROM partidos_oficiales m
    JOIN public.match_sets ms ON ms.match_id = m.id
    GROUP BY m.competition_id, m.home_team_id
    UNION ALL
    SELECT m.competition_id, m.away_team_id,
           sum(ms.away_points), sum(ms.home_points)
    FROM partidos_oficiales m
    JOIN public.match_sets ms ON ms.match_id = m.id
    GROUP BY m.competition_id, m.away_team_id
),
team_points_agg AS (
    SELECT competition_id, team_id, sum(points_for) AS points_for, sum(points_against) AS points_against
    FROM team_points
    GROUP BY competition_id, team_id
)
SELECT ct.competition_id,
       ct.team_id,
       t.name AS team_name,
       COALESCE(ts.matches_played, 0::bigint) AS matches_played,
       COALESCE(ts.matches_won, 0::bigint) AS matches_won,
       COALESCE(ts.matches_lost, 0::bigint) AS matches_lost,
       COALESCE(ts.sets_won, 0::bigint) AS sets_won,
       COALESCE(ts.sets_lost, 0::bigint) AS sets_lost,
       COALESCE(ts.total_points, 0::numeric) AS total_points,
       CASE
           WHEN COALESCE(ts.sets_lost, 0::bigint) = 0 THEN
               CASE WHEN COALESCE(ts.sets_won, 0::bigint) > 0 THEN COALESCE(ts.sets_won, 0::bigint)::numeric ELSE 0::numeric END
           ELSE COALESCE(ts.sets_won, 0::bigint)::numeric / ts.sets_lost::numeric
       END AS ratio_sets,
       CASE
           WHEN COALESCE(tpa.points_against, 0::numeric) = 0::numeric THEN
               CASE WHEN COALESCE(tpa.points_for, 0::numeric) > 0::numeric THEN COALESCE(tpa.points_for, 0::numeric) ELSE 0::numeric END
           ELSE COALESCE(tpa.points_for, 0::numeric) / tpa.points_against
       END AS ratio_puntos
FROM public.competition_teams ct
JOIN public.teams t ON t.id = ct.team_id
LEFT JOIN team_stats ts ON ts.competition_id = ct.competition_id AND ts.team_id = ct.team_id
LEFT JOIN team_points_agg tpa ON tpa.competition_id = ct.competition_id AND tpa.team_id = ct.team_id
WHERE ct.status = 'INSCRITO';

REVOKE ALL ON public.v_standings FROM anon;
