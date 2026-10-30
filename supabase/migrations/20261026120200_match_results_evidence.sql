-- Migration: Evidencias y Validación de Resultados
-- Description: Agrega el estado del acta, los validadores y una tabla para adjuntar la hoja de anotación y fotos.

-- Agrega las columnas de control de acta a la tabla de partidos
ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS acta_status VARCHAR(20) NOT NULL DEFAULT 'BORRADOR' 
CHECK (acta_status IN ('BORRADOR', 'ENVIADA', 'VALIDADA')),
ADD COLUMN IF NOT EXISTS validated_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP WITH TIME ZONE;

-- Crea la tabla para almacenar múltiples evidencias por partido (fotos, PDFs)
CREATE TABLE IF NOT EXISTS public.match_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_type VARCHAR(50), -- 'HOJA_ANOTACION', 'FOTO_EQUIPO', 'INCIDENTE'
    description TEXT,
    uploaded_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilita RLS en la nueva tabla para cumplir con las políticas de seguridad
ALTER TABLE public.match_evidence ENABLE ROW LEVEL SECURITY;

-- Permite la lectura y escritura solo a usuarios autenticados (el backend usa service_role)
DROP POLICY IF EXISTS "Permitir lectura a autenticados" ON public.match_evidence;
CREATE POLICY "Permitir lectura a autenticados"
ON public.match_evidence FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Permitir inserción a autenticados" ON public.match_evidence;
CREATE POLICY "Permitir inserción a autenticados"
ON public.match_evidence FOR INSERT
TO authenticated
WITH CHECK (true);

-- Crea un índice para buscar evidencias por partido rápidamente
CREATE INDEX IF NOT EXISTS idx_match_evidence_match 
ON public.match_evidence(match_id);