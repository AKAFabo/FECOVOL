-- Migration: 003_associations_teams_persons_documents_assignments
-- Frente: Asociaciones y Arbitraje (Estudiante 3)
-- Description: Asociaciones, equipos, personas (jugadores, cuerpo tecnico, arbitros),
--              nominas de equipo, documentos y licencias, y designaciones arbitrales.
-- Nota: los triggers de auditoria se adjuntan solos gracias al event trigger de la migracion 001.

-- ==========================================
-- 0. HELPER
-- ==========================================

-- Devuelve el id de un valor de catalogo a partir del nombre del catalogo y el codigo.
CREATE OR REPLACE FUNCTION public.fn_catalog_value_id(
    p_catalog_name VARCHAR,
    p_code VARCHAR
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT cv.id INTO v_id
    FROM public.catalog_values cv
    JOIN public.catalogs c ON c.id = cv.catalog_id
    WHERE c.name = p_catalog_name AND cv.code = p_code;

    IF v_id IS NULL THEN
        RAISE EXCEPTION 'No existe el valor % en el catalogo %', p_code, p_catalog_name;
    END IF;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ==========================================
-- 1. ASOCIACIONES
-- ==========================================

CREATE TABLE public.associations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50),
    tax_id VARCHAR(30) UNIQUE NOT NULL,              -- cedula juridica
    province VARCHAR(50),
    canton VARCHAR(80),
    address TEXT,
    email VARCHAR(255),
    phone VARCHAR(30),
    website VARCHAR(255),
    logo_url TEXT,
    home_venue VARCHAR(255),                         -- gimnasio sede (texto mientras existe el modulo de sedes)
    founded_date DATE,
    affiliation_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'PROVISIONAL'
        CHECK (status IN ('PROVISIONAL', 'AFILIADA', 'SUSPENDIDA', 'DESAFILIADA')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_associations_status ON public.associations(status);

-- La cuenta del representante vive en user_profiles.organization_id (frente 1).
ALTER TABLE public.user_profiles
    ADD CONSTRAINT fk_user_profiles_association
    FOREIGN KEY (organization_id) REFERENCES public.associations(id) ON DELETE SET NULL;

CREATE TABLE public.association_board_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
    position VARCHAR(80) NOT NULL,                   -- Presidencia, Secretaria, Tesoreria...
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(30),
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_board_members_association ON public.association_board_members(association_id);

-- ==========================================
-- 2. EQUIPOS
-- ==========================================

CREATE TABLE public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50),
    category_value_id UUID NOT NULL REFERENCES public.catalog_values(id),   -- catalogo Categorias
    branch_value_id UUID NOT NULL REFERENCES public.catalog_values(id),     -- catalogo Ramas
    modality_value_id UUID NOT NULL REFERENCES public.catalog_values(id),   -- catalogo Modalidades
    home_venue VARCHAR(255),
    primary_color VARCHAR(50),
    secondary_color VARCHAR(50),
    logo_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVO'
        CHECK (status IN ('ACTIVO', 'INACTIVO')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (association_id, name)
);

CREATE INDEX idx_teams_association ON public.teams(association_id);

-- ==========================================
-- 3. PERSONAS (jugadores, cuerpo tecnico, arbitros)
-- ==========================================

CREATE TABLE public.persons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type_value_id UUID NOT NULL REFERENCES public.catalog_values(id), -- catalogo Tipos de documento
    document_number VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(150) NOT NULL,
    birth_date DATE NOT NULL,
    sex VARCHAR(10) CHECK (sex IN ('F', 'M', 'OTRO')),
    nationality VARCHAR(80) DEFAULT 'Costarricense',
    province VARCHAR(50),
    email VARCHAR(255),
    phone VARCHAR(30),
    emergency_contact VARCHAR(255),
    photo_url TEXT,
    association_id UUID REFERENCES public.associations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    is_verified BOOLEAN NOT NULL DEFAULT false,      -- FECOVOL verifica identidad contra el documento
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVA'
        CHECK (status IN ('ACTIVA', 'INACTIVA')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (document_type_value_id, document_number)
);

CREATE INDEX idx_persons_association ON public.persons(association_id);
CREATE INDEX idx_persons_last_name ON public.persons(last_name);

