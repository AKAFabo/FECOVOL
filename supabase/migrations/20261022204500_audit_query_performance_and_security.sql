-- Migration: 20261022204500_audit_query_performance_and_security.sql
-- Description: Optimización de consultas de bitácora, índices compuestos para rangos de fecha
--              y restricción estricta de acceso RLS solo a Administradores (RF-AUD-004)
-- Frente: Administración de Datos y Auditoría (Estudiante 1)

-- 1. Actualizar la función auxiliar is_admin() para contemplar tanto el rol directo como la relación N:M
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.user_profiles up
        LEFT JOIN public.roles r ON up.role_id = r.id
        LEFT JOIN public.user_roles ur ON ur.user_id = up.id
        LEFT JOIN public.roles r2 ON ur.role_id = r2.id
        WHERE up.id = auth.uid() 
          AND (r.name = 'Administrador' OR r2.name = 'Administrador')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Asegurar que solo usuarios con rol Administrador puedan consultar la bitácora (Criterio de Rechazo 2)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_authenticated_read_audit ON public.audit_logs;
CREATE POLICY allow_authenticated_read_audit
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
    );

-- 3. Índices de alto rendimiento para filtrado rápido por rangos de fechas, entidad afectada y usuarios
CREATE INDEX IF NOT EXISTS idx_audit_logs_usuario 
    ON public.audit_logs(usuario);

CREATE INDEX IF NOT EXISTS idx_audit_logs_registro_id 
    ON public.audit_logs(registro_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_accion 
    ON public.audit_logs(accion);

CREATE INDEX IF NOT EXISTS idx_audit_logs_fecha_hora_desc 
    ON public.audit_logs(fecha_hora DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tabla_registro 
    ON public.audit_logs(tabla, registro_id);

-- 4. Función para obtener la fecha del registro más antiguo conservado en la bitácora (Excepción 3)
CREATE OR REPLACE FUNCTION public.fn_get_earliest_audit_date()
RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
    v_fecha TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT MIN(fecha_hora) INTO v_fecha FROM public.audit_logs;
    RETURN COALESCE(v_fecha, NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
