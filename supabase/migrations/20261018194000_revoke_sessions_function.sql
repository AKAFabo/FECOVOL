-- Migration: 013_revoke_sessions_function
-- Description: Función para revocar sesiones activas en auth.sessions (RF-SEG-003).
-- Frente: Seguridad (Estudiante 1)

CREATE OR REPLACE FUNCTION public.fn_revoke_user_sessions(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Eliminar las sesiones activas en el esquema interno auth de Supabase
    DELETE FROM auth.sessions WHERE user_id = p_user_id;
    -- Limpiar refresh tokens asociados a sesiones inexistentes
    DELETE FROM auth.refresh_tokens WHERE session_id NOT IN (SELECT id FROM auth.sessions);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.fn_revoke_user_sessions(UUID) TO service_role;
