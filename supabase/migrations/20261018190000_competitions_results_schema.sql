-- Migration: Competencias, Inscripciones, Partidos y Resultados
-- Frente: Competencias y Resultados

-- ==========================================
-- 1. COMPETENCIAS
-- ==========================================
CREATE TABLE public.competitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    season VARCHAR(50) NOT NULL, -- Ej: "2026"
    category_value_id UUID NOT NULL REFERENCES public.catalog_values(id),
    branch_value_id UUID NOT NULL REFERENCES public.catalog_values(id),
    modality_value_id UUID NOT NULL REFERENCES public.catalog_values(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PLANIFICACION' 
        CHECK (status IN ('PLANIFICACION', 'INSCRIPCIONES', 'EN_CURSO', 'FINALIZADA', 'CERRADA')),
    points_win_3_0 NUMERIC(5,2) DEFAULT 3.0, -- Reglas de puntuación configurables (RF-COM-008)
    points_win_3_2 NUMERIC(5,2) DEFAULT 2.0,
    points_loss_2_3 NUMERIC(5,2) DEFAULT 1.0,
    points_loss_0_3 NUMERIC(5,2) DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 2. INSCRIPCIÓN DE EQUIPOS
-- ==========================================
CREATE TABLE public.competition_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'INSCRITO' 
        CHECK (status IN ('INSCRITO', 'RETIRADO', 'DESCALIFICADO')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (competition_id, team_id) -- Un equipo no puede inscribirse dos veces en la misma competencia
);

-- ==========================================
-- 3. NÓMINAS DE COMPETENCIA (Historial y Habilitación)
-- ==========================================
CREATE TABLE public.competition_rosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    jersey_number SMALLINT, 
    roster_role VARCHAR(50) NOT NULL DEFAULT 'JUGADOR' 
        CHECK (roster_role IN ('JUGADOR', 'TECNICO', 'DELEGADO')),
    is_habilitated BOOLEAN DEFAULT true,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' 
        CHECK (status IN ('ACTIVO', 'BAJA')),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Una persona no puede estar activa dos veces en la misma nómina de competencia
CREATE UNIQUE INDEX uq_roster_active 
    ON public.competition_rosters(competition_id, team_id, person_id) 
    WHERE status = 'ACTIVO';

-- ==========================================
-- 4. PARTIDOS (Matches)
-- ==========================================
CREATE TABLE public.matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    match_number INT NOT NULL, -- Consecutivo (ej. Partido #1, #2...)
    matchday INT NOT NULL, -- Jornada (ej. Jornada 8)
    home_team_id UUID NOT NULL REFERENCES public.teams(id),
    away_team_id UUID NOT NULL REFERENCES public.teams(id),
    venue VARCHAR(255), -- Gimnasio/Sede
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PROGRAMADO' 
        CHECK (status IN ('PROGRAMADO', 'EN_CURSO', 'FINALIZADO', 'SUSPENDIDO', 'CANCELADO')),
    -- Campos calculados al finalizar para facilitar reportes y tabla de posiciones
    home_sets_won SMALLINT DEFAULT 0,
    away_sets_won SMALLINT DEFAULT 0,
    winner_team_id UUID REFERENCES public.teams(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Validaciones básicas
    CONSTRAINT chk_different_teams CHECK (home_team_id <> away_team_id),
    UNIQUE (competition_id, match_number)
);

-- CONECTAR CON EL MÓDULO DE ARBITRAJE (Estudiante 3)
-- 1. Limpiam los registros huérfanos de prueba (creados antes de que existiera la tabla matches)
DELETE FROM public.referee_assignments 
WHERE match_id NOT IN (SELECT id FROM public.matches);

-- 2. Aplica la llave foránea sin conflictos
ALTER TABLE public.referee_assignments
    ADD CONSTRAINT fk_referee_assignments_match
    FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

-- ==========================================
-- 5. RESULTADOS POR SET
-- ==========================================
CREATE TABLE public.match_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    set_number INT NOT NULL CHECK (set_number BETWEEN 1 AND 5),
    home_points INT NOT NULL DEFAULT 0,
    away_points INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (match_id, set_number) -- Un partido solo puede tener un set 1, un set 2, etc.
);

-- ==========================================
-- 6. HISTORIAL DE REPROGRAMACIONES (RF-COM-006)
-- ==========================================
CREATE TABLE public.match_reschedulings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    previous_date DATE NOT NULL,
    previous_time TIME NOT NULL,
    previous_venue VARCHAR(255),
    new_date DATE NOT NULL,
    new_time TIME NOT NULL,
    new_venue VARCHAR(255),
    reason TEXT,
    rescheduled_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 7. VISTA: TABLA DE POSICIONES (RF-COM-008)
-- ==========================================
-- Calcula puntos, sets y partidos ganados automáticamente a partir de los resultados oficiales.
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
)
SELECT 
    tm.competition_id,
    tm.team_id,
    t.name AS team_name,
    COUNT(tm.match_id) AS matches_played,
    COUNT(tm.match_id) FILTER (WHERE tm.won_match = true) AS matches_won,
    COUNT(tm.match_id) FILTER (WHERE tm.won_match = false) AS matches_lost,
    SUM(tm.sets_won) AS sets_won,
    SUM(tm.sets_lost) AS sets_lost,
    -- Cálculo de puntos según reglas de la competencia
    SUM(
        CASE 
            WHEN tm.won_match = true AND tm.sets_lost = 0 THEN tm.points_win_3_0
            WHEN tm.won_match = true AND tm.sets_lost = 1 THEN tm.points_win_3_2
            WHEN tm.won_match = false AND tm.sets_won = 2 THEN tm.points_loss_2_3
            ELSE tm.points_loss_0_3
        END
    ) AS total_points
