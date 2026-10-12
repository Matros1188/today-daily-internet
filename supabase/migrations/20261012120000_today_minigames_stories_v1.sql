-- TODAY Mini-games + expiring profile stories V1
-- Safe, additive, idempotent migration. Existing user/account/publication data is untouched.
begin;

create table if not exists public.today_social_stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 600),
  media_path text,
  media_type text check (media_type is null or media_type in ('image','video')),
  visibility text not null default 'public' check (visibility in ('public','friends')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint today_social_story_has_content check (char_length(trim(body)) > 0 or nullif(media_path,'') is not null),
  constraint today_social_story_media_pair check ((media_path is null and media_type is null) or (media_path is not null and media_type is not null))
);
create index if not exists today_social_stories_author_expiry_idx on public.today_social_stories(author_id, expires_at desc);
create index if not exists today_social_stories_expiry_idx on public.today_social_stories(expires_at);

create table if not exists public.today_social_story_views (
  story_id uuid not null references public.today_social_stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key(story_id, viewer_id)
);
create index if not exists today_social_story_views_viewer_idx on public.today_social_story_views(viewer_id, viewed_at desc);

create table if not exists public.today_mini_game_scores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id text not null check (game_id in ('match3','flappy','merge2048','memory')),
  day_date date not null default ((now() at time zone 'Europe/Moscow')::date),
  best_score integer not null default 0 check (best_score >= 0),
  best_duration_sec integer not null default 0 check (best_duration_sec >= 0),
  plays integer not null default 0 check (plays >= 0),
  updated_at timestamptz not null default now(),
  primary key(user_id, game_id, day_date)
);
create index if not exists today_mini_game_scores_daily_idx on public.today_mini_game_scores(game_id, day_date, best_score desc, updated_at asc);

alter table public.today_social_stories enable row level security;
alter table public.today_social_story_views enable row level security;
alter table public.today_mini_game_scores enable row level security;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('today-social-stories','today-social-stories',false,26214400,array['image/jpeg','image/png','image/webp','video/mp4'])
on conflict(id) do update set public=false,file_size_limit=26214400,allowed_mime_types=array['image/jpeg','image/png','image/webp','video/mp4'];

drop policy if exists today_social_stories_owner_upload on storage.objects;
create policy today_social_stories_owner_upload on storage.objects for insert to authenticated
with check(bucket_id='today-social-stories'
  and (storage.foldername(name))[1]='stories'
  and (storage.foldername(name))[2]=auth.uid()::text
  and ((storage.extension(name) in ('jpg','jpeg','png','webp')) or (storage.extension(name)='mp4')));

drop policy if exists today_social_stories_owner_delete on storage.objects;
create policy today_social_stories_owner_delete on storage.objects for delete to authenticated
using(bucket_id='today-social-stories'
  and (storage.foldername(name))[1]='stories'
  and (storage.foldername(name))[2]=auth.uid()::text);

