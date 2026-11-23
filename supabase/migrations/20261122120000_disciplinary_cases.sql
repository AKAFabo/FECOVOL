-- Migration: incidentes y sanciones (expedientes disciplinarios)
-- Módulo: Incidentes y sanciones (panel de administración)
--
-- Tablas nuevas:
--   infractions          catálogo de faltas del reglamento, con el rango de sanción permitido
--   disciplinary_cases   expedientes (EXP-AAAA-NN) abiertos por FECOVOL
--   case_parties         personas, equipos o sedes involucradas en un expediente
--   case_events          cronología del expediente (no se edita ni se borra)
--   case_documents       pruebas y documentos del expediente
--   sanctions            sanciones aplicadas a un involucrado
--
-- Tipos de sanción y su orden de gravedad (de menor a mayor). El rango de una falta
-- va de una sanción mínima a una máxima dentro de esta escala:
--   AMONESTACION < MULTA(colones) < SUSPENSION_PARTIDOS(n) < SUSPENSION_MESES(n)
--   < PERDIDA_PARTIDO < PERDIDA_PUNTOS(n) < SUSPENSION_SEDE < EXPULSION
--
-- Los triggers de auditoría se adjuntan solos (event trigger de la migración inicial).

-- ==========================================
-- 1. CATÁLOGO "Tipos de incidente"
-- ==========================================
INSERT INTO public.catalogs (name, description)
VALUES ('Tipos de incidente', 'Clasificación de incidentes')
ON CONFLICT (name) DO NOTHING;

DO $$
BEGIN
    PERFORM public.sp_upsert_catalog_value('Tipos de incidente', 'TARJETA_ROJA', 'Tarjeta roja', NULL, true, 'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de incidente', 'RECLAMO', 'Reclamo de un equipo', NULL, true, 'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de incidente', 'CONDUCTA', 'Conducta antideportiva', NULL, true, 'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de incidente', 'AGRESION_VERBAL', 'Agresión verbal', NULL, true, 'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de incidente', 'AGRESION_FISICA', 'Agresión física', NULL, true, 'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de incidente', 'ALINEACION', 'Alineación indebida', NULL, true, 'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de incidente', 'RETRASO', 'Retraso en la presentación', NULL, true, 'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de incidente', 'SEDE', 'Condiciones de la sede', NULL, true, 'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de incidente', 'OTRO', 'Otro', NULL, true, 'seed');
END $$;

-- ==========================================
-- 2. CATÁLOGO DE FALTAS
-- ==========================================
CREATE TABLE public.infractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    applies_to VARCHAR(10) NOT NULL CHECK (applies_to IN ('PERSONA', 'EQUIPO', 'SEDE')),
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('LEVE', 'GRAVE', 'MUY_GRAVE')),
    min_sanction VARCHAR(20) NOT NULL,
    min_quantity INTEGER CHECK (min_quantity IS NULL OR min_quantity > 0),
    max_sanction VARCHAR(20) NOT NULL,
    max_quantity INTEGER CHECK (max_quantity IS NULL OR max_quantity > 0),
    recidivism VARCHAR(120),                       -- "Duplica", "+1 partido", "Expulsión del torneo"...
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT chk_infractions_min CHECK (min_sanction IN ('AMONESTACION', 'MULTA', 'SUSPENSION_PARTIDOS',
        'SUSPENSION_MESES', 'PERDIDA_PARTIDO', 'PERDIDA_PUNTOS', 'SUSPENSION_SEDE', 'EXPULSION')),
    CONSTRAINT chk_infractions_max CHECK (max_sanction IN ('AMONESTACION', 'MULTA', 'SUSPENSION_PARTIDOS',
        'SUSPENSION_MESES', 'PERDIDA_PARTIDO', 'PERDIDA_PUNTOS', 'SUSPENSION_SEDE', 'EXPULSION'))
);

