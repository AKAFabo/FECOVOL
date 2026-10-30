-- Migration: 20261030120000_competition_roster_versions
-- Description:
--   - Crea competition_roster_versions para versionar nóminas (RF-COM-003).
--   - Agrega procedimientos para crear, aprobar y aplicar versiones.
-- Frente: Competencias y Resultados

-- Tabla de versiones de nómina
CREATE TABLE IF NOT EXISTS public.competition_roster_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OFICIALIZADA'
        CHECK (status IN ('OFICIALIZADA', 'PENDIENTE_APROBACION', 'RECHAZADA')),
    roster_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    changes_summary TEXT,
    reason TEXT,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_by VARCHAR(255),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    UNIQUE (competition_id, team_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_roster_versions_lookup
    ON public.competition_roster_versions(competition_id, team_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_roster_versions_pending
    ON public.competition_roster_versions(competition_id, team_id)
    WHERE status = 'PENDIENTE_APROBACION';

ALTER TABLE public.competition_roster_versions ENABLE ROW LEVEL SECURITY;

-- Snapshot actual de la nómina oficial
CREATE OR REPLACE FUNCTION public.fn_roster_snapshot_actual(
    p_competition_id UUID,
    p_team_id UUID
) RETURNS JSONB AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'person_id', cr.person_id,
                'jersey_number', cr.jersey_number,
                'roster_role', cr.roster_role
            )
            ORDER BY cr.jersey_number NULLS LAST
        ),
        '[]'::jsonb
    )
    FROM public.competition_rosters cr
    WHERE cr.competition_id = p_competition_id
      AND cr.team_id = p_team_id
      AND cr.status = 'ACTIVO';
$$ LANGUAGE SQL STABLE;

-- Aplica un snapshot JSONB a competition_rosters de forma idempotente
CREATE OR REPLACE FUNCTION public.sp_apply_roster_snapshot(
    p_competition_id UUID,
    p_team_id UUID,
    p_snapshot JSONB,
    p_admin_user VARCHAR
) RETURNS VOID AS $$
DECLARE
    v_item JSONB;
    v_person_id UUID;
    v_jersey SMALLINT;
    v_role VARCHAR;
    v_roster_id UUID;
    v_ids UUID[];
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT array_agg((item->>'person_id')::UUID)
    INTO v_ids
    FROM jsonb_array_elements(p_snapshot) AS item;

    -- Da de baja a las personas que ya no están en el snapshot
    UPDATE public.competition_rosters
    SET status = 'BAJA',
        end_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE competition_id = p_competition_id
      AND team_id = p_team_id
      AND status = 'ACTIVO'
      AND (v_ids IS NULL OR person_id != ALL(v_ids));

    -- Recorre el snapshot y actualiza o inserta
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_snapshot) LOOP
        v_person_id := (v_item->>'person_id')::UUID;
        v_jersey := NULLIF(v_item->>'jersey_number', '')::SMALLINT;
        v_role := COALESCE(v_item->>'roster_role', 'JUGADOR');

        SELECT id INTO v_roster_id
        FROM public.competition_rosters
        WHERE competition_id = p_competition_id
          AND team_id = p_team_id
          AND person_id = v_person_id
          AND status = 'ACTIVO';

        IF v_roster_id IS NOT NULL THEN
            UPDATE public.competition_rosters
            SET jersey_number = v_jersey,
                roster_role = v_role,
                updated_at = NOW()
            WHERE id = v_roster_id;
        ELSE
            INSERT INTO public.competition_rosters (
                competition_id, team_id, person_id, jersey_number, roster_role, is_habilitated
            ) VALUES (
                p_competition_id, p_team_id, v_person_id, v_jersey, v_role, true
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crea una nueva versión numerada
CREATE OR REPLACE FUNCTION public.sp_create_roster_version(
    p_competition_id UUID,
    p_team_id UUID,
    p_snapshot JSONB,
    p_changes_summary TEXT,
    p_reason TEXT,
    p_created_by VARCHAR,
    p_status VARCHAR
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_next INT;
BEGIN
    PERFORM set_config('app.current_user', p_created_by, true);

    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next
    FROM public.competition_roster_versions
    WHERE competition_id = p_competition_id AND team_id = p_team_id;

    INSERT INTO public.competition_roster_versions (
        competition_id, team_id, version_number, status, roster_snapshot,
        changes_summary, reason, created_by
    ) VALUES (
        p_competition_id, p_team_id, v_next, p_status, p_snapshot,
        p_changes_summary, p_reason, p_created_by
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permisos: solo service_role puede ejecutar los procedimientos
ALTER FUNCTION public.fn_roster_snapshot_actual(UUID, UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.sp_apply_roster_snapshot(UUID, UUID, JSONB, VARCHAR) SET search_path = public, pg_temp;
ALTER FUNCTION public.sp_create_roster_version(UUID, UUID, JSONB, TEXT, TEXT, VARCHAR, VARCHAR) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.fn_roster_snapshot_actual(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sp_apply_roster_snapshot(UUID, UUID, JSONB, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sp_create_roster_version(UUID, UUID, JSONB, TEXT, TEXT, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_roster_snapshot_actual(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.sp_apply_roster_snapshot(UUID, UUID, JSONB, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.sp_create_roster_version(UUID, UUID, JSONB, TEXT, TEXT, VARCHAR, VARCHAR) TO service_role;