-- Migration: 009_user_profiles_admin_rls
-- Description: Permite a los usuarios con rol 'Administrador' ver y gestionar todos los perfiles de public.user_profiles.
-- Frente: Seguridad (Estudiante 1)

-- 1. Habilitar RLS en public.user_profiles si no estuviera habilitado
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 2. Función auxiliar SECURITY DEFINER para verificar rol Administrador sin provocar recursión infinita en RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.user_profiles up
        JOIN public.roles r ON up.role_id = r.id
        WHERE up.id = auth.uid() 
          AND r.name = 'Administrador'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Política de SELECT: Un usuario puede ver su propio perfil O un Administrador puede ver todos los perfiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own profile or admins view all" ON public.user_profiles;

CREATE POLICY "Users can view own profile or admins view all"
    ON public.user_profiles
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = id OR public.is_admin()
    );

-- 4. Política de UPDATE: Un usuario puede actualizar su propio perfil O un Administrador puede actualizar cualquiera
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile or admins update all" ON public.user_profiles;

CREATE POLICY "Users can update own profile or admins update all"
    ON public.user_profiles
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = id OR public.is_admin()
    );

-- 5. Política de DELETE: Solo Administradores pueden eliminar perfiles
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.user_profiles;

CREATE POLICY "Admins can delete profiles"
    ON public.user_profiles
    FOR DELETE
    TO authenticated
    USING (
        public.is_admin()
    );
