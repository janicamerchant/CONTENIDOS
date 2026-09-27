-- Apply to a dedicated, empty Estudio project. No public signup, grants or storage.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.miembros (
  user_id uuid primary key references auth.users(id) on delete restrict,
  rol text not null check (rol in ('admin','editor','lector')),
  activo boolean not null default true,
  limite_mensual_usd numeric(12,6) not null default 25 check (limite_mensual_usd >= 0),
  created_at timestamptz not null default now()
);
create table public.marcas (
  id text primary key check (id ~ '^([a-z0-9][a-z0-9-]{0,63}|_comun)$'),
  identidad jsonb not null default '{}' check (jsonb_typeof(identidad)='object'),
  reglas text not null default '', archivada boolean not null default false,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
create table public.miembro_marca (
  user_id uuid not null references public.miembros(user_id) on delete cascade,
  marca_id text not null references public.marcas(id) on delete cascade,
  primary key(user_id, marca_id)
);
create index miembro_marca_marca on public.miembro_marca(marca_id,user_id);
create table public.personas (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  identidad jsonb not null default '{}' check (jsonb_typeof(identidad)='object'),
  archivada boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.persona_marca (
  persona_id text not null references public.personas(id) on delete cascade,
  marca_id text not null references public.marcas(id) on delete cascade,
  primary key(persona_id,marca_id)
);
create index persona_marca_marca on public.persona_marca(marca_id,persona_id);

-- Internal authorization helpers avoid recursive policies on membership tables.
-- No caller-controlled user_id: only the verified request's auth.uid().
create function private.es_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.miembros where user_id=(select auth.uid()) and activo and rol='admin');
$$;
create function private.acceso_marca(marca text, escribir boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
 select 1 from public.miembros m where m.user_id=(select auth.uid()) and m.activo
 and (m.rol='admin' or (
   (not escribir or m.rol='editor') and
   ((marca='_comun' and not escribir) or exists(select 1 from public.miembro_marca mm where mm.user_id=m.user_id and mm.marca_id=marca))
   and (not escribir or marca<>'_comun')
 )));
$$;
create function private.acceso_persona(persona text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.es_admin() or exists (
 select 1 from public.persona_marca pm where pm.persona_id=persona and private.acceso_marca(pm.marca_id)));
$$;
revoke all on function private.es_admin(),private.acceso_marca(text,boolean),private.acceso_persona(text) from public, anon;
grant execute on function private.es_admin(),private.acceso_marca(text,boolean),private.acceso_persona(text) to authenticated,service_role;

create table public.archivos (
 id uuid primary key default gen_random_uuid(),
 alcance text not null check(alcance in ('marca','persona','cuarentena')),
 marca_id text references public.marcas(id), persona_id text references public.personas(id),
 nombre text not null, mime text not null,
 bytes bigint not null check(bytes between 0 and 52428800),
 sha256 text check(sha256 ~ '^[0-9a-f]{64}$'),
 object_path text generated always as (id::text || '/original') stored unique,
 origen text unique, listo boolean not null default false,
 eliminado_at timestamptz,
 created_at timestamptz not null default now(),
 check((alcance='marca' and marca_id is not null and persona_id is null) or
       (alcance='persona' and persona_id is not null and marca_id is null) or
       (alcance='cuarentena' and marca_id is null and persona_id is null)),
 unique(id,marca_id), unique(id,persona_id)
);
create index archivos_marca on public.archivos(marca_id);
create index archivos_persona on public.archivos(persona_id);
create table public.marca_recursos (
 id uuid primary key default gen_random_uuid(), marca_id text not null references public.marcas(id),
 archivo_id uuid not null, tipo text not null check(tipo in ('conocimiento','referencias','logos','vestuario','papelera','otros')),
 ruta text not null, activo boolean not null default true, etiquetas jsonb not null default '[]',
 eliminado_at timestamptz, metadata jsonb not null default '{}',
 unique(marca_id,ruta), foreign key(archivo_id,marca_id) references public.archivos(id,marca_id)
);
create index marca_recursos_archivo on public.marca_recursos(archivo_id);
create table public.marca_datos (
 id uuid primary key default gen_random_uuid(), marca_id text not null references public.marcas(id),
 dato text not null, fuente text not null, url text, metadata jsonb not null default '{}'
);
create index marca_datos_marca on public.marca_datos(marca_id);
create table public.persona_fotos (
 persona_id text not null references public.personas(id), archivo_id uuid not null,
 posicion integer not null default 0, activa boolean not null default true,
 primary key(persona_id,archivo_id), foreign key(archivo_id,persona_id) references public.archivos(id,persona_id)
);
create index persona_fotos_archivo on public.persona_fotos(archivo_id);
create table public.proyectos (
 id text primary key check(length(id) between 1 and 128), marca_id text not null references public.marcas(id),
 documento jsonb not null check(jsonb_typeof(documento)='object'),
 version bigint not null default 1, created_by uuid references auth.users(id),
 updated_at timestamptz not null default now(), unique(id,marca_id)
);
create index proyectos_marca on public.proyectos(marca_id,updated_at desc);
create table public.solicitudes (
 id text primary key, marca_id text not null references public.marcas(id), documento jsonb not null,
 version bigint not null default 1, created_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create index solicitudes_marca on public.solicitudes(marca_id);
create table public.entregas (
 id uuid primary key default gen_random_uuid(), marca_id text not null references public.marcas(id),
 archivo_id uuid not null, carpeta text not null, nombre text not null,
 created_at timestamptz not null default now(),
 unique(archivo_id), foreign key(archivo_id,marca_id) references public.archivos(id,marca_id)
);
create index entregas_marca on public.entregas(marca_id,created_at desc);

create table public.trabajos (
 id uuid primary key default gen_random_uuid(), grupo_id uuid not null,
 user_id uuid not null references public.miembros(user_id), marca_id text not null references public.marcas(id),
 proyecto_id text, lamina_id text, proyecto_version bigint,
 tipo text not null check(tipo in ('imagen','propuesta','recorte','perfil')),
 estado text not null default 'queued' check(estado in ('queued','running','waiting','succeeded','failed','uncertain','canceled')),
 motor text not null, payload jsonb not null,
 idempotency_key uuid not null, payload_hash text not null,
 provider_id text, resultado jsonb, error text,
 reserva_usd numeric(12,6) not null check(reserva_usd>0), coste_usd numeric(12,6) check(coste_usd>=0),
 intentos integer not null default 0, lease_token uuid, lease_until timestamptz,
 next_run_at timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,idempotency_key), foreign key(proyecto_id,marca_id) references public.proyectos(id,marca_id)
);
create index trabajos_cola on public.trabajos(next_run_at) where estado in ('queued','waiting');
create index trabajos_usuario on public.trabajos(user_id,created_at);
create index trabajos_marca on public.trabajos(marca_id);
create index trabajos_proyecto on public.trabajos(proyecto_id);
create index trabajos_grupo on public.trabajos(grupo_id);
create table public.auditoria (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id), marca_id text references public.marcas(id),
 accion text not null, detalle jsonb not null default '{}', created_at timestamptz not null default now()
);
create index auditoria_marca on public.auditoria(marca_id,created_at desc);
create index auditoria_actor on public.auditoria(actor_id);

