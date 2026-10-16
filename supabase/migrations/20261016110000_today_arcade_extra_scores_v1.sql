
-- TODAY ARCADE EXTRA SCORES V1
-- Расширение серверного хранения результатов 10 дополнительных игр.
-- Не изменяет TODAY coins, магазин или прогресс Crystal Chronicles.

DO $$
BEGIN
  IF to_regclass('public.today_mini_game_scores') IS NULL THEN
    RAISE EXCEPTION
      'Required table public.today_mini_game_scores is missing.';
  END IF;
END $$;

-- Убираем только существующие ограничения game_id, содержащие старый allowlist.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.today_mini_game_scores'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%game_id%'
      AND pg_get_constraintdef(oid) ILIKE '%match3%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.today_mini_game_scores DROP CONSTRAINT %I',
      c.conname
    );
  END LOOP;
END $$;

ALTER TABLE public.today_mini_game_scores
ADD CONSTRAINT today_mini_game_scores_game_id_check
CHECK (
  game_id IN (
    'match3', 'flappy', 'merge2048', 'memory',
    'snake', 'pulse', 'breakout', 'ttt', 'word',
    'colorsnap', 'stacker', 'laserdodge', 'quiz', 'starcatch'
  )
);

CREATE OR REPLACE FUNCTION public.today_mini_game_submit_score(
  p_game_id text,
  p_score integer,
  p_duration_sec integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_cap integer;
  v_row public.today_mini_game_scores%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'message', 'Войди в аккаунт, чтобы сохранить рекорд.'
    );
  END IF;

  v_cap := CASE p_game_id
    WHEN 'match3' THEN 100000
    WHEN 'flappy' THEN 1000
    WHEN 'merge2048' THEN 1000000
    WHEN 'memory' THEN 1000
    WHEN 'snake' THEN 2000
    WHEN 'pulse' THEN 1000
    WHEN 'breakout' THEN 1000
    WHEN 'ttt' THEN 5000
    WHEN 'word' THEN 2000
    WHEN 'colorsnap' THEN 3000
    WHEN 'stacker' THEN 2000
    WHEN 'laserdodge' THEN 100
    WHEN 'quiz' THEN 1000
    WHEN 'starcatch' THEN 3000
    ELSE NULL
  END;

  IF v_cap IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'message', 'Неизвестная игра.'
    );
  END IF;

  IF p_score IS NULL OR p_score < 0 OR p_score > v_cap THEN
    RETURN jsonb_build_object(
      'ok', false,
      'message', 'Результат находится вне допустимого диапазона.'
    );
  END IF;

  IF coalesce(p_duration_sec, 0) < 0
     OR coalesce(p_duration_sec, 0) > 7200 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'message', 'Некорректная длительность игры.'
    );
  END IF;

  INSERT INTO public.today_mini_game_scores (
    user_id,
    game_id,
    day_date,
    best_score,
    best_duration_sec,
    plays,
    updated_at
  )
  VALUES (
    v_uid,
    p_game_id,
    v_today,
    p_score,
    greatest(coalesce(p_duration_sec, 0), 0),
    1,
    now()
  )
  ON CONFLICT (user_id, game_id, day_date)
  DO UPDATE SET
    best_duration_sec = CASE
      WHEN excluded.best_score > today_mini_game_scores.best_score
      THEN excluded.best_duration_sec
      ELSE today_mini_game_scores.best_duration_sec
    END,
    best_score = greatest(
      today_mini_game_scores.best_score,
      excluded.best_score
    ),
    plays = today_mini_game_scores.plays + 1,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'best_score', v_row.best_score,
    'plays', v_row.plays,
    'day_date', v_row.day_date,
    'message', 'Результат сохранён.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.today_mini_game_leaderboard(
  p_game_id text,
  p_limit integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'message', 'Войди в аккаунт, чтобы смотреть рейтинг друзей.'
    );
  END IF;

  IF p_game_id IS NULL OR p_game_id NOT IN (
    'match3', 'flappy', 'merge2048', 'memory',
    'snake', 'pulse', 'breakout', 'ttt', 'word',
    'colorsnap', 'stacker', 'laserdodge', 'quiz', 'starcatch'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'message', 'Неизвестная игра.'
    );
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', q.user_id,
        'display_name', q.display_name,
        'username', q.username,
        'avatar_url', q.avatar_url,
        'best_score', q.best_score,
        'plays', q.plays,
        'updated_at', q.updated_at
      )
      ORDER BY q.best_score DESC, q.updated_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      s.user_id,
      coalesce(
        to_jsonb(p)->>'display_name',
        to_jsonb(p)->>'nickname',
        to_jsonb(p)->>'username',
        'Участник'
      ) AS display_name,
      coalesce(to_jsonb(p)->>'username', '') AS username,
      coalesce(to_jsonb(p)->>'avatar_url', '') AS avatar_url,
      s.best_score,
      s.plays,
      s.updated_at
    FROM public.today_mini_game_scores s
    JOIN public.profiles p ON p.id = s.user_id
    WHERE s.game_id = p_game_id
      AND s.day_date = v_today
      AND (
        s.user_id = v_uid
        OR EXISTS (
          SELECT 1
          FROM public.today_social_friends f
          WHERE f.status = 'accepted'
            AND (
              (f.requester_id = v_uid AND f.addressee_id = s.user_id)
              OR
              (f.addressee_id = v_uid AND f.requester_id = s.user_id)
            )
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.today_social_user_blocks b
        WHERE
          (b.blocker_id = v_uid AND b.blocked_id = s.user_id)
          OR
          (b.blocker_id = s.user_id AND b.blocked_id = v_uid)
      )
    ORDER BY s.best_score DESC, s.updated_at ASC
    LIMIT greatest(1, least(coalesce(p_limit, 10), 50))
  ) q;

  RETURN jsonb_build_object(
    'ok', true,
    'day_date', v_today,
    'scores', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.today_mini_game_submit_score(text, integer, integer)
FROM public, anon;

REVOKE ALL ON FUNCTION
  public.today_mini_game_leaderboard(text, integer)
FROM public, anon;

GRANT EXECUTE ON FUNCTION
  public.today_mini_game_submit_score(text, integer, integer)
TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.today_mini_game_leaderboard(text, integer)
TO authenticated;
