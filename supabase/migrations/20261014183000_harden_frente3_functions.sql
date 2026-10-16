-- Migration: 007_harden_frente3_functions
-- Frente: Asociaciones y Arbitraje (Estudiante 3)
-- Los procedimientos son SECURITY DEFINER: si anon o authenticated pueden ejecutarlos,
-- cualquiera con la anon key los llama por /rest/v1/rpc y se salta el RLS de las tablas.
-- Aqui solo los puede ejecutar service_role (el backend), y se fija el search_path.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS firma
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN (
            'fn_catalog_value_id',
            'sp_create_association', 'sp_update_association', 'sp_add_board_member',
            'sp_create_team', 'sp_update_team',
            'sp_create_person', 'sp_update_person', 'sp_verify_person', 'sp_set_person_role',
            'sp_add_team_member', 'sp_remove_team_member',
            'sp_upload_document', 'sp_review_document', 'sp_expire_documents',
            'sp_assign_referee', 'sp_update_referee_assignment'
          )
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.firma);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.firma);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.firma);
    END LOOP;
END $$;
