create schema if not exists extensions;

do $$
declare
  current_schema text;
begin
  select namespace.nspname
  into current_schema
  from pg_extension extension
  join pg_namespace namespace on namespace.oid = extension.extnamespace
  where extension.extname = 'pg_trgm';

  if current_schema is null then
    execute 'create extension pg_trgm with schema extensions';
  elsif current_schema = 'public' then
    execute 'alter extension pg_trgm set schema extensions';
  end if;
end
$$;
