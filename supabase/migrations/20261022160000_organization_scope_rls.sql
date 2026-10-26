-- Migration: 20261022160000_organization_scope_rls.sql
-- Description: Políticas de Row Level Security (RLS) para delimitar información por ámbito de organización y clasificación de visibilidad (RF-SEG-011)
-- Frente: Seguridad y Auditoría (Estudiante 1)

-- =========================================================================
-- 1. FUNCIONES AUXILIARES SECURITY DEFINER (Evitan recursión infinita en RLS)
-- =========================================================================

-- Obtener la organización asociada al usuario autenticado
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT organization_id
        FROM public.user_profiles
        WHERE id = auth.uid()
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comprobar si el usuario autenticado pertenece al personal de FECOVOL o es Administrador
CREATE OR REPLACE FUNCTION public.is_fecovol_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.user_profiles up
        LEFT JOIN public.roles r ON up.role_id = r.id
        LEFT JOIN public.user_roles ur ON ur.user_id = up.id
        LEFT JOIN public.roles r2 ON ur.role_id = r2.id
        WHERE up.id = auth.uid()
          AND (
            LOWER(r.name) IN ('administrador', 'personal') OR
            LOWER(r2.name) IN ('administrador', 'personal')
          )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 2. POLÍTICAS RLS PARA EQUIPOS (public.teams)
-- =========================================================================
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Equipos: lectura pública y por ámbito" ON public.teams;
DROP POLICY IF EXISTS "Equipos: modificación por ámbito" ON public.teams;
DROP POLICY IF EXISTS "Equipos: inserción por ámbito" ON public.teams;

-- SELECT: Administradores ven todo; Representantes ven sus equipos; Público ve equipos activos
CREATE POLICY "Equipos: lectura pública y por ámbito"
    ON public.teams
    FOR SELECT
    TO anon, authenticated
    USING (
        public.is_fecovol_staff() OR
        (auth.uid() IS NOT NULL AND association_id = public.get_user_organization_id()) OR
        (status = 'ACTIVO')
    );

-- INSERT: Solo FECOVOL o la propia asociación
CREATE POLICY "Equipos: inserción por ámbito"
    ON public.teams
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_fecovol_staff() OR
        (association_id = public.get_user_organization_id())
    );

-- UPDATE: Solo FECOVOL o la propia asociación
CREATE POLICY "Equipos: modificación por ámbito"
    ON public.teams
    FOR UPDATE
    TO authenticated
    USING (
        public.is_fecovol_staff() OR
        (association_id = public.get_user_organization_id())
    );

-- =========================================================================
-- 3. POLÍTICAS RLS PARA PERSONAS (public.persons)
-- =========================================================================
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Personas: lectura delimitada" ON public.persons;
DROP POLICY IF EXISTS "Personas: inserción delimitada" ON public.persons;
DROP POLICY IF EXISTS "Personas: modificación delimitada" ON public.persons;

-- SELECT: Administradores ven todo; Representantes ven sus afiliados; Público ve personas activas
CREATE POLICY "Personas: lectura delimitada"
    ON public.persons
    FOR SELECT
    TO anon, authenticated
    USING (
        public.is_fecovol_staff() OR
        (auth.uid() IS NOT NULL AND (association_id IS NULL OR association_id = public.get_user_organization_id())) OR
        (status = 'ACTIVA')
    );

-- INSERT: FECOVOL o representantes para su propia asociación
CREATE POLICY "Personas: inserción delimitada"
    ON public.persons
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_fecovol_staff() OR
        (association_id = public.get_user_organization_id())
    );

-- UPDATE: FECOVOL o la asociación a la que pertenece la persona
CREATE POLICY "Personas: modificación delimitada"
    ON public.persons
    FOR UPDATE
    TO authenticated
    USING (
        public.is_fecovol_staff() OR
        (association_id = public.get_user_organization_id())
    );

-- =========================================================================
-- 4. POLÍTICAS RLS PARA NÓMINA DE EQUIPOS (public.team_members)
-- =========================================================================
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Nomina: lectura delimitada" ON public.team_members;
DROP POLICY IF EXISTS "Nomina: gestión delimitada" ON public.team_members;

CREATE POLICY "Nomina: lectura delimitada"
    ON public.team_members
    FOR SELECT
    TO anon, authenticated
    USING (
        public.is_fecovol_staff() OR
        EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = team_members.team_id
              AND (t.association_id = public.get_user_organization_id() OR team_members.status = 'ACTIVO')
        )
    );

CREATE POLICY "Nomina: gestión delimitada"
    ON public.team_members
    FOR ALL
    TO authenticated
    USING (
        public.is_fecovol_staff() OR
        EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = team_members.team_id
              AND t.association_id = public.get_user_organization_id()
        )
    );

-- =========================================================================
-- 5. POLÍTICAS RLS PARA DOCUMENTOS Y LICENCIAS (public.documents)
-- =========================================================================
-- Clasificación de visibilidad: Los documentos de respaldo son PRIVADOS (RF-SEG-011)
-- NUNCA se otorga permiso SELECT al rol anon.
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Documentos: lectura privada por ámbito" ON public.documents;
DROP POLICY IF EXISTS "Documentos: subida por ámbito" ON public.documents;
DROP POLICY IF EXISTS "Documentos: dictamen FECOVOL" ON public.documents;

CREATE POLICY "Documentos: lectura privada por ámbito"
    ON public.documents
    FOR SELECT
    TO authenticated
    USING (
        public.is_fecovol_staff() OR
        (association_id IS NOT NULL AND association_id = public.get_user_organization_id()) OR
        (team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.teams t WHERE t.id = documents.team_id AND t.association_id = public.get_user_organization_id()
        )) OR
        (person_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.persons p WHERE p.id = documents.person_id AND p.association_id = public.get_user_organization_id()
        ))
    );

CREATE POLICY "Documentos: subida por ámbito"
    ON public.documents
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_fecovol_staff() OR
        (association_id IS NOT NULL AND association_id = public.get_user_organization_id()) OR
        (team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.teams t WHERE t.id = documents.team_id AND t.association_id = public.get_user_organization_id()
        )) OR
        (person_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.persons p WHERE p.id = documents.person_id AND p.association_id = public.get_user_organization_id()
        ))
    );

CREATE POLICY "Documentos: dictamen FECOVOL"
    ON public.documents
    FOR UPDATE
    TO authenticated
    USING (public.is_fecovol_staff());
