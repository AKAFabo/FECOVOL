-- Migration: 20261022174500_audit_catalogs_trigger.sql
-- Description: Adjunta el trigger de auditoría trg_audit_generic a la tabla public.catalogs (RF-AUD-001)
-- Frente: Administración de Datos y Auditoría (Estudiante 1)

-- 1. Agregar updated_at a public.catalogs si no existe
ALTER TABLE public.catalogs 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Eliminar trigger previo si existiera
DROP TRIGGER IF EXISTS audit_catalogs ON public.catalogs;

-- 3. Crear el trigger de auditoría para public.catalogs
CREATE TRIGGER audit_catalogs
    AFTER INSERT OR UPDATE OR DELETE ON public.catalogs
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_generic();
