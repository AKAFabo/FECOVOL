-- Migration: 012_audit_logs_logout_action
-- Description: Soporte de auditoría para eventos de cierre de sesión (RF-SEG-002) en public.audit_logs.
-- Frente: Seguridad y Auditoría (Estudiante 1)

-- En caso de que RLS esté activado o se active en public.audit_logs:
-- Permitir a usuarios autenticados insertar registros de LOGOUT y leer la bitácora
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
          AND tablename = 'audit_logs' 
          AND rowsecurity = true
    ) THEN
        -- Política de inserción de eventos de auditoría para usuarios autenticados
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
              AND tablename = 'audit_logs' 
              AND policyname = 'allow_authenticated_insert_logout'
        ) THEN
            CREATE POLICY allow_authenticated_insert_logout 
                ON public.audit_logs 
                FOR INSERT 
                TO authenticated 
                WITH CHECK (accion = 'LOGOUT');
        END IF;

        -- Política de lectura para administradores / personal autenticado
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
              AND tablename = 'audit_logs' 
              AND policyname = 'allow_authenticated_read_audit'
        ) THEN
            CREATE POLICY allow_authenticated_read_audit 
                ON public.audit_logs 
                FOR SELECT 
                TO authenticated 
                USING (true);
        END IF;
    END IF;
END $$;
