-- TODAY CRYSTAL WORLD V500: 500 levels, mechanics and one-time progress reset.
-- Trophies are derived from completed levels and are cosmetic only; they never affect coins, score or boosters.

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.today_match3_campaign_state'::regclass
      AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%unlocked_level%'
  LOOP
    EXECUTE format('ALTER TABLE public.today_match3_campaign_state DROP CONSTRAINT %I', c.conname);
  END LOOP;
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.today_match3_campaign_levels'::regclass
      AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%level_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.today_match3_campaign_levels DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.today_match3_campaign_state
  ADD CONSTRAINT today_match3_campaign_state_unlocked_1_501_v500 CHECK (unlocked_level BETWEEN 1 AND 501);

ALTER TABLE public.today_match3_campaign_levels
  ADD CONSTRAINT today_match3_campaign_levels_level_1_500_v500 CHECK (level_id BETWEEN 1 AND 500);

-- The V25 loader returned only 30-level progress. Replace it so all 220 levels
-- and the authoritative unlock state survive reloads and cross-device sync.
CREATE OR REPLACE FUNCTION public.today_match3_get_progress()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_unlocked integer;
  v_coins bigint := 0;
  v_inventory jsonb := '{}'::jsonb;
  v_levels jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы синхронизировать кампанию.');
  END IF;

  INSERT INTO public.today_match3_campaign_state(user_id)
  VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.today_match3_booster_inventory(user_id,booster_id,quantity)
  VALUES (v_uid,'hammer',1),(v_uid,'shuffle',1)
  ON CONFLICT (user_id,booster_id) DO NOTHING;

  SELECT unlocked_level INTO v_unlocked
  FROM public.today_match3_campaign_state WHERE user_id=v_uid;

  SELECT coalesce(coins,0)::bigint INTO v_coins
  FROM public.profiles WHERE id=v_uid;
  IF v_coins IS NULL THEN v_coins := 0; END IF;

  SELECT coalesce(jsonb_object_agg(booster_id,quantity),'{}'::jsonb)
  INTO v_inventory
  FROM public.today_match3_booster_inventory WHERE user_id=v_uid;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'level_id',level_id,'best_score',best_score,'best_stars',best_stars,
    'completed',completed,'best_moves',best_moves,'best_duration_sec',best_duration_sec
  ) ORDER BY level_id),'[]'::jsonb)
  INTO v_levels
  FROM public.today_match3_campaign_levels WHERE user_id=v_uid AND level_id BETWEEN 1 AND 500;

  RETURN jsonb_build_object(
    'ok',true,
    'unlocked_level',coalesce(v_unlocked,1),
    'coins',coalesce(v_coins,0),
    'inventory',v_inventory,
    'levels',v_levels
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.today_match3_save_result(
  p_level_id integer,
  p_score integer,
  p_stars integer,
  p_moves_used integer,
  p_duration_sec integer,
  p_won boolean,
  p_goal_color integer,
  p_goal_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_unlocked integer;
  v_coins bigint := 0;
  v_target_score integer;
  v_required_score integer;
  v_expected_stars integer;
  v_expected_goal_code integer := -1;
  v_expected_goal_count integer := 0;
  v_goal_kind text := 'score';
  v_d integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы сохранить результат на сервере.');
  END IF;

  IF p_level_id IS NULL OR p_level_id < 1 OR p_level_id > 500
    OR p_score IS NULL OR p_score < 0 OR p_score > 10000000
    OR p_stars IS NULL OR p_stars < 0 OR p_stars > 3
    OR p_moves_used IS NULL OR p_moves_used < 0 OR p_moves_used > 1000
    OR p_duration_sec IS NULL OR p_duration_sec < 0 OR p_duration_sec > 86400
    OR p_goal_color IS NULL OR p_goal_color < -5 OR p_goal_color > 6
    OR p_goal_count IS NULL OR p_goal_count < 0 OR p_goal_count > 5000 THEN
    RETURN jsonb_build_object('ok',false,'message','Результат уровня имеет некорректные значения.');
  END IF;

  -- Keep the original first 30 score thresholds intact so already-familiar early levels do not change.
  IF p_level_id <= 30 THEN
    v_target_score := 820 + p_level_id * 185;
    IF p_level_id >= 4 AND mod(p_level_id,4)=0 THEN
      v_goal_kind := 'color';
      v_expected_goal_code := (p_level_id * 3 + 1) % 7;
      v_expected_goal_count := 10 + floor(p_level_id::numeric / 3)::integer;
    END IF;
  ELSE
    v_d := p_level_id - 30;
    v_target_score := 6370 + v_d * 24 + floor((v_d::numeric * v_d::numeric) / 160)::integer + floor(power(greatest(0,p_level_id-200)::numeric,1.22)*8)::integer;
    IF mod(p_level_id,4)=0 THEN
      v_goal_kind := 'color';
      v_expected_goal_code := (p_level_id * 3 + 1) % 7;
      v_expected_goal_count := least(24,10+floor((p_level_id-30)::numeric/12)::integer);
    ELSIF mod(p_level_id,11)=0 THEN
      v_goal_kind := 'relic';
      v_expected_goal_code := -3;
      v_expected_goal_count := least(6,2+floor(p_level_id::numeric/55)::integer);
    ELSIF mod(p_level_id,7)=0 THEN
      v_goal_kind := 'ice';
      v_expected_goal_code := -2;
      v_expected_goal_count := least(18,6+floor(p_level_id::numeric/28)::integer);
    ELSIF mod(p_level_id,9)=0 THEN
      v_goal_kind := 'chain';
      v_expected_goal_code := -4;
      v_expected_goal_count := least(4,2+floor(p_level_id::numeric/75)::integer);
    ELSIF mod(p_level_id,13)=0 THEN
      v_goal_kind := 'sigil';
      v_expected_goal_code := -5;
      v_expected_goal_count := least(8,2+floor((p_level_id-31)::numeric/35)::integer);
    END IF;
  END IF;

  v_required_score := CASE WHEN v_goal_kind IN ('score','color') THEN ceil(v_target_score::numeric*0.68)::integer ELSE ceil(v_target_score::numeric*0.45)::integer END;

  IF coalesce(p_won,false) THEN
    IF p_score < v_required_score THEN
      RETURN jsonb_build_object('ok',false,'message','Результат ниже минимальной цели уровня.');
    END IF;
    v_expected_stars := CASE WHEN p_score::numeric >= v_target_score * 1.52 THEN 3 WHEN p_score::numeric >= v_target_score * 1.23 THEN 2 ELSE 1 END;
    IF p_stars <> v_expected_stars THEN
      RETURN jsonb_build_object('ok',false,'message','Количество звёзд не совпало с результатом.');
    END IF;
    IF p_goal_color <> v_expected_goal_code OR p_goal_count < v_expected_goal_count THEN
      IF v_goal_kind <> 'score' OR p_goal_color <> -1 OR p_goal_count <> 0 THEN
        RETURN jsonb_build_object('ok',false,'message','Условие прохождения уровня не подтверждено.');
      END IF;
    END IF;
    IF v_goal_kind='score' AND (p_goal_color <> -1 OR p_goal_count <> 0) THEN
      RETURN jsonb_build_object('ok',false,'message','Для этого уровня не предусмотрена дополнительная цель.');
    END IF;
  ELSIF p_stars <> 0 THEN
    RETURN jsonb_build_object('ok',false,'message','Неуспешный уровень не может получить звёзды.');
  END IF;

  INSERT INTO public.today_match3_campaign_state(user_id)
  VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT unlocked_level INTO v_unlocked
  FROM public.today_match3_campaign_state WHERE user_id=v_uid FOR UPDATE;
  IF p_level_id > coalesce(v_unlocked,1) THEN
    RETURN jsonb_build_object('ok',false,'message','Этот уровень ещё не открыт на сервере.');
  END IF;

  INSERT INTO public.today_match3_campaign_levels AS existing(
    user_id,level_id,best_score,best_stars,completed,best_moves,best_duration_sec,completed_at,updated_at
  ) VALUES (
    v_uid,p_level_id,p_score,p_stars,coalesce(p_won,false),
    CASE WHEN coalesce(p_won,false) THEN p_moves_used ELSE 0 END,
    p_duration_sec,CASE WHEN coalesce(p_won,false) THEN now() ELSE NULL END,now()
  ) ON CONFLICT(user_id,level_id) DO UPDATE SET
    best_score=greatest(existing.best_score,excluded.best_score),
    best_stars=greatest(existing.best_stars,excluded.best_stars),
    completed=existing.completed OR excluded.completed,
    best_moves=CASE WHEN excluded.completed AND excluded.best_moves>0 AND (existing.best_moves=0 OR excluded.best_moves<existing.best_moves) THEN excluded.best_moves ELSE existing.best_moves END,
    best_duration_sec=CASE WHEN excluded.completed AND excluded.best_duration_sec>0 AND (existing.best_duration_sec=0 OR excluded.best_duration_sec<existing.best_duration_sec) THEN excluded.best_duration_sec ELSE existing.best_duration_sec END,
    completed_at=CASE WHEN excluded.completed THEN coalesce(existing.completed_at,now()) ELSE existing.completed_at END,
    updated_at=now();

  IF coalesce(p_won,false) AND p_level_id=coalesce(v_unlocked,1) THEN
    UPDATE public.today_match3_campaign_state
      SET unlocked_level=least(501,p_level_id+1),updated_at=now()
      WHERE user_id=v_uid RETURNING unlocked_level INTO v_unlocked;
  END IF;

  SELECT coalesce(coins,0)::bigint INTO v_coins FROM public.profiles WHERE id=v_uid;
  RETURN jsonb_build_object('ok',true,'level_id',p_level_id,'won',coalesce(p_won,false),'unlocked_level',coalesce(v_unlocked,1),'coins',coalesce(v_coins,0));
END;
$$;

REVOKE ALL ON FUNCTION public.today_match3_save_result(integer,integer,integer,integer,integer,boolean,integer,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.today_match3_save_result(integer,integer,integer,integer,integer,boolean,integer,integer) TO authenticated;
-- Private recovery copies. No coins or inventories are reset.
CREATE TABLE IF NOT EXISTS public.today_match3_campaign_state_backup_v500
AS SELECT s.*, now() AS backup_at
FROM public.today_match3_campaign_state s WHERE false;

CREATE TABLE IF NOT EXISTS public.today_match3_campaign_levels_backup_v500
AS SELECT l.*, now() AS backup_at
FROM public.today_match3_campaign_levels l WHERE false;

CREATE TABLE IF NOT EXISTS public.today_crystal_world_migration_log (
  migration_key text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.today_match3_campaign_state_backup_v500 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.today_match3_campaign_levels_backup_v500 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.today_crystal_world_migration_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.today_match3_campaign_state_backup_v500 FROM anon, authenticated;
REVOKE ALL ON public.today_match3_campaign_levels_backup_v500 FROM anon, authenticated;
REVOKE ALL ON public.today_crystal_world_migration_log FROM anon, authenticated;

-- Execute the mass reset only once. Re-running this installer will not erase
-- progress earned after the reset. The pre-reset snapshot remains available.
DO $today_crystal_world_reset$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.today_crystal_world_migration_log
    WHERE migration_key='crystal-world-v500-reset-once'
  ) THEN

    INSERT INTO public.today_match3_campaign_state_backup_v500
    SELECT s.*, now()
    FROM public.today_match3_campaign_state s;

    INSERT INTO public.today_match3_campaign_levels_backup_v500
    SELECT l.*, now()
    FROM public.today_match3_campaign_levels l;

    DELETE FROM public.today_match3_campaign_levels;

    UPDATE public.today_match3_campaign_state
    SET unlocked_level=1,
        updated_at=now();

    INSERT INTO public.today_crystal_world_migration_log(migration_key)
    VALUES ('crystal-world-v500-reset-once');
  END IF;
END
$today_crystal_world_reset$;
