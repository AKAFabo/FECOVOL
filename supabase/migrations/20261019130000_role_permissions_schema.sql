-- Migration: 017_role_permissions_schema
-- Description: Implementación de permisos por rol (matriz rol-pantallas) para RF-SEG-005.
-- Permite definir y editar qué pantallas/módulos puede acceder cada rol (ej. superuser con acceso total).
-- Frente: Seguridad (Estudiante 1)

-- 1. Crear tabla role_permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    screen_key VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(role_id, screen_key)
);

-- Índices para optimizar consultas de permisos
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_screen_key ON public.role_permissions(screen_key);

-- 2. Configuración de seguridad (RLS)
-- IMPORTANTE: public.roles es una tabla catálogo base del sistema.
-- NO debe tener RLS con subconsultas recursivas a user_profiles o a sí misma, ya que causa el error 42P17.
DROP POLICY IF EXISTS "roles_modify_policy" ON public.roles;
DROP POLICY IF EXISTS "roles_select_policy" ON public.roles;
ALTER TABLE public.roles DISABLE ROW LEVEL SECURITY;

-- Configurar RLS en role_permissions
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Lectura para usuarios autenticados y anónimos (para renderizar navegación según rol)
DROP POLICY IF EXISTS "role_permissions_select_policy" ON public.role_permissions;
CREATE POLICY "role_permissions_select_policy"
ON public.role_permissions FOR SELECT
TO authenticated, anon
USING (true);

-- Modificación exclusiva vía backend (service_role omite RLS por defecto)
DROP POLICY IF EXISTS "role_permissions_modify_policy" ON public.role_permissions;
CREATE POLICY "role_permissions_modify_policy"
ON public.role_permissions FOR ALL
TO service_role
USING (true);

-- 3. Triggers de auditoría para roles y permisos
DROP TRIGGER IF EXISTS audit_roles ON public.roles;
CREATE TRIGGER audit_roles
    AFTER INSERT OR UPDATE OR DELETE ON public.roles
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();

DROP TRIGGER IF EXISTS audit_role_permissions ON public.role_permissions;
CREATE TRIGGER audit_role_permissions
    AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();

-- 4. Sembrado inicial de permisos de subrutas para los roles predeterminados
-- Subrutas principales del sistema (Vistas por rol):
-- '/admin'            -> Entorno de Administración FECOVOL
-- '/arbitro'          -> Entorno de Cuerpo Arbitral
-- '/asociacion'       -> Entorno de Representante de Asociación
-- '/personal'         -> Entorno de Personal Técnico de Competencias
-- Subrutas administrativas internas:
-- '/admin/usuarios'   -> Usuarios y permisos
-- '/admin/listas-valores' -> Listas de valores y roles
-- '/admin/auditoria'  -> Auditoría y respaldos
-- '/admin/perfil'     -> Perfil de usuario y sesiones

-- Limpiar permisos previos en formato antiguo
DELETE FROM public.role_permissions WHERE screen_key NOT LIKE '/%';

-- Administrador: Acceso total a todas las subrutas del sistema (Superuser)
INSERT INTO public.role_permissions (role_id, screen_key)
SELECT r.id, s.subruta
FROM public.roles r
CROSS JOIN (
    VALUES 
        ('/admin'),
        ('/arbitro'),
        ('/asociacion'),
        ('/personal'),
        ('/admin/usuarios'),
        ('/admin/listas-valores'),
        ('/admin/auditoria'),
        ('/admin/perfil')
) AS s(subruta)
WHERE r.name = 'Administrador'
ON CONFLICT (role_id, screen_key) DO NOTHING;

-- Personal: Entorno de Personal Técnico
INSERT INTO public.role_permissions (role_id, screen_key)
SELECT r.id, '/personal'
FROM public.roles r
WHERE r.name = 'Personal'
ON CONFLICT (role_id, screen_key) DO NOTHING;

-- Representante: Entorno de Representante de Asociación
INSERT INTO public.role_permissions (role_id, screen_key)
SELECT r.id, '/asociacion'
FROM public.roles r
WHERE r.name = 'Representante'
ON CONFLICT (role_id, screen_key) DO NOTHING;

-- Arbitro: Entorno de Cuerpo Arbitral
INSERT INTO public.role_permissions (role_id, screen_key)
SELECT r.id, '/arbitro'
FROM public.roles r
WHERE r.name = 'Arbitro'
ON CONFLICT (role_id, screen_key) DO NOTHING;
