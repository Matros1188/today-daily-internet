-- TODAY ARCADE LEADERBOARDS V2
-- Сегодня / 7 дней / всё время.
-- Не удаляет существующие игровые результаты.

DO $preflight$
BEGIN
  IF to_regclass('public.today_mini_game_scores') IS NULL THEN
    RAISE EXCEPTION
      'Required table public.today_mini_game_scores is missing.';
  END IF;

  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION
      'Required table public.profiles is missing.';
  END IF;

  IF to_regclass('public.today_social_friends') IS NULL THEN
    RAISE EXCEPTION
      'Required table public.today_social_friends is missing.';
  END IF;

  IF to_regclass('public.today_social_user_blocks') IS NULL THEN
    RAISE EXCEPTION
      'Required table public.today_social_user_blocks is missing.';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.today_mini_game_leaderboard_v2(
  p_game_id text,
  p_period text DEFAULT 'today',
  p_limit integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_period_label text;
  v_rows jsonb := '[]'::jsonb;
  v_my_rank bigint := NULL;
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

  IF p_period IS NULL OR p_period NOT IN ('today', 'week', 'all') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'message', 'Неизвестный период рейтинга.'
    );
  END IF;

  v_period_label := CASE p_period
    WHEN 'today' THEN 'сегодня'
    WHEN 'week' THEN 'за 7 дней'
    ELSE 'за всё время'
  END;

  WITH score_aggregates AS (
    SELECT
      s.user_id,
      max(s.best_score)::bigint AS best_score,
      coalesce(sum(s.plays), 0)::bigint AS plays,
      max(s.updated_at) AS updated_at
    FROM public.today_mini_game_scores s
    WHERE s.game_id = p_game_id
      AND s.day_date <= v_today
      AND (
        p_period = 'all'
        OR (
          p_period = 'week'
          AND s.day_date >= v_today - 6
        )
        OR (
          p_period = 'today'
          AND s.day_date = v_today
        )
      )
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
    GROUP BY s.user_id
  ),
  aggregated AS (
    SELECT
      a.user_id,
      coalesce(
        to_jsonb(p)->>'display_name',
        to_jsonb(p)->>'nickname',
        to_jsonb(p)->>'username',
        'Участник'
      ) AS display_name,
      coalesce(to_jsonb(p)->>'username', '') AS username,
      coalesce(to_jsonb(p)->>'avatar_url', '') AS avatar_url,
      a.best_score,
      a.plays,
      a.updated_at
    FROM score_aggregates a
    JOIN public.profiles p ON p.id = a.user_id
  ),
  ranked AS (
    SELECT
      a.*,
      row_number() OVER (
        ORDER BY
          a.best_score DESC,
          a.updated_at ASC NULLS LAST,
          a.user_id ASC
      ) AS rank_no
    FROM aggregated a
  )
  SELECT
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', r.user_id,
          'display_name', r.display_name,
          'username', r.username,
          'avatar_url', r.avatar_url,
          'best_score', r.best_score,
          'plays', r.plays,
          'updated_at', r.updated_at,
          'rank', r.rank_no,
          'is_me', (r.user_id = v_uid)
        ) ORDER BY r.rank_no
      ),
      '[]'::jsonb
    ),
    max(r.rank_no) FILTER (WHERE r.user_id = v_uid)
  INTO v_rows, v_my_rank
  FROM ranked r
  WHERE r.rank_no <= greatest(1, least(coalesce(p_limit, 10), 50))
     OR r.user_id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'day_date', v_today,
    'period', p_period,
    'period_label', v_period_label,
    'my_rank', v_my_rank,
    'scores', v_rows
  );
END;
$function$;

REVOKE ALL ON FUNCTION
  public.today_mini_game_leaderboard_v2(text, text, integer)
FROM public, anon;

GRANT EXECUTE ON FUNCTION
  public.today_mini_game_leaderboard_v2(text, text, integer)
TO authenticated;

NOTIFY pgrst, 'reload schema';
