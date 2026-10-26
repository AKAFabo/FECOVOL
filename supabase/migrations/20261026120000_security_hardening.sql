-- Migration: endurecimiento de seguridad de la base (RLS, permisos de funciones y bitácora)
--
-- Contexto: el frontend usa la llave pública (anon) de Supabase, que cualquiera puede ver en el
-- navegador. Con esa llave se puede llamar directamente a la API REST de Supabase, sin pasar por
-- nuestro backend. Esta migración cierra lo que quedaba abierto por ese camino:
--
--   1. Tablas sin RLS (roles, catalogs, catalog_values, system_parameters): cualquiera podía
--      leerlas y modificarlas.
--   2. Funciones SECURITY DEFINER que cualquiera podía ejecutar: crear o cambiar perfiles de
--      usuario (escalar a Administrador), cambiar parámetros, revocar sesiones ajenas, etc.
--   3. Un usuario podía cambiar su propio rol, estado u organización actualizando su fila de
--      user_profiles (la política de "actualizar su propio perfil" no limita columnas).
--   4. Cualquiera, sin sesión, podía insertar registros falsos en la bitácora de auditoría.
--   5. Datos personales expuestos sin sesión: personas activas (cédula, fecha de nacimiento,
--      teléfono, contacto de emergencia), nóminas y todas las asociaciones con cédula jurídica,
--      correo y teléfono. El portal público no necesita esas lecturas: usa /api/public del
--      backend, que publica solo los campos autorizados.
--   6. Funciones sin search_path fijo y la vista v_standings como SECURITY DEFINER.
--
-- Se cuidó no romper los flujos que hoy existen en el frontend: inicio de sesión (lee su perfil,
-- su rol y su asociación, y actualiza last_login), definir contraseña (PENDIENTE_CONTRASENA →
-- ACTIVA), pantallas de administración (catálogos, parámetros, usuarios) para Administradores y
-- registros de auditoría que hace el propio usuario con sesión.

-- ============================================================================================
-- 1. RLS en las tablas que no la tenían
-- ============================================================================================

-- roles: ya tenía la política de lectura para usuarios con sesión; faltaba activar RLS.
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- catalogs y catalog_values: se leen en formularios; solo el Administrador los modifica.
ALTER TABLE public.catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catálogos: lectura" ON public.catalogs
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Catálogos: escritura solo Administrador" ON public.catalogs
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Valores de catálogo: lectura" ON public.catalog_values
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Valores de catálogo: escritura solo Administrador" ON public.catalog_values
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- system_parameters: lectura con sesión; cambios solo del Administrador y nunca en los de solo lectura.
ALTER TABLE public.system_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parámetros: lectura con sesión" ON public.system_parameters
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Parámetros: alta solo Administrador" ON public.system_parameters
    FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Parámetros: cambio solo Administrador" ON public.system_parameters
    FOR UPDATE TO authenticated
    USING (public.is_admin() AND COALESCE(is_readonly, false) = false)
    WITH CHECK (public.is_admin() AND COALESCE(is_readonly, false) = false);
CREATE POLICY "Parámetros: borrado solo Administrador" ON public.system_parameters
    FOR DELETE TO authenticated
    USING (public.is_admin() AND COALESCE(is_readonly, false) = false);

-- ============================================================================================
-- 2. user_profiles: un usuario no puede cambiarse a sí mismo el rol, la organización ni el estado
-- ============================================================================================
-- RLS no puede limitar columnas, así que se valida en un trigger. Solo aplica a solicitudes que
-- llegan directo desde el navegador (roles anon/authenticated). El backend (service_role) y los
-- procedimientos almacenados no pasan por esta regla.
CREATE OR REPLACE FUNCTION public.fn_user_profiles_proteger_campos()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER a propósito: así current_user es el rol de quien hace la solicitud.
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.role_id IS DISTINCT FROM OLD.role_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'No tiene permiso para cambiar el rol, la organización o el correo de una cuenta.'
            USING ERRCODE = '42501';
    END IF;

    -- Único cambio de estado permitido al propio usuario: terminar de definir su contraseña.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'PENDIENTE_CONTRASENA' AND NEW.status = 'ACTIVA' AND NEW.id = auth.uid()) THEN
        RAISE EXCEPTION 'No tiene permiso para cambiar el estado de una cuenta.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_user_profiles_proteger_campos() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_user_profiles_proteger_campos ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_proteger_campos
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.fn_user_profiles_proteger_campos();

