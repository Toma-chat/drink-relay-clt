-- Apply once to an existing store using the Supabase SQL Editor.
-- Return database time as JSON, since HTTP Date is not exposed to browsers by CORS.
create or replace function public.drink_server_time()
returns timestamptz language sql volatile
set search_path = ''
as $$ select clock_timestamp(); $$;
grant execute on function public.drink_server_time() to anon, authenticated;
