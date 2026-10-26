-- Migration: 008_user_status_pending_password
-- Description: Permite el estado 'PENDIENTE_CONTRASENA' en user_profiles.
-- Frente: Seguridad (Estudiante 1)

ALTER TABLE public.user_profiles
    DROP CONSTRAINT IF EXISTS user_profiles_status_check;

ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_status_check
    CHECK (status IN ('ACTIVA', 'SUSPENDIDA', 'PENDIENTE_CONTRASENA'));

COMMENT ON COLUMN public.user_profiles.status IS 'Estados: ACTIVA (vigente), SUSPENDIDA (bloqueada/baja lógica), PENDIENTE_CONTRASENA (nueva cuenta que requiere definir contraseña antes de acceder)';
