-- Migration: 005_associations_referees_procedures
-- Frente: Asociaciones y Arbitraje (Estudiante 3)
-- Procedimientos de asociaciones, equipos, personas, nomina, documentos y designaciones.
-- Todos reciben p_admin_user para que el trigger de auditoria sepa quien hizo el cambio.

-- ========== ASOCIACIONES ==========

CREATE OR REPLACE FUNCTION public.sp_create_association(
    p_name VARCHAR,
    p_tax_id VARCHAR,
    p_province VARCHAR,
    p_canton VARCHAR,
    p_email VARCHAR,
    p_phone VARCHAR,
    p_admin_user VARCHAR,
    p_short_name VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_home_venue VARCHAR DEFAULT NULL,
    p_founded_date DATE DEFAULT NULL,
    p_status VARCHAR DEFAULT 'PROVISIONAL'
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF EXISTS (SELECT 1 FROM public.associations WHERE tax_id = p_tax_id) THEN
        RAISE EXCEPTION 'Ya existe una asociacion con la cedula juridica %', p_tax_id;
    END IF;

    INSERT INTO public.associations (name, short_name, tax_id, province, canton, address,
                                     email, phone, home_venue, founded_date, affiliation_date, status)
    VALUES (p_name, p_short_name, p_tax_id, p_province, p_canton, p_address,
            p_email, p_phone, p_home_venue, p_founded_date, CURRENT_DATE, p_status)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sp_update_association(
    p_id UUID,
    p_admin_user VARCHAR,
    p_name VARCHAR DEFAULT NULL,
    p_short_name VARCHAR DEFAULT NULL,
    p_province VARCHAR DEFAULT NULL,
    p_canton VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL,
    p_website VARCHAR DEFAULT NULL,
    p_home_venue VARCHAR DEFAULT NULL,
    p_status VARCHAR DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    UPDATE public.associations
    SET name = COALESCE(p_name, name),
        short_name = COALESCE(p_short_name, short_name),
        province = COALESCE(p_province, province),
        canton = COALESCE(p_canton, canton),
        address = COALESCE(p_address, address),
        email = COALESCE(p_email, email),
        phone = COALESCE(p_phone, phone),
        website = COALESCE(p_website, website),
        home_venue = COALESCE(p_home_venue, home_venue),
        status = COALESCE(p_status, status),
        updated_at = NOW()
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la asociacion %', p_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========== EQUIPOS ==========

CREATE OR REPLACE FUNCTION public.sp_create_team(
    p_association_id UUID,
    p_name VARCHAR,
    p_category_code VARCHAR,
    p_branch_code VARCHAR,
    p_modality_code VARCHAR,
    p_admin_user VARCHAR,
    p_short_name VARCHAR DEFAULT NULL,
    p_home_venue VARCHAR DEFAULT NULL,
    p_primary_color VARCHAR DEFAULT NULL,
    p_secondary_color VARCHAR DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF NOT EXISTS (SELECT 1 FROM public.associations WHERE id = p_association_id) THEN
        RAISE EXCEPTION 'No existe la asociacion %', p_association_id;
    END IF;

    INSERT INTO public.teams (association_id, name, short_name, category_value_id, branch_value_id,
                              modality_value_id, home_venue, primary_color, secondary_color)
    VALUES (p_association_id, p_name, p_short_name,
            public.fn_catalog_value_id('Categorías', p_category_code),
            public.fn_catalog_value_id('Ramas', p_branch_code),
            public.fn_catalog_value_id('Modalidades', p_modality_code),
            p_home_venue, p_primary_color, p_secondary_color)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sp_update_team(
    p_id UUID,
    p_admin_user VARCHAR,
    p_name VARCHAR DEFAULT NULL,
    p_short_name VARCHAR DEFAULT NULL,
    p_home_venue VARCHAR DEFAULT NULL,
    p_primary_color VARCHAR DEFAULT NULL,
    p_secondary_color VARCHAR DEFAULT NULL,
    p_status VARCHAR DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    UPDATE public.teams
    SET name = COALESCE(p_name, name),
        short_name = COALESCE(p_short_name, short_name),
        home_venue = COALESCE(p_home_venue, home_venue),
        primary_color = COALESCE(p_primary_color, primary_color),
        secondary_color = COALESCE(p_secondary_color, secondary_color),
        status = COALESCE(p_status, status),
        updated_at = NOW()
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe el equipo %', p_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========== PERSONAS ==========

CREATE OR REPLACE FUNCTION public.sp_create_person(
    p_document_type_code VARCHAR,
    p_document_number VARCHAR,
    p_first_name VARCHAR,
    p_last_name VARCHAR,
    p_birth_date DATE,
    p_admin_user VARCHAR,
    p_sex VARCHAR DEFAULT NULL,
    p_association_id UUID DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL,
    p_province VARCHAR DEFAULT NULL,
    p_roles TEXT[] DEFAULT ARRAY['JUGADOR']
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_doc_type UUID;
    v_role TEXT;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    v_doc_type := public.fn_catalog_value_id('Tipos de documento', p_document_type_code);

    SELECT id INTO v_id FROM public.persons
    WHERE document_type_value_id = v_doc_type AND document_number = p_document_number;

    IF v_id IS NOT NULL THEN
        RAISE EXCEPTION 'La persona con documento % ya existe en el padron (id %)', p_document_number, v_id;
    END IF;

    INSERT INTO public.persons (document_type_value_id, document_number, first_name, last_name,
                                birth_date, sex, association_id, email, phone, province)
    VALUES (v_doc_type, p_document_number, p_first_name, p_last_name,
            p_birth_date, p_sex, p_association_id, p_email, p_phone, p_province)
    RETURNING id INTO v_id;

    FOREACH v_role IN ARRAY p_roles LOOP
        INSERT INTO public.person_roles (person_id, role_type) VALUES (v_id, v_role)
        ON CONFLICT (person_id, role_type) DO NOTHING;
    END LOOP;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sp_update_person(
    p_id UUID,
    p_admin_user VARCHAR,
    p_first_name VARCHAR DEFAULT NULL,
    p_last_name VARCHAR DEFAULT NULL,
    p_birth_date DATE DEFAULT NULL,
    p_sex VARCHAR DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL,
    p_province VARCHAR DEFAULT NULL,
    p_emergency_contact VARCHAR DEFAULT NULL,
    p_status VARCHAR DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_identity_changed BOOLEAN := false;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT (p_first_name IS NOT NULL AND p_first_name <> first_name)
        OR (p_last_name IS NOT NULL AND p_last_name <> last_name)
        OR (p_birth_date IS NOT NULL AND p_birth_date <> birth_date)
      INTO v_identity_changed
    FROM public.persons WHERE id = p_id;

    IF v_identity_changed IS NULL THEN
        RAISE EXCEPTION 'No existe la persona %', p_id;
    END IF;

    UPDATE public.persons
    SET first_name = COALESCE(p_first_name, first_name),
        last_name = COALESCE(p_last_name, last_name),
        birth_date = COALESCE(p_birth_date, birth_date),
        sex = COALESCE(p_sex, sex),
        email = COALESCE(p_email, email),
        phone = COALESCE(p_phone, phone),
        province = COALESCE(p_province, province),
        emergency_contact = COALESCE(p_emergency_contact, emergency_contact),
        status = COALESCE(p_status, status),
        -- si cambian nombre o fecha de nacimiento, FECOVOL debe verificar de nuevo
        is_verified = CASE WHEN v_identity_changed THEN false ELSE is_verified END,
        verified_at = CASE WHEN v_identity_changed THEN NULL ELSE verified_at END,
        verified_by = CASE WHEN v_identity_changed THEN NULL ELSE verified_by END,
        updated_at = NOW()
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sp_verify_person(
    p_id UUID,
    p_admin_user VARCHAR
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    UPDATE public.persons
    SET is_verified = true, verified_at = NOW(), verified_by = p_admin_user, updated_at = NOW()
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la persona %', p_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========== NOMINA ==========

CREATE OR REPLACE FUNCTION public.sp_add_team_member(
    p_team_id UUID,
    p_person_id UUID,
    p_member_type VARCHAR,
    p_admin_user VARCHAR,
    p_position_code VARCHAR DEFAULT NULL,
    p_technical_role VARCHAR DEFAULT NULL,
    p_jersey_number SMALLINT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_association UUID;
    v_person_association UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    SELECT association_id INTO v_association FROM public.teams WHERE id = p_team_id;
    IF v_association IS NULL THEN
        RAISE EXCEPTION 'No existe el equipo %', p_team_id;
    END IF;

    SELECT association_id INTO v_person_association FROM public.persons WHERE id = p_person_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la persona %', p_person_id;
    END IF;

    IF v_person_association IS NOT NULL AND v_person_association <> v_association THEN
        RAISE EXCEPTION 'La persona pertenece a otra asociacion';
    END IF;

    INSERT INTO public.team_members (team_id, person_id, member_type, position_value_id,
                                     technical_role, jersey_number)
    VALUES (p_team_id, p_person_id, p_member_type,
            CASE WHEN p_position_code IS NULL THEN NULL
                 ELSE public.fn_catalog_value_id('Posiciones', p_position_code) END,
            p_technical_role, p_jersey_number)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sp_remove_team_member(
    p_id UUID,
    p_admin_user VARCHAR
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    UPDATE public.team_members
    SET status = 'BAJA', end_date = CURRENT_DATE, updated_at = NOW()
    WHERE id = p_id AND status = 'ACTIVO';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe un integrante activo con id %', p_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========== DOCUMENTOS ==========

CREATE OR REPLACE FUNCTION public.sp_upload_document(
    p_document_type_code VARCHAR,
    p_file_url TEXT,
    p_admin_user VARCHAR,
    p_person_id UUID DEFAULT NULL,
    p_association_id UUID DEFAULT NULL,
    p_team_id UUID DEFAULT NULL,
    p_file_name VARCHAR DEFAULT NULL,
    p_issue_date DATE DEFAULT NULL,
    p_expiry_date DATE DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    INSERT INTO public.documents (document_type_value_id, person_id, association_id, team_id,
                                  file_url, file_name, issue_date, expiry_date, uploaded_by)
    VALUES (public.fn_catalog_value_id('Tipos de documento', p_document_type_code),
            p_person_id, p_association_id, p_team_id,
            p_file_url, p_file_name, p_issue_date, p_expiry_date, p_admin_user)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sp_review_document(
    p_id UUID,
    p_status VARCHAR,
    p_admin_user VARCHAR,
    p_notes TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF p_status NOT IN ('VIGENTE', 'RECHAZADO', 'VENCIDO') THEN
        RAISE EXCEPTION 'Estado de revision no valido: %', p_status;
    END IF;

    UPDATE public.documents
    SET status = p_status,
        notes = COALESCE(p_notes, notes),
        reviewed_by = p_admin_user,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe el documento %', p_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Marca como vencidos los documentos cuya fecha de vencimiento ya paso.
CREATE OR REPLACE FUNCTION public.sp_expire_documents()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    PERFORM set_config('app.current_user', 'sistema', true);

    UPDATE public.documents
    SET status = 'VENCIDO', updated_at = NOW()
    WHERE status = 'VIGENTE' AND expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========== DESIGNACIONES ARBITRALES ==========

CREATE OR REPLACE FUNCTION public.sp_assign_referee(
    p_match_id UUID,
    p_person_id UUID,
    p_official_type_code VARCHAR,
    p_admin_user VARCHAR,
    p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF NOT EXISTS (SELECT 1 FROM public.person_roles
                   WHERE person_id = p_person_id AND role_type = 'ARBITRO' AND is_active) THEN
        RAISE EXCEPTION 'La persona % no esta registrada como arbitro', p_person_id;
    END IF;

    INSERT INTO public.referee_assignments (match_id, person_id, official_type_value_id, assigned_by, notes)
    VALUES (p_match_id, p_person_id,
            public.fn_catalog_value_id('Tipos de oficial', p_official_type_code),
            p_admin_user, p_notes)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sp_update_referee_assignment(
    p_id UUID,
    p_status VARCHAR,
    p_admin_user VARCHAR,
    p_notes TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF p_status NOT IN ('CONFIRMADA', 'RECHAZADA', 'CUMPLIDA', 'ANULADA') THEN
        RAISE EXCEPTION 'Estado no valido para una designacion: %', p_status;
    END IF;

    UPDATE public.referee_assignments
    SET status = p_status,
        notes = COALESCE(p_notes, notes),
        responded_at = NOW(),
        updated_at = NOW()
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la designacion %', p_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