INSERT INTO public.infractions (code, name, applies_to, severity, min_sanction, min_quantity, max_sanction, max_quantity, recidivism) VALUES
    ('F-01', 'Retraso en la presentación del equipo', 'EQUIPO', 'LEVE', 'AMONESTACION', NULL, 'MULTA', 50000, 'Duplica'),
    ('F-04', 'Uniforme no reglamentario', 'EQUIPO', 'LEVE', 'AMONESTACION', NULL, 'MULTA', 25000, 'Duplica'),
    ('F-07', 'Uso de jugadora no inscrita', 'EQUIPO', 'GRAVE', 'PERDIDA_PARTIDO', NULL, 'PERDIDA_PUNTOS', 3, 'Expulsión del torneo'),
    ('F-09', 'Reclamo reiterado al arbitraje', 'PERSONA', 'LEVE', 'AMONESTACION', NULL, 'SUSPENSION_PARTIDOS', 1, '+1 partido'),
    ('F-12', 'Conducta antideportiva grave', 'PERSONA', 'GRAVE', 'SUSPENSION_PARTIDOS', 1, 'SUSPENSION_PARTIDOS', 3, 'Duplica'),
    ('F-15', 'Agresión verbal a oficiales', 'PERSONA', 'GRAVE', 'SUSPENSION_PARTIDOS', 2, 'SUSPENSION_PARTIDOS', 6, 'Duplica'),
    ('F-18', 'Agresión física', 'PERSONA', 'MUY_GRAVE', 'SUSPENSION_MESES', 6, 'EXPULSION', NULL, 'Expulsión'),
    ('F-21', 'Falta de condiciones de la sede', 'SEDE', 'GRAVE', 'AMONESTACION', NULL, 'SUSPENSION_SEDE', NULL, NULL)
ON CONFLICT (code) DO NOTHING;

-- ==========================================
-- 3. EXPEDIENTES
-- ==========================================
CREATE TABLE public.disciplinary_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number VARCHAR(20) NOT NULL UNIQUE,         -- EXP-2026-07
    season INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    competition_id UUID NOT NULL REFERENCES public.competitions(id),
    match_id UUID REFERENCES public.matches(id),
    incident_type_value_id UUID NOT NULL REFERENCES public.catalog_values(id),  -- catálogo Tipos de incidente
    title VARCHAR(255) NOT NULL,
    facts TEXT NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    moment_detail VARCHAR(255),                      -- "Set 3, marcador 14-16"
    reported_by VARCHAR(255),                        -- "Marta Vega González (árbitra principal) en el acta"
    -- ABIERTO → EN_SEGUIMIENTO → CON_SANCION. ARCHIVADO si no procede.
    -- "Resuelto" se calcula: con sanción y sin sanciones vigentes.
    status VARCHAR(20) NOT NULL DEFAULT 'ABIERTO'
        CHECK (status IN ('ABIERTO', 'EN_SEGUIMIENTO', 'CON_SANCION', 'ARCHIVADO')),
    responsible_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    defense_deadline DATE,
    notify_involved BOOLEAN NOT NULL DEFAULT true,
    -- Propuesta de resolución
    proposed_party_id UUID,
    infraction_id UUID REFERENCES public.infractions(id),
    proposed_sanction VARCHAR(20),
    proposed_quantity INTEGER,
    resolution_basis TEXT,
    archived_reason TEXT,
    opened_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (season, sequence)
);

CREATE INDEX idx_cases_status ON public.disciplinary_cases(status);
CREATE INDEX idx_cases_competition ON public.disciplinary_cases(competition_id);
CREATE INDEX idx_cases_match ON public.disciplinary_cases(match_id);

CREATE TABLE public.case_parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.disciplinary_cases(id) ON DELETE CASCADE,
    party_type VARCHAR(10) NOT NULL CHECK (party_type IN ('PERSONA', 'EQUIPO', 'SEDE')),
    person_id UUID REFERENCES public.persons(id),
    team_id UUID REFERENCES public.teams(id),        -- equipo de la persona o el equipo involucrado
    venue_name VARCHAR(255),
    role_in_case VARCHAR(15) NOT NULL DEFAULT 'DENUNCIADO'
        CHECK (role_in_case IN ('DENUNCIANTE', 'DENUNCIADO', 'INVOLUCRADO', 'TESTIGO')),
    participation VARCHAR(120),                      -- "Entrenador principal", "Atleta"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT chk_case_parties_owner CHECK (
        (party_type = 'PERSONA' AND person_id IS NOT NULL) OR
        (party_type = 'EQUIPO' AND team_id IS NOT NULL AND person_id IS NULL) OR
        (party_type = 'SEDE' AND venue_name IS NOT NULL AND person_id IS NULL)
    )
);

