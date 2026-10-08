-- Migration: 001_initial_security_data_audit_schema
-- Description: Creates the foundation for Security, Data Administration (Catalogs), and Audit Log modules.
-- Includes an automatic Event Trigger to dynamically attach the audit trigger to all new non-temporary public tables.

-- ==========================================
-- 1. SECURITY & USERS
-- ==========================================

CREATE TABLE public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);

INSERT INTO public.roles (name, description) VALUES
    ('Administrador', 'Administrador general de FECOVOL con acceso total'),
    ('Personal', 'Personal de FECOVOL / Gestor de competencias'),
    ('Representante', 'Representante de asociación o club'),
    ('Arbitro', 'Miembro del cuerpo arbitral');

CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role_id UUID REFERENCES public.roles(id),
    organization_id UUID, 
    status VARCHAR(20) DEFAULT 'ACTIVA' CHECK (status IN ('ACTIVA', 'SUSPENDIDA')),
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 2. DATA ADMINISTRATION (Catalogs & Params)
-- ==========================================

CREATE TABLE public.catalogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public.catalogs (name, description) VALUES
    ('Categorías', 'Categorías de los equipos'),
    ('Ramas', 'Ramas deportivas'),
    ('Modalidades', 'Modalidades de voleibol'),
    ('Posiciones', 'Posiciones de juego'),
    ('Tipos de documento', 'Tipos de identificaciones'),
    ('Tipos de incidente', 'Clasificación de incidentes'),
    ('Tipos de sanción', 'Clasificación de sanciones'),
    ('Tipos de oficial', 'Roles dentro de un partido'),
    ('Estados de partido', 'Estados posibles de un encuentro');

CREATE TABLE public.catalog_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id UUID REFERENCES public.catalogs(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    value VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(catalog_id, code)
);

CREATE TABLE public.system_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 3. AUDIT LOGS (Bitácora)
-- ==========================================

CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha_hora TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    usuario VARCHAR(255) NOT NULL,
    accion VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
    tabla VARCHAR(100) NOT NULL,
    registro_id VARCHAR(255),
    registro_viejo JSONB,
    registro_nuevo JSONB
);

CREATE INDEX idx_audit_logs_tabla ON public.audit_logs(tabla);
CREATE INDEX idx_audit_logs_fecha ON public.audit_logs(fecha_hora);

-- Generic Trigger Function that logs rows to audit_logs
CREATE OR REPLACE FUNCTION public.trg_audit_generic()
RETURNS TRIGGER AS $$
DECLARE
    v_usuario_name VARCHAR;
    v_registro_id VARCHAR;
    v_viejo JSONB := NULL;
    v_nuevo JSONB := NULL;
BEGIN
    -- 1. Intentar obtener el usuario del JWT (Supabase Client directo)
    v_usuario_name := current_setting('request.jwt.claims', true)::json->>'email';
    
    -- 2. Si es nulo (Backend Node.js con Service Role), intentar leer variable local
    IF v_usuario_name IS NULL THEN
        v_usuario_name := current_setting('app.current_user', true);
    END IF;
    
    -- 3. Fallback
    IF v_usuario_name IS NULL THEN
        v_usuario_name := 'Admin BD';
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_registro_id := row_to_json(OLD)->>'id';
        v_viejo := row_to_json(OLD)::JSONB;
    ELSIF TG_OP = 'UPDATE' THEN
        v_registro_id := row_to_json(NEW)->>'id';
        v_viejo := row_to_json(OLD)::JSONB;
        v_nuevo := row_to_json(NEW)::JSONB;
    ELSIF TG_OP = 'INSERT' THEN
        v_registro_id := row_to_json(NEW)->>'id';
        v_nuevo := row_to_json(NEW)::JSONB;
    END IF;

    -- Si es UPDATE y no cambiaron valores, no registrar nada
    IF TG_OP = 'UPDATE' AND v_viejo = v_nuevo THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.audit_logs (usuario, accion, tabla, registro_id, registro_viejo, registro_nuevo)
    VALUES (v_usuario_name, TG_OP, TG_TABLE_NAME, v_registro_id, v_viejo, v_nuevo);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers manuales para las tablas creadas en este script
CREATE TRIGGER audit_user_profiles
    AFTER INSERT OR UPDATE OR DELETE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();

CREATE TRIGGER audit_catalog_values
    AFTER INSERT OR UPDATE OR DELETE ON public.catalog_values
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();

CREATE TRIGGER audit_system_parameters
    AFTER INSERT OR UPDATE OR DELETE ON public.system_parameters
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();


-- ==========================================
-- 4. AUTOMATIC EVENT TRIGGER (Para tablas futuras)
-- ==========================================

-- Función que se ejecuta tras cada CREATE TABLE
CREATE OR REPLACE FUNCTION public.fn_auto_attach_audit_trigger()
RETURNS event_trigger AS $$
DECLARE
    r RECORD;
    v_trigger_sql TEXT;
BEGIN
    FOR r IN SELECT * FROM pg_event_trigger_ddl_commands()
    LOOP
        -- Solo aplicar a tablas ordinarias creadas en el esquema 'public'
        -- Excluye audit_logs (evitar recursión), tablas temporales y vistas
        IF r.object_type = 'table' 
           AND r.schema_name = 'public' 
           AND r.object_identity != 'public.audit_logs'
           AND r.schema_name NOT LIKE 'pg_temp%' THEN
           
            v_trigger_sql := format(
                'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();',
                'audit_' || replace(r.object_identity, 'public.', ''),
                r.object_identity
            );
            
            BEGIN
                EXECUTE v_trigger_sql;
            EXCEPTION WHEN duplicate_object THEN
                -- El trigger ya existe, ignorar
                NULL;
            END;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Event trigger que escucha eventos DDL (CREATE TABLE)
DROP EVENT TRIGGER IF EXISTS evt_trg_auto_attach_audit;

CREATE EVENT TRIGGER evt_trg_auto_attach_audit
    ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS')
    EXECUTE FUNCTION public.fn_auto_attach_audit_trigger();
