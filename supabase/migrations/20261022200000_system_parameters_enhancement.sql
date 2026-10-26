-- Migration: 20261022200000_system_parameters_enhancement.sql
-- Description: Estructura mejorada y semillas oficiales para Parámetros del Sistema (RF-AUD-001)
-- Frente: Administración de Datos y Auditoría (Estudiante 1)

-- 1. Ampliar columnas en public.system_parameters
ALTER TABLE public.system_parameters 
    ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'GENERAL',
    ADD COLUMN IF NOT EXISTS data_type VARCHAR(20) DEFAULT 'STRING',
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS is_readonly BOOLEAN DEFAULT FALSE;

-- 2. Procedimiento almacenado actualizado para parámetros del sistema (RF-AUD-001)
CREATE OR REPLACE FUNCTION public.sp_update_system_parameter(
    p_name VARCHAR,
    p_value TEXT,
    p_admin_user VARCHAR,
    p_description TEXT DEFAULT NULL,
    p_category VARCHAR DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user', p_admin_user, true);

    IF EXISTS (SELECT 1 FROM public.system_parameters WHERE name = p_name) THEN
        UPDATE public.system_parameters
        SET value = p_value,
            description = COALESCE(p_description, description),
            category = COALESCE(p_category, category),
            is_active = COALESCE(p_is_active, is_active),
            updated_at = NOW()
        WHERE name = p_name;
    ELSE
        INSERT INTO public.system_parameters (
            name, 
            value, 
            description, 
            category, 
            data_type, 
            is_active, 
            is_readonly
        ) VALUES (
            p_name, 
            p_value, 
            p_description, 
            COALESCE(p_category, 'GENERAL'), 
            'STRING', 
            COALESCE(p_is_active, true), 
            false
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Parámetros semilla oficiales del sistema FECOVOL (RF-AUD-001 / RF-COM-008 / RF-SEG-001)
INSERT INTO public.system_parameters (name, value, description, category, data_type, is_active, is_readonly)
VALUES 
    -- Competencias y Puntuación FIVB / FECOVOL (RF-COM-008)
    ('COMPETENCIA_PUNTOS_VICTORIA_MAX', '3', 'Puntos otorgados al equipo ganador por marcador 3-0 o 3-1 según Reglamento Oficial FIVB.', 'COMPETENCIAS', 'NUMBER', true, false),
    ('COMPETENCIA_PUNTOS_VICTORIA_MIN', '2', 'Puntos otorgados al equipo ganador por marcador 3-2 en muerte súbita (Tie-break).', 'COMPETENCIAS', 'NUMBER', true, false),
    ('COMPETENCIA_PUNTOS_DERROTA_MIN', '1', 'Puntos otorgados al equipo perdedor que alcanzó el quinto set decisivo (marcador 2-3).', 'COMPETENCIAS', 'NUMBER', true, false),
    ('COMPETENCIA_PUNTOS_DERROTA_MAX', '0', 'Puntos otorgados al equipo perdedor por marcador 0-3 o 1-3.', 'COMPETENCIAS', 'NUMBER', true, false),
    ('COMPETENCIA_SETS_MAXIMOS', '5', 'Cantidad máxima reglamentaria de sets a disputar por encuentro oficial.', 'COMPETENCIAS', 'NUMBER', true, false),
    ('COMPETENCIA_TOLERANCIA_MINUTOS', '15', 'Tiempo de espera reglamentario en minutos antes de decretar No Presentación (Default).', 'COMPETENCIAS', 'NUMBER', true, false),

    -- Seguridad y Gestión de Sesiones (RF-SEG-001 / RF-SEG-003)
    ('SEGURIDAD_MAX_INTENTOS_LOGIN', '5', 'Número de intentos de acceso fallidos permitidos antes de suspender temporalmente la cuenta.', 'SEGURIDAD', 'NUMBER', true, false),
    ('SEGURIDAD_TIEMPO_INACTIVIDAD_MINUTOS', '30', 'Tiempo de inactividad en minutos para expirar automáticamente la sesión del usuario.', 'SEGURIDAD', 'NUMBER', true, false),

    -- Operativos y Carga de Evidencias (RF-ARB-006 / RF-DIV-004)
    ('EVIDENCIAS_TAMANO_MAXIMO_MB', '10', 'Tamaño máximo permitido en Megabytes (MB) para adjuntos, actas e informes de arbitraje.', 'OPERATIVOS', 'NUMBER', true, false),
    ('EVIDENCIAS_FORMATOS_PERMITIDOS', 'PDF, JPG, PNG', 'Formatos de archivo admitidos para carga de actas oficiales y evidencias deportivas.', 'OPERATIVOS', 'STRING', true, false),

    -- Divulgación y Prensa (RF-DIV-001)
    ('DIVULGACION_NOTICIAS_PORTADA_CANTIDAD', '6', 'Número de artículos y comunicados destacados que se presentan en la portada pública.', 'DIVULGACION', 'NUMBER', true, false)
ON CONFLICT (name) DO UPDATE 
SET description = EXCLUDED.description,
    category = EXCLUDED.category,
    data_type = EXCLUDED.data_type;
