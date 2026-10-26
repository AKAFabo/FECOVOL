-- Migration: 015_user_sessions_management
-- Description: Funciones para consultar sesiones activas y revocar sesiones de usuario (RF-SEG-003, RF-SEG-007).
-- Frente: Seguridad (Estudiante 1)

-- 1. Consultar sesiones activas de un usuario desde auth.sessions
CREATE OR REPLACE FUNCTION public.fn_get_user_sessions(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    ip INET,
    user_agent TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.created_at, s.updated_at, s.ip, s.user_agent
    FROM auth.sessions s
    WHERE s.user_id = p_user_id
    ORDER BY s.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.fn_get_user_sessions(UUID) TO authenticated, service_role;

-- 2. Revocar otras sesiones abiertas de un usuario (para uso al cambiar contraseña)
CREATE OR REPLACE FUNCTION public.fn_revoke_other_sessions(p_user_id UUID, p_current_session_id UUID DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    IF p_current_session_id IS NOT NULL THEN
        DELETE FROM auth.sessions 
        WHERE user_id = p_user_id AND id != p_current_session_id;
    ELSE
        -- Si no se especifica la sesión actual, revocar todas las sesiones
        DELETE FROM auth.sessions WHERE user_id = p_user_id;
    END IF;

    -- Limpiar refresh tokens huérfanos
    DELETE FROM auth.refresh_tokens WHERE session_id NOT IN (SELECT id FROM auth.sessions);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.fn_revoke_other_sessions(UUID, UUID) TO authenticated, service_role;
