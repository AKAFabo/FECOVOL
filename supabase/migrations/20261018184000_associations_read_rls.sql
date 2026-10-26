-- Migration: 010_associations_read_rls
-- Description: Permite la lectura (SELECT) de la tabla public.associations para usuarios autenticados y visitantes.
-- Frente: Seguridad / Administración de datos (Estudiante 1)

-- 1. Asegurar que RLS esté activo
ALTER TABLE public.associations ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas previas si existieran
DROP POLICY IF EXISTS "Allow read associations" ON public.associations;
DROP POLICY IF EXISTS "Allow authenticated read associations" ON public.associations;
DROP POLICY IF EXISTS "Allow public read on associations" ON public.associations;

-- 3. Crear política para que usuarios autenticados y anónimos puedan consultar las asociaciones
CREATE POLICY "Allow public read on associations"
    ON public.associations
    FOR SELECT
    TO anon, authenticated
    USING (true);
