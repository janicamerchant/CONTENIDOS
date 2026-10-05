-- Generador de Reels: transcripción (Apify + Deepgram), guiones y entregables PDF con Claude.
-- Cada cliente de Reels es una marca del Estudio: mismos permisos, presupuesto y cola de trabajos.
begin;

-- Configuración de Reels por marca: perfil, estilos de guion, estructura del copy y del PDF, branding del PDF.
create table public.reels_marcas (
 marca_id text primary key references public.marcas(id) on delete cascade,
 contexto text not null default '',
 estilos jsonb not null default '[]' check(jsonb_typeof(estilos)='array'),
 estructura_copy text not null default '',
 estructura_entregable text not null default '',
 branding jsonb not null default '{}' check(jsonb_typeof(branding)='object'),
 version bigint not null default 1,
 updated_at timestamptz not null default now()
);

-- Un proyecto por video: transcripción, puntos clave, guiones y entregables (documento JSON).
create table public.reels_proyectos (
 id text primary key check(id ~ '^[A-Za-z0-9-]{1,64}$'),
 marca_id text not null references public.marcas(id),
 tipo text not null check(tipo in ('largo','reel')),
 titulo text not null default '',
 documento jsonb not null check(jsonb_typeof(documento)='object'),
 version bigint not null default 1,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index reels_proyectos_marca on public.reels_proyectos(marca_id,created_at desc);
create index reels_proyectos_autor on public.reels_proyectos(created_by);

-- Solo lectura para el navegador; el servidor escribe tras comprobar rol y marca.
do $$ declare t text; begin
 foreach t in array array['reels_marcas','reels_proyectos'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy lectura on public.%I for select to authenticated using(private.acceso_marca(marca_id))',t);
 end loop;
end $$;

-- Nuevo tipo de trabajo en la cola. payload.op: transcribir | guiones | entregable | sugerir | muestra.
alter table public.trabajos drop constraint trabajos_tipo_check;
alter table public.trabajos add constraint trabajos_tipo_check check(tipo in ('imagen','propuesta','recorte','perfil','reels'));

-- Igual que antes; solo sube el máximo de trabajos pendientes por persona de 10 a 30
-- (una tanda de guiones con su PDF por guion encola un trabajo por cada PDF).
create or replace function public.encolar_trabajo(p_actor uuid,p_marca text,p_tipo text,p_motor text,p_payload jsonb,
 p_key uuid,p_hash text,p_reserva numeric,p_grupo uuid,p_proyecto text default null,p_lamina text default null,p_version bigint default null)
returns public.trabajos language plpgsql security invoker set search_path='' as $$
declare m public.miembros; j public.trabajos; gastado numeric; activos integer;
begin
 select * into m from public.miembros where user_id=p_actor for update;
 if not found or not m.activo or m.rol not in ('admin','editor') then raise exception 'Sin permiso para generar' using errcode='42501'; end if;
 if m.rol<>'admin' and (p_marca='_comun' or not exists(select 1 from public.miembro_marca where user_id=p_actor and marca_id=p_marca)) then
  raise exception 'Marca no autorizada' using errcode='42501';
 end if;
 select * into j from public.trabajos where user_id=p_actor and idempotency_key=p_key;
 if found then
  if j.payload_hash<>p_hash or j.marca_id<>p_marca or j.tipo<>p_tipo or j.motor<>p_motor or j.payload<>p_payload or j.proyecto_id is distinct from p_proyecto or j.lamina_id is distinct from p_lamina then
   raise exception 'Clave de idempotencia usada con otra solicitud' using errcode='23505';
  end if;
  return j;
 end if;
 select coalesce(sum(coalesce(coste_usd,reserva_usd)),0) into gastado from public.trabajos
 where user_id=p_actor and (created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' or estado in ('queued','running','waiting','uncertain'));
 if p_reserva is null or p_reserva<=0 or gastado+p_reserva>m.limite_mensual_usd then raise exception 'Presupuesto mensual insuficiente' using errcode='P0001'; end if;
 select count(*) into activos from public.trabajos where user_id=p_actor and estado in ('queued','running','waiting','uncertain');
 if activos>=30 then raise exception 'Demasiados trabajos pendientes' using errcode='P0001'; end if;
 insert into public.trabajos(user_id,marca_id,tipo,motor,payload,idempotency_key,payload_hash,reserva_usd,grupo_id,proyecto_id,lamina_id,proyecto_version)
 values(p_actor,p_marca,p_tipo,p_motor,p_payload,p_key,p_hash,p_reserva,p_grupo,p_proyecto,p_lamina,p_version) returning * into j;
 insert into public.auditoria(actor_id,marca_id,accion,detalle) values(p_actor,p_marca,'trabajo.encolado',jsonb_build_object('id',j.id,'reserva_usd',p_reserva));
 return j;
end $$;
revoke all on function public.encolar_trabajo(uuid,text,text,text,jsonb,uuid,text,numeric,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.encolar_trabajo(uuid,text,text,text,jsonb,uuid,text,numeric,uuid,text,text,bigint) to service_role;

-- Audio/video subido para transcribir: privado, temporal (se borra al terminar la transcripción).
-- Sin políticas para clientes: la subida usa una URL firmada de un solo uso y Deepgram lee una URL firmada.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('reels-media','reels-media',false,52428800,array['audio/*','video/*']);
commit;