CREATE INDEX idx_case_parties_case ON public.case_parties(case_id);
CREATE INDEX idx_case_parties_person ON public.case_parties(person_id);
CREATE INDEX idx_case_parties_team ON public.case_parties(team_id);

ALTER TABLE public.disciplinary_cases
    ADD CONSTRAINT fk_cases_proposed_party
    FOREIGN KEY (proposed_party_id) REFERENCES public.case_parties(id) ON DELETE SET NULL;

CREATE TABLE public.case_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.disciplinary_cases(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN (
        'REGISTRO', 'APERTURA', 'DESCARGO', 'DOCUMENTO', 'PROPUESTA', 'SANCION', 'ARCHIVO', 'NOTA')),
    description TEXT NOT NULL,
    actor VARCHAR(255) NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_events_case ON public.case_events(case_id, occurred_at);

-- La cronología es un registro: no se modifica ni se borra (salvo al borrar el expediente completo).
CREATE OR REPLACE FUNCTION public.fn_case_events_immutable()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'La cronología del expediente no se puede modificar';
    END IF;
    IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM public.disciplinary_cases WHERE id = OLD.case_id) THEN
        RAISE EXCEPTION 'La cronología del expediente no se puede borrar';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER trg_case_events_immutable
    BEFORE UPDATE OR DELETE ON public.case_events
    FOR EACH ROW EXECUTE FUNCTION public.fn_case_events_immutable();

