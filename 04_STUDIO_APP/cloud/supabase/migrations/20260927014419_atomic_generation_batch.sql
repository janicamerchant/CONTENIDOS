begin;
-- Reserve the entire carousel in one transaction: never silently enqueue a partial batch.
create function public.encolar_lote(p_actor uuid,p_marca text,p_grupo uuid,p_jobs jsonb)
returns setof public.trabajos language plpgsql security invoker set search_path='' as $$
declare item jsonb; j public.trabajos;
begin
 if jsonb_typeof(p_jobs)<>'array' or jsonb_array_length(p_jobs) not between 1 and 10 then raise exception 'Lote inválido' using errcode='22023'; end if;
 if not exists(select 1 from public.marcas where id=p_marca and not archivada) then raise exception 'Marca archivada' using errcode='42501'; end if;
 for item in select value from jsonb_array_elements(p_jobs) loop
  select * into j from public.encolar_trabajo(p_actor,p_marca,item->>'tipo',item->>'motor',item->'payload',
   (item->>'key')::uuid,item->>'hash',(item->>'reserva')::numeric,p_grupo,item->>'proyecto',item->>'lamina',(item->>'version')::bigint);
  return next j;
 end loop;
end $$;
revoke all on function public.encolar_lote(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.encolar_lote(uuid,text,uuid,jsonb) to service_role;
commit;
