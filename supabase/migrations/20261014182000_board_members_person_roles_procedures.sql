-- Migration: 006_board_members_person_roles_procedures
-- Frente: Asociaciones y Arbitraje (Estudiante 3)
-- Junta directiva y roles de persona tambien pasan por procedimiento,
-- para que la bitacora registre al usuario real y no 'Admin BD'.

CREATE OR REPLACE FUNCTION public.sp_add_board_member(
    p_association_id UUID,
    p_position VARCHAR,
    p_full_name VARCHAR,
    p_admin_user VARCHAR,
    p_email VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL,
    p_start_date DATE DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF NOT EXISTS (SELECT 1 FROM public.associations WHERE id = p_association_id) THEN
        RAISE EXCEPTION 'No existe la asociacion %', p_association_id;
    END IF;

    INSERT INTO public.association_board_members (association_id, position, full_name, email, phone, start_date)
    VALUES (p_association_id, p_position, p_full_name, p_email, p_phone, p_start_date)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sp_set_person_role(
    p_person_id UUID,
    p_role_type VARCHAR,
    p_is_active BOOLEAN,
    p_admin_user VARCHAR
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_person_id) THEN
        RAISE EXCEPTION 'No existe la persona %', p_person_id;
    END IF;

    INSERT INTO public.person_roles (person_id, role_type, is_active)
    VALUES (p_person_id, p_role_type, p_is_active)
    ON CONFLICT (person_id, role_type) DO UPDATE SET is_active = EXCLUDED.is_active;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
