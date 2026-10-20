-- Apply before the updated unlimited Edge Function. No existing rows are rewritten.
-- Only the service-role Edge Function can call this transaction boundary.
create or replace function public.drink_unlimited_mutate(
  p_action text, p_store text, p_hash text,
  p_session text default null, p_value jsonb default null, p_expected jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  catalog jsonb;
  current_value jsonb;
  card jsonb;
  destination jsonb;
  saved jsonb;
  pending public.drink_orders%rowtype;
  inserted public.drink_orders%rowtype;
  row_id text := 'aycd-session-' || left(p_hash,40);
  at_time timestamptz;
begin
  -- Always lock catalog first, then session. Catalog retirement and session
  -- replacement/termination therefore serialize with customer mutations.
  select menu into catalog from public.drink_app_settings
    where id = 'aycd-card-catalog' for update;
  select menu into current_value from public.drink_app_settings
    where id = row_id for update;
  select value into card from pg_catalog.jsonb_array_elements(catalog)
    where pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_store || ':' || (value->>'token'),'UTF8')),'hex') = p_hash
      and value->>'status' = 'active';
  if card is null then
    return jsonb_build_object('error','このQRカードは利用できません','code','SESSION_ENDED');
  end if;
  at_time := clock_timestamp();
  if p_action = 'save' then
    if current_value is distinct from p_expected or p_value->>'cardHash' is distinct from p_hash
      or p_value->>'planId' is distinct from card->>'planId' then
      return jsonb_build_object('error','利用状態が変更されました。再読み込みしてください','code','SESSION_ENDED');
    end if;
    if p_value->>'status' = 'active' and
       (current_value->>'status' is distinct from 'pending'
        or (current_value->>'requestExpiresAt')::timestamptz <= at_time) then
      return jsonb_build_object('error','受付コードは期限切れです','code','SESSION_ENDED');
    end if;
    insert into public.drink_app_settings(id,menu,updated_at) values(row_id,p_value,at_time)
      on conflict(id) do update set menu=excluded.menu,updated_at=excluded.updated_at;
    return jsonb_build_object('session',p_value);
  end if;
  if current_value is null or current_value->>'status' is distinct from 'active'
    or current_value->>'sessionId' is distinct from p_session
    or current_value->>'cardHash' is distinct from p_hash
    or current_value->>'planId' is distinct from card->>'planId'
    or coalesce((current_value->>'expiresAt')::timestamptz, '-infinity'::timestamptz) <= at_time then
    return jsonb_build_object('error','この利用は終了しました','code','SESSION_ENDED');
  end if;
  select * into pending from public.drink_orders
    where events @> jsonb_build_array(jsonb_build_object('source','unlimited','sessionId',p_session))
      and status in ('ordered','making','made') order by created_at limit 1 for update;
  at_time := clock_timestamp();
  if coalesce((current_value->>'expiresAt')::timestamptz, '-infinity'::timestamptz) <= at_time then
    return jsonb_build_object('error','この利用は終了しました','code','SESSION_ENDED');
  end if;
  if p_action = 'location' then
    destination := p_value - 'source';
    if destination->>'target' not in ('bar','ring','tournament')
      or destination->>'target' is null
      or (destination->>'target' <> 'bar' and
        (coalesce(destination->>'tableNo','') not in ('A','B','C','D','E','F','G','H')
         or coalesce(destination->>'seatNo','') not in ('1','2','3','4','5','6','7','8','9'))) then
      raise exception 'Invalid delivery location';
    end if;
    saved := current_value || jsonb_build_object('currentLocation',destination,'locationConfirmed',true,
      'updatedAt',at_time,'locationUpdatedAt',at_time,'locationSource',p_value->>'source','locationRevision',gen_random_uuid());
    update public.drink_app_settings set menu=saved,updated_at=at_time where id=row_id;
    if pending.id is not null then
      update public.drink_orders set target=destination->>'target',table_no=destination->>'tableNo',
        seat_no=destination->>'seatNo',updated_at=at_time,
        events=coalesce(events,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'type','location-changed','at',at_time,'sessionId',p_session,'source',p_value->>'source',
          'previousDeliveryLocation',current_value->'currentLocation','sessionCurrentLocation',destination))
        where id=pending.id returning * into pending;
    end if;
    return jsonb_build_object('session',saved,'pendingOrder',case when pending.id is null then null else to_jsonb(pending) end);
  elsif p_action = 'order' then
    if pending.id is not null then
      return jsonb_build_object('error','前のドリンクの提供をお待ちください','code','UNLIMITED_ORDER_PENDING');
    end if;
    if current_value->>'locationConfirmed' = 'false' then
      return jsonb_build_object('error','最初の届け先を設定してください','code','SESSION_ENDED');
    end if;
    destination := current_value->'currentLocation';
    -- Use the current destination under the lock, never the Edge snapshot.
    p_value := p_value || jsonb_build_object('created_at',at_time,'updated_at',at_time,
      'target',destination->>'target','table_no',destination->>'tableNo','seat_no',destination->>'seatNo',
      'events',jsonb_build_array((p_value->'events'->0) || jsonb_build_object(
        'at',at_time,'orderLocation',destination,'sessionCurrentLocation',destination)));
    inserted := jsonb_populate_record(null::public.drink_orders,p_value);
    insert into public.drink_orders select (inserted).* returning * into inserted;
    return jsonb_build_object('order',to_jsonb(inserted));
  end if;
  raise exception 'Unsupported unlimited mutation';
end;
$$;
revoke all on function public.drink_unlimited_mutate(text,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.drink_unlimited_mutate(text,text,text,text,jsonb,jsonb) to service_role;
