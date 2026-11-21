-- Documentos y licencias (RF-ASO-005): archivos en un bucket privado de Supabase Storage.
--
-- * El bucket `documentos` es privado y no tiene políticas para anon ni authenticated: nadie lo
--   lee ni escribe directo desde el navegador. Solo el backend (service_role) sube archivos,
--   después de verificar sesión, ámbito, tamaño y tipo real del archivo, y entrega enlaces
--   firmados de corta duración a quien tiene permiso.
-- * documents.file_url guarda la ruta interna (storage://documentos/<ruta>), no un enlace público.
-- * La vista v_documentos resuelve a qué asociación pertenece cada documento (directo, por su
--   equipo o por su persona), para filtrar por ámbito con una sola consulta. No se expone por la
--   API de Supabase: solo la consulta el backend.

-- 1. Bucket privado con límites de tamaño y tipo (el backend valida además el contenido real).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Vista con la asociación dueña de cada documento.
create or replace view public.v_documentos
with (security_invoker = true) as
select
  d.id,
  d.file_url,
  d.file_name,
  d.issue_date,
  d.expiry_date,
  d.status,
  d.notes,
  d.uploaded_by,
  d.reviewed_by,
  d.reviewed_at,
  d.created_at,
  d.person_id,
  d.team_id,
  d.association_id,
  coalesce(d.association_id, t.association_id, p.association_id) as owner_association_id,
  cv.code  as tipo_code,
  cv.value as tipo_value,
  p.first_name as persona_first_name,
  p.last_name  as persona_last_name,
  t.name as equipo_name,
  a.name as asociacion_name
from public.documents d
join public.catalog_values cv on cv.id = d.document_type_value_id
left join public.persons p on p.id = d.person_id
left join public.teams t on t.id = d.team_id
left join public.associations a on a.id = coalesce(d.association_id, t.association_id, p.association_id);

revoke all on public.v_documentos from public, anon, authenticated;
grant select on public.v_documentos to service_role;

comment on view public.v_documentos is
  'Documentos con su asociación dueña (directa, por equipo o por persona). Solo para el backend.';

-- 3. Junta directiva (RF-ASO-002): editar un cargo y darlo por terminado. Igual que
--    sp_add_board_member, pasan por un procedimiento para que el disparador de bitácora registre
--    quién hizo el cambio. Solo los ejecuta el backend (service_role).
create or replace function public.sp_update_board_member(
  p_id uuid,
  p_admin_user varchar,
  p_position varchar default null,
  p_full_name varchar default null,
  p_email varchar default null,
  p_phone varchar default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform set_config('app.current_user', p_admin_user, true);

  update public.association_board_members
     set position  = coalesce(nullif(trim(p_position), ''), position),
         full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
         email     = case when p_email is null then email else nullif(trim(p_email), '') end,
         phone     = case when p_phone is null then phone else nullif(trim(p_phone), '') end
   where id = p_id and end_date is null;

  if not found then
    raise exception 'No existe el cargo vigente %', p_id;
  end if;
end;
$$;

create or replace function public.sp_end_board_member(p_id uuid, p_admin_user varchar)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform set_config('app.current_user', p_admin_user, true);

  update public.association_board_members
     set end_date = current_date
   where id = p_id and end_date is null;

  if not found then
    raise exception 'No existe el cargo vigente %', p_id;
  end if;
end;
$$;

revoke all on function public.sp_update_board_member(uuid, varchar, varchar, varchar, varchar, varchar) from public, anon, authenticated;
revoke all on function public.sp_end_board_member(uuid, varchar) from public, anon, authenticated;
grant execute on function public.sp_update_board_member(uuid, varchar, varchar, varchar, varchar, varchar) to service_role;
grant execute on function public.sp_end_board_member(uuid, varchar) to service_role;