-- ============================================================================================
-- 3. Bitácora: sin inserciones anónimas y sin suplantar a otro usuario
-- ============================================================================================
DROP POLICY IF EXISTS "allow_authenticated_insert_audit" ON public.audit_logs;

CREATE POLICY "Bitácora: registro con sesión" ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);

-- Cuando el registro llega directo desde el navegador, el usuario y la hora los pone la base, no
-- el cliente. Los triggers de auditoría y los procedimientos (SECURITY DEFINER) no se tocan.
CREATE OR REPLACE FUNCTION public.fn_audit_logs_sellar_origen()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER a propósito: así current_user es el rol de quien hace la solicitud.
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user IN ('anon', 'authenticated') THEN
        NEW.usuario := COALESCE(NULLIF(auth.jwt() ->> 'email', ''), 'usuario sin correo');
        NEW.fecha_hora := now();
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_audit_logs_sellar_origen() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_logs_sellar_origen ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_sellar_origen
    BEFORE INSERT ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_logs_sellar_origen();

-- ============================================================================================
-- 4. Datos personales y de asociaciones: nada sin sesión, y con sesión solo lo propio
-- ============================================================================================
-- El portal público lee estos datos a través de /api/public (backend con service_role), que
-- solo publica los campos autorizados (RF-DIV-004).

-- Personas: antes cualquiera podía leer todas las personas activas, con cédula y contactos.
DROP POLICY IF EXISTS "Personas: lectura delimitada" ON public.persons;
CREATE POLICY "Personas: lectura delimitada" ON public.persons
    FOR SELECT TO authenticated
    USING (
        public.is_fecovol_staff()
        OR association_id = public.get_user_organization_id()
        OR user_id = auth.uid()
    );

-- Nóminas: antes cualquiera podía leer las nóminas activas.
DROP POLICY IF EXISTS "Nomina: lectura delimitada" ON public.team_members;
CREATE POLICY "Nomina: lectura delimitada" ON public.team_members
    FOR SELECT TO authenticated
    USING (
        public.is_fecovol_staff()
        OR EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = team_members.team_id
              AND t.association_id = public.get_user_organization_id()
        )
    );

-- Asociaciones: antes cualquiera podía leer todas, incluidas las provisionales, con cédula
-- jurídica, dirección, correo y teléfono.
DROP POLICY IF EXISTS "Allow public read on associations" ON public.associations;
CREATE POLICY "Asociaciones: lectura delimitada" ON public.associations
    FOR SELECT TO authenticated
    USING (public.is_fecovol_staff() OR id = public.get_user_organization_id());

-- ============================================================================================
-- 5. Funciones: nadie las ejecuta desde el navegador salvo las que usan las políticas
-- ============================================================================================
-- Procedimientos de escritura, sesiones y triggers: solo el backend (service_role).
-- Los triggers siguen funcionando: PostgreSQL no revisa EXECUTE al dispararlos.
DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS firma
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'sp_create_user_profile', 'sp_update_user_profile',
              'sp_upsert_catalog_value', 'sp_update_system_parameter', 'sp_log_system_event',
              'fn_get_user_sessions', 'fn_revoke_user_sessions', 'fn_revoke_other_sessions',
              'fn_get_earliest_audit_date', 'fn_get_association_dependencies',
              'fn_get_catalog_value_dependencies',
              'sp_create_competition', 'sp_register_team_in_competition',
              'sp_schedule_match', 'sp_record_match_result',
              'trg_audit_generic', 'fn_auto_attach_audit_trigger',
              'fn_prevent_audit_logs_mutation', 'fn_prevent_last_admin_removal',
              'news_set_updated_at'
          )
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.firma);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.firma);
    END LOOP;
END $$;

-- is_admin(), is_fecovol_staff() y get_user_organization_id() se quedan ejecutables: las políticas
-- RLS las llaman con el rol de quien consulta, y solo responden sobre el propio usuario.

-- ============================================================================================
-- 6. search_path fijo en todas las funciones de public que no lo tenían
-- ============================================================================================
DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS firma
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
          AND (p.proconfig IS NULL OR NOT EXISTS (
              SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
          ))
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f.firma);
    END LOOP;
END $$;

-- ============================================================================================
-- 7. Vista de posiciones con los permisos de quien consulta
-- ============================================================================================
-- El backend (service_role) la sigue leyendo igual; desde el navegador ya no salta la RLS.
ALTER VIEW public.v_standings SET (security_invoker = true);