create or replace function public.today_social_can_view_story(p_story_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare
  v_me uuid:=auth.uid();
  v_author uuid;
  v_visibility text;
  v_expires timestamptz;
  v_allow_visits boolean:=true;
  v_profile_visibility text:='public';
  v_friend boolean:=false;
begin
  if v_me is null then return false; end if;
  select s.author_id,s.visibility,s.expires_at into v_author,v_visibility,v_expires
  from public.today_social_stories s where s.id=p_story_id;
  if v_author is null or v_expires<=now() then return false; end if;
  if v_author=v_me then return true; end if;
  if exists(select 1 from public.today_social_user_blocks b where (b.blocker_id=v_me and b.blocked_id=v_author) or (b.blocker_id=v_author and b.blocked_id=v_me)) then return false; end if;
  select coalesce(x.allow_profile_visits,true),coalesce(x.profile_visibility,'public')
    into v_allow_visits,v_profile_visibility from public.today_social_settings x where x.user_id=v_author;
  if not found then v_allow_visits:=true; v_profile_visibility:='public'; end if;
  if not v_allow_visits then return false; end if;
  select exists(select 1 from public.today_social_friends f where f.status='accepted' and ((f.requester_id=v_me and f.addressee_id=v_author) or (f.requester_id=v_author and f.addressee_id=v_me))) into v_friend;
  if v_profile_visibility='private' then return false; end if;
  if v_profile_visibility='friends' and not v_friend then return false; end if;
  if v_visibility='friends' and not v_friend then return false; end if;
  return true;
end;
$$;

-- Look up a story through SECURITY DEFINER so RLS on the story table cannot hide the owner-authorized media path.
create or replace function public.today_social_can_view_story_media(p_path text)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_story_id uuid;
begin
  if auth.uid() is null or nullif(trim(coalesce(p_path,'')),'') is null then return false; end if;
  select s.id into v_story_id from public.today_social_stories s
    where s.media_path=p_path and s.expires_at>now()
    order by s.created_at desc limit 1;
  if not found then return false; end if;
  return public.today_social_can_view_story(v_story_id);
end;
$$;

-- Storage reads are permitted only for currently visible stories; the media bucket is private.
drop policy if exists today_social_stories_media_read on storage.objects;
create policy today_social_stories_media_read on storage.objects for select to authenticated
using(bucket_id='today-social-stories' and public.today_social_can_view_story_media(name));

create or replace function public.today_social_create_story(p_body text default '', p_media_path text default null, p_media_type text default null, p_visibility text default 'public')
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_story public.today_social_stories%rowtype; v_path text:=nullif(trim(coalesce(p_media_path,'')),''); v_body text:=trim(coalesce(p_body,'')); v_vis text:=coalesce(p_visibility,'public'); v_type text:=nullif(trim(coalesce(p_media_type,'')),'');
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы добавить историю.'); end if;
  if char_length(v_body)>600 then return jsonb_build_object('ok',false,'message','Текст истории — максимум 600 символов.'); end if;
  if v_vis not in ('public','friends') then return jsonb_build_object('ok',false,'message','Неверная настройка видимости истории.'); end if;
  if v_path is null and v_body='' then return jsonb_build_object('ok',false,'message','Добавь текст или медиафайл.'); end if;
  if v_path is not null then
    if left(v_path,length('stories/'||v_uid::text||'/'))<>'stories/'||v_uid::text||'/' then return jsonb_build_object('ok',false,'message','Недопустимый путь файла истории.'); end if;
    if v_type not in ('image','video') then return jsonb_build_object('ok',false,'message','Неизвестный тип медиафайла.'); end if;
    if v_type='video' and lower(v_path) not like '%.mp4' then return jsonb_build_object('ok',false,'message','Поддерживается видео MP4.'); end if;
  else
    v_type:=null;
  end if;
  insert into public.today_social_stories(author_id,body,media_path,media_type,visibility,expires_at)
  values(v_uid,v_body,v_path,v_type,v_vis,now()+interval '24 hours') returning * into v_story;
  return jsonb_build_object('ok',true,'message','История опубликована на 24 часа.','story',jsonb_build_object('id',v_story.id,'expires_at',v_story.expires_at,'media_path',v_story.media_path));
end;
$$;

create or replace function public.today_social_list_profile_stories(p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_me uuid:=auth.uid(); v_target uuid:=coalesce(p_user_id,auth.uid()); v_stories jsonb;
begin
  if v_target is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы смотреть истории.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'author_id',q.author_id,'author_name',q.author_name,'username',q.username,'avatar_url',q.avatar_url,
    'body',q.body,'media_path',q.media_path,'media_type',q.media_type,'visibility',q.visibility,
    'created_at',q.created_at,'expires_at',q.expires_at,'views_count',q.views_count
  ) order by q.created_at asc),'[]'::jsonb) into v_stories
  from (
    select s.id,s.author_id,s.body,s.media_path,s.media_type,s.visibility,s.created_at,s.expires_at,
      coalesce(to_jsonb(p)->>'display_name',to_jsonb(p)->>'nickname',to_jsonb(p)->>'username','Участник') author_name,
      coalesce(to_jsonb(p)->>'username','') username,coalesce(to_jsonb(p)->>'avatar_url','') avatar_url,
      (select count(*)::int from public.today_social_story_views v where v.story_id=s.id) views_count
    from public.today_social_stories s join public.profiles p on p.id=s.author_id
    where s.author_id=v_target and s.expires_at>now() and public.today_social_can_view_story(s.id)
    order by s.created_at asc limit 50
  ) q;
  return jsonb_build_object('ok',true,'stories',v_stories);
end;
$$;

