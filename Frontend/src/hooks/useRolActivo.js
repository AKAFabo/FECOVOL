import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { api } from '../services/apiInterna.js';

export const RUTA_POR_ROL = {
  'Administrador': '/admin/panel',
  'Personal':      '/personal',
  'Representante': '/asociacion',
  'Arbitro':       '/arbitro',
};

/**
 * Hook para gestionar el usuario autenticado, sus roles disponibles y la alternancia de rol activo.
 * Normalizado para AdminLayout, PersonalLayout, ArbitroLayout y AsociacionLayout (RF-SEG-006).
 */
export function useRolActivo(rolPorDefecto = 'Usuario FECOVOL') {
  const navigate = useNavigate();
  const [usuarioActual, setUsuarioActual] = useState({
    id: null,
    email: '',
    roleId: null,
    status: null,
    nombre: 'Usuario',
    rol: rolPorDefecto,
    iniciales: 'US'
  });
  const [rolesDisponibles, setRolesDisponibles] = useState([]);
  const [cambiandoRol, setCambiandoRol] = useState(false);

  const cargarUsuarioYRoles = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role_id, status, full_name, email, roles:roles!user_profiles_role_id_fkey(name)')
        .eq('id', user.id)
        .maybeSingle();

      const nombre = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario';
      const rol = profile?.roles?.name || rolPorDefecto;

      const palabras = nombre.trim().split(' ').filter(Boolean);
      const iniciales = palabras.length > 1
        ? (palabras[0][0] + palabras[1][0]).toUpperCase()
        : nombre.substring(0, 2).toUpperCase();

      let listaRoles = [];
      try {
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('role_id')
          .eq('user_id', user.id);

        const allRoleIds = [profile?.role_id, ...(userRoles || []).map(ur => ur.role_id)].filter(Boolean);
        if (allRoleIds.length > 0) {
          const { data: rolesData } = await supabase
            .from('roles')
            .select('id, name')
            .in('id', allRoleIds);
          if (rolesData && rolesData.length > 0) {
            listaRoles = rolesData;
          }
        }
      } catch (e) {}

      if (listaRoles.length === 0 && profile?.roles) {
        listaRoles = [{ id: profile.role_id, name: profile.roles.name }];
      }

      // Si el usuario es Administrador (en su rol activo o en sus roles asignados), puede ver todos los roles del sistema
      const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
      const esAdmin = listaRoles.some(r => sinTildes(r.name) === 'administrador') || sinTildes(rol) === 'administrador';

      if (esAdmin) {
        try {
          const { data: todosRoles } = await supabase.from('roles').select('id, name');
          if (todosRoles && todosRoles.length > 0) {
            listaRoles = todosRoles;
          }
        } catch (eRoles) {}
      }

      setRolesDisponibles(listaRoles);
      setUsuarioActual({
        id: user.id,
        email: profile?.email || user.email || '',
        roleId: profile?.role_id || null,
        status: profile?.status || null,
        nombre,
        rol,
        iniciales
      });
    } catch (err) {
      console.error('Error al obtener usuario y roles:', err);
    }
  }, [rolPorDefecto]);

  useEffect(() => {
    cargarUsuarioYRoles();
  }, [cargarUsuarioYRoles]);

  const cambiarRolActivo = async (nuevoRoleId, callbackExtra = null) => {
    if (!usuarioActual.id) return;
    // Únicamente se revisa si ese usuario y ese rol tienen relación en rolesDisponibles (que proviene de user_roles)
    const rolObj = rolesDisponibles.find(r => r.id === nuevoRoleId);
    if (!rolObj) return;

    setCambiandoRol(true);
    try {
      sessionStorage.setItem('fecovol_role_switched_locally', 'true');
      sessionStorage.setItem('fecovol_active_role_id', nuevoRoleId);
      sessionStorage.setItem('fecovol_active_role_name', rolObj.name);

      // NO se modifica la base de datos al cambiar de vista de rol (RF-SEG-006).
      // Solo actualizamos el estado de la vista en el cliente y navegamos al entorno respectivo.
      setUsuarioActual(prev => ({
        ...prev,
        rol: rolObj.name
      }));

      if (callbackExtra) {
        await callbackExtra(nuevoRoleId, rolObj.name);
      }

      navigate(RUTA_POR_ROL[rolObj.name] || '/admin/panel');
    } catch (err) {
      console.error('Error al cambiar de rol activo:', err);
    } finally {
      setCambiandoRol(false);
    }
  };

  return {
    usuarioActual,
    setUsuarioActual,
    rolesDisponibles,
    setRolesDisponibles,
    cambiandoRol,
    cambiarRolActivo,
    recargarUsuario: cargarUsuarioYRoles
  };
}
