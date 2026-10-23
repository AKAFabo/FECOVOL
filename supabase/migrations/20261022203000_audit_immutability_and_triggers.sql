-- Migration: 20261022203000_audit_immutability_and_triggers.sql
-- Description: Inmutabilidad estricta de audit_logs, sanitización de datos sensibles,
--              diferenciación de procesos de sistema y disparadores en tablas operativas (RF-AUD-003)
-- Frente: Administración de Datos y Auditoría (Estudiante 1)

-- 1. Ampliar tamaño de columna accion para soportar eventos descriptivos (INTENTO_FALLIDO, PROCESO_AUTOMATICO, etc.)
ALTER TABLE public.audit_logs 
ALTER COLUMN accion TYPE VARCHAR(50);

-- 2. Función genérica de auditoría mejorada:
--    - Elimina contraseñas, tokens y secretos de los registros JSONB.
--    - Identifica y etiqueta inequívocamente los procesos automáticos del sistema.
CREATE OR REPLACE FUNCTION public.trg_audit_generic()
RETURNS TRIGGER AS $$
DECLARE
    v_usuario_name VARCHAR;
    v_registro_id VARCHAR;
    v_viejo JSONB := NULL;
    v_nuevo JSONB := NULL;
    v_is_system BOOLEAN := false;
BEGIN
    -- 2.1 Verificar si la transacción fue marcada explícitamente como proceso automático
    BEGIN
        IF current_setting('app.is_system', true) = 'true' THEN
            v_is_system := true;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_is_system := false;
    END;

    -- 2.2 Intentar obtener el correo del usuario a partir del JWT de Supabase
    BEGIN
        v_usuario_name := current_setting('request.jwt.claims', true)::json->>'email';
    EXCEPTION WHEN OTHERS THEN
        v_usuario_name := NULL;
    END;

    -- 2.3 Si no hay JWT (ej. peticiones Backend Node.js con Service Role), consultar variable de sesión
    IF v_usuario_name IS NULL OR v_usuario_name = '' THEN
        BEGIN
            v_usuario_name := current_setting('app.current_user', true);
        EXCEPTION WHEN OTHERS THEN
            v_usuario_name := NULL;
        END;
    END IF;

    -- 2.4 Diferenciación de procesos automáticos vs usuarios reales
    IF v_is_system OR v_usuario_name IN ('system', 'seed', 'cron', 'service_role', 'migration', 'background', 'postgres', 'supabase_admin') THEN
        v_usuario_name := 'Sistema (Proceso automático)';
    ELSIF v_usuario_name IS NULL OR v_usuario_name = '' THEN
        v_usuario_name := 'Sistema (Proceso automático)';
    END IF;

    -- 2.5 Capturar valores anteriores y posteriores según la operación
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

    -- 2.6 Sanitización estricta: Eliminar contraseñas, hashes y tokens de los objetos JSONB
    IF v_viejo IS NOT NULL THEN
        v_viejo := v_viejo - 'password' - 'encrypted_password' - 'token' - 'recovery_token' - 'secret' - 'salt' - 'refresh_token' - 'hash';
    END IF;
    IF v_nuevo IS NOT NULL THEN
        v_nuevo := v_nuevo - 'password' - 'encrypted_password' - 'token' - 'recovery_token' - 'secret' - 'salt' - 'refresh_token' - 'hash';
    END IF;

    -- 2.7 Si es UPDATE y no hubo cambios sustanciales en los datos, no registrar
    IF TG_OP = 'UPDATE' AND v_viejo = v_nuevo THEN
        RETURN NEW;
    END IF;

    -- 2.8 Inserción en la bitácora
    INSERT INTO public.audit_logs (usuario, accion, tabla, registro_id, registro_viejo, registro_nuevo)
    VALUES (v_usuario_name, TG_OP, TG_TABLE_NAME, v_registro_id, v_viejo, v_nuevo);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. INMUTABILIDAD ESTRICTA DE LA BITÁCORA:
