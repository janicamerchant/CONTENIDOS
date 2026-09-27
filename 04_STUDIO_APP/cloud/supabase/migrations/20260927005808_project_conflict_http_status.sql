-- Application version conflicts are HTTP 409, not retryable database serialization failures.
begin;
create or replace function private.version_proyecto() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if new.id<>old.id or new.marca_id<>old.marca_id or new.created_by is distinct from old.created_by then
   raise exception 'La identidad del proyecto no se puede cambiar' using errcode='42501';
  end if;
  if new.version<>old.version+1 then raise exception 'Conflicto de versión' using errcode='PT409'; end if;
 end if;
 if new.documento->>'brand' is distinct from new.marca_id or new.documento->>'id' is distinct from new.id then
  raise exception 'Identidad del documento inválida' using errcode='23514';
 end if;
 new.updated_at=now(); return new;
end $$;

create or replace function public.guardar_proyecto(p_id text,p_marca text,p_documento jsonb,p_version bigint)
returns public.proyectos language plpgsql security invoker set search_path='' as $$
declare r public.proyectos;
begin
 if p_version=0 then
  insert into public.proyectos(id,marca_id,documento,created_by) values(p_id,p_marca,p_documento,auth.uid()) returning * into r;
 else
  update public.proyectos set documento=p_documento,version=version+1
  where id=p_id and marca_id=p_marca and version=p_version returning * into r;
  if not found then raise exception 'Proyecto modificado o acceso revocado. Recarga antes de guardar.' using errcode='PT409'; end if;
 end if;
 return r;
end $$;
commit;
