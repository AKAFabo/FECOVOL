const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { badRequest, fromSupabase } = require('../utils/httpError');

const router = express.Router();

// POST /api/users/invite -> Invita un usuario por correo usando Supabase Auth Admin
router.post('/invite', asyncHandler(async (req, res) => {
  const { email, full_name, role_id, organization_id, status } = req.body;

  if (!email || !full_name) {
    throw badRequest('El correo y el nombre completo son obligatorios');
  }

  // 1. Enviar invitacion por email con Supabase Admin API
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name }
  });

  const errAuth = fromSupabase(inviteError);
  if (errAuth) throw errAuth;

  const userId = inviteData.user.id;

  // 2. Crear o actualizar el perfil en public.user_profiles
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .upsert({
      id: userId,
      email,
      full_name,
      role_id: role_id || null,
      organization_id: organization_id || null,
      status: status || 'ACTIVA',
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  const errProfile = fromSupabase(profileError);
  if (errProfile) throw errProfile;

  res.status(201).json({
    message: 'Invitación enviada con éxito',
    data: profile
  });
}));

module.exports = router;
