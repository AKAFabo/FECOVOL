-- Selecciones nacionales (portal público: Selecciones; administración de FECOVOL).
--
-- Una persona no "es" seleccionada: se la convoca a una selección para un evento, con un número y
-- una posición, y esa convocatoria tiene fecha y estado. Por eso son tablas propias y no una
-- marca en persons:
--   national_teams              la selección (categoría, rama y modalidad)
--   national_team_events        el torneo, gira o concentración, con fechas y sede
--   national_team_callups       la convocatoria de una selección (opcionalmente para un evento)
--   national_team_callup_members  cada persona convocada, jugadora o del cuerpo técnico
-- Así se conserva la historia de todas las convocatorias de cada persona.
--
-- Solo el backend accede a estas tablas (RLS activo y sin políticas); el portal público recibe
-- únicamente convocatorias publicadas, con nombre, número y posición de cada atleta.
-- Los disparadores de auditoría se adjuntan solos (event trigger de la migración inicial).

CREATE TABLE IF NOT EXISTS public.national_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    modality VARCHAR(10) NOT NULL CHECK (modality IN ('SALA', 'PLAYA')),
    branch_value_id UUID NOT NULL,
    category_value_id UUID NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'ACTIVA' CHECK (status IN ('ACTIVA', 'INACTIVA')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT national_teams_branch_fkey FOREIGN KEY (branch_value_id) REFERENCES public.catalog_values(id),
    CONSTRAINT national_teams_category_fkey FOREIGN KEY (category_value_id) REFERENCES public.catalog_values(id),
    CONSTRAINT national_teams_unica UNIQUE (modality, branch_value_id, category_value_id)
);

CREATE TABLE IF NOT EXISTS public.national_team_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(160) NOT NULL,
    modality VARCHAR(10) NOT NULL CHECK (modality IN ('SALA', 'PLAYA')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    venue VARCHAR(160),
    status VARCHAR(12) NOT NULL DEFAULT 'PROGRAMADO' CHECK (status IN ('PROGRAMADO', 'FINALIZADO', 'CANCELADO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT national_team_events_fechas CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.national_team_callups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    national_team_id UUID NOT NULL,
    event_id UUID,
    title VARCHAR(160) NOT NULL,
    notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
    status VARCHAR(10) NOT NULL DEFAULT 'BORRADOR' CHECK (status IN ('BORRADOR', 'PUBLICADA', 'ARCHIVADA')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT national_team_callups_team_fkey FOREIGN KEY (national_team_id) REFERENCES public.national_teams(id),
    CONSTRAINT national_team_callups_event_fkey FOREIGN KEY (event_id) REFERENCES public.national_team_events(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_callups_team ON public.national_team_callups(national_team_id);

CREATE TABLE IF NOT EXISTS public.national_team_callup_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    callup_id UUID NOT NULL,
    person_id UUID NOT NULL,
    member_type VARCHAR(15) NOT NULL CHECK (member_type IN ('JUGADOR', 'CUERPO_TECNICO')),
    jersey_number SMALLINT CHECK (jersey_number IS NULL OR jersey_number BETWEEN 1 AND 99),
    position_value_id UUID,
    staff_role VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT callup_members_callup_fkey FOREIGN KEY (callup_id) REFERENCES public.national_team_callups(id) ON DELETE CASCADE,
    CONSTRAINT callup_members_person_fkey FOREIGN KEY (person_id) REFERENCES public.persons(id),
    CONSTRAINT callup_members_position_fkey FOREIGN KEY (position_value_id) REFERENCES public.catalog_values(id),
    CONSTRAINT callup_members_unica UNIQUE (callup_id, person_id),
    CONSTRAINT callup_members_datos CHECK (
        (member_type = 'JUGADOR' AND staff_role IS NULL)
        OR (member_type = 'CUERPO_TECNICO' AND jersey_number IS NULL AND position_value_id IS NULL AND staff_role IS NOT NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_callup_members_numero
    ON public.national_team_callup_members(callup_id, jersey_number) WHERE jersey_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_callup_members_person ON public.national_team_callup_members(person_id);

ALTER TABLE public.national_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.national_team_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.national_team_callups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.national_team_callup_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.national_teams, public.national_team_events, public.national_team_callups,
    public.national_team_callup_members FROM anon, authenticated;
