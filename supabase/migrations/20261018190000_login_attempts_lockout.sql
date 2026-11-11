-- Migration: 011_login_attempts_lockout
-- Description: Tabla para gestionar la política de bloqueo temporal tras 5 intentos fallidos (RF-SEG-001).
-- Frente: Seguridad (Estudiante 1)

CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(50) NOT NULL,
    failed_attempts INT DEFAULT 1,
    locked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_login_attempts_email_ip UNIQUE(email, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup 
    ON public.auth_login_attempts(email, ip_address);

-- Habilitar RLS: solo accesible vía Backend con Service Role
ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;