CREATE TABLE public.case_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.disciplinary_cases(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,                         -- ruta en el bucket privado case-documents
    file_name VARCHAR(255),
    uploaded_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_case_documents_case ON public.case_documents(case_id);

-- ==========================================
-- 4. SANCIONES
-- ==========================================
CREATE TABLE public.sanctions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.disciplinary_cases(id),
    party_id UUID NOT NULL REFERENCES public.case_parties(id),
    person_id UUID REFERENCES public.persons(id),
    team_id UUID REFERENCES public.teams(id),
    infraction_id UUID NOT NULL REFERENCES public.infractions(id),
    sanction_type VARCHAR(20) NOT NULL CHECK (sanction_type IN ('AMONESTACION', 'MULTA', 'SUSPENSION_PARTIDOS',
        'SUSPENSION_MESES', 'PERDIDA_PARTIDO', 'PERDIDA_PUNTOS', 'SUSPENSION_SEDE', 'EXPULSION')),
    quantity INTEGER CHECK (quantity IS NULL OR quantity > 0),
    start_date DATE NOT NULL,
    end_date DATE,                                   -- NULL: sin fecha de fin (expulsión o partidos aún sin programar)
    served_in TEXT,                                  -- "Jornadas 8 y 9 (19 al 27 set)"
    basis TEXT NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'VIGENTE' CHECK (status IN ('VIGENTE', 'ANULADA')),
    applied_by VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT chk_sanctions_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_sanctions_case ON public.sanctions(case_id);
CREATE INDEX idx_sanctions_person ON public.sanctions(person_id);
CREATE INDEX idx_sanctions_team ON public.sanctions(team_id);

-- ¿La persona tiene una suspensión o expulsión en curso en la fecha dada?
CREATE OR REPLACE FUNCTION public.fn_person_is_suspended(p_person_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.sanctions
        WHERE person_id = p_person_id
          AND status = 'VIGENTE'
          AND sanction_type IN ('SUSPENSION_PARTIDOS', 'SUSPENSION_MESES', 'EXPULSION')
          AND start_date <= p_date
          AND (end_date IS NULL OR end_date >= p_date)
    );
$$ LANGUAGE sql STABLE SET search_path = public, pg_temp;

-- ==========================================
-- 5. PROCEDIMIENTO: ABRIR EXPEDIENTE
-- ==========================================
-- Numera el expediente (EXP-AAAA-NN, consecutivo por temporada) y guarda en una sola
-- transacción el expediente, sus involucrados y los primeros movimientos de la cronología.
-- p_parties: [{ "party_type", "person_id", "team_id", "venue_name", "role_in_case", "participation" }]
CREATE OR REPLACE FUNCTION public.sp_open_disciplinary_case(
    p_competition_id UUID,
    p_match_id UUID,
    p_incident_type_code VARCHAR,
    p_title VARCHAR,
    p_facts TEXT,
    p_occurred_at TIMESTAMP WITH TIME ZONE,
    p_moment_detail VARCHAR,
    p_reported_by VARCHAR,
    p_responsible_user_id UUID,
    p_defense_deadline DATE,
    p_notify_involved BOOLEAN,
    p_parties JSONB,
    p_admin_user VARCHAR,
    p_admin_name VARCHAR
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_season INTEGER := EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'America/Costa_Rica'))::INTEGER;
    v_sequence INTEGER;
    v_party JSONB;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF p_parties IS NULL OR jsonb_array_length(p_parties) = 0 THEN
        RAISE EXCEPTION 'Agregue al menos un involucrado';
    END IF;

    IF p_match_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.matches WHERE id = p_match_id AND competition_id = p_competition_id
    ) THEN
        RAISE EXCEPTION 'El partido no pertenece a la competencia seleccionada';
    END IF;

    -- Un consecutivo por temporada, sin choques entre dos aperturas simultáneas.
    PERFORM pg_advisory_xact_lock(hashtext('disciplinary_cases'), v_season);
    SELECT COALESCE(MAX(sequence), 0) + 1 INTO v_sequence FROM public.disciplinary_cases WHERE season = v_season;

    INSERT INTO public.disciplinary_cases (
        case_number, season, sequence, competition_id, match_id, incident_type_value_id,
        title, facts, occurred_at, moment_detail, reported_by,
        responsible_user_id, defense_deadline, notify_involved, opened_by
    ) VALUES (
        'EXP-' || v_season || '-' || LPAD(v_sequence::TEXT, 2, '0'), v_season, v_sequence,
        p_competition_id, p_match_id, public.fn_catalog_value_id('Tipos de incidente', p_incident_type_code),
        p_title, p_facts, p_occurred_at, p_moment_detail, p_reported_by,
        p_responsible_user_id, p_defense_deadline, COALESCE(p_notify_involved, true), p_admin_user
    ) RETURNING id INTO v_id;

    FOR v_party IN SELECT * FROM jsonb_array_elements(p_parties) LOOP
        INSERT INTO public.case_parties (case_id, party_type, person_id, team_id, venue_name, role_in_case, participation)
        VALUES (
            v_id,
            v_party->>'party_type',
            NULLIF(v_party->>'person_id', '')::UUID,
            NULLIF(v_party->>'team_id', '')::UUID,
            NULLIF(v_party->>'venue_name', ''),
            COALESCE(NULLIF(v_party->>'role_in_case', ''), 'DENUNCIADO'),
            NULLIF(v_party->>'participation', '')
        );
    END LOOP;

    INSERT INTO public.case_events (case_id, event_type, description, actor, occurred_at)
    VALUES (v_id, 'REGISTRO', 'Incidente ocurrido' || COALESCE(' · reportado por ' || p_reported_by, ''),
            COALESCE(p_reported_by, p_admin_name), p_occurred_at);

    INSERT INTO public.case_events (case_id, event_type, description, actor)
    VALUES (v_id, 'APERTURA', 'Expediente abierto por FECOVOL', p_admin_name);

    IF p_defense_deadline IS NOT NULL THEN
        INSERT INTO public.case_events (case_id, event_type, description, actor)
        VALUES (v_id, 'DESCARGO',
                'Descargo solicitado a los involucrados (plazo: ' || TO_CHAR(p_defense_deadline, 'DD/MM/YYYY') || ')',
                p_admin_name);
    END IF;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.sp_open_disciplinary_case(
    UUID, UUID, VARCHAR, VARCHAR, TEXT, TIMESTAMP WITH TIME ZONE, VARCHAR, VARCHAR, UUID, DATE, BOOLEAN, JSONB, VARCHAR, VARCHAR
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_open_disciplinary_case(
    UUID, UUID, VARCHAR, VARCHAR, TEXT, TIMESTAMP WITH TIME ZONE, VARCHAR, VARCHAR, UUID, DATE, BOOLEAN, JSONB, VARCHAR, VARCHAR
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_person_is_suspended(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_person_is_suspended(UUID, DATE) TO service_role;

-- ==========================================
-- 6. RLS
-- ==========================================
-- Sin políticas: solo el backend (service role) lee y escribe.
ALTER TABLE public.infractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disciplinary_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctions ENABLE ROW LEVEL SECURITY;