FROM team_matches tm
JOIN public.teams t ON t.id = tm.team_id
GROUP BY tm.competition_id, tm.team_id, t.name;

-- ==========================================
-- 8. PROCEDIMIENTOS ALMACENADOS (Para bitácora)
-- ==========================================

-- Crear Competencia
CREATE OR REPLACE FUNCTION public.sp_create_competition(
    p_name VARCHAR,
    p_season VARCHAR,
    p_category_code VARCHAR,
    p_branch_code VARCHAR,
    p_modality_code VARCHAR,
    p_start_date DATE,
    p_end_date DATE,
    p_admin_user VARCHAR,
    p_status VARCHAR DEFAULT 'PLANIFICACION'
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF p_end_date < p_start_date THEN
        RAISE EXCEPTION 'La fecha de fin no puede ser anterior a la de inicio.';
    END IF;

    INSERT INTO public.competitions (
        name, season, category_value_id, branch_value_id, modality_value_id, 
        start_date, end_date, status
    ) VALUES (
        p_name, p_season, 
        public.fn_catalog_value_id('Categorías', p_category_code),
        public.fn_catalog_value_id('Ramas', p_branch_code),
        public.fn_catalog_value_id('Modalidades', p_modality_code),
        p_start_date, p_end_date, p_status
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Inscribir Equipo en Competencia
CREATE OR REPLACE FUNCTION public.sp_register_team_in_competition(
    p_competition_id UUID,
    p_team_id UUID,
    p_admin_user VARCHAR
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF NOT EXISTS (SELECT 1 FROM public.competitions WHERE id = p_competition_id) THEN
        RAISE EXCEPTION 'No existe la competencia %', p_competition_id;
    END IF;

    INSERT INTO public.competition_teams (competition_id, team_id)
    VALUES (p_competition_id, p_team_id)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Programar Partido
CREATE OR REPLACE FUNCTION public.sp_schedule_match(
    p_competition_id UUID,
    p_match_number INT,
    p_matchday INT,
    p_home_team_id UUID,
    p_away_team_id UUID,
    p_scheduled_date DATE,
    p_scheduled_time TIME,
    p_admin_user VARCHAR,
    p_venue VARCHAR DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_comp_start DATE;
    v_comp_end DATE;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT start_date, end_date INTO v_comp_start, v_comp_end 
    FROM public.competitions WHERE id = p_competition_id;

    IF v_comp_start IS NULL THEN
        RAISE EXCEPTION 'No existe la competencia %', p_competition_id;
    END IF;

    IF p_scheduled_date < v_comp_start OR p_scheduled_date > v_comp_end THEN
        RAISE EXCEPTION 'La fecha del partido está fuera del rango de la competencia.';
    END IF;

    INSERT INTO public.matches (
        competition_id, match_number, matchday, home_team_id, away_team_id, 
        scheduled_date, scheduled_time, venue
    ) VALUES (
        p_competition_id, p_match_number, p_matchday, p_home_team_id, p_away_team_id, 
        p_scheduled_date, p_scheduled_time, p_venue
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Registrar Resultado Oficial
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

    -- Calcular sets ganados
    FOR r IN SELECT home_points, away_points FROM public.match_sets WHERE match_id = p_match_id LOOP
        IF r.home_points > r.away_points THEN v_home_sets := v_home_sets + 1;
        ELSIF r.away_points > r.home_points THEN v_away_sets := v_away_sets + 1;
        END IF;
    END LOOP;

    IF v_home_sets > v_away_sets THEN v_winner := v_home_id;
    ELSE v_winner := v_away_id;
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


-- ==========================================
-- 9. SEGURIDAD (RLS Y PERMISOS)
-- ==========================================
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_reschedulings ENABLE ROW LEVEL SECURITY;

-- Solo service_role puede ejecutar los procedimientos y acceder a las tablas
REVOKE EXECUTE ON FUNCTION public.sp_create_competition(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, DATE, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sp_register_team_in_competition(UUID, UUID, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sp_schedule_match(UUID, INT, INT, UUID, UUID, DATE, TIME, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sp_record_match_result(UUID, VARCHAR) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sp_create_competition(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, DATE, VARCHAR, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.sp_register_team_in_competition(UUID, UUID, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.sp_schedule_match(UUID, INT, INT, UUID, UUID, DATE, TIME, VARCHAR, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.sp_record_match_result(UUID, VARCHAR) TO service_role;