--    Disparador que impide de manera absoluta el borrado o alteración de registros en audit_logs.
CREATE OR REPLACE FUNCTION public.fn_prevent_audit_logs_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Operación no permitida: La bitácora de auditoría es inmutable. No se permite actualizar ni eliminar registros históricos.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_audit_logs_mutation ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_logs_mutation
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prevent_audit_logs_mutation();


-- 4. POLÍTICAS DE SEGURIDAD POR FILA (RLS) EN audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 4.1 Permitir lectura a usuarios autenticados
DROP POLICY IF EXISTS allow_authenticated_read_audit ON public.audit_logs;
CREATE POLICY allow_authenticated_read_audit
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (true);

-- 4.2 Permitir inserción de eventos (como LOGOUT, accesos denegados o auditoría)
DROP POLICY IF EXISTS allow_authenticated_insert_audit ON public.audit_logs;
CREATE POLICY allow_authenticated_insert_audit
    ON public.audit_logs
    FOR INSERT
    TO authenticated, anon, service_role
    WITH CHECK (true);

-- Nota: No existen políticas ni permisos para UPDATE ni DELETE, garantizando la inmutabilidad tanto a nivel RLS como a nivel de Trigger.


-- 5. ADJUNTAR DISPARADORES DE AUDITORÍA EN TABLAS MAESTRAS Y OPERATIVAS
--    Garantiza trazabilidad completa en todas las entidades del sistema deportivo.

-- Tablas de Asociaciones
DROP TRIGGER IF EXISTS audit_associations ON public.associations;
CREATE TRIGGER audit_associations
    AFTER INSERT OR UPDATE OR DELETE ON public.associations
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();

DROP TRIGGER IF EXISTS audit_association_board_members ON public.association_board_members;
CREATE TRIGGER audit_association_board_members
    AFTER INSERT OR UPDATE OR DELETE ON public.association_board_members
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();

-- Tablas de Equipos
DROP TRIGGER IF EXISTS audit_teams ON public.teams;
CREATE TRIGGER audit_teams
    AFTER INSERT OR UPDATE OR DELETE ON public.teams
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();

DROP TRIGGER IF EXISTS audit_team_members ON public.team_members;
CREATE TRIGGER audit_team_members
    AFTER INSERT OR UPDATE OR DELETE ON public.team_members
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();

-- Tablas de Personas / Afiliados
DROP TRIGGER IF EXISTS audit_persons ON public.persons;
CREATE TRIGGER audit_persons
    AFTER INSERT OR UPDATE OR DELETE ON public.persons
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();

DROP TRIGGER IF EXISTS audit_person_roles ON public.person_roles;
CREATE TRIGGER audit_person_roles
    AFTER INSERT OR UPDATE OR DELETE ON public.person_roles
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();

-- Tablas de Documentos y Evidencias
DROP TRIGGER IF EXISTS audit_documents ON public.documents;
CREATE TRIGGER audit_documents
    AFTER INSERT OR UPDATE OR DELETE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();

-- Tablas de Arbitraje
DROP TRIGGER IF EXISTS audit_referee_assignments ON public.referee_assignments;
CREATE TRIGGER audit_referee_assignments
    AFTER INSERT OR UPDATE OR DELETE ON public.referee_assignments
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();


-- 6. PROCEDIMIENTO ALMACENADO PARA REGISTRO MANUAL DE PROCESOS DEL SISTEMA
CREATE OR REPLACE FUNCTION public.sp_log_system_event(
    p_proceso TEXT,
    p_tabla TEXT DEFAULT 'sistema',
    p_registro_id TEXT DEFAULT NULL,
    p_detalles JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.audit_logs (
        usuario,
        accion,
        tabla,
        registro_id,
        registro_viejo,
        registro_nuevo
    ) VALUES (
        'Sistema (Proceso automático)',
        'PROCESO_AUTOMATICO',
        COALESCE(p_tabla, 'sistema'),
        p_registro_id,
        NULL,
        jsonb_build_object(
            'evento', p_proceso,
            'detalles', p_detalles,
            'timestamp', NOW()
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