create or replace function public.today_social_record_story_view(p_story_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_author uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  if not public.today_social_can_view_story(p_story_id) then return jsonb_build_object('ok',false,'message','История недоступна или уже исчезла.'); end if;
  select author_id into v_author from public.today_social_stories where id=p_story_id;
  if v_author<>v_uid then
    insert into public.today_social_story_views(story_id,viewer_id,viewed_at) values(p_story_id,v_uid,now())
    on conflict(story_id,viewer_id) do update set viewed_at=excluded.viewed_at;
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.today_social_delete_story(p_story_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_path text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  delete from public.today_social_stories s where s.id=p_story_id and s.author_id=v_uid returning s.media_path into v_path;
  if not found then return jsonb_build_object('ok',false,'message','История не найдена или принадлежит другому автору.'); end if;
  return jsonb_build_object('ok',true,'media_path',v_path,'message','История удалена.');
end;
$$;

create or replace function public.today_mini_game_submit_score(p_game_id text, p_score integer, p_duration_sec integer default 0)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_today date:=(now() at time zone 'Europe/Moscow')::date; v_cap integer; v_row public.today_mini_game_scores%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы сохранить рекорд.'); end if;
  v_cap:=case p_game_id when 'match3' then 100000 when 'flappy' then 1000 when 'merge2048' then 1000000 when 'memory' then 1000 else null end;
  if v_cap is null then return jsonb_build_object('ok',false,'message','Неизвестная игра.'); end if;
  if p_score is null or p_score<0 or p_score>v_cap then return jsonb_build_object('ok',false,'message','Результат находится вне допустимого диапазона.'); end if;
  if coalesce(p_duration_sec,0)<0 or coalesce(p_duration_sec,0)>7200 then return jsonb_build_object('ok',false,'message','Некорректная длительность игры.'); end if;
  insert into public.today_mini_game_scores(user_id,game_id,day_date,best_score,best_duration_sec,plays,updated_at)
  values(v_uid,p_game_id,v_today,p_score,greatest(coalesce(p_duration_sec,0),0),1,now())
  on conflict(user_id,game_id,day_date) do update set
    best_duration_sec=case when excluded.best_score>today_mini_game_scores.best_score then excluded.best_duration_sec else today_mini_game_scores.best_duration_sec end,
    best_score=greatest(today_mini_game_scores.best_score,excluded.best_score),
    plays=today_mini_game_scores.plays+1,updated_at=now()
  returning * into v_row;
  return jsonb_build_object('ok',true,'best_score',v_row.best_score,'plays',v_row.plays,'day_date',v_row.day_date,'message','Результат сохранён.');
end;
$$;

create or replace function public.today_mini_game_leaderboard(p_game_id text, p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_today date:=(now() at time zone 'Europe/Moscow')::date; v_rows jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы смотреть рейтинг друзей.'); end if;
  if p_game_id not in ('match3','flappy','merge2048','memory') then return jsonb_build_object('ok',false,'message','Неизвестная игра.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',q.user_id,'display_name',q.display_name,'username',q.username,'avatar_url',q.avatar_url,'best_score',q.best_score,'plays',q.plays,'updated_at',q.updated_at) order by q.best_score desc,q.updated_at asc),'[]'::jsonb)
    into v_rows from (
      select s.user_id,coalesce(to_jsonb(p)->>'display_name',to_jsonb(p)->>'nickname',to_jsonb(p)->>'username','Участник') display_name,
        coalesce(to_jsonb(p)->>'username','') username,coalesce(to_jsonb(p)->>'avatar_url','') avatar_url,
        s.best_score,s.plays,s.updated_at
      from public.today_mini_game_scores s join public.profiles p on p.id=s.user_id
      where s.game_id=p_game_id and s.day_date=v_today and (
        s.user_id=v_uid or exists(select 1 from public.today_social_friends f where f.status='accepted' and ((f.requester_id=v_uid and f.addressee_id=s.user_id) or (f.addressee_id=v_uid and f.requester_id=s.user_id)))
      ) and not exists(select 1 from public.today_social_user_blocks b where (b.blocker_id=v_uid and b.blocked_id=s.user_id) or (b.blocker_id=s.user_id and b.blocked_id=v_uid))
      order by s.best_score desc,s.updated_at asc limit greatest(1,least(coalesce(p_limit,10),50))
    ) q;
  return jsonb_build_object('ok',true,'day_date',v_today,'scores',v_rows);
end;
$$;

revoke all on function public.today_social_can_view_story(uuid) from public,anon;
revoke all on function public.today_social_can_view_story_media(text) from public,anon;
revoke all on function public.today_social_create_story(text,text,text,text) from public,anon;
revoke all on function public.today_social_list_profile_stories(uuid) from public,anon;
revoke all on function public.today_social_record_story_view(uuid) from public,anon;
revoke all on function public.today_social_delete_story(uuid) from public,anon;
revoke all on function public.today_mini_game_submit_score(text,integer,integer) from public,anon;
revoke all on function public.today_mini_game_leaderboard(text,integer) from public,anon;
grant execute on function public.today_social_can_view_story(uuid) to authenticated;
grant execute on function public.today_social_can_view_story_media(text) to authenticated;
grant execute on function public.today_social_create_story(text,text,text,text) to authenticated;
grant execute on function public.today_social_list_profile_stories(uuid) to authenticated;
grant execute on function public.today_social_record_story_view(uuid) to authenticated;
grant execute on function public.today_social_delete_story(uuid) to authenticated;
grant execute on function public.today_mini_game_submit_score(text,integer,integer) to authenticated;
grant execute on function public.today_mini_game_leaderboard(text,integer) to authenticated;


-- TODAY DEMO BOT SAME-DAY DEDUP GUARD V1 BEGIN
-- TODAY_DEMO_POST_DEDUP_GUARD_V1
-- Daily duplicate cleanup affects demo/bot contributions only; human publications are untouched.

CREATE OR REPLACE FUNCTION public.today_demo_post_normalize(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $today_norm$
  SELECT btrim(regexp_replace(replace(lower(coalesce(p_text, '')), 'ё', 'е'), '[^a-zа-я0-9]+', ' ', 'g'));
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
  WHERE char_length(norm) >= 6
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
  IF NEW.day_date IS NULL OR char_length(current_norm) < 6 THEN
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
-- TODAY DEMO BOT SAME-DAY DEDUP GUARD V1 END



notify pgrst, 'reload schema';
commit;
