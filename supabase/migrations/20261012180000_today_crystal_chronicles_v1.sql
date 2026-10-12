-- TODAY CRYSTAL CHRONICLES V1: campaign progression, server-authoritative booster wallet and coin purchases.
-- Idempotent migration. Booster purchases debit the existing public.profiles.coins balance.

create table if not exists public.today_match3_campaign_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  unlocked_level integer not null default 1 check (unlocked_level between 1 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.today_match3_campaign_levels (
  user_id uuid not null references auth.users(id) on delete cascade,
  level_id integer not null check (level_id between 1 and 30),
  best_score integer not null default 0 check (best_score between 0 and 10000000),
  best_stars integer not null default 0 check (best_stars between 0 and 3),
  completed boolean not null default false,
  best_moves integer not null default 0 check (best_moves between 0 and 1000),
  best_duration_sec integer not null default 0 check (best_duration_sec between 0 and 86400),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, level_id)
);

create table if not exists public.today_match3_booster_inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  booster_id text not null check (booster_id in ('hammer','shuffle','rainbow','moves')),
  quantity integer not null default 0 check (quantity between 0 and 10000),
  updated_at timestamptz not null default now(),
  primary key (user_id, booster_id)
);

create index if not exists today_match3_levels_user_completed_idx
  on public.today_match3_campaign_levels (user_id, completed, level_id);

alter table public.today_match3_campaign_state enable row level security;
alter table public.today_match3_campaign_levels enable row level security;
alter table public.today_match3_booster_inventory enable row level security;
revoke all on public.today_match3_campaign_state from anon, authenticated;
revoke all on public.today_match3_campaign_levels from anon, authenticated;
revoke all on public.today_match3_booster_inventory from anon, authenticated;

create or replace function public.today_match3_get_progress()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_unlocked integer;
  v_coins bigint := 0;
  v_inventory jsonb := '{}'::jsonb;
  v_levels jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы синхронизировать кампанию.');
  end if;

  insert into public.today_match3_campaign_state(user_id)
  values (v_uid) on conflict (user_id) do nothing;

  -- A small starter kit makes the first chapter friendly; rows remain at quantity zero after use.
  insert into public.today_match3_booster_inventory(user_id, booster_id, quantity)
  values (v_uid,'hammer',1),(v_uid,'shuffle',1)
  on conflict (user_id, booster_id) do nothing;

  select unlocked_level into v_unlocked
  from public.today_match3_campaign_state where user_id=v_uid;

  select coalesce(coins,0)::bigint into v_coins
  from public.profiles where id=v_uid;
  if v_coins is null then v_coins := 0; end if;

  select coalesce(jsonb_object_agg(booster_id,quantity),'{}'::jsonb)
    into v_inventory
  from public.today_match3_booster_inventory where user_id=v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'level_id',level_id,'best_score',best_score,'best_stars',best_stars,
    'completed',completed,'best_moves',best_moves,'best_duration_sec',best_duration_sec
  ) order by level_id),'[]'::jsonb)
    into v_levels
  from public.today_match3_campaign_levels where user_id=v_uid;

  return jsonb_build_object('ok',true,'unlocked_level',coalesce(v_unlocked,1),
    'coins',coalesce(v_coins,0),'inventory',v_inventory,'levels',v_levels);
end;
$$;

