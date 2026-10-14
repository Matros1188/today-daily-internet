-- TODAY V97: promotion feed latency and bounded response.
-- Idempotent function replacement; keep existing execute grants.

CREATE OR REPLACE FUNCTION public.today_social_get_promoted_posts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
    v_posts jsonb;
    v_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'promotion_id', q.promotion_id,
                'post_id', q.post_id,
                'author_id', q.author_id,
                'username', q.username,
                'author_name', q.author_name,
                'avatar_url', q.avatar_url,
                'title', q.title,
                'body', q.body,
                'image_path', q.image_path,
                'created_at', q.created_at,
                'promoted_at', q.promoted_at
            )
            ORDER BY q.promoted_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_posts
    FROM (
        SELECT
            pr.id AS promotion_id,
            p.id AS post_id,
            p.author_id,
            COALESCE(to_jsonb(a)->>'username', '') AS username,
            COALESCE(
                to_jsonb(a)->>'display_name',
                to_jsonb(a)->>'nickname',
                to_jsonb(a)->>'username',
                'Участник'
            ) AS author_name,
            COALESCE(
                to_jsonb(a)->>'avatar_url',
                to_jsonb(a)->>'photo_url',
                ''
            ) AS avatar_url,
            p.title,
            p.body,
            p.image_path,
            p.created_at,
            pr.created_at AS promoted_at
        FROM public.today_social_promotions pr
        JOIN public.today_social_profile_posts p
          ON p.id = pr.post_id
        JOIN public.profiles a
          ON a.id = p.author_id
        WHERE pr.day_date = v_today
          AND p.visibility = 'public'
        ORDER BY pr.created_at DESC
        LIMIT 24
    ) q;

    RETURN jsonb_build_object(
        'ok', true,
        'day_date', v_today,
        'posts', v_posts
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.today_social_get_promoted_posts() TO anon, authenticated;
