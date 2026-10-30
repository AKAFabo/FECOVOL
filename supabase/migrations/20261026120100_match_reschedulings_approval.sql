-- Migration: Flujo de Aprobación de Reprogramaciones
-- Description: Agrega estados de aprobación, motivo de rechazo y usuarios intervinientes a la tabla match_reschedulings.

-- Agrega la columna de estado con su restricción
ALTER TABLE public.match_reschedulings
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'APROBADA' 
CHECK (status IN ('PENDIENTE', 'APROBADA', 'RECHAZADA'));

-- Agrega las columnas para rastrear quién solicita y quién aprueba
ALTER TABLE public.match_reschedulings
ADD COLUMN IF NOT EXISTS requested_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Migra los datos históricos: asigna el usuario que reprogramó originalmente como el solicitante
UPDATE public.match_reschedulings
SET requested_by = rescheduled_by
WHERE requested_by IS NULL;

-- Crea un índice para filtrar rápidamente las solicitudes pendientes
CREATE INDEX IF NOT EXISTS idx_reschedulings_status 
ON public.match_reschedulings(status);