create or replace function public.today_match3_buy_booster(p_booster_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_price integer;
  v_coins bigint;
  v_quantity integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы покупать усилители.');
  end if;
  v_price := case p_booster_id
    when 'hammer' then 90
    when 'shuffle' then 65
    when 'rainbow' then 145
    when 'moves' then 120
    else null end;
  if v_price is null then
    return jsonb_build_object('ok',false,'message','Неизвестный усилитель.');
  end if;

  -- Lock the actual profile row; concurrent clicks cannot spend the same coins twice.
  select coalesce(coins,0)::bigint into v_coins
  from public.profiles where id=v_uid for update;
  if not found then
    return jsonb_build_object('ok',false,'message','Не найден профиль с балансом монет.');
  end if;
  if coalesce(v_coins,0) < v_price then
    return jsonb_build_object('ok',false,'message',format('Недостаточно монет: нужно %s, у тебя %s.',v_price,coalesce(v_coins,0)));
  end if;

  update public.profiles set coins=coalesce(coins,0)-v_price where id=v_uid returning coins::bigint into v_coins;
  insert into public.today_match3_booster_inventory as existing(user_id,booster_id,quantity,updated_at)
  values (v_uid,p_booster_id,1,now())
  on conflict (user_id,booster_id) do update
    set quantity=existing.quantity+1,updated_at=now()
  returning quantity into v_quantity;

  return jsonb_build_object('ok',true,'booster_id',p_booster_id,'price',v_price,
    'coins',coalesce(v_coins,0),'quantity',coalesce(v_quantity,0));
end;
$$;

create or replace function public.today_match3_use_booster(p_booster_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_quantity integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы использовать усилители.');
  end if;
  if p_booster_id not in ('hammer','shuffle','rainbow','moves') then
    return jsonb_build_object('ok',false,'message','Неизвестный усилитель.');
  end if;
  update public.today_match3_booster_inventory
  set quantity=quantity-1,updated_at=now()
  where user_id=v_uid and booster_id=p_booster_id and quantity>0
  returning quantity into v_quantity;
  if not found then
    return jsonb_build_object('ok',false,'message','Усилитель закончился. Купи его за монеты на карте кампании.');
  end if;
  return jsonb_build_object('ok',true,'booster_id',p_booster_id,'quantity',v_quantity);
end;
$$;

create or replace function public.today_match3_save_result(
  p_level_id integer,
  p_score integer,
  p_stars integer,
  p_moves_used integer,
  p_duration_sec integer,
  p_won boolean,
  p_goal_color integer,
  p_goal_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_unlocked integer;
  v_coins bigint := 0;
  v_target_score integer;
  v_expected_stars integer;
  v_expected_goal_color integer;
  v_expected_goal_count integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы сохранить результат на сервере.');
  end if;
  if p_level_id is null or p_level_id < 1 or p_level_id > 30
    or p_score is null or p_score < 0 or p_score > 10000000
    or p_stars is null or p_stars < 0 or p_stars > 3
    or p_moves_used is null or p_moves_used < 0 or p_moves_used > 1000
    or p_duration_sec is null or p_duration_sec < 0 or p_duration_sec > 86400
    or p_goal_color is null or p_goal_color < -1 or p_goal_color > 6
    or p_goal_count is null or p_goal_count < 0 or p_goal_count > 5000 then
    return jsonb_build_object('ok',false,'message','Результат уровня имеет некорректные значения.');
  end if;

  -- Server-side sanity checks protect progression/stars from accidental client-side bad payloads.
  if coalesce(p_won,false) then
    v_target_score := 820 + p_level_id * 185;
    if p_score < v_target_score then
      return jsonb_build_object('ok',false,'message','Результат ниже серверной цели уровня.');
    end if;
    v_expected_stars := case when p_score::numeric >= v_target_score * 1.52 then 3 when p_score::numeric >= v_target_score * 1.23 then 2 else 1 end;
    if p_stars <> v_expected_stars then
      return jsonb_build_object('ok',false,'message','Количество звёзд не совпало с результатом.');
    end if;
    if p_level_id >= 4 and mod(p_level_id,4)=0 then
      v_expected_goal_color := (p_level_id * 3 + 1) % 7;
      v_expected_goal_count := 10 + floor(p_level_id::numeric / 3)::integer;
      if p_goal_color <> v_expected_goal_color or p_goal_count < v_expected_goal_count then
        return jsonb_build_object('ok',false,'message','Цель по цвету не подтверждена.');
      end if;
    elsif p_goal_color <> -1 or p_goal_count <> 0 then
      return jsonb_build_object('ok',false,'message','Для этого уровня не предусмотрена цель по цвету.');
    end if;
  elsif p_stars <> 0 then
    return jsonb_build_object('ok',false,'message','Неуспешный уровень не может получить звёзды.');
  end if;

  insert into public.today_match3_campaign_state(user_id)
  values (v_uid) on conflict (user_id) do nothing;
  select unlocked_level into v_unlocked
    from public.today_match3_campaign_state where user_id=v_uid for update;
  if p_level_id > coalesce(v_unlocked,1) then
    return jsonb_build_object('ok',false,'message','Этот уровень ещё не открыт на сервере.');
  end if;

  insert into public.today_match3_campaign_levels as existing(
    user_id,level_id,best_score,best_stars,completed,best_moves,best_duration_sec,completed_at,updated_at
  ) values (
    v_uid,p_level_id,p_score,p_stars,coalesce(p_won,false),
    case when coalesce(p_won,false) then p_moves_used else 0 end,
    p_duration_sec,case when coalesce(p_won,false) then now() else null end,now()
  ) on conflict(user_id,level_id) do update set
    best_score=greatest(existing.best_score,excluded.best_score),
    best_stars=greatest(existing.best_stars,excluded.best_stars),
    completed=existing.completed or excluded.completed,
    best_moves=case
      when excluded.completed and excluded.best_moves>0 and (existing.best_moves=0 or excluded.best_moves<existing.best_moves) then excluded.best_moves
      else existing.best_moves end,
    best_duration_sec=case
      when excluded.completed and excluded.best_duration_sec>0 and (existing.best_duration_sec=0 or excluded.best_duration_sec<existing.best_duration_sec) then excluded.best_duration_sec
      else existing.best_duration_sec end,
    completed_at=case when excluded.completed then coalesce(existing.completed_at,now()) else existing.completed_at end,
    updated_at=now();

  if coalesce(p_won,false) and p_level_id=coalesce(v_unlocked,1) then
    update public.today_match3_campaign_state
      set unlocked_level=least(31,p_level_id+1),updated_at=now()
      where user_id=v_uid returning unlocked_level into v_unlocked;
  end if;
  select coalesce(coins,0)::bigint into v_coins from public.profiles where id=v_uid;
  return jsonb_build_object('ok',true,'level_id',p_level_id,'won',coalesce(p_won,false),
    'unlocked_level',coalesce(v_unlocked,1),'coins',coalesce(v_coins,0));
end;
$$;

revoke all on function public.today_match3_get_progress() from public, anon;
revoke all on function public.today_match3_buy_booster(text) from public, anon;
revoke all on function public.today_match3_use_booster(text) from public, anon;
revoke all on function public.today_match3_save_result(integer,integer,integer,integer,integer,boolean,integer,integer) from public, anon;
grant execute on function public.today_match3_get_progress() to authenticated;
grant execute on function public.today_match3_buy_booster(text) to authenticated;
grant execute on function public.today_match3_use_booster(text) to authenticated;
grant execute on function public.today_match3_save_result(integer,integer,integer,integer,integer,boolean,integer,integer) to authenticated;
