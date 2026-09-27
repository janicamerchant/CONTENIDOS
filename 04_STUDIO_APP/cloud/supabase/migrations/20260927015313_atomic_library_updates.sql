begin;
create function public.guardar_marca(p_actor uuid,p_marca text,p_version bigint,p_identidad jsonb,p_reglas text,p_personas jsonb default null)
returns void language plpgsql security invoker set search_path='' as $$
declare m public.miembros; b public.marcas;
begin
 select * into m from public.miembros where user_id=p_actor for share;
 if not found or not m.activo or m.rol not in ('admin','editor') then raise exception 'Sin permiso' using errcode='42501'; end if;
 if m.rol<>'admin' and (p_marca='_comun' or not exists(select 1 from public.miembro_marca where user_id=p_actor and marca_id=p_marca)) then raise exception 'Sin permiso' using errcode='42501'; end if;
 select * into b from public.marcas where id=p_marca for update;
 if not found or b.archivada then raise exception 'Marca no disponible' using errcode='42501'; end if;
 if b.version<>p_version then raise exception 'Conflicto de versión' using errcode='PT409'; end if;
 if p_personas is not null then
  if m.rol<>'admin' then raise exception 'Solo administración asigna personas' using errcode='42501'; end if;
  if jsonb_typeof(p_personas)<>'array' then raise exception 'Personas inválidas'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_personas) v where not exists(select 1 from public.personas where id=v.value and not archivada)) then raise exception 'Persona no disponible'; end if;
  delete from public.persona_marca where marca_id=p_marca;
  insert into public.persona_marca(persona_id,marca_id) select distinct value,p_marca from jsonb_array_elements_text(p_personas);
 end if;
 update public.marcas set identidad=p_identidad,reglas=p_reglas,version=version+1,updated_at=now() where id=p_marca;
end $$;
revoke all on function public.guardar_marca(uuid,text,bigint,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.guardar_marca(uuid,text,bigint,jsonb,text,jsonb) to service_role;
create function public.guardar_persona(p_actor uuid,p_id text,p_identidad jsonb,p_marcas jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.miembros where user_id=p_actor and activo and rol='admin') then raise exception 'Solo administración' using errcode='42501'; end if;
 if jsonb_typeof(p_marcas)<>'array' then raise exception 'Marcas inválidas'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_marcas) v where not exists(select 1 from public.marcas where id=v.value and not archivada)) then raise exception 'Marca no disponible'; end if;
 insert into public.personas(id,identidad) values(p_id,p_identidad) on conflict(id) do update set identidad=excluded.identidad,updated_at=now();
 delete from public.persona_marca where persona_id=p_id;
 insert into public.persona_marca(persona_id,marca_id) select p_id,value from (select distinct value from jsonb_array_elements_text(p_marcas)) q;
end $$;
revoke all on function public.guardar_persona(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.guardar_persona(uuid,text,jsonb,jsonb) to service_role;
commit;
