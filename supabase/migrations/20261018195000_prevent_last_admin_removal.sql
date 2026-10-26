-- Migration: 014_prevent_last_admin_removal
-- Description: Trigger para impedir desactivar, degradar o eliminar la última cuenta Administrador activa (RF-SEG-004).
-- Frente: Seguridad (Estudiante 1)

CREATE OR REPLACE FUNCTION public.fn_prevent_last_admin_removal()
RETURNS TRIGGER AS $$
DECLARE
    v_admin_role_id UUID;
    v_other_active_admins INT;
BEGIN
    -- Obtener el ID del rol Administrador
    SELECT id INTO v_admin_role_id FROM public.roles WHERE name = 'Administrador';
    
    -- Si no existe el rol en la tabla roles, continuar normalmente
    IF v_admin_role_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Caso 1: Eliminación de usuario (DELETE)
    IF TG_OP = 'DELETE' THEN
        IF OLD.role_id = v_admin_role_id AND OLD.status = 'ACTIVA' THEN
            SELECT count(*) INTO v_other_active_admins 
            FROM public.user_profiles 
            WHERE role_id = v_admin_role_id AND status = 'ACTIVA' AND id != OLD.id;
            
            IF v_other_active_admins = 0 THEN
                RAISE EXCEPTION 'Operación denegada: No se puede eliminar la única cuenta Administrador activa del sistema.';
            END IF;
        END IF;
        RETURN OLD;
    END IF;

    -- Caso 2: Modificación de rol o estado (UPDATE)
    IF TG_OP = 'UPDATE' THEN
        IF OLD.role_id = v_admin_role_id AND OLD.status = 'ACTIVA' THEN
            -- Si se está cambiando de rol o retirando el estado ACTIVA
            IF (NEW.role_id != v_admin_role_id OR NEW.status != 'ACTIVA') THEN
                SELECT count(*) INTO v_other_active_admins 
                FROM public.user_profiles 
                WHERE role_id = v_admin_role_id AND status = 'ACTIVA' AND id != OLD.id;
                
                IF v_other_active_admins = 0 THEN
                    RAISE EXCEPTION 'Operación denegada: No se puede desactivar o cambiar el rol de la única cuenta Administrador activa del sistema.';
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_last_admin_removal ON public.user_profiles;

CREATE TRIGGER trg_prevent_last_admin_removal
    BEFORE UPDATE OR DELETE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prevent_last_admin_removal();