-- En que participa cada persona: jugador, cuerpo tecnico, arbitro, oficial de mesa.
CREATE TABLE public.person_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    role_type VARCHAR(20) NOT NULL
        CHECK (role_type IN ('JUGADOR', 'TECNICO', 'ARBITRO', 'OFICIAL')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (person_id, role_type)
);

-- ==========================================
-- 4. NOMINA DEL EQUIPO
-- ==========================================

CREATE TABLE public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    member_type VARCHAR(20) NOT NULL
        CHECK (member_type IN ('JUGADOR', 'TECNICO')),
    position_value_id UUID REFERENCES public.catalog_values(id),  -- catalogo Posiciones (solo jugadores)
    technical_role VARCHAR(80),                                   -- Entrenador principal, asistente, etc.
    jersey_number SMALLINT CHECK (jersey_number BETWEEN 1 AND 99),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVO'
        CHECK (status IN ('ACTIVO', 'BAJA')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_team_members_team ON public.team_members(team_id);
CREATE INDEX idx_team_members_person ON public.team_members(person_id);

-- Una persona no puede estar dos veces activa en el mismo equipo.
CREATE UNIQUE INDEX uq_team_members_active
    ON public.team_members(team_id, person_id)
    WHERE status = 'ACTIVO';

-- Tampoco se puede repetir el numero de camiseta dentro del mismo equipo.
CREATE UNIQUE INDEX uq_team_members_jersey
    ON public.team_members(team_id, jersey_number)
    WHERE status = 'ACTIVO' AND jersey_number IS NOT NULL;

-- ==========================================
-- 5. DOCUMENTOS Y LICENCIAS
-- ==========================================

CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type_value_id UUID NOT NULL REFERENCES public.catalog_values(id), -- catalogo Tipos de documento
    person_id UUID REFERENCES public.persons(id) ON DELETE CASCADE,
    association_id UUID REFERENCES public.associations(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    issue_date DATE,
    expiry_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'EN_REVISION'
        CHECK (status IN ('EN_REVISION', 'VIGENTE', 'VENCIDO', 'RECHAZADO')),
    notes TEXT,
    uploaded_by VARCHAR(255),
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- cada documento pertenece a una sola cosa: persona, equipo o asociacion
    CONSTRAINT chk_documents_owner CHECK (
        (person_id IS NOT NULL)::int +
        (association_id IS NOT NULL)::int +
        (team_id IS NOT NULL)::int = 1
    )
);

CREATE INDEX idx_documents_person ON public.documents(person_id);
CREATE INDEX idx_documents_association ON public.documents(association_id);
CREATE INDEX idx_documents_expiry ON public.documents(expiry_date);

-- ==========================================
-- 6. DESIGNACIONES ARBITRALES
-- ==========================================

-- match_id queda sin llave foranea hasta que exista public.matches (frente 2).
CREATE TABLE public.referee_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL,
    person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    official_type_value_id UUID NOT NULL REFERENCES public.catalog_values(id), -- catalogo Tipos de oficial
    status VARCHAR(20) NOT NULL DEFAULT 'PROPUESTA'
        CHECK (status IN ('PROPUESTA', 'CONFIRMADA', 'RECHAZADA', 'CUMPLIDA', 'ANULADA')),
    assigned_by VARCHAR(255),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_referee_assignments_match ON public.referee_assignments(match_id);
CREATE INDEX idx_referee_assignments_person ON public.referee_assignments(person_id);

-- Un arbitro no se designa dos veces al mismo partido.
CREATE UNIQUE INDEX uq_referee_assignment_person
    ON public.referee_assignments(match_id, person_id)
    WHERE status <> 'ANULADA';

-- Un mismo puesto (principal, segundo, anotador) se ocupa una sola vez por partido.
CREATE UNIQUE INDEX uq_referee_assignment_role
    ON public.referee_assignments(match_id, official_type_value_id)
    WHERE status <> 'ANULADA';

-- ==========================================
-- 7. RLS
-- ==========================================
-- Se activa RLS sin politicas: el backend usa la service role key y la omite,
-- mientras que la anon key no puede leer ni escribir nada.
ALTER TABLE public.associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.association_board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referee_assignments ENABLE ROW LEVEL SECURITY;
