-- Re-runnable one-time replacement. Keeps all order history and archived cards.
-- Run only after deploying the matching unlimited Edge Function and frontend.
begin;
do $migration$
declare
  old_cards jsonb;
  archived jsonb;
  fresh jsonb;
  stamp timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtext('aycd-catalog-20261017'));
  if exists(select 1 from public.drink_app_settings where id='aycd-catalog-20261017') then return; end if;
  select menu::jsonb into old_cards from public.drink_app_settings where id='aycd-card-catalog' for update;
  if old_cards is null or jsonb_typeof(old_cards) <> 'array' then raise exception 'Existing QR catalog missing'; end if;
  select coalesce(jsonb_agg(c || jsonb_build_object('status','retired','retiredAt',stamp,'retiredReason','catalog-replaced-20261017') order by n),'[]'::jsonb)
    into archived from jsonb_array_elements(old_cards) with ordinality x(c,n);
  select jsonb_agg(jsonb_build_object(
    'id',gen_random_uuid()::text,'token',encode(extensions.gen_random_bytes(24),'hex'),
    'planId',p->>'id','label',(p->>'name') || ' / ' || (p->>'profile') || ' ' || num || '番',
    'createdAt',stamp,'kind','permanent','status','active','immutable',true,
    'tokenHistory','[]'::jsonb,'catalogVersion','20261017') order by ordinal,num)
    into fresh from jsonb_array_elements($plans$[{"id":"unlimited-warmup-std","name":"Warm Up 飛ぶまで飲み放題","profile":"アルコールSTD","endMode":"staff"},{"id":"unlimited-warmup-sp","name":"Warm Up 飛ぶまで飲み放題 SP版","profile":"アルコールSP","endMode":"staff"},{"id":"unlimited-weekend-std","name":"Weekend Championship 飛ぶまで飲み放題 アルコール版","profile":"アルコールSTD","endMode":"staff"},{"id":"unlimited-super-weekend-sp","name":"超Weekend Championship 飛ぶまで飲み放題 SP版","profile":"アルコールSP","endMode":"staff"},{"id":"unlimited-happy-hour-sp","name":"超ハッピーアワー18:00まで飲み放題","profile":"アルコールSP","endMode":"18:00"},{"id":"unlimited-soft-2h","name":"2時間ソフトドリンク飲み放題","profile":"ソフトドリンクSTD"},{"id":"unlimited-soft-sp-2h","name":"2時間ソフトドリンクSP飲み放題","profile":"ソフトドリンクSP"},{"id":"unlimited-alcohol-2h","name":"2時間アルコール飲み放題","profile":"アルコールSTD"},{"id":"unlimited-alcohol-sp-2h","name":"2時間アルコールSP飲み放題","profile":"アルコールSP"},{"id":"unlimited-soft-all-day","name":"終日ソフトドリンク飲み放題","profile":"ソフトドリンクSTD"},{"id":"unlimited-soft-sp-all-day","name":"終日ソフトドリンクSP飲み放題","profile":"ソフトドリンクSP"},{"id":"unlimited-alcohol-all-day","name":"終日アルコール飲み放題","profile":"アルコールSTD"},{"id":"unlimited-alcohol-sp-all-day","name":"終日アルコールSP飲み放題","profile":"アルコールSP"},{"id":"unlimited-ring-sp","name":"リングゲームプレイ中飲み放題","profile":"アルコールSP","endMode":"staff"}]$plans$::jsonb) with ordinality x(p,ordinal) cross join generate_series(1,20) num;
  if jsonb_array_length(fresh) <> 280 then raise exception 'Expected 280 new cards'; end if;
  update public.drink_app_settings set menu=archived || fresh, updated_at=stamp where id='aycd-card-catalog';
  update public.drink_app_settings s set menu=s.menu::jsonb || jsonb_build_object('status','revoked','revokedAt',stamp,'revokedReason','catalog-replaced-20261017','reconnectRequest',null), updated_at=stamp
    where s.id like 'aycd-session-%' and s.menu->>'status' in ('active','pending','waiting')
    and exists(select 1 from jsonb_array_elements(old_cards) c where c->>'planId'=s.menu->>'planId');
  -- Existing eight sale items retain their configured prices and other fields.
  update public.drink_app_settings s set menu=(select jsonb_agg(case when cat->>'id'='all-you-can-drink' then
    jsonb_set(cat,'{items}',(select jsonb_agg(case when def.p is not null then jsonb_set(item,'{name}',def.p->'name') else item end order by seq)
      from jsonb_array_elements(cat->'items') with ordinality i(item,seq)
      left join lateral (select p from jsonb_array_elements($plans$[{"id":"unlimited-warmup-std","name":"Warm Up 飛ぶまで飲み放題","profile":"アルコールSTD","endMode":"staff"},{"id":"unlimited-warmup-sp","name":"Warm Up 飛ぶまで飲み放題 SP版","profile":"アルコールSP","endMode":"staff"},{"id":"unlimited-weekend-std","name":"Weekend Championship 飛ぶまで飲み放題 アルコール版","profile":"アルコールSTD","endMode":"staff"},{"id":"unlimited-super-weekend-sp","name":"超Weekend Championship 飛ぶまで飲み放題 SP版","profile":"アルコールSP","endMode":"staff"},{"id":"unlimited-happy-hour-sp","name":"超ハッピーアワー18:00まで飲み放題","profile":"アルコールSP","endMode":"18:00"},{"id":"unlimited-soft-2h","name":"2時間ソフトドリンク飲み放題","profile":"ソフトドリンクSTD"},{"id":"unlimited-soft-sp-2h","name":"2時間ソフトドリンクSP飲み放題","profile":"ソフトドリンクSP"},{"id":"unlimited-alcohol-2h","name":"2時間アルコール飲み放題","profile":"アルコールSTD"},{"id":"unlimited-alcohol-sp-2h","name":"2時間アルコールSP飲み放題","profile":"アルコールSP"},{"id":"unlimited-soft-all-day","name":"終日ソフトドリンク飲み放題","profile":"ソフトドリンクSTD"},{"id":"unlimited-soft-sp-all-day","name":"終日ソフトドリンクSP飲み放題","profile":"ソフトドリンクSP"},{"id":"unlimited-alcohol-all-day","name":"終日アルコール飲み放題","profile":"アルコールSTD"},{"id":"unlimited-alcohol-sp-all-day","name":"終日アルコールSP飲み放題","profile":"アルコールSP"},{"id":"unlimited-ring-sp","name":"リングゲームプレイ中飲み放題","profile":"アルコールSP","endMode":"staff"}]$plans$::jsonb) p where p->>'id'=item->>'id') def on true))
    else cat end order by pos) from jsonb_array_elements(s.menu::jsonb) with ordinality x(cat,pos)), updated_at=stamp where s.id='main';
  insert into public.drink_app_settings(id,menu,updated_at) values('aycd-catalog-20261017',jsonb_build_object('created',280,'archived',jsonb_array_length(old_cards),'appliedAt',stamp),stamp);
end $migration$;
commit;
-- Only counts are returned. QR tokens are never printed in logs.
select c->>'planId' as plan, count(*) as active_cards from public.drink_app_settings s,
jsonb_array_elements(s.menu::jsonb) c where s.id='aycd-card-catalog' and c->>'status'='active'
group by 1 order by 1;
