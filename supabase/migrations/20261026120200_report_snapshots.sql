-- Migration: Report Snapshots
-- Description: Guarda el estado exacto de un reporte generado para su posterior descarga.

CREATE TABLE IF NOT EXISTS public.report_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(50) NOT NULL,
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    parameters JSONB DEFAULT '{}'::jsonb,
    data JSONB NOT NULL,
    generated_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_snapshots_competition 
ON public.report_snapshots(competition_id, created_at DESC);

ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura a autenticados" ON public.report_snapshots;
CREATE POLICY "Permitir lectura a autenticados"
ON public.report_snapshots FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Permitir inserción a autenticados" ON public.report_snapshots;
CREATE POLICY "Permitir inserción a autenticados"
ON public.report_snapshots FOR INSERT
TO authenticated
WITH CHECK (true);