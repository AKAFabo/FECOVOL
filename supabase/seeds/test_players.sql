-- llena los 4 equipos con jugadores para las pruebas del frontend 
-- en caso de correr este sql nuevamente, tenemos que obtener los UUID de los equipos
DO $$
DECLARE
    v_doc_type UUID;
    v_person_id UUID;
    i INT;
    j INT;
    v_team_id UUID;
    v_team_name TEXT;
    v_team_ids UUID[] := ARRAY[
        '69338c83-cb4f-4fd2-a647-fe1261aac9d5'::UUID, -- CD Sarchí
        'ad08d4cb-8282-4b68-b20b-ff5754455b9d'::UUID, -- Limón VC
        'c2d14eaa-019b-4bd0-969f-62047096389a'::UUID, -- San Carlos VC
        '4c5ab044-39ac-4f8e-9896-97fb8c8a50d4'::UUID  -- AD Guanacaste
    ];
    v_team_names TEXT[] := ARRAY['Sarchi', 'Limon', 'SanCarlos', 'Guanacaste'];
BEGIN
    -- obtiene el ID del tipo de documento CED (especificando que es el id de catalog_values)
    SELECT cv.id INTO v_doc_type FROM public.catalog_values cv
    JOIN public.catalogs c ON cv.catalog_id = c.id
    WHERE c.name = 'Tipos de documento' AND cv.code = 'CED'
    LIMIT 1;

    -- Itera sobre cada equipo
    FOR i IN 1..array_length(v_team_ids, 1) LOOP
        v_team_id := v_team_ids[i];
        v_team_name := v_team_names[i];
        
        -- Crea 10 jugadores por equipo
        FOR j IN 1..10 LOOP
            -- Inserta la persona
            INSERT INTO public.persons (
                document_type_value_id, document_number, first_name, last_name, 
                birth_date, sex, is_verified, status
            ) VALUES (
                v_doc_type, 
                '9-' || LPAD(((i-1)*10 + j)::text, 8, '0'), -- Genera cédulas únicas
                'Jugador ' || v_team_name, 
                'Prueba ' || j, 
                '2000-01-01', 
                'F', 
                true, 
                'ACTIVA'
            ) RETURNING id INTO v_person_id;

            -- Inserta en la nomina del equipo
            INSERT INTO public.team_members (
                team_id, person_id, member_type, jersey_number, status
            ) VALUES (
                v_team_id, v_person_id, 'JUGADOR', j, 'ACTIVO'
            );
        END LOOP;
    END LOOP;
END $$;