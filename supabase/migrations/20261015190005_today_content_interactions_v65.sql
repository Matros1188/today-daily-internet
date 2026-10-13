-- TODAY CONTENT INTERACTIONS V65
-- Additive, rerunnable schema for threaded comments, bookmarks and wall reposts.
-- Existing daily likes, publication tables, profile posts and channel data are not modified.

begin;

create table if not exists public.today_v65_content_actions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check (source_type in ('daily_user','daily_demo','profile')),
  source_id text not null check (char_length(source_id) between 1 and 160),
  action text not null check (action in ('like','bookmark')),
  created_at timestamptz not null default now(),
  primary key (user_id, source_type, source_id, action)
);
create index if not exists today_v65_actions_content_idx
  on public.today_v65_content_actions(source_type, source_id, action, created_at desc);
create index if not exists today_v65_actions_user_idx
  on public.today_v65_content_actions(user_id, action, created_at desc);

create table if not exists public.today_v65_content_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check (source_type in ('daily_user','daily_demo','profile')),
  source_id text not null check (char_length(source_id) between 1 and 160),
  parent_comment_id uuid references public.today_v65_content_comments(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists today_v65_comments_content_idx
  on public.today_v65_content_comments(source_type, source_id, created_at asc);
create index if not exists today_v65_comments_parent_idx
  on public.today_v65_content_comments(parent_comment_id, created_at asc);
create index if not exists today_v65_comments_user_idx
  on public.today_v65_content_comments(user_id, created_at desc);

create table if not exists public.today_v65_content_reposts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check (source_type in ('daily_user','daily_demo','profile')),
  source_id text not null check (char_length(source_id) between 1 and 160),
  caption text not null default '' check (char_length(caption) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, source_type, source_id)
);
create index if not exists today_v65_reposts_user_idx
  on public.today_v65_content_reposts(user_id, created_at desc);
create index if not exists today_v65_reposts_content_idx
  on public.today_v65_content_reposts(source_type, source_id, created_at desc);

