-- Endurecimiento de permisos para las llaves públicas (navegador).
--
-- 1. Bitácora: cualquier usuario con sesión podía insertar registros en audit_logs con la llave
--    pública, con el usuario y el texto que quisiera. La bitácora la escriben solo los disparadores
--    y el backend (llave de servicio).
-- 2. Perfiles: la política de actualización del propio perfil no limitaba columnas, así que un
--    usuario podía cambiarse role_id (por ejemplo, a Administrador), su estado o su asociación desde
--    el navegador. Ahora un usuario que no es Administrador solo puede cambiar datos no sensibles de
--    su propio perfil (nombre, último ingreso); el rol, el estado, la asociación y el correo los
--    cambia la Administración o el backend.
-- 3. Evidencias y reportes: las inserciones directas con la llave pública no se usan (todo pasa por
--    el backend) y permitían agregar filas sin control.

-- ==========================================
-- 1. BITÁCORA
-- ==========================================
DROP POLICY IF EXISTS "Bitácora: registro con sesión" ON public.audit_logs;

-- ==========================================
-- 2. PERFILES
-- ==========================================
DROP POLICY IF EXISTS "Users can update own profile or admins update all" ON public.user_profiles;
DROP POLICY IF EXISTS "Los usuarios pueden actualizar su propio perfil" ON public.user_profiles;

CREATE POLICY "Perfiles: el propio usuario o la Administración"
ON public.user_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id OR public.is_admin())
WITH CHECK (auth.uid() = id OR public.is_admin());

CREATE OR REPLACE FUNCTION public.fn_user_profiles_campos_protegidos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Solo se limita lo que llega del navegador con una sesión (rol authenticated). El backend usa
    -- la llave de servicio y las migraciones no tienen auth.uid().
    IF auth.uid() IS NULL OR COALESCE(auth.role(), '') <> 'authenticated' OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.role_id IS DISTINCT FROM OLD.role_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'No tiene permiso para modificar el rol, el estado, la asociación ni el correo de la cuenta'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_campos_protegidos ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_campos_protegidos
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.fn_user_profiles_campos_protegidos();

REVOKE ALL ON FUNCTION public.fn_user_profiles_campos_protegidos() FROM PUBLIC, anon, authenticated;

-- ==========================================
-- 3. EVIDENCIAS Y REPORTES
-- ==========================================
DROP POLICY IF EXISTS "Permitir inserción a autenticados" ON public.match_evidence;
DROP POLICY IF EXISTS "Permitir inserción a autenticados" ON public.report_snapshots;