-- Explicit grants: clients cannot write roles, jobs, prices, files or audit records.
do $$ declare t text; begin
 foreach t in array array['miembros','miembro_marca','marcas','personas','persona_marca','archivos','marca_recursos','marca_datos','persona_fotos','proyectos','solicitudes','entregas','trabajos','auditoria'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.auditoria_id_seq to service_role;
create policy miembros_lectura on public.miembros for select to authenticated using(user_id=(select auth.uid()) or (select private.es_admin()));
create policy asignaciones_lectura on public.miembro_marca for select to authenticated using(user_id=(select auth.uid()) or (select private.es_admin()));
create policy marcas_lectura on public.marcas for select to authenticated using(private.acceso_marca(id));
create policy personas_lectura on public.personas for select to authenticated using(private.acceso_persona(id));
create policy persona_marca_lectura on public.persona_marca for select to authenticated using(private.acceso_marca(marca_id));
create policy persona_fotos_lectura on public.persona_fotos for select to authenticated using(private.acceso_persona(persona_id));
create policy archivos_lectura on public.archivos for select to authenticated using(
 (select private.es_admin()) or (eliminado_at is null and (
  (alcance='marca' and private.acceso_marca(marca_id)) or (alcance='persona' and private.acceso_persona(persona_id))
 )));
do $$ declare t text; begin
 foreach t in array array['marca_recursos','marca_datos','proyectos','solicitudes','entregas','trabajos'] loop
 execute format('create policy lectura on public.%I for select to authenticated using(private.acceso_marca(marca_id))',t);
 end loop;
end $$;
create policy auditoria_lectura on public.auditoria for select to authenticated using((select private.es_admin()));
-- Direct writes use caller JWT, not a privileged server client.
grant insert on public.proyectos to authenticated;
grant update(documento,version,updated_at) on public.proyectos to authenticated;
create policy proyectos_crear on public.proyectos for insert to authenticated with check(private.acceso_marca(marca_id,true) and created_by=(select auth.uid()) and version=1);
create policy proyectos_editar on public.proyectos for update to authenticated using(private.acceso_marca(marca_id,true)) with check(private.acceso_marca(marca_id,true));

-- Trigger also protects direct REST writes from bypassing optimistic concurrency.
create function private.version_proyecto() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if new.id<>old.id or new.marca_id<>old.marca_id or new.created_by is distinct from old.created_by then
   raise exception 'La identidad del proyecto no se puede cambiar' using errcode='42501';
  end if;
  if new.version<>old.version+1 then raise exception 'Conflicto de versión' using errcode='40001'; end if;
 end if;
 if new.documento->>'brand' is distinct from new.marca_id or new.documento->>'id' is distinct from new.id then
  raise exception 'Identidad del documento inválida' using errcode='23514';
 end if;
 new.updated_at=now(); return new;
end $$;
revoke all on function private.version_proyecto() from public,anon,authenticated;
create trigger version_proyecto before insert or update on public.proyectos for each row execute function private.version_proyecto();

create function public.guardar_proyecto(p_id text,p_marca text,p_documento jsonb,p_version bigint)
returns public.proyectos language plpgsql security invoker set search_path='' as $$
declare r public.proyectos;
begin
 if p_version=0 then
  insert into public.proyectos(id,marca_id,documento,created_by) values(p_id,p_marca,p_documento,auth.uid()) returning * into r;
 else
  update public.proyectos set documento=p_documento,version=version+1
  where id=p_id and marca_id=p_marca and version=p_version returning * into r;
  if not found then raise exception 'Proyecto modificado o acceso revocado. Recarga antes de guardar.' using errcode='40001'; end if;
 end if;
 return r;
end $$;
revoke all on function public.guardar_proyecto(text,text,jsonb,bigint) from public,anon;
grant execute on function public.guardar_proyecto(text,text,jsonb,bigint) to authenticated;

-- Only the server may enqueue: it supplies a validated maximum cost, never the browser.
-- Membership row lock serializes spending reservations, including across different brands.
create function public.encolar_trabajo(p_actor uuid,p_marca text,p_tipo text,p_motor text,p_payload jsonb,
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
 if activos>=10 then raise exception 'Demasiados trabajos pendientes' using errcode='P0001'; end if;
 insert into public.trabajos(user_id,marca_id,tipo,motor,payload,idempotency_key,payload_hash,reserva_usd,grupo_id,proyecto_id,lamina_id,proyecto_version)
 values(p_actor,p_marca,p_tipo,p_motor,p_payload,p_key,p_hash,p_reserva,p_grupo,p_proyecto,p_lamina,p_version) returning * into j;
 insert into public.auditoria(actor_id,marca_id,accion,detalle) values(p_actor,p_marca,'trabajo.encolado',jsonb_build_object('id',j.id,'reserva_usd',p_reserva));
 return j;
end $$;
revoke all on function public.encolar_trabajo(uuid,text,text,text,jsonb,uuid,text,numeric,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.encolar_trabajo(uuid,text,text,text,jsonb,uuid,text,numeric,uuid,text,text,bigint) to service_role;

-- A timed-out submission is ambiguous. Never automatically charge for it twice.
-- Polling a persisted provider_id is safe to retry; submission without one is not.
create function public.reclamar_trabajo() returns setof public.trabajos language plpgsql security invoker set search_path='' as $$
begin
 update public.trabajos set estado=case when provider_id is null then 'uncertain' else 'waiting' end,
 error=case when provider_id is null then 'Ejecución interrumpida: revisar proveedor antes de reintentar' else error end,
 lease_token=null,lease_until=null,updated_at=now() where estado='running' and lease_until<now();
 -- Re-check current permissions before a queued submission or subsequent polling.
 update public.trabajos j set estado=case when provider_id is null then 'canceled' else 'uncertain' end,
 coste_usd=case when provider_id is null then 0 else coste_usd end, error='Acceso revocado',updated_at=now()
 where estado in ('queued','waiting') and not exists(select 1 from public.miembros m where m.user_id=j.user_id and m.activo and
 (m.rol='admin' or (m.rol='editor' and j.marca_id<>'_comun' and exists(select 1 from public.miembro_marca mm where mm.user_id=m.user_id and mm.marca_id=j.marca_id))));
 return query
 with candidato as (select id from public.trabajos where estado in ('queued','waiting') and next_run_at<=now()
 order by next_run_at for update skip locked limit 1)
 update public.trabajos j set estado='running',intentos=intentos+1,lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',updated_at=now()
 from candidato c where j.id=c.id returning j.*;
end $$;
revoke all on function public.reclamar_trabajo() from public,anon,authenticated;
grant execute on function public.reclamar_trabajo() to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('estudio','estudio',false,52428800,array['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/markdown','application/octet-stream']);
-- File registration is server-only. A signed upload grants one already-authorized object.
create policy estudio_descarga on storage.objects for select to authenticated using(
 bucket_id='estudio' and exists(select 1 from public.archivos a where a.object_path=name and a.listo and a.eliminado_at is null)
);
-- No client INSERT/UPDATE/DELETE policies: uploads are one-use signed paths without upsert.
-- Realtime broadcasts are optional; persisted table state remains authoritative.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.trabajos;
 end if;
end $$;
commit;
