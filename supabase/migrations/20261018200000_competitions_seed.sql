-- Migration: Datos de prueba para Competencias y Resultados
-- Basado en los datos del prototipo de Figma y usando los stored procedures.

DO $$
DECLARE
    v_comp_id UUID;
    v_sarchi_id UUID;
    v_turrialba_id UUID;
    v_ucr_id UUID;
    v_una_id UUID;
    v_match_id UUID;
BEGIN
    -- 1. Crear la Competencia (Liga Superior Femenina 2026)
    v_comp_id := public.sp_create_competition(
        'Liga Superior Femenina 2026',
        '2026',
        'MAYOR',
        'FEM',
        'SALA',
        '2026-01-15',
        '2026-11-30',
        'seed',
        'EN_CURSO'
    );

    -- 2. Buscar los equipos existentes (creados por el Estudiante 3)
    -- Usamos ILIKE por si los escribieron como "CD Sarchi" o "Club Sarchí"
    SELECT id INTO v_sarchi_id FROM public.teams WHERE name ILIKE '%Sarchi%' LIMIT 1;
    SELECT id INTO v_turrialba_id FROM public.teams WHERE name ILIKE '%Turrialba%' LIMIT 1;
    SELECT id INTO v_ucr_id FROM public.teams WHERE name ILIKE '%UCR%' LIMIT 1;
    SELECT id INTO v_una_id FROM public.teams WHERE name ILIKE '%UNA%' LIMIT 1;

    -- 3. Si los equipos existen en la base de datos, inscribirlos y crear partidos
    IF v_sarchi_id IS NOT NULL AND v_turrialba_id IS NOT NULL THEN
        
        -- Inscribir equipos
        PERFORM public.sp_register_team_in_competition(v_comp_id, v_sarchi_id, 'seed');
        PERFORM public.sp_register_team_in_competition(v_comp_id, v_turrialba_id, 'seed');

        -- Crear el Partido de la Jornada 7
        v_match_id := public.sp_schedule_match(
            v_comp_id, 1, 7, v_sarchi_id, v_turrialba_id, 
            '2026-09-12', '19:00', 'seed', 'Gimnasio Nacional'
        );

        -- Insertar los resultados set a set (Sarchí 3 - 1 Turrialba)
        -- Nota: Al ser un seed directo, se permite el insert en match_sets ya que es data dura de prueba.
        INSERT INTO public.match_sets (match_id, set_number, home_points, away_points) VALUES
            (v_match_id, 1, 25, 19),
            (v_match_id, 2, 22, 25),
            (v_match_id, 3, 25, 21),
            (v_match_id, 4, 25, 17);

        -- Ejecutar el cálculo del resultado (marca el partido como FINALIZADO y calcula el ganador)
        PERFORM public.sp_record_match_result(v_match_id, 'seed');
            
    ELSE
        RAISE NOTICE 'No se encontraron los equipos (Sarchí/Turrialba) para crear los partidos. Crea primero los equipos.';
    END IF;

    -- 4. Crear un segundo partido de prueba (Programado para el futuro)
    IF v_ucr_id IS NOT NULL AND v_una_id IS NOT NULL THEN
        PERFORM public.sp_register_team_in_competition(v_comp_id, v_ucr_id, 'seed');
        PERFORM public.sp_register_team_in_competition(v_comp_id, v_una_id, 'seed');

        PERFORM public.sp_schedule_match(
            v_comp_id, 2, 8, v_ucr_id, v_una_id, 
            '2026-09-19', '16:00', 'seed', 'Gimnasio UCR'
        );
    END IF;

END $$;