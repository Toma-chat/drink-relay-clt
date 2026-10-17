-- Remove standard Warm Up individual cards and happy-hour cards 6-20.
-- Shared daily-code Warmup QR, orders and historical sessions are preserved.
begin;
do $reduce$
declare before_cards jsonb; removed jsonb; remaining jsonb;
begin
  select menu::jsonb into before_cards from public.drink_app_settings where id='aycd-card-catalog' for update;
  select coalesce(jsonb_agg(c),'[]'::jsonb) into removed from jsonb_array_elements(before_cards) c
    where c->>'planId'='unlimited-warmup-std' or (c->>'planId'='unlimited-happy-hour-sp' and substring(c->>'label' from '([0-9]+)番$')::int>5);
  select coalesce(jsonb_agg(c order by n),'[]'::jsonb) into remaining from jsonb_array_elements(before_cards) with ordinality x(c,n)
    where not (c->>'planId'='unlimited-warmup-std' or (c->>'planId'='unlimited-happy-hour-sp' and substring(c->>'label' from '([0-9]+)番$')::int>5));
  if jsonb_array_length(remaining)<>245 or (select count(*) from jsonb_array_elements(remaining) c where c->>'planId'='unlimited-happy-hour-sp')<>5 then raise exception 'Expected 245 cards including five happy-hour cards'; end if;
  update public.drink_app_settings s set menu=s.menu::jsonb || jsonb_build_object('status','revoked','revokedAt',now(),'revokedReason','card-count-reduced'),updated_at=now()
    where s.id like 'aycd-session-%' and s.menu->>'status' in ('active','pending')
      and exists(select 1 from jsonb_array_elements(removed) c where s.menu->>'cardHash'=encode(extensions.digest('casinolivetokyo:'||(c->>'token'),'sha256'),'hex'));
  update public.drink_app_settings set menu=remaining,updated_at=now() where id='aycd-card-catalog';
end $reduce$;
commit;
select c->>'planId' as plan,count(*) as active_cards from public.drink_app_settings s,jsonb_array_elements(s.menu::jsonb) c where s.id='aycd-card-catalog' and c->>'status'='active' group by 1 order by 1;
