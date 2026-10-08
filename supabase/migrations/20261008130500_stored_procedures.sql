-- Migration: 002_stored_procedures
-- Description: Creates stored procedures for Security, Catalogs, and Parameters management.
-- Note: Audit logging is now handled entirely by generic triggers listening to table changes.

-- ==========================================
-- 1. SECURITY & USERS
-- ==========================================

CREATE OR REPLACE FUNCTION public.sp_create_user_profile(
    p_id UUID,
    p_email VARCHAR,
    p_full_name VARCHAR,
    p_role_name VARCHAR,
    p_admin_user VARCHAR,
    p_organization_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_role_id UUID;
BEGIN
    -- Configurar la variable local para que el Trigger de auditoría sepa quién hace el cambio
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name;
    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'El rol especificado no existe: %', p_role_name;
    END IF;

    INSERT INTO public.user_profiles (id, email, full_name, role_id, organization_id)
    VALUES (p_id, p_email, p_full_name, v_role_id, p_organization_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.sp_update_user_profile(
    p_id UUID,
    p_full_name VARCHAR,
    p_role_name VARCHAR,
    p_organization_id UUID,
    p_status VARCHAR,
    p_admin_user VARCHAR
) RETURNS VOID AS $$
DECLARE
    v_role_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name;
    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'El rol especificado no existe: %', p_role_name;
    END IF;

    UPDATE public.user_profiles
    SET full_name = p_full_name,
        role_id = v_role_id,
        organization_id = p_organization_id,
        status = p_status,
        updated_at = NOW()
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- 2. DATA ADMINISTRATION (Catalogs)
-- ==========================================

CREATE OR REPLACE FUNCTION public.sp_upsert_catalog_value(
    p_catalog_name VARCHAR,
    p_code VARCHAR,
    p_value VARCHAR,
    p_description TEXT,
    p_is_active BOOLEAN,
    p_admin_user VARCHAR
) RETURNS VOID AS $$
DECLARE
    v_catalog_id UUID;
    v_existing_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT id INTO v_catalog_id FROM public.catalogs WHERE name = p_catalog_name;
    IF v_catalog_id IS NULL THEN
        RAISE EXCEPTION 'El catálogo especificado no existe: %', p_catalog_name;
    END IF;

    SELECT id INTO v_existing_id FROM public.catalog_values WHERE catalog_id = v_catalog_id AND code = p_code;

    IF v_existing_id IS NOT NULL THEN
        UPDATE public.catalog_values
        SET value = p_value,
            description = p_description,
            is_active = p_is_active,
            updated_at = NOW()
        WHERE id = v_existing_id;
    ELSE
        INSERT INTO public.catalog_values (catalog_id, code, value, description, is_active)
        VALUES (v_catalog_id, p_code, p_value, p_description, p_is_active);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- 3. SYSTEM PARAMETERS
-- ==========================================

CREATE OR REPLACE FUNCTION public.sp_update_system_parameter(
    p_name VARCHAR,
    p_value TEXT,
    p_admin_user VARCHAR
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF EXISTS (SELECT 1 FROM public.system_parameters WHERE name = p_name) THEN
        UPDATE public.system_parameters
        SET value = p_value,
            updated_at = NOW()
        WHERE name = p_name;
    ELSE
        INSERT INTO public.system_parameters (name, value) VALUES (p_name, p_value);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