-- Persistent personal-wall polls share the existing profile-post card and access rules.
alter table public.today_social_profile_posts add column if not exists post_type text not null default 'text';
alter table public.today_social_profile_posts add column if not exists poll_options jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.today_social_profile_posts'::regclass and conname='today_social_profile_posts_type_v65_check') then
    alter table public.today_social_profile_posts add constraint today_social_profile_posts_type_v65_check check (post_type in ('text','poll'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.today_social_profile_posts'::regclass and conname='today_social_profile_posts_poll_options_v65_check') then
    alter table public.today_social_profile_posts add constraint today_social_profile_posts_poll_options_v65_check check (
      (post_type='text' and jsonb_typeof(poll_options)='array') or
      (post_type='poll' and jsonb_typeof(poll_options)='array' and jsonb_array_length(poll_options) between 2 and 6)
    );
  end if;
end $$;

create table if not exists public.today_v65_profile_poll_votes (
  post_id uuid not null references public.today_social_profile_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index integer not null check (option_index between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(post_id,user_id)
);
create index if not exists today_v65_profile_poll_votes_post_idx on public.today_v65_profile_poll_votes(post_id,option_index);
alter table public.today_v65_profile_poll_votes enable row level security;
revoke all on table public.today_v65_profile_poll_votes from anon, authenticated;

alter table public.today_v65_content_actions enable row level security;
alter table public.today_v65_content_comments enable row level security;
alter table public.today_v65_content_reposts enable row level security;
revoke all on table public.today_v65_content_actions from anon, authenticated;
revoke all on table public.today_v65_content_comments from anon, authenticated;
revoke all on table public.today_v65_content_reposts from anon, authenticated;

-- This helper centralizes visibility rules for every interaction, so a guessed ID is not enough.
create or replace function public.today_v65_content_can_view(
  p_source_type text,
  p_source_id text,
  p_viewer uuid default auth.uid()
) returns boolean
language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare
  v_author uuid;
  v_visibility text;
  v_profile_visibility text;
  v_allow_visits boolean;
  v_today date := (now() at time zone 'Europe/Moscow')::date;
begin
  if p_source_id is null or char_length(p_source_id) < 1 or char_length(p_source_id) > 160 then return false; end if;

  if p_source_type = 'daily_user' then
    select t.user_id into v_author
    from public.today_publications t
    where t.id::text = p_source_id and t.day_date = v_today
    limit 1;
    if not found then return false; end if;
    if p_viewer is not null and v_author is not null and exists (
      select 1 from public.today_social_user_blocks b
      where (b.blocker_id=p_viewer and b.blocked_id=v_author)
         or (b.blocker_id=v_author and b.blocked_id=p_viewer)
    ) then return false; end if;
    return true;
  elsif p_source_type = 'daily_demo' then
    return exists(
      select 1 from public.demo_contributions d
      where d.id::text = p_source_id and d.day_date = v_today
    );
  elsif p_source_type = 'profile' then
    select p.author_id, p.visibility into v_author, v_visibility
    from public.today_social_profile_posts p
    where p.id::text = p_source_id
    limit 1;
    if not found then return false; end if;
    if p_viewer = v_author then return true; end if;
    if p_viewer is not null and exists (
      select 1 from public.today_social_user_blocks b
      where (b.blocker_id=p_viewer and b.blocked_id=v_author)
         or (b.blocker_id=v_author and b.blocked_id=p_viewer)
    ) then return false; end if;
    select coalesce(s.profile_visibility,'public'), coalesce(s.allow_profile_visits,true)
      into v_profile_visibility, v_allow_visits
    from (select 1) x left join public.today_social_settings s on s.user_id=v_author;
    if not coalesce(v_allow_visits,true) or coalesce(v_profile_visibility,'public')='private' then return false; end if;
    if coalesce(v_profile_visibility,'public')='friends'
       and (p_viewer is null or not public.today_social_is_friend(p_viewer,v_author)) then return false; end if;
    if coalesce(v_visibility,'public')='private' then return false; end if;
    if coalesce(v_visibility,'public')='friends'
       and (p_viewer is null or not public.today_social_is_friend(p_viewer,v_author)) then return false; end if;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.today_v65_get_feed_state(p_items jsonb default '[]'::jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare
  v_item jsonb;
  v_type text;
  v_id text;
  v_rows jsonb := '[]'::jsonb;
  v_uid uuid := auth.uid();
  v_counts jsonb;
  v_processed integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok',false,'message','Ожидался список публикаций.');
  end if;
  for v_item in select value from jsonb_array_elements(p_items) limit 80 loop
    v_processed := v_processed + 1;
    v_type := v_item->>'source_type';
    v_id := v_item->>'source_id';
    if public.today_v65_content_can_view(v_type,v_id,v_uid) then
      select jsonb_build_object(
        'source_type',v_type,'source_id',v_id,
        'comments',(select count(*) from public.today_v65_content_comments c where c.source_type=v_type and c.source_id=v_id and c.deleted_at is null),
        'likes',(select count(*) from public.today_v65_content_actions a where a.source_type=v_type and a.source_id=v_id and a.action='like'),
        'bookmarks',(select count(*) from public.today_v65_content_actions a where a.source_type=v_type and a.source_id=v_id and a.action='bookmark'),
        'reposts',(select count(*) from public.today_v65_content_reposts r where r.source_type=v_type and r.source_id=v_id),
        'viewer_liked',(v_uid is not null and exists(select 1 from public.today_v65_content_actions a where a.user_id=v_uid and a.source_type=v_type and a.source_id=v_id and a.action='like')),
        'viewer_bookmarked',(v_uid is not null and exists(select 1 from public.today_v65_content_actions a where a.user_id=v_uid and a.source_type=v_type and a.source_id=v_id and a.action='bookmark')),
        'viewer_reposted',(v_uid is not null and exists(select 1 from public.today_v65_content_reposts r where r.user_id=v_uid and r.source_type=v_type and r.source_id=v_id))
      ) into v_counts;
      v_rows := v_rows || jsonb_build_array(v_counts);
    end if;
  end loop;
  return jsonb_build_object('ok',true,'items',v_rows,'processed',v_processed);
end;
$$;

create or replace function public.today_v65_list_comments(p_source_type text,p_source_id text,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_comments jsonb; v_uid uuid:=auth.uid();
begin
  if not public.today_v65_content_can_view(p_source_type,p_source_id,v_uid) then
    return jsonb_build_object('ok',false,'message','Эта публикация больше недоступна.');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'parent_comment_id',q.parent_comment_id,'user_id',q.user_id,
    'author_name',q.author_name,'username',q.username,'avatar_url',q.avatar_url,
    'body',q.body,'deleted',q.deleted,'created_at',q.created_at,'is_owner',(v_uid is not null and q.user_id=v_uid)
  ) order by q.created_at asc),'[]'::jsonb)
  into v_comments
  from (
    select c.id,c.parent_comment_id,c.user_id,
      coalesce(nullif(to_jsonb(p)->>'display_name',''),nullif(to_jsonb(p)->>'nickname',''),nullif(to_jsonb(p)->>'username',''),'Участник') author_name,
      coalesce(to_jsonb(p)->>'username','') username,
      coalesce(to_jsonb(p)->>'avatar_url',to_jsonb(p)->>'photo_url','') avatar_url,
      case when c.deleted_at is not null then 'Комментарий удалён' else c.body end body,
      (c.deleted_at is not null) deleted,c.created_at
    from public.today_v65_content_comments c
    left join public.profiles p on p.id=c.user_id
    where c.source_type=p_source_type and c.source_id=p_source_id
    order by c.created_at asc limit greatest(1,least(coalesce(p_limit,100),200))
  ) q;
  return jsonb_build_object('ok',true,'comments',v_comments);
end;
$$;

create or replace function public.today_v65_add_comment(
  p_source_type text,p_source_id text,p_body text,p_parent_comment_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_uid uuid:=auth.uid(); v_body text:=btrim(coalesce(p_body,'')); v_comment public.today_v65_content_comments%rowtype;
  v_muted timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы комментировать.'); end if;
  if char_length(v_body)<1 or char_length(v_body)>2000 then return jsonb_build_object('ok',false,'message','Комментарий должен содержать от 1 до 2000 символов.'); end if;
  if not public.today_v65_content_can_view(p_source_type,p_source_id,v_uid) then return jsonb_build_object('ok',false,'message','Эта публикация больше недоступна.'); end if;
  select muted_until into v_muted from public.today_social_moderation_state where user_id=v_uid;
  if v_muted is not null and v_muted>now() then return jsonb_build_object('ok',false,'message','Комментирование временно ограничено.','muted_until',v_muted); end if;
  if (select count(*) from public.today_v65_content_comments c where c.user_id=v_uid and c.created_at>now()-interval '1 minute')>=12 then
    return jsonb_build_object('ok',false,'message','Слишком много комментариев за короткое время. Подожди минуту и попробуй снова.');
  end if;
  if p_parent_comment_id is not null and not exists(
    select 1 from public.today_v65_content_comments c
    where c.id=p_parent_comment_id and c.source_type=p_source_type and c.source_id=p_source_id
      and c.parent_comment_id is null and c.deleted_at is null
  ) then return jsonb_build_object('ok',false,'message','На этот комментарий нельзя ответить. Обнови обсуждение.'); end if;
  insert into public.today_v65_content_comments(user_id,source_type,source_id,parent_comment_id,body)
    values(v_uid,p_source_type,p_source_id,p_parent_comment_id,v_body) returning * into v_comment;
  return jsonb_build_object('ok',true,'id',v_comment.id,'message',case when p_parent_comment_id is null then 'Комментарий опубликован.' else 'Ответ опубликован.' end);
end;
$$;

create or replace function public.today_v65_delete_comment(p_comment_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_count integer;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  update public.today_v65_content_comments set body='Комментарий удалён',deleted_at=now(),updated_at=now()
  where id=p_comment_id and user_id=v_uid and deleted_at is null;
  get diagnostics v_count=row_count;
  if v_count=0 then return jsonb_build_object('ok',false,'message','Комментарий уже удалён или тебе не принадлежит.'); end if;
  return jsonb_build_object('ok',true,'message','Комментарий удалён.');
end;
$$;

create or replace function public.today_v65_toggle_action(p_source_type text,p_source_id text,p_action text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_deleted integer;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  if p_action is null or p_action not in ('like','bookmark') then return jsonb_build_object('ok',false,'message','Неизвестное действие.'); end if;
  if p_action='like' and p_source_type<>'profile' then return jsonb_build_object('ok',false,'message','В этой ленте уже используется отдельная система лайков.'); end if;
  if not public.today_v65_content_can_view(p_source_type,p_source_id,v_uid) then return jsonb_build_object('ok',false,'message','Эта публикация больше недоступна.'); end if;
  delete from public.today_v65_content_actions where user_id=v_uid and source_type=p_source_type and source_id=p_source_id and action=p_action;
  get diagnostics v_deleted=row_count;
  if v_deleted>0 then return jsonb_build_object('ok',true,'active',false,'action',p_action,'message',case when p_action='bookmark' then 'Убрано из закладок.' else 'Лайк убран.' end); end if;
  insert into public.today_v65_content_actions(user_id,source_type,source_id,action) values(v_uid,p_source_type,p_source_id,p_action)
  on conflict(user_id,source_type,source_id,action) do nothing;
  return jsonb_build_object('ok',true,'active',true,'action',p_action,'message',case when p_action='bookmark' then 'Сохранено в закладки.' else 'Лайк поставлен.' end);
end;
$$;

create or replace function public.today_v65_repost_content(p_source_type text,p_source_id text,p_caption text default '')
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_deleted integer; v_muted timestamptz; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы делиться публикациями.'); end if;
  if char_length(coalesce(p_caption,''))>500 then return jsonb_build_object('ok',false,'message','Подпись к репосту — максимум 500 символов.'); end if;
  if not public.today_v65_content_can_view(p_source_type,p_source_id,v_uid) then return jsonb_build_object('ok',false,'message','Эта публикация больше недоступна.'); end if;
  select muted_until into v_muted from public.today_social_moderation_state where user_id=v_uid;
  if v_muted is not null and v_muted>now() then return jsonb_build_object('ok',false,'message','Репосты временно ограничены.'); end if;
  delete from public.today_v65_content_reposts where user_id=v_uid and source_type=p_source_type and source_id=p_source_id returning id into v_id;
  if v_id is not null then return jsonb_build_object('ok',true,'reposted',false,'message','Репост удалён со страницы.'); end if;
  insert into public.today_v65_content_reposts(user_id,source_type,source_id,caption)
    values(v_uid,p_source_type,p_source_id,btrim(coalesce(p_caption,''))) on conflict(user_id,source_type,source_id) do nothing returning id into v_id;
  return jsonb_build_object('ok',true,'reposted',true,'id',v_id,'message','Публикация добавлена в твой раздел репостов.');
end;
$$;

create or replace function public.today_v65_list_bookmarks(p_limit integer default 80)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_row record; v_item jsonb; v_rows jsonb:='[]'::jsonb; v_today date:=(now() at time zone 'Europe/Moscow')::date;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы смотреть закладки.'); end if;
  for v_row in select a.source_type,a.source_id,a.created_at from public.today_v65_content_actions a
    where a.user_id=v_uid and a.action='bookmark' order by a.created_at desc limit greatest(1,least(coalesce(p_limit,80),120)) loop
    v_item:=null;
    if not public.today_v65_content_can_view(v_row.source_type,v_row.source_id,v_uid) then continue; end if;
    if v_row.source_type='daily_user' then
      select jsonb_build_object('source_type','daily_user','source_id',t.id::text,'title',coalesce(t.kind::text,'Публикация дня'),'body',coalesce(t.body,''),'image_url',coalesce(t.image_url,''),'author_name',coalesce(nullif(to_jsonb(p)->>'display_name',''),nullif(to_jsonb(p)->>'username',''),'Участник'),'created_at',t.created_at)
      into v_item from public.today_publications t left join public.profiles p on p.id=t.user_id where t.id::text=v_row.source_id and t.day_date=v_today;
    elsif v_row.source_type='daily_demo' then
      select jsonb_build_object('source_type','daily_demo','source_id',d.id::text,'title',coalesce(d.kind::text,'Публикация дня'),'body',coalesce(d.body,''),'image_url',coalesce(d.image_url,''),'author_name',coalesce(d.display_name,'Участник TODAY'),'created_at',d.created_at)
      into v_item from public.demo_contributions d where d.id::text=v_row.source_id and d.day_date=v_today;
    elsif v_row.source_type='profile' then
      select jsonb_build_object('source_type','profile','source_id',p.id::text,'title',coalesce(p.title,''),'body',coalesce(p.body,''),'image_url','','author_name',coalesce(nullif(to_jsonb(a)->>'display_name',''),nullif(to_jsonb(a)->>'username',''),'Участник'),'created_at',p.created_at)
      into v_item from public.today_social_profile_posts p left join public.profiles a on a.id=p.author_id where p.id::text=v_row.source_id;
    end if;
    if v_item is not null then v_rows:=v_rows||jsonb_build_array(v_item); end if;
  end loop;
  return jsonb_build_object('ok',true,'items',v_rows);
end;
$$;

create or replace function public.today_v65_list_reposts(p_profile_id uuid default auth.uid())
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_profile_id uuid:=coalesce(p_profile_id,auth.uid()); v_profile_visibility text; v_allow_visits boolean; v_row record; v_item jsonb; v_rows jsonb:='[]'::jsonb; v_today date:=(now() at time zone 'Europe/Moscow')::date;
begin
  if v_profile_id is null then return jsonb_build_object('ok',false,'message','Профиль не указан.'); end if;
  select coalesce(s.profile_visibility,'public'),coalesce(s.allow_profile_visits,true) into v_profile_visibility,v_allow_visits
    from (select 1) x left join public.today_social_settings s on s.user_id=v_profile_id;
  if v_uid is distinct from v_profile_id then
    if not coalesce(v_allow_visits,true) or coalesce(v_profile_visibility,'public')='private' then return jsonb_build_object('ok',false,'message','Репосты этого профиля скрыты.'); end if;
    if coalesce(v_profile_visibility,'public')='friends' and (v_uid is null or not public.today_social_is_friend(v_uid,v_profile_id)) then return jsonb_build_object('ok',false,'message','Репосты доступны только друзьям.'); end if;
    if v_uid is not null and exists(select 1 from public.today_social_user_blocks b where (b.blocker_id=v_uid and b.blocked_id=v_profile_id) or (b.blocker_id=v_profile_id and b.blocked_id=v_uid)) then return jsonb_build_object('ok',false,'message','Репосты недоступны.'); end if;
  end if;
  for v_row in select r.id,r.source_type,r.source_id,r.caption,r.created_at from public.today_v65_content_reposts r where r.user_id=v_profile_id order by r.created_at desc limit 80 loop
    if not public.today_v65_content_can_view(v_row.source_type,v_row.source_id,v_uid) then continue; end if;
    v_item:=null;
    if v_row.source_type='daily_user' then
      select jsonb_build_object('source_type','daily_user','source_id',t.id::text,'title',coalesce(t.kind::text,'Публикация дня'),'body',coalesce(t.body,''),'author_name',coalesce(nullif(to_jsonb(p)->>'display_name',''),nullif(to_jsonb(p)->>'username',''),'Участник'),'original_created_at',t.created_at)
      into v_item from public.today_publications t left join public.profiles p on p.id=t.user_id where t.id::text=v_row.source_id and t.day_date=v_today;
    elsif v_row.source_type='daily_demo' then
      select jsonb_build_object('source_type','daily_demo','source_id',d.id::text,'title',coalesce(d.kind::text,'Публикация дня'),'body',coalesce(d.body,''),'author_name',coalesce(d.display_name,'Участник TODAY'),'original_created_at',d.created_at)
      into v_item from public.demo_contributions d where d.id::text=v_row.source_id and d.day_date=v_today;
    elsif v_row.source_type='profile' then
      select jsonb_build_object('source_type','profile','source_id',p.id::text,'title',coalesce(p.title,''),'body',coalesce(p.body,''),'author_name',coalesce(nullif(to_jsonb(a)->>'display_name',''),nullif(to_jsonb(a)->>'username',''),'Участник'),'original_created_at',p.created_at)
      into v_item from public.today_social_profile_posts p left join public.profiles a on a.id=p.author_id where p.id::text=v_row.source_id;
    end if;
    if v_item is not null then v_rows:=v_rows||jsonb_build_array(v_item||jsonb_build_object('repost_id',v_row.id,'caption',v_row.caption,'reposted_at',v_row.created_at,'reposted_by',v_profile_id)); end if;
  end loop;
  return jsonb_build_object('ok',true,'reposts',v_rows);
end;
$$;

create or replace function public.today_v65_create_profile_poll(
  p_title text,p_body text,p_visibility text,p_options jsonb
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_uid uuid:=auth.uid(); v_body text:=btrim(coalesce(p_body,'')); v_title text:=btrim(coalesce(p_title,''));
  v_option_count integer; v_valid_count integer; v_duplicate_count integer; v_muted timestamptz; v_post public.today_social_profile_posts%rowtype; v_options jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы создать опрос.'); end if;
  if char_length(v_body)<1 or char_length(v_body)>5000 then return jsonb_build_object('ok',false,'message','Вопрос должен содержать от 1 до 5000 символов.'); end if;
  if char_length(v_title)>140 then return jsonb_build_object('ok',false,'message','Заголовок — максимум 140 символов.'); end if;
  if coalesce(p_visibility,'public') not in ('public','friends','private') then return jsonb_build_object('ok',false,'message','Выбрана неизвестная видимость публикации.'); end if;
  if p_options is null or jsonb_typeof(p_options)<>'array' then return jsonb_build_object('ok',false,'message','Для опроса нужны варианты ответа.'); end if;
  v_option_count:=jsonb_array_length(p_options);
  if v_option_count<2 or v_option_count>6 then return jsonb_build_object('ok',false,'message','Добавь от 2 до 6 вариантов ответа.'); end if;
  select count(*) into v_valid_count
  from jsonb_array_elements(p_options) o(value)
  where jsonb_typeof(o.value)='string'
    and char_length(btrim(o.value #>> '{}')) between 1 and 80;
  if v_valid_count<>v_option_count then return jsonb_build_object('ok',false,'message','Каждый вариант должен содержать от 1 до 80 символов.'); end if;
  select count(*) into v_duplicate_count from (
    select lower(btrim(value #>> '{}'))
    from jsonb_array_elements(p_options) o(value)
    where jsonb_typeof(value)='string'
    group by lower(btrim(value #>> '{}')) having count(*)>1
  ) d;
  if v_duplicate_count>0 then return jsonb_build_object('ok',false,'message','Варианты ответа не должны повторяться.'); end if;
  select muted_until into v_muted from public.today_social_moderation_state where user_id=v_uid;
  if v_muted is not null and v_muted>now() then return jsonb_build_object('ok',false,'message','Создание публикаций временно ограничено.','muted_until',v_muted); end if;
  select coalesce(jsonb_agg(to_jsonb(btrim(value #>> '{}')) order by ordinality),'[]'::jsonb) into v_options
  from jsonb_array_elements(p_options) with ordinality o(value,ordinality);
  insert into public.today_social_profile_posts(author_id,title,body,visibility,post_type,poll_options)
    values(v_uid,left(v_title,140),v_body,coalesce(p_visibility,'public'),'poll',v_options) returning * into v_post;
  return jsonb_build_object('ok',true,'id',v_post.id,'message','Опрос опубликован на личной стене.');
end;
$$;

create or replace function public.today_v65_list_profile_polls(p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_polls jsonb;
begin
  if p_profile_id is null then return jsonb_build_object('ok',false,'message','Профиль не указан.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'title',p.title,'body',p.body,'visibility',p.visibility,'created_at',p.created_at,
    'options',(select coalesce(jsonb_agg(jsonb_build_object('index',o.ordinality-1,'label',o.option_text,'votes',o.votes) order by o.ordinality),'[]'::jsonb)
      from (select opt.option_text,opt.ordinality,(select count(*) from public.today_v65_profile_poll_votes v where v.post_id=p.id and v.option_index=opt.ordinality-1) votes
        from jsonb_array_elements_text(p.poll_options) with ordinality opt(option_text,ordinality)) o),
    'total_votes',(select count(*) from public.today_v65_profile_poll_votes v where v.post_id=p.id),
    'viewer_vote',(select v.option_index from public.today_v65_profile_poll_votes v where v.post_id=p.id and v.user_id=v_uid limit 1)
  ) order by p.created_at desc),'[]'::jsonb) into v_polls
  from public.today_social_profile_posts p
  where p.author_id=p_profile_id and p.post_type='poll'
    and public.today_v65_content_can_view('profile',p.id::text,v_uid);
  return jsonb_build_object('ok',true,'polls',v_polls);
end;
$$;

create or replace function public.today_v65_vote_profile_poll(p_post_id uuid,p_option_index integer)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_author uuid; v_options jsonb; v_muted timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы голосовать.'); end if;
  select author_id,poll_options into v_author,v_options from public.today_social_profile_posts where id=p_post_id and post_type='poll';
  if v_author is null then return jsonb_build_object('ok',false,'message','Опрос не найден.'); end if;
  if not public.today_v65_content_can_view('profile',p_post_id::text,v_uid) then return jsonb_build_object('ok',false,'message','Этот опрос недоступен.'); end if;
  if p_option_index is null or p_option_index<0 or p_option_index>=jsonb_array_length(v_options) then return jsonb_build_object('ok',false,'message','Выбран неизвестный вариант ответа.'); end if;
  select muted_until into v_muted from public.today_social_moderation_state where user_id=v_uid;
  if v_muted is not null and v_muted>now() then return jsonb_build_object('ok',false,'message','Голосование временно ограничено.'); end if;
  insert into public.today_v65_profile_poll_votes(post_id,user_id,option_index) values(p_post_id,v_uid,p_option_index)
    on conflict(post_id,user_id) do update set option_index=excluded.option_index,updated_at=now();
  return jsonb_build_object('ok',true,'option_index',p_option_index,'message','Голос учтён.');
end;
$$;

revoke all on function public.today_v65_content_can_view(text,text,uuid) from public,anon,authenticated;
revoke all on function public.today_v65_get_feed_state(jsonb) from public,anon,authenticated;
revoke all on function public.today_v65_list_comments(text,text,integer) from public,anon,authenticated;
revoke all on function public.today_v65_add_comment(text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.today_v65_delete_comment(uuid) from public,anon,authenticated;
revoke all on function public.today_v65_toggle_action(text,text,text) from public,anon,authenticated;
revoke all on function public.today_v65_repost_content(text,text,text) from public,anon,authenticated;
revoke all on function public.today_v65_list_bookmarks(integer) from public,anon,authenticated;
revoke all on function public.today_v65_list_reposts(uuid) from public,anon,authenticated;
revoke all on function public.today_v65_create_profile_poll(text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.today_v65_list_profile_polls(uuid) from public,anon,authenticated;
revoke all on function public.today_v65_vote_profile_poll(uuid,integer) from public,anon,authenticated;
grant execute on function public.today_v65_get_feed_state(jsonb) to anon,authenticated;
grant execute on function public.today_v65_list_comments(text,text,integer) to anon,authenticated;
grant execute on function public.today_v65_add_comment(text,text,text,uuid) to authenticated;
grant execute on function public.today_v65_delete_comment(uuid) to authenticated;
grant execute on function public.today_v65_toggle_action(text,text,text) to authenticated;
grant execute on function public.today_v65_repost_content(text,text,text) to authenticated;
grant execute on function public.today_v65_list_bookmarks(integer) to authenticated;
grant execute on function public.today_v65_list_reposts(uuid) to anon,authenticated;
grant execute on function public.today_v65_create_profile_poll(text,text,text,jsonb) to authenticated;
grant execute on function public.today_v65_list_profile_polls(uuid) to anon,authenticated;
grant execute on function public.today_v65_vote_profile_poll(uuid,integer) to authenticated;


-- Transactional verification: fail the whole migration if a required V65 object is missing.
do $$
begin
  if to_regclass('public.today_v65_content_actions') is null
     or to_regclass('public.today_v65_content_comments') is null
     or to_regclass('public.today_v65_content_reposts') is null
     or to_regclass('public.today_v65_profile_poll_votes') is null then
    raise exception 'TODAY V65 verification failed: content interaction tables are missing';
  end if;
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='today_v65_get_feed_state')
     or not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='today_v65_add_comment')
     or not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='today_v65_list_bookmarks')
     or not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='today_v65_vote_profile_poll') then
    raise exception 'TODAY V65 verification failed: required RPC functions are missing';
  end if;
  if exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('today_v65_content_actions','today_v65_content_comments','today_v65_content_reposts','today_v65_profile_poll_votes')
      and c.relrowsecurity=false
  ) then
    raise exception 'TODAY V65 verification failed: RLS is disabled on an interaction table';
  end if;
end;
$$;

commit;
