-- Migration: 016_user_roles_many_to_many
-- Description: Implementación de relación muchos a muchos (N * M) entre usuarios y roles (RF-SEG-006).
-- Permite que una misma cuenta posea múltiples roles (ej. Administrador + Árbitro).
-- Frente: Seguridad (Estudiante 1)

-- 1. Crear tabla intermedia user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- Índices para optimizar consultas cruzadas
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles(role_id);

-- 2. Migrar los roles existentes de user_profiles a user_roles sin pérdida de datos
INSERT INTO public.user_roles (user_id, role_id)
SELECT id, role_id
FROM public.user_profiles
WHERE role_id IS NOT NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 3. Habilitar Row Level Security (RLS)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Política de lectura: los usuarios pueden leer sus propios roles, y los administradores pueden leer todos
DROP POLICY IF EXISTS "user_roles_select_policy" ON public.user_roles;
CREATE POLICY "user_roles_select_policy"
ON public.user_roles FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.user_profiles up
        JOIN public.roles r ON up.role_id = r.id
        WHERE up.id = auth.uid() AND r.name = 'Administrador'
    )
);

-- Política de modificación: solo service_role y administradores pueden modificar user_roles
DROP POLICY IF EXISTS "user_roles_modify_policy" ON public.user_roles;
CREATE POLICY "user_roles_modify_policy"
ON public.user_roles FOR ALL
TO service_role, authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles up
        JOIN public.roles r ON up.role_id = r.id
        WHERE up.id = auth.uid() AND r.name = 'Administrador'
    )
);

-- 4. Trigger de auditoría para registrar asignación y revocación de roles
DROP TRIGGER IF EXISTS audit_user_roles ON public.user_roles;
CREATE TRIGGER audit_user_roles
    AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();
