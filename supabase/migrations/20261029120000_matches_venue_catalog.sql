-- Migration: 20261029120000_matches_venue_catalog
-- Description:
--   - Asegura el catálogo "Sedes" en catalog_values.
--   - Migra matches.venue (texto libre) a matches.venue_id (FK a catalog_values).
--   - Agrega previous_venue_id y new_venue_id a match_reschedulings.
--   - Actualiza sp_schedule_match para aceptar p_venue_id y mantener compatibilidad con p_venue.
-- Frente: Competencias y Resultados

BEGIN;

-- Asegura el catálogo "Sedes"
INSERT INTO public.catalogs (name, description)
SELECT 'Sedes', 'Gimnasios y sedes deportivas oficiales'
WHERE NOT EXISTS (SELECT 1 FROM public.catalogs WHERE name = 'Sedes');

-- Agrega la columna venue_id a matches (sin FK todavía, para poder migrar)
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS venue_id UUID;

-- Crea un valor en el catálogo de sedes para cada venue único que exista en matches
INSERT INTO public.catalog_values (catalog_id, code, value, is_active)
SELECT 
    c.id,
    'SEDE_' || SUBSTRING(MD5(RANDOM()::text || m.venue), 1, 8),
    m.venue,
    true
FROM (
    SELECT DISTINCT TRIM(venue) AS venue 
    FROM public.matches 
    WHERE venue IS NOT NULL AND TRIM(venue) <> ''
) m
CROSS JOIN public.catalogs c
WHERE c.name = 'Sedes'
  AND NOT EXISTS (
      SELECT 1 FROM public.catalog_values cv 
      WHERE cv.catalog_id = c.id 
        AND LOWER(cv.value) = LOWER(m.venue)
  );

-- Puebla venue_id a partir del nombre del venue
UPDATE public.matches m
SET venue_id = cv.id
FROM public.catalog_values cv
JOIN public.catalogs c ON c.id = cv.catalog_id
WHERE c.name = 'Sedes'
  AND LOWER(cv.value) = LOWER(m.venue)
  AND m.venue IS NOT NULL;

-- Agrega la FK contra catalog_values
ALTER TABLE public.matches
    ADD CONSTRAINT fk_matches_venue
    FOREIGN KEY (venue_id) REFERENCES public.catalog_values(id) ON DELETE SET NULL;

-- Elimina la columna venue antigua
ALTER TABLE public.matches DROP COLUMN IF EXISTS venue;

-- Índice para acelerar filtros por sede
CREATE INDEX IF NOT EXISTS idx_matches_venue_id ON public.matches(venue_id);

-- Agrega columnas de sede a match_reschedulings
--    Los textos se conservan como snapshot histórico del nombre al momento del cambio.
ALTER TABLE public.match_reschedulings 
    ADD COLUMN IF NOT EXISTS previous_venue_id UUID REFERENCES public.catalog_values(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS new_venue_id UUID REFERENCES public.catalog_values(id) ON DELETE SET NULL;

-- Migra los nombres históricos ya guardados a sus IDs (si existen en el catálogo)
UPDATE public.match_reschedulings mr
SET previous_venue_id = cv.id
FROM public.catalog_values cv
JOIN public.catalogs c ON c.id = cv.catalog_id
WHERE c.name = 'Sedes'
  AND cv.value = mr.previous_venue
  AND mr.previous_venue IS NOT NULL;

UPDATE public.match_reschedulings mr
SET new_venue_id = cv.id
FROM public.catalog_values cv
JOIN public.catalogs c ON c.id = cv.catalog_id
WHERE c.name = 'Sedes'
  AND cv.value = mr.new_venue
  AND mr.new_venue IS NOT NULL;

-- Reemplaza sp_schedule_match para aceptar venue_id y mantener compatibilidad con venue texto.
--     El seed usa el nombre de la sede, así que sigue funcionando con p_venue.
DROP FUNCTION IF EXISTS public.sp_schedule_match(UUID, INT, INT, UUID, UUID, DATE, TIME, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION public.sp_schedule_match(
    p_competition_id UUID,
    p_match_number INT,
    p_matchday INT,
    p_home_team_id UUID,
    p_away_team_id UUID,
    p_scheduled_date DATE,
    p_scheduled_time TIME,
    p_admin_user VARCHAR,
    p_venue VARCHAR DEFAULT NULL,
    p_venue_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_comp_start DATE;
    v_comp_end DATE;
    v_venue_id UUID := p_venue_id;
    v_catalog_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT start_date, end_date INTO v_comp_start, v_comp_end 
    FROM public.competitions WHERE id = p_competition_id;

    IF v_comp_start IS NULL THEN
        RAISE EXCEPTION 'No existe la competencia %', p_competition_id;
    END IF;

    IF p_scheduled_date < v_comp_start OR p_scheduled_date > v_comp_end THEN
        RAISE EXCEPTION 'La fecha del partido está fuera del rango de la competencia.';
    END IF;

    -- Si no viene venue_id pero sí un nombre, lo busca o lo crea en el catálogo "Sedes"
    IF v_venue_id IS NULL AND p_venue IS NOT NULL AND TRIM(p_venue) <> '' THEN
        SELECT id INTO v_catalog_id FROM public.catalogs WHERE name = 'Sedes';

        IF v_catalog_id IS NULL THEN
            RAISE EXCEPTION 'No existe el catálogo "Sedes". Asegúrate de haber aplicado la migración.';
        END IF;

        SELECT id INTO v_venue_id FROM public.catalog_values
        WHERE catalog_id = v_catalog_id AND LOWER(value) = LOWER(TRIM(p_venue))
        LIMIT 1;

        IF v_venue_id IS NULL THEN
            INSERT INTO public.catalog_values (catalog_id, code, value, is_active)
            VALUES (
                v_catalog_id,
                'SEDE_' || SUBSTRING(MD5(RANDOM()::text), 1, 8),
                TRIM(p_venue),
                true
            )
            RETURNING id INTO v_venue_id;
        END IF;
    END IF;

    INSERT INTO public.matches (
        competition_id, match_number, matchday, home_team_id, away_team_id, 
        scheduled_date, scheduled_time, venue_id
    ) VALUES (
        p_competition_id, p_match_number, p_matchday, p_home_team_id, p_away_team_id, 
        p_scheduled_date, p_scheduled_time, v_venue_id
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.sp_schedule_match(UUID, INT, INT, UUID, UUID, DATE, TIME, VARCHAR, VARCHAR, UUID)
    SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.sp_schedule_match(UUID, INT, INT, UUID, UUID, DATE, TIME, VARCHAR, VARCHAR, UUID)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sp_schedule_match(UUID, INT, INT, UUID, UUID, DATE, TIME, VARCHAR, VARCHAR, UUID)
    TO service_role;

COMMIT;