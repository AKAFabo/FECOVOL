-- Migration: 20261022183000_catalog_dependency_functions.sql
-- Description: Funciones para consultar y verificar dependencias de valores de catálogo y entidades (RF-AUD-002)
-- Frente: Administración de Datos y Auditoría (Estudiante 1)

-- 1. Dependencias de un valor de catálogo individual
CREATE OR REPLACE FUNCTION public.fn_get_catalog_value_dependencies(p_value_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_teams INT := 0;
    v_persons INT := 0;
    v_members INT := 0;
    v_documents INT := 0;
    v_referees INT := 0;
    v_total INT := 0;
BEGIN
    -- 1. Equipos (categoría, rama, modalidad)
    SELECT COUNT(*) INTO v_teams 
    FROM public.teams 
    WHERE category_value_id = p_value_id 
       OR branch_value_id = p_value_id 
       OR modality_value_id = p_value_id;

    -- 2. Personas (tipo de documento)
    SELECT COUNT(*) INTO v_persons 
    FROM public.persons 
    WHERE document_type_value_id = p_value_id;

    -- 3. Miembros de equipo (posición)
    SELECT COUNT(*) INTO v_members 
    FROM public.team_members 
    WHERE position_value_id = p_value_id;

    -- 4. Documentos (tipo de documento)
    SELECT COUNT(*) INTO v_documents 
    FROM public.documents 
    WHERE document_type_value_id = p_value_id;

    -- 5. Designaciones arbitrales (tipo de oficial)
    SELECT COUNT(*) INTO v_referees 
    FROM public.referee_assignments 
    WHERE official_type_value_id = p_value_id;

    v_total := COALESCE(v_teams, 0) + COALESCE(v_persons, 0) + COALESCE(v_members, 0) + COALESCE(v_documents, 0) + COALESCE(v_referees, 0);

    RETURN jsonb_build_object(
        'value_id', p_value_id,
        'total', v_total,
        'teams', COALESCE(v_teams, 0),
        'persons', COALESCE(v_persons, 0),
        'members', COALESCE(v_members, 0),
        'documents', COALESCE(v_documents, 0),
        'referees', COALESCE(v_referees, 0)
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Dependencias de una asociación afiliada
CREATE OR REPLACE FUNCTION public.fn_get_association_dependencies(p_association_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_teams INT := 0;
    v_persons INT := 0;
    v_board INT := 0;
    v_documents INT := 0;
    v_profiles INT := 0;
    v_total INT := 0;
BEGIN
    -- 1. Equipos
    SELECT COUNT(*) INTO v_teams 
    FROM public.teams 
    WHERE association_id = p_association_id;

    -- 2. Personas afiliadas
    SELECT COUNT(*) INTO v_persons 
    FROM public.persons 
    WHERE association_id = p_association_id;

    -- 3. Miembros de junta directiva
    SELECT COUNT(*) INTO v_board 
    FROM public.association_board_members 
    WHERE association_id = p_association_id;

    -- 4. Documentos institucionales
    SELECT COUNT(*) INTO v_documents 
    FROM public.documents 
    WHERE association_id = p_association_id;

    -- 5. Cuentas de usuario vinculadas
    SELECT COUNT(*) INTO v_profiles 
    FROM public.user_profiles 
    WHERE organization_id = p_association_id;

    v_total := COALESCE(v_teams, 0) + COALESCE(v_persons, 0) + COALESCE(v_board, 0) + COALESCE(v_documents, 0) + COALESCE(v_profiles, 0);

    RETURN jsonb_build_object(
        'association_id', p_association_id,
        'total', v_total,
        'teams', COALESCE(v_teams, 0),
        'persons', COALESCE(v_persons, 0),
        'board', COALESCE(v_board, 0),
        'documents', COALESCE(v_documents, 0),
        'profiles', COALESCE(v_profiles, 0)
    );
END;
$$ LANGUAGE plpgsql STABLE;
