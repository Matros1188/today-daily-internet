-- TODAY_DEMO_POST_DEDUP_GUARD_V1
-- Daily duplicate cleanup affects demo/bot contributions only; human publications are untouched.

CREATE OR REPLACE FUNCTION public.today_demo_post_normalize(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $today_norm$
  SELECT btrim(regexp_replace(lower(replace(coalesce(p_text, ''), 'ё', 'е')), '[^a-zа-я0-9]+', ' ', 'g'));
$today_norm$;

CREATE OR REPLACE FUNCTION public.today_demo_post_tokens(p_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $today_tokens$
  SELECT coalesce(array_agg(token ORDER BY token), ARRAY[]::text[])
  FROM (
    SELECT DISTINCT token
    FROM regexp_split_to_table(public.today_demo_post_normalize(p_text), '\s+') AS token
    WHERE char_length(token) > 2
      AND token <> ALL (ARRAY[
        'сегодня','вчера','завтра','просто','очень','когда','потому','почему','чтобы',
        'который','которая','которые','которое','такой','такая','такие','этот','эта','эти','это',
        'вот','уже','еще','может','можно','будто','кажется','иногда','часто','всегда','никогда',
        'многие','люди','человек','самый','самое','самая','свой','свои','бывает','бывают','быть',
        'были','было','будет','будут','есть','нет','для','при','над','под','без','про','или','если',
        'чем','как','так','что','кто','куда','где','мне','меня','мой','моя','мои','твой','твоя',
        'его','ее','она','оно','они','нам','вам','нас','вас','все','всех','всем','тоже','даже',
        'только','лишь','пока','после','перед','между','через','этого','этими','таких','один','одна','одно'
      ]::text[])
  ) AS unique_tokens;
$today_tokens$;

-- Keep the earliest copy of an exact normalized bot post for each Moscow publication date.
WITH normalized AS (
  SELECT id, day_date, created_at, public.today_demo_post_normalize(body) AS norm
  FROM public.demo_contributions
  WHERE body IS NOT NULL AND btrim(body) <> ''
), ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY day_date, norm ORDER BY created_at ASC NULLS LAST, id::text ASC) AS rn
  FROM normalized
  WHERE char_length(norm) >= 8
)
DELETE FROM public.demo_contributions AS d
USING ranked AS r
WHERE d.id = r.id AND r.rn > 1;

CREATE OR REPLACE FUNCTION public.today_demo_contribution_duplicate_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $today_guard$
DECLARE
  current_norm text;
  current_tokens text[];
  old_row record;
  old_norm text;
  old_tokens text[];
  common_count integer;
  minimum_tokens integer;
  union_tokens integer;
BEGIN
  current_norm := public.today_demo_post_normalize(NEW.body);
  IF NEW.day_date IS NULL OR char_length(current_norm) < 8 THEN
    RETURN NEW;
  END IF;
  current_tokens := public.today_demo_post_tokens(NEW.body);

  FOR old_row IN
    SELECT id, body
    FROM public.demo_contributions
    WHERE day_date = NEW.day_date
      AND body IS NOT NULL
      AND btrim(body) <> ''
      AND id IS DISTINCT FROM NEW.id
    ORDER BY created_at DESC NULLS LAST
    LIMIT 300
  LOOP
    old_norm := public.today_demo_post_normalize(old_row.body);
    IF current_norm = old_norm THEN
      RETURN NULL; -- silently skip exact same-day duplicate bot post
    END IF;
    old_tokens := public.today_demo_post_tokens(old_row.body);
    minimum_tokens := least(cardinality(current_tokens), cardinality(old_tokens));
    IF minimum_tokens >= 6 THEN
      SELECT count(*) INTO common_count
      FROM (SELECT unnest(current_tokens) INTERSECT SELECT unnest(old_tokens)) AS common_words;
      union_tokens := cardinality(current_tokens) + cardinality(old_tokens) - common_count;
      IF common_count::numeric / greatest(1, minimum_tokens) >= 0.78
         OR (minimum_tokens >= 8 AND common_count::numeric / greatest(1, union_tokens) >= 0.70) THEN
        RETURN NULL; -- silently skip a near-duplicate from another bot
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$today_guard$;

DROP TRIGGER IF EXISTS today_demo_contribution_duplicate_guard ON public.demo_contributions;
CREATE TRIGGER today_demo_contribution_duplicate_guard
BEFORE INSERT ON public.demo_contributions
FOR EACH ROW
EXECUTE FUNCTION public.today_demo_contribution_duplicate_guard();
