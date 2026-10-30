-- Migration: Flujo de Aprobación de Inscripciones
-- Description: Agrega estados de revisión, observaciones y fechas de envío/revisión a la tabla competition_teams.

-- Elimina la restricción de estado anterior para permitir los nuevos estados del flujo
ALTER TABLE public.competition_teams 
DROP CONSTRAINT IF EXISTS competition_teams_status_check;

-- Agrega la nueva restricción con los estados de aprobación
ALTER TABLE public.competition_teams
ADD CONSTRAINT competition_teams_status_check 
CHECK (status IN ('PENDIENTE', 'POR_SUBSANAR', 'DEVUELTA', 'INSCRITO', 'RETIRADO', 'DESCALIFICADO'));

-- Agrega las columnas para gestionar la comunicación y fechas del flujo
ALTER TABLE public.competition_teams
ADD COLUMN IF NOT EXISTS observaciones TEXT,
ADD COLUMN IF NOT EXISTS enviada_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS revisada_at TIMESTAMP WITH TIME ZONE;

-- Actualiza los registros existentes para que no queden nulos en las fechas
UPDATE public.competition_teams 
SET enviada_at = created_at 
WHERE enviada_at IS NULL;

-- Crea un índice para acelerar las búsquedas por estado (útil para el panel de FECOVOL)
CREATE INDEX IF NOT EXISTS idx_competition_teams_status 
ON public.competition_teams(status);