begin;
alter table public.entregas
 add column exportacion_id uuid,
 add column proyecto_id text,
 add column proyecto_version bigint,
 add column lamina_id text,
 add column posicion integer,
 add column total integer,
 add column publicada boolean not null default false,
 add constraint entregas_proyecto_marca foreign key(proyecto_id,marca_id) references public.proyectos(id,marca_id),
 add constraint entregas_exportacion_completa check(exportacion_id is null or
  (proyecto_id is not null and proyecto_version is not null and lamina_id is not null and posicion is not null and total is not null and posicion>=0 and total between 1 and 10 and posicion<total)),
 add constraint entregas_exportacion_posicion unique(marca_id,exportacion_id,posicion);
create unique index entregas_exportacion_lamina on public.entregas(marca_id,exportacion_id,lamina_id) where exportacion_id is not null;
create index entregas_exportacion on public.entregas(exportacion_id) where exportacion_id is not null;

-- Publication is atomic: readers never receive a partially uploaded carousel.
create function public.publicar_exportacion(p_actor uuid,p_exportacion uuid,p_proyecto text,p_version bigint)
returns void language plpgsql security invoker set search_path='' as $$
declare p public.proyectos; n integer; esperado integer; minimo integer; maximo integer;
begin
 select * into p from public.proyectos where id=p_proyecto for update;
 if not found or p.version<>p_version then raise exception 'El proyecto cambió durante la exportación' using errcode='40001'; end if;
 if not exists(select 1 from public.miembros m where m.user_id=p_actor and m.activo and
 (m.rol='admin' or (m.rol='editor' and exists(select 1 from public.miembro_marca mm where mm.user_id=m.user_id and mm.marca_id=p.marca_id)))) then
  raise exception 'Sin permiso' using errcode='42501';
 end if;
 select count(*),min(total),min(posicion),max(posicion) into n,esperado,minimo,maximo from public.entregas
 where exportacion_id=p_exportacion and marca_id=p.marca_id and proyecto_id=p.id and proyecto_version=p.version;
 if n=0 or n<>esperado or minimo<>0 or maximo<>esperado-1 or exists(select 1 from public.entregas where exportacion_id=p_exportacion and
 (proyecto_id<>p.id or marca_id<>p.marca_id or proyecto_version<>p.version or total<>esperado)) then
  raise exception 'Exportación incompleta' using errcode='22023';
 end if;
 update public.entregas set publicada=true where exportacion_id=p_exportacion and proyecto_id=p.id and proyecto_version=p.version;
end $$;
revoke all on function public.publicar_exportacion(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.publicar_exportacion(uuid,uuid,text,bigint) to service_role;
commit;
