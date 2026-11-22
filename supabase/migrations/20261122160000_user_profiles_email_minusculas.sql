-- Los correos de user_profiles se guardan en minúsculas, igual que los entrega Supabase Auth.
-- Un perfil creado como "Nombre+Per@..." no coincidía con el correo de la sesión y el backend
-- lo trataba como usuario no registrado.

update public.user_profiles
   set email = lower(trim(email))
 where email <> lower(trim(email));

create or replace function public.fn_user_profiles_email_minusculas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.email is not null then
    new.email := lower(trim(new.email));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_email_minusculas on public.user_profiles;
create trigger trg_user_profiles_email_minusculas
  before insert or update of email on public.user_profiles
  for each row execute function public.fn_user_profiles_email_minusculas();
