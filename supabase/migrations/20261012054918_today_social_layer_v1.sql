-- TODAY Social Layer V1 — persistent profiles, friendships, chats, channels, moderation and daily promotion
-- Idempotent migration. Existing TODAY tables and shop RPCs are intentionally untouched.

begin;

create table if not exists public.today_social_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  allow_direct_messages boolean not null default true,
  allow_group_invites boolean not null default true,
  allow_friend_requests boolean not null default true,
  allow_profile_visits boolean not null default true,
  profile_visibility text not null default 'public' check (profile_visibility in ('public','friends','private')),
  friend_list_visibility text not null default 'public' check (friend_list_visibility in ('public','friends','private')),
  updated_at timestamptz not null default now()
);

create table if not exists public.today_social_friends (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint today_social_friends_not_self check (requester_id <> addressee_id),
  constraint today_social_friends_pair unique (requester_id, addressee_id)
);
create index if not exists today_social_friends_addressee_status_idx on public.today_social_friends(addressee_id,status);
create index if not exists today_social_friends_requester_status_idx on public.today_social_friends(requester_id,status);

create table if not exists public.today_social_user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint today_social_blocks_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.today_social_profile_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 140),
  body text not null check (char_length(body) between 1 and 5000),
  visibility text not null default 'public' check (visibility in ('public','friends','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists today_social_profile_posts_author_created_idx on public.today_social_profile_posts(author_id,created_at desc);

create table if not exists public.today_social_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  slug text not null unique,
  description text not null default '' check (char_length(description) <= 500),
  visibility text not null default 'public' check (visibility in ('public','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists today_social_channels_visibility_idx on public.today_social_channels(visibility,created_at desc);

create table if not exists public.today_social_channel_members (
  channel_id uuid not null references public.today_social_channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','moderator','member')),
  joined_at timestamptz not null default now(),
  primary key (channel_id,user_id)
);
create index if not exists today_social_channel_members_user_idx on public.today_social_channel_members(user_id,joined_at desc);

create table if not exists public.today_social_channel_posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.today_social_channels(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 140),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists today_social_channel_posts_channel_created_idx on public.today_social_channel_posts(channel_id,created_at desc);

create table if not exists public.today_social_chats (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct','group','global')),
  title text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  is_global boolean not null default false,
  member_a uuid references public.profiles(id) on delete cascade,
  member_b uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint today_social_chat_type_shape check (
    (type = 'direct' and member_a is not null and member_b is not null and member_a <> member_b and not is_global)
    or (type = 'group' and not is_global)
    or (type = 'global' and is_global)
  )
);
create unique index if not exists today_social_chats_direct_pair_idx on public.today_social_chats(member_a,member_b) where type='direct';
create unique index if not exists today_social_chats_global_idx on public.today_social_chats(is_global) where is_global=true;

create table if not exists public.today_social_chat_members (
  chat_id uuid not null references public.today_social_chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (chat_id,user_id)
);
create index if not exists today_social_chat_members_user_idx on public.today_social_chat_members(user_id,joined_at desc);

create table if not exists public.today_social_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.today_social_chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index if not exists today_social_chat_messages_chat_created_idx on public.today_social_chat_messages(chat_id,created_at desc);
create index if not exists today_social_chat_messages_sender_created_idx on public.today_social_chat_messages(sender_id,created_at desc);

create table if not exists public.today_social_chat_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid not null references public.today_social_chats(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id,chat_id)
);

create table if not exists public.today_social_promotions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.today_social_profile_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  day_date date not null,
  price_coins integer not null default 250 check (price_coins = 250),
  created_at timestamptz not null default now(),
  unique (author_id,day_date)
);
create index if not exists today_social_promotions_day_idx on public.today_social_promotions(day_date,created_at desc);

create table if not exists public.today_social_moderation_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  strike_count integer not null default 0 check (strike_count >= 0),
  muted_until timestamptz,
  last_violation_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.today_social_moderation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid references public.today_social_chats(id) on delete set null,
  violation_code text not null,
  strike_number integer not null,
  muted_until timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists today_social_moderation_events_user_idx on public.today_social_moderation_events(user_id,created_at desc);

create table if not exists public.today_social_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  content_type text not null check (content_type in ('profile','profile_post','channel','channel_post','chat_message','user')),
  content_id text not null,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);
create index if not exists today_social_reports_created_idx on public.today_social_reports(created_at desc);

-- RLS: clients cannot directly write chats/posts or alter coin balances; all authoritative actions use RPCs.
alter table public.today_social_settings enable row level security;
alter table public.today_social_friends enable row level security;
alter table public.today_social_user_blocks enable row level security;
alter table public.today_social_profile_posts enable row level security;
alter table public.today_social_channels enable row level security;
alter table public.today_social_channel_members enable row level security;
alter table public.today_social_channel_posts enable row level security;
alter table public.today_social_chats enable row level security;
alter table public.today_social_chat_members enable row level security;
alter table public.today_social_chat_messages enable row level security;
alter table public.today_social_chat_reads enable row level security;
alter table public.today_social_promotions enable row level security;
alter table public.today_social_moderation_state enable row level security;
alter table public.today_social_moderation_events enable row level security;
alter table public.today_social_reports enable row level security;

drop policy if exists today_social_settings_own on public.today_social_settings;
create policy today_social_settings_own on public.today_social_settings for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

grant select,insert,update on public.today_social_settings to authenticated;
grant usage on schema public to authenticated;

create or replace function public.today_social_profile_json(p_profile_id uuid)
returns jsonb language sql stable security definer set search_path=public,auth,pg_temp as $$
  select case when p.id is null then null else jsonb_build_object(
    'id',p.id,
    'username',coalesce(to_jsonb(p)->>'username',''),
    'name',coalesce(nullif(to_jsonb(p)->>'display_name',''),nullif(to_jsonb(p)->>'nickname',''),nullif(to_jsonb(p)->>'full_name',''),nullif(to_jsonb(p)->>'username',''),'Участник'),
    'avatar_url',coalesce(to_jsonb(p)->>'avatar_url',to_jsonb(p)->>'photo_url',''),
    'bio',coalesce(to_jsonb(p)->>'bio','')
  ) end
  from (select 1) seed left join public.profiles p on p.id=p_profile_id;
$$;

create or replace function public.today_social_is_friend(p_a uuid,p_b uuid)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select exists(
    select 1 from public.today_social_friends f
    where f.status='accepted'
      and ((f.requester_id=p_a and f.addressee_id=p_b) or (f.requester_id=p_b and f.addressee_id=p_a))
  );
$$;

create or replace function public.today_social_search_users(p_query text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_query text; v_users jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  v_query:=regexp_replace(lower(trim(coalesce(p_query,''))),'^@','');
  if char_length(v_query)<2 then return jsonb_build_object('ok',true,'users','[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'username',q.username,'name',q.name,'avatar_url',q.avatar_url)),'[]'::jsonb)
    into v_users
  from (
    select p.id,coalesce(to_jsonb(p)->>'username','') as username,
      coalesce(nullif(to_jsonb(p)->>'display_name',''),nullif(to_jsonb(p)->>'nickname',''),nullif(to_jsonb(p)->>'full_name',''),nullif(to_jsonb(p)->>'username',''),'Участник') as name,
      coalesce(to_jsonb(p)->>'avatar_url',to_jsonb(p)->>'photo_url','') as avatar_url
    from public.profiles p
    where p.id<>auth.uid()
      and (lower(regexp_replace(coalesce(to_jsonb(p)->>'username',''),'^(\@)','')) like '%'||v_query||'%'
        or lower(coalesce(to_jsonb(p)->>'display_name',to_jsonb(p)->>'nickname',to_jsonb(p)->>'full_name','')) like '%'||v_query||'%')
      and not exists(select 1 from public.today_social_user_blocks b where b.blocker_id=p.id and b.blocked_id=auth.uid())
    order by lower(coalesce(to_jsonb(p)->>'display_name',to_jsonb(p)->>'username',''))
    limit 30
  ) q;
  return jsonb_build_object('ok',true,'users',v_users);
end;
$$;

create or replace function public.today_social_send_friend_request(p_username text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_me uuid:=auth.uid(); v_target uuid; v_allow boolean; v_status text;
begin
  if v_me is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  select p.id into v_target from public.profiles p
    where lower(regexp_replace(coalesce(to_jsonb(p)->>'username',''),'^@',''))=lower(regexp_replace(trim(coalesce(p_username,'')),'^@','')) limit 1;
  if v_target is null then return jsonb_build_object('ok',false,'message','Пользователь не найден.'); end if;
  if v_target=v_me then return jsonb_build_object('ok',false,'message','Себя нельзя добавить в друзья.'); end if;
  if exists(select 1 from public.today_social_user_blocks b where (b.blocker_id=v_me and b.blocked_id=v_target) or (b.blocker_id=v_target and b.blocked_id=v_me)) then
    return jsonb_build_object('ok',false,'message','Заявка недоступна: между аккаунтами действует блокировка.');
  end if;
  select coalesce(s.allow_friend_requests,true) into v_allow from (select 1) x left join public.today_social_settings s on s.user_id=v_target;
  if not coalesce(v_allow,true) then return jsonb_build_object('ok',false,'message','Пользователь отключил заявки в друзья.'); end if;
  if public.today_social_is_friend(v_me,v_target) then return jsonb_build_object('ok',true,'status','accepted','message','Вы уже друзья.'); end if;
  update public.today_social_friends set status='accepted',updated_at=now()
    where requester_id=v_target and addressee_id=v_me and status='pending';
  if found then return jsonb_build_object('ok',true,'status','accepted','message','Заявка принята автоматически: у пользователя уже была встречная заявка.'); end if;
  select f.status into v_status from public.today_social_friends f where f.requester_id=v_me and f.addressee_id=v_target;
  if v_status='pending' then return jsonb_build_object('ok',true,'status','pending','message','Заявка уже отправлена.'); end if;
  insert into public.today_social_friends(requester_id,addressee_id,status) values(v_me,v_target,'pending')
    on conflict(requester_id,addressee_id) do update set status='pending',updated_at=now();
  return jsonb_build_object('ok',true,'status','pending','message','Заявка в друзья отправлена.');
end;
$$;

create or replace function public.today_social_respond_friend_request(p_requester_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_me uuid:=auth.uid(); v_count integer;
begin
  if v_me is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  update public.today_social_friends set status=case when p_accept then 'accepted' else 'declined' end,updated_at=now()
    where requester_id=p_requester_id and addressee_id=v_me and status='pending';
  get diagnostics v_count=row_count;
  if v_count=0 then return jsonb_build_object('ok',false,'message','Заявка уже обработана или не найдена.'); end if;
  return jsonb_build_object('ok',true,'status',case when p_accept then 'accepted' else 'declined' end,'message',case when p_accept then 'Теперь вы друзья.' else 'Заявка отклонена.' end);
end;
$$;

create or replace function public.today_social_list_friend_requests()
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_me uuid:=auth.uid(); v_in jsonb; v_out jsonb; v_friends jsonb;
begin
  if v_me is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',coalesce(to_jsonb(p)->>'username',''),'name',coalesce(to_jsonb(p)->>'display_name',to_jsonb(p)->>'nickname',to_jsonb(p)->>'username','Участник'),'avatar_url',coalesce(to_jsonb(p)->>'avatar_url',to_jsonb(p)->>'photo_url',''))),'[]'::jsonb)
    into v_in from public.today_social_friends f join public.profiles p on p.id=f.requester_id where f.addressee_id=v_me and f.status='pending';
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',coalesce(to_jsonb(p)->>'username',''),'name',coalesce(to_jsonb(p)->>'display_name',to_jsonb(p)->>'nickname',to_jsonb(p)->>'username','Участник'),'avatar_url',coalesce(to_jsonb(p)->>'avatar_url',to_jsonb(p)->>'photo_url',''))),'[]'::jsonb)
    into v_out from public.today_social_friends f join public.profiles p on p.id=f.addressee_id where f.requester_id=v_me and f.status='pending';
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',coalesce(to_jsonb(p)->>'username',''),'name',coalesce(to_jsonb(p)->>'display_name',to_jsonb(p)->>'nickname',to_jsonb(p)->>'username','Участник'),'avatar_url',coalesce(to_jsonb(p)->>'avatar_url',to_jsonb(p)->>'photo_url',''))),'[]'::jsonb)
    into v_friends from public.today_social_friends f join public.profiles p on p.id=case when f.requester_id=v_me then f.addressee_id else f.requester_id end
    where f.status='accepted' and (f.requester_id=v_me or f.addressee_id=v_me);
  return jsonb_build_object('ok',true,'incoming',v_in,'outgoing',v_out,'friends',v_friends);
end;
$$;

create or replace function public.today_social_block_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  if p_user_id is null or p_user_id=auth.uid() then return jsonb_build_object('ok',false,'message','Нельзя заблокировать этот аккаунт.'); end if;
  insert into public.today_social_user_blocks(blocker_id,blocked_id) values(auth.uid(),p_user_id) on conflict do nothing;
  delete from public.today_social_friends where (requester_id=auth.uid() and addressee_id=p_user_id) or (requester_id=p_user_id and addressee_id=auth.uid());
  return jsonb_build_object('ok',true,'message','Пользователь заблокирован.');
end;
$$;

create or replace function public.today_social_unblock_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  delete from public.today_social_user_blocks where blocker_id=auth.uid() and blocked_id=p_user_id;
  return jsonb_build_object('ok',true,'message','Блокировка снята.');
end;
$$;

create or replace function public.today_social_create_profile_post(p_title text,p_body text,p_visibility text default 'public')
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_post public.today_social_profile_posts%rowtype; v_muted timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  select muted_until into v_muted from public.today_social_moderation_state where user_id=v_uid;
  if v_muted is not null and v_muted>now() then return jsonb_build_object('ok',false,'message','Публикации временно ограничены до '||to_char(v_muted at time zone 'Europe/Moscow','DD.MM.YYYY HH24:MI')||' МСК.','muted_until',v_muted); end if;
  if char_length(trim(coalesce(p_body,'')))<1 or char_length(p_body)>5000 then return jsonb_build_object('ok',false,'message','Текст должен содержать от 1 до 5000 символов.'); end if;
  if coalesce(p_visibility,'public') not in ('public','friends','private') then return jsonb_build_object('ok',false,'message','Некорректная видимость публикации.'); end if;
  insert into public.today_social_profile_posts(author_id,title,body,visibility)
    values(v_uid,left(trim(coalesce(p_title,'')),140),trim(p_body),coalesce(p_visibility,'public')) returning * into v_post;
  return jsonb_build_object('ok',true,'post',jsonb_build_object('id',v_post.id,'title',v_post.title,'body',v_post.body,'visibility',v_post.visibility,'created_at',v_post.created_at),'message','Публикация сохранена на личной странице.');
end;
$$;

create or replace function public.today_social_profile_page(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_me uuid:=auth.uid(); v_target uuid:=p_user_id; v_profile jsonb; v_posts jsonb; v_friends jsonb:='[]'::jsonb; v_visibility text; v_visits boolean; v_friend_list text; v_friend_status text;
begin
  if v_target is null then return jsonb_build_object('ok',false,'message','Профиль не указан.'); end if;
  select jsonb_build_object('id',p.id,'username',coalesce(to_jsonb(p)->>'username',''),'name',coalesce(nullif(to_jsonb(p)->>'display_name',''),nullif(to_jsonb(p)->>'nickname',''),nullif(to_jsonb(p)->>'full_name',''),nullif(to_jsonb(p)->>'username',''),'Участник'),'avatar_url',coalesce(to_jsonb(p)->>'avatar_url',to_jsonb(p)->>'photo_url',''),'bio',coalesce(to_jsonb(p)->>'bio',''))
    into v_profile from public.profiles p where p.id=v_target;
  if v_profile is null then return jsonb_build_object('ok',false,'message','Пользователь не найден.'); end if;
  select coalesce(s.profile_visibility,'public'),coalesce(s.allow_profile_visits,true),coalesce(s.friend_list_visibility,'public')
    into v_visibility,v_visits,v_friend_list from (select 1) x left join public.today_social_settings s on s.user_id=v_target;
  if v_me is distinct from v_target then
    if not coalesce(v_visits,true) or v_visibility='private' or (v_visibility='friends' and not public.today_social_is_friend(v_me,v_target)) then
      return jsonb_build_object('ok',false,'private',true,'message','Эта страница доступна ограниченному кругу людей.');
    end if;
    if exists(select 1 from public.today_social_user_blocks b where (b.blocker_id=v_me and b.blocked_id=v_target) or (b.blocker_id=v_target and b.blocked_id=v_me)) then
      return jsonb_build_object('ok',false,'private',true,'message','Эта страница недоступна.');
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'body',q.body,'visibility',q.visibility,'created_at',q.created_at,'can_promote',(q.visibility='public' and q.author_id=v_target and v_me=v_target)) order by q.created_at desc),'[]'::jsonb)
    into v_posts from (
      select p.id,p.author_id,p.title,p.body,p.visibility,p.created_at
      from public.today_social_profile_posts p where p.author_id=v_target
       and (v_me=v_target or p.visibility='public' or (p.visibility='friends' and public.today_social_is_friend(v_me,v_target)))
      order by p.created_at desc limit 80
    ) q;
  if v_me=v_target or v_friend_list='public' or (v_friend_list='friends' and public.today_social_is_friend(v_me,v_target)) then
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',coalesce(to_jsonb(p)->>'username',''),'name',coalesce(to_jsonb(p)->>'display_name',to_jsonb(p)->>'nickname',to_jsonb(p)->>'username','Участник'),'avatar_url',coalesce(to_jsonb(p)->>'avatar_url',to_jsonb(p)->>'photo_url',''))),'[]'::jsonb)
      into v_friends from public.today_social_friends f join public.profiles p on p.id=case when f.requester_id=v_target then f.addressee_id else f.requester_id end
      where f.status='accepted' and (f.requester_id=v_target or f.addressee_id=v_target);
  end if;
  if v_me=v_target then v_friend_status:='self';
  elsif public.today_social_is_friend(v_me,v_target) then v_friend_status:='friends';
  elsif exists(select 1 from public.today_social_friends f where f.requester_id=v_target and f.addressee_id=v_me and f.status='pending') then v_friend_status:='incoming';
  elsif exists(select 1 from public.today_social_friends f where f.requester_id=v_me and f.addressee_id=v_target and f.status='pending') then v_friend_status:='outgoing';
  else v_friend_status:='none'; end if;
  return jsonb_build_object('ok',true,'profile',v_profile,'posts',v_posts,'friends',v_friends,'friend_status',v_friend_status,'is_self',v_me=v_target);
end;
$$;

create or replace function public.today_social_detect_violation(p_body text)
returns text language plpgsql immutable security definer set search_path=public,auth,pg_temp as $$
declare v text:=lower(coalesce(p_body,'')); v_compact text;
begin
  -- Check ordinary text and a normalized version to reduce punctuation/spacing/Latin-homoglyph bypasses.
  v_compact:=regexp_replace(v,'[^[:alnum:]]','','g');
  v_compact:=translate(v_compact,'aekmopctxyhb01345','аекморстхунвоизчс');
  if v ~* '(^|[^[:alnum:]_])(бляд[а-яё]*|блят[а-яё]*|бля|еб[а-яё]*|ёб[а-яё]*|ху[йяеию][а-яё]*|пизд[а-яё]*|су(ка|чар[а-яё]*)|мудак[а-яё]*|дебил[а-яё]*|идиот[а-яё]*|мраз[а-яё]*|урод[а-яё]*|твар[а-яё]*|гандон[а-яё]*|чмо|шлюх[а-яё]*|пидор[а-яё]*|гнид[а-яё]*|сволоч[а-яё]*|лох[а-яё]*|fuck|shit|bitch|asshole|moron|idiot)([^[:alnum:]_]|$)'
     or v_compact ~* '(бляд|блят|ебан|ебал|ебаш|ебл|ебн|ебат|ебись|ёбан|ёбл|хуй|хуя|хуе|хуи|хуё|пизд|сука|мудак|дебил|идиот|мраз|урод|твар|гандон|чмо|шлюх|пидор|гнид|сволоч|fuck|shit|bitch|asshole|moron|idiot)' then
    return 'profanity_or_insult';
  end if;
  if v ~* '(^|[^[:alnum:]_])(политик[а-яё]*|президент[а-яё]*|депутат[а-яё]*|госдум[а-яё]*|кремл[а-яё]*|выборы|выборах|выборов|выборный|партия|партий[а-яё]*|парламент[а-яё]*|санкци[а-яё]*|оппозици[а-яё]*|правительств[а-яё]*|государств[а-яё]*|чиновник[а-яё]*|путин[а-яё]*|росси[а-яё]*|украин[а-яё]*|трамп[а-яё]*|нато|зеленск[а-яё]*|войн[а-яё]*|митинг[а-яё]*|протест[а-яё]*|идеолог[а-яё]*|коммунист[а-яё]*|капиталист[а-яё]*|либерал[а-яё]*|фашист[а-яё]*|националист[а-яё]*|пропаганд[а-яё]*)([^[:alnum:]_]|$)'
     or v_compact ~* '(политик|президент|депутат|госдум|кремл|выборы|выборах|выборов|партия|партий|парламент|санкци|оппозици|правительств|государств|чиновник|путин|росси|украин|трамп|нато|зеленск|войн|митинг|протест|идеолог|коммунист|капиталист|либерал|фашист|националист|пропаганд)' then
    return 'political_statement';
  end if;
  return null;
end;
$$;

create or replace function public.today_social_create_channel(p_title text,p_description text default '',p_visibility text default 'public')
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_channel public.today_social_channels%rowtype; v_slug text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  if char_length(trim(coalesce(p_title,'')))<2 or char_length(trim(p_title))>80 then return jsonb_build_object('ok',false,'message','Название канала: от 2 до 80 символов.'); end if;
  if coalesce(p_visibility,'public') not in ('public','private') then return jsonb_build_object('ok',false,'message','Некорректный тип канала.'); end if;
  v_slug:=left(regexp_replace(lower(trim(p_title)),'[^a-z0-9а-яё]+','-','g'),45)||'-'||substr(md5(random()::text||clock_timestamp()::text),1,7);
  insert into public.today_social_channels(owner_id,title,slug,description,visibility) values(v_uid,trim(p_title),v_slug,left(trim(coalesce(p_description,'')),500),coalesce(p_visibility,'public')) returning * into v_channel;
  insert into public.today_social_channel_members(channel_id,user_id,role) values(v_channel.id,v_uid,'owner') on conflict do nothing;
  return jsonb_build_object('ok',true,'channel',jsonb_build_object('id',v_channel.id,'title',v_channel.title,'slug',v_channel.slug,'description',v_channel.description,'visibility',v_channel.visibility,'role','owner'),'message','Канал создан. Публикации будут находиться внутри него.');
end;
$$;

create or replace function public.today_social_list_channels()
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_channels jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'slug',q.slug,'description',q.description,'visibility',q.visibility,'owner_id',q.owner_id,'member_count',q.member_count,'is_member',q.is_member,'role',q.role,'created_at',q.created_at) order by q.is_member desc,q.created_at desc),'[]'::jsonb)
  into v_channels from (
    select c.id,c.title,c.slug,c.description,c.visibility,c.owner_id,c.created_at,
      (select count(*)::int from public.today_social_channel_members m where m.channel_id=c.id) member_count,
      exists(select 1 from public.today_social_channel_members m where m.channel_id=c.id and m.user_id=v_uid) is_member,
      (select m.role from public.today_social_channel_members m where m.channel_id=c.id and m.user_id=v_uid limit 1) role
    from public.today_social_channels c
    where c.visibility='public' or exists(select 1 from public.today_social_channel_members m where m.channel_id=c.id and m.user_id=v_uid)
  ) q;
  return jsonb_build_object('ok',true,'channels',v_channels);
end;
$$;

create or replace function public.today_social_join_channel(p_channel_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_channel public.today_social_channels%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  select * into v_channel from public.today_social_channels where id=p_channel_id;
  if v_channel.id is null then return jsonb_build_object('ok',false,'message','Канал не найден.'); end if;
  if v_channel.visibility='private' and not exists(select 1 from public.today_social_channel_members m where m.channel_id=p_channel_id and m.user_id=v_uid) then return jsonb_build_object('ok',false,'message','Закрытый канал доступен только по приглашению.'); end if;
  insert into public.today_social_channel_members(channel_id,user_id,role) values(p_channel_id,v_uid,case when v_channel.owner_id=v_uid then 'owner' else 'member' end) on conflict do nothing;
  return jsonb_build_object('ok',true,'message','Ты внутри канала.');
end;
$$;

create or replace function public.today_social_invite_channel_members(p_channel_id uuid,p_usernames text[])
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_count integer:=0; v_added integer:=0;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  if not exists(select 1 from public.today_social_channel_members m where m.channel_id=p_channel_id and m.user_id=v_uid and m.role in ('owner','admin')) then return jsonb_build_object('ok',false,'message','Приглашать участников могут владелец и администратор канала.'); end if;
  if coalesce(cardinality(p_usernames),0)=0 then return jsonb_build_object('ok',false,'message','Укажи хотя бы один никнейм.'); end if;
  select count(*)::int into v_count from public.profiles p where lower(regexp_replace(coalesce(to_jsonb(p)->>'username',''),'^@','')) in (select lower(regexp_replace(trim(x.username),'^@','')) from unnest(p_usernames) as x(username) where trim(x.username)<>'') and p.id<>v_uid;
  insert into public.today_social_channel_members(channel_id,user_id,role)
    select p_channel_id,p.id,'member' from public.profiles p
    where p.id<>v_uid and lower(regexp_replace(coalesce(to_jsonb(p)->>'username',''),'^@','')) in (select lower(regexp_replace(trim(x.username),'^@','')) from unnest(p_usernames) as x(username) where trim(x.username)<>'')
    on conflict do nothing;
  get diagnostics v_added=row_count;
  return jsonb_build_object('ok',true,'added',v_added,'matched',v_count,'message','Обработка приглашений завершена.');
end;
$$;

create or replace function public.today_social_get_channel_posts(p_channel_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_channel jsonb; v_posts jsonb; v_visibility text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  select jsonb_build_object('id',c.id,'title',c.title,'slug',c.slug,'description',c.description,'visibility',c.visibility,'owner_id',c.owner_id,
    'member_count',(select count(*)::int from public.today_social_channel_members m where m.channel_id=c.id),
    'is_member',exists(select 1 from public.today_social_channel_members m where m.channel_id=c.id and m.user_id=v_uid),
    'role',(select m.role from public.today_social_channel_members m where m.channel_id=c.id and m.user_id=v_uid limit 1)) , c.visibility
  into v_channel,v_visibility from public.today_social_channels c where c.id=p_channel_id;
  if v_channel is null then return jsonb_build_object('ok',false,'message','Канал не найден.'); end if;
  if v_visibility='private' and not exists(select 1 from public.today_social_channel_members m where m.channel_id=p_channel_id and m.user_id=v_uid) then return jsonb_build_object('ok',false,'message','Это закрытый канал.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'body',q.body,'author_id',q.author_id,'author_name',q.author_name,'author_username',q.author_username,'created_at',q.created_at) order by q.created_at desc),'[]'::jsonb)
  into v_posts from (
    select p.id,p.title,p.body,p.author_id,p.created_at,coalesce(to_jsonb(a)->>'display_name',to_jsonb(a)->>'nickname',to_jsonb(a)->>'username','Участник') author_name,coalesce(to_jsonb(a)->>'username','') author_username
    from public.today_social_channel_posts p join public.profiles a on a.id=p.author_id where p.channel_id=p_channel_id order by p.created_at desc limit 100
  ) q;
  return jsonb_build_object('ok',true,'channel',v_channel,'posts',v_posts);
end;
$$;

create or replace function public.today_social_create_channel_post(p_channel_id uuid,p_title text,p_body text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_post public.today_social_channel_posts%rowtype; v_muted timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  select muted_until into v_muted from public.today_social_moderation_state where user_id=v_uid;
  if v_muted is not null and v_muted>now() then return jsonb_build_object('ok',false,'muted_until',v_muted,'message','Публикации временно ограничены до '||to_char(v_muted at time zone 'Europe/Moscow','DD.MM.YYYY HH24:MI')||' МСК.'); end if;
  if not exists(select 1 from public.today_social_channel_members m where m.channel_id=p_channel_id and m.user_id=v_uid) then return jsonb_build_object('ok',false,'message','Сначала вступи в канал.'); end if;
  if char_length(trim(coalesce(p_body,'')))<1 or char_length(p_body)>5000 then return jsonb_build_object('ok',false,'message','Текст должен содержать от 1 до 5000 символов.'); end if;
  insert into public.today_social_channel_posts(channel_id,author_id,title,body) values(p_channel_id,v_uid,left(trim(coalesce(p_title,'')),140),trim(p_body)) returning * into v_post;
  return jsonb_build_object('ok',true,'post',jsonb_build_object('id',v_post.id,'title',v_post.title,'body',v_post.body,'created_at',v_post.created_at),'message','Пост опубликован внутри канала.');
end;
$$;

create or replace function public.today_social_create_direct_chat(p_username text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_me uuid:=auth.uid(); v_target uuid; v_allow boolean; v_a uuid; v_b uuid; v_chat public.today_social_chats%rowtype;
begin
  if v_me is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  select p.id into v_target from public.profiles p where lower(regexp_replace(coalesce(to_jsonb(p)->>'username',''),'^@',''))=lower(regexp_replace(trim(coalesce(p_username,'')),'^@','')) limit 1;
  if v_target is null then return jsonb_build_object('ok',false,'message','Пользователь не найден.'); end if;
  if v_target=v_me then return jsonb_build_object('ok',false,'message','Нельзя написать самому себе.'); end if;
  if exists(select 1 from public.today_social_user_blocks b where (b.blocker_id=v_me and b.blocked_id=v_target) or (b.blocker_id=v_target and b.blocked_id=v_me)) then return jsonb_build_object('ok',false,'message','Один из пользователей заблокировал другого.'); end if;
  select coalesce(s.allow_direct_messages,true) into v_allow from (select 1) x left join public.today_social_settings s on s.user_id=v_target;
  if not coalesce(v_allow,true) then return jsonb_build_object('ok',false,'message','Пользователь отключил входящие личные сообщения.'); end if;
  v_a:=least(v_me,v_target); v_b:=greatest(v_me,v_target);
  select * into v_chat from public.today_social_chats c where c.type='direct' and c.member_a=v_a and c.member_b=v_b limit 1;
  if v_chat.id is null then
    insert into public.today_social_chats(type,title,created_by,member_a,member_b) values('direct','',v_me,v_a,v_b) returning * into v_chat;
    insert into public.today_social_chat_members(chat_id,user_id,role) values(v_chat.id,v_a,'member'),(v_chat.id,v_b,'member') on conflict do nothing;
  end if;
  return jsonb_build_object('ok',true,'chat',jsonb_build_object('id',v_chat.id,'type',v_chat.type,'title',v_chat.title),'message','Диалог готов.');
end;
$$;

create or replace function public.today_social_create_group_chat(p_title text,p_usernames text[])
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_targets uuid[]; v_chat public.today_social_chats%rowtype; v_missing boolean; v_disallowed boolean;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  if char_length(trim(coalesce(p_title,'')))<2 or char_length(p_title)>100 then return jsonb_build_object('ok',false,'message','Название группы: от 2 до 100 символов.'); end if;
  if coalesce(cardinality(p_usernames),0)=0 then return jsonb_build_object('ok',false,'message','Для группового чата укажи хотя бы одного участника помимо себя.'); end if;
  select array_agg(distinct p.id) into v_targets from public.profiles p
  where p.id<>v_uid and lower(regexp_replace(coalesce(to_jsonb(p)->>'username',''),'^@','')) in (select lower(regexp_replace(trim(x.username),'^@','')) from unnest(p_usernames) as x(username) where trim(x.username)<>'');
  if coalesce(cardinality(v_targets),0)=0 then return jsonb_build_object('ok',false,'message','Ни один указанный пользователь не найден.'); end if;
  select exists(select 1 from unnest(v_targets) t(uid) where not coalesce((select s.allow_group_invites from public.today_social_settings s where s.user_id=t.uid),true)) into v_disallowed;
  if v_disallowed then return jsonb_build_object('ok',false,'message','Кто-то из приглашённых отключил приглашения в групповые чаты.'); end if;
  if exists(select 1 from unnest(v_targets) t(uid) join public.today_social_user_blocks b on (b.blocker_id=v_uid and b.blocked_id=t.uid) or (b.blocker_id=t.uid and b.blocked_id=v_uid)) then return jsonb_build_object('ok',false,'message','Нельзя создать группу: один из участников заблокирован.'); end if;
  insert into public.today_social_chats(type,title,created_by) values('group',trim(p_title),v_uid) returning * into v_chat;
  insert into public.today_social_chat_members(chat_id,user_id,role) values(v_chat.id,v_uid,'owner') on conflict do nothing;
  insert into public.today_social_chat_members(chat_id,user_id,role) select v_chat.id,t.uid,'member' from unnest(v_targets) t(uid) on conflict do nothing;
  return jsonb_build_object('ok',true,'chat',jsonb_build_object('id',v_chat.id,'type',v_chat.type,'title',v_chat.title),'member_count',cardinality(v_targets)+1,'message','Групповой чат создан.');
end;
$$;

create or replace function public.today_social_invite_group_members(p_chat_id uuid,p_usernames text[])
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_type text; v_targets uuid[]; v_disallowed boolean; v_added integer:=0;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  select c.type into v_type from public.today_social_chats c where c.id=p_chat_id;
  if v_type is distinct from 'group' then return jsonb_build_object('ok',false,'message','Приглашать можно только в групповой чат.'); end if;
  if not exists(select 1 from public.today_social_chat_members m where m.chat_id=p_chat_id and m.user_id=v_uid) then return jsonb_build_object('ok',false,'message','Ты не участник этой группы.'); end if;
  select array_agg(distinct p.id) into v_targets from public.profiles p where p.id<>v_uid and lower(regexp_replace(coalesce(to_jsonb(p)->>'username',''),'^@','')) in (select lower(regexp_replace(trim(x.username),'^@','')) from unnest(coalesce(p_usernames,array[]::text[])) as x(username) where trim(x.username)<>'');
  if coalesce(cardinality(v_targets),0)=0 then return jsonb_build_object('ok',false,'message','Новых пользователей не найдено.'); end if;
  select exists(select 1 from unnest(v_targets) t(uid) where not coalesce((select s.allow_group_invites from public.today_social_settings s where s.user_id=t.uid),true)) into v_disallowed;
  if v_disallowed then return jsonb_build_object('ok',false,'message','Кто-то из приглашённых отключил приглашения в групповые чаты.'); end if;
  if exists(select 1 from unnest(v_targets) t(uid) join public.today_social_user_blocks b on (b.blocker_id=v_uid and b.blocked_id=t.uid) or (b.blocker_id=t.uid and b.blocked_id=v_uid)) then return jsonb_build_object('ok',false,'message','Приглашение заблокированному пользователю недоступно.'); end if;
  insert into public.today_social_chat_members(chat_id,user_id,role) select p_chat_id,t.uid,'member' from unnest(v_targets) t(uid) on conflict do nothing;
  get diagnostics v_added=row_count;
  return jsonb_build_object('ok',true,'added',v_added,'message','Приглашения обработаны.');
end;
$$;

create or replace function public.today_social_ensure_global_chat()
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_chat public.today_social_chats%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  begin
    insert into public.today_social_chats(type,title,created_by,is_global) values('global','Общий чат',auth.uid(),true);
  exception when unique_violation then null;
  end;
  select * into v_chat from public.today_social_chats where is_global=true limit 1;
  return jsonb_build_object('ok',true,'chat',jsonb_build_object('id',v_chat.id,'type','global','title','Общий чат'));
end;
$$;

create or replace function public.today_social_list_chats()
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_chats jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  perform public.today_social_ensure_global_chat();
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'type',q.type,'title',q.display_title,'last_body',q.last_body,'last_at',q.last_at,'unread_count',q.unread_count,'member_count',q.member_count) order by q.sort_at desc),'[]'::jsonb)
    into v_chats from (
      select c.id,c.type,
        case when c.type='global' then 'Общий чат' when c.type='direct' then coalesce(o.name,'Личный чат') else c.title end display_title,
        lm.body last_body,lm.created_at last_at,
        (select count(*)::int from public.today_social_chat_messages unread where unread.chat_id=c.id and unread.sender_id<>v_uid and unread.created_at>coalesce(r.last_read_at,'epoch'::timestamptz)) unread_count,
        (select count(*)::int from public.today_social_chat_members cm2 where cm2.chat_id=c.id) member_count,
        coalesce(lm.created_at,c.updated_at,c.created_at) sort_at
      from public.today_social_chats c
      left join public.today_social_chat_reads r on r.chat_id=c.id and r.user_id=v_uid
      left join lateral (select m.body,m.created_at,m.sender_id from public.today_social_chat_messages m where m.chat_id=c.id order by m.created_at desc limit 1) lm on true
      left join lateral (select coalesce(to_jsonb(p)->>'display_name',to_jsonb(p)->>'nickname',to_jsonb(p)->>'username','Участник') name from public.today_social_chat_members cm join public.profiles p on p.id=cm.user_id where cm.chat_id=c.id and cm.user_id<>v_uid order by cm.joined_at limit 1) o on true
      where c.is_global or exists(select 1 from public.today_social_chat_members cm where cm.chat_id=c.id and cm.user_id=v_uid)
    ) q;
  return jsonb_build_object('ok',true,'chats',v_chats);
end;
$$;

create or replace function public.today_social_get_chat_messages(p_chat_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_global boolean; v_messages jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  select c.is_global into v_global from public.today_social_chats c where c.id=p_chat_id;
  if v_global is null then return jsonb_build_object('ok',false,'message','Чат не найден.'); end if;
  if not v_global and not exists(select 1 from public.today_social_chat_members m where m.chat_id=p_chat_id and m.user_id=v_uid) then return jsonb_build_object('ok',false,'message','Нет доступа к этому чату.'); end if;
  if exists(select 1 from public.today_social_chats c where c.id=p_chat_id and c.type='direct') and exists(
    select 1 from public.today_social_chats c join public.today_social_user_blocks b on (b.blocker_id=c.member_a and b.blocked_id=c.member_b) or (b.blocker_id=c.member_b and b.blocked_id=c.member_a) where c.id=p_chat_id and ((b.blocker_id=v_uid) or (b.blocked_id=v_uid))
  ) then return jsonb_build_object('ok',false,'message','Диалог недоступен из-за блокировки.'); end if;
  insert into public.today_social_chat_reads(user_id,chat_id,last_read_at) values(v_uid,p_chat_id,now()) on conflict(user_id,chat_id) do update set last_read_at=excluded.last_read_at;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'sender_id',q.sender_id,'sender_name',q.sender_name,'sender_username',q.sender_username,'body',q.body,'created_at',q.created_at) order by q.created_at asc),'[]'::jsonb)
    into v_messages from (
      select m.id,m.sender_id,m.body,m.created_at,coalesce(to_jsonb(p)->>'display_name',to_jsonb(p)->>'nickname',to_jsonb(p)->>'username','Участник') sender_name,coalesce(to_jsonb(p)->>'username','') sender_username
      from (select * from public.today_social_chat_messages m0 where m0.chat_id=p_chat_id order by m0.created_at desc limit 120) m join public.profiles p on p.id=m.sender_id
    ) q;
  return jsonb_build_object('ok',true,'messages',v_messages);
end;
$$;

create or replace function public.today_social_send_chat_message(p_chat_id uuid,p_body text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_chat public.today_social_chats%rowtype; v_target uuid; v_allow boolean; v_muted timestamptz; v_strikes integer; v_new integer; v_reason text; v_until timestamptz; v_message public.today_social_chat_messages%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  if char_length(trim(coalesce(p_body,'')))<1 or char_length(p_body)>3000 then return jsonb_build_object('ok',false,'message','Сообщение должно содержать от 1 до 3000 символов.'); end if;
  select * into v_chat from public.today_social_chats where id=p_chat_id;
  if v_chat.id is null then return jsonb_build_object('ok',false,'message','Чат не найден.'); end if;
  if not v_chat.is_global and not exists(select 1 from public.today_social_chat_members m where m.chat_id=p_chat_id and m.user_id=v_uid) then return jsonb_build_object('ok',false,'message','Ты не участник этого чата.'); end if;
  if v_chat.type='direct' then
    v_target:=case when v_chat.member_a=v_uid then v_chat.member_b else v_chat.member_a end;
    if exists(select 1 from public.today_social_user_blocks b where (b.blocker_id=v_uid and b.blocked_id=v_target) or (b.blocker_id=v_target and b.blocked_id=v_uid)) then return jsonb_build_object('ok',false,'message','Отправка недоступна из-за блокировки.'); end if;
    select coalesce(s.allow_direct_messages,true) into v_allow from (select 1) x left join public.today_social_settings s on s.user_id=v_target;
    if not coalesce(v_allow,true) then return jsonb_build_object('ok',false,'message','Пользователь отключил входящие личные сообщения.'); end if;
  end if;
  select muted_until into v_muted from public.today_social_moderation_state where user_id=v_uid;
  if v_muted is not null and v_muted>now() then return jsonb_build_object('ok',false,'muted_until',v_muted,'message','Отправка сообщений и публикаций ограничена до '||to_char(v_muted at time zone 'Europe/Moscow','DD.MM.YYYY HH24:MI')||' МСК.'); end if;
  if exists(select 1 from public.today_social_chat_messages m where m.chat_id=p_chat_id and m.sender_id=v_uid and m.created_at>now()-interval '1.3 seconds') then return jsonb_build_object('ok',false,'message','Слишком быстро. Подожди секунду.'); end if;
  if v_chat.is_global then
    v_reason:=public.today_social_detect_violation(trim(p_body));
    if v_reason is not null then
      insert into public.today_social_moderation_state(user_id,strike_count) values(v_uid,0) on conflict(user_id) do nothing;
      select strike_count into v_strikes from public.today_social_moderation_state where user_id=v_uid for update;
      v_new:=coalesce(v_strikes,0)+1;
      v_until:=now()+case when v_new=1 then interval '30 minutes' when v_new=2 then interval '1 day' else interval '7 days' end;
      update public.today_social_moderation_state set strike_count=v_new,muted_until=v_until,last_violation_at=now(),updated_at=now() where user_id=v_uid;
      insert into public.today_social_moderation_events(user_id,chat_id,violation_code,strike_number,muted_until) values(v_uid,p_chat_id,v_reason,v_new,v_until);
      return jsonb_build_object('ok',false,'moderated',true,'strike',v_new,'muted_until',v_until,
        'message',case when v_new=1 then 'Нарушение правил. Отправка сообщений и публикаций заблокирована на 30 минут.' when v_new=2 then 'Повторное нарушение. Отправка сообщений и публикаций заблокирована на 24 часа.' else 'Повторное нарушение. Отправка сообщений и публикаций заблокирована на 7 суток.' end);
    end if;
  end if;
  insert into public.today_social_chat_messages(chat_id,sender_id,body) values(p_chat_id,v_uid,trim(p_body)) returning * into v_message;
  update public.today_social_chats set updated_at=now() where id=p_chat_id;
  return jsonb_build_object('ok',true,'message',jsonb_build_object('id',v_message.id,'sender_id',v_message.sender_id,'body',v_message.body,'created_at',v_message.created_at));
end;
$$;

create or replace function public.today_social_promote_profile_post(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_post public.today_social_profile_posts%rowtype; v_today date:=(now() at time zone 'Europe/Moscow')::date; v_coins bigint; v_muted timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  select muted_until into v_muted from public.today_social_moderation_state where user_id=v_uid;
  if v_muted is not null and v_muted>now() then return jsonb_build_object('ok',false,'muted_until',v_muted,'message','Продвижение недоступно до окончания ограничения публикаций.'); end if;
  select * into v_post from public.today_social_profile_posts where id=p_post_id and author_id=v_uid;
  if v_post.id is null then return jsonb_build_object('ok',false,'message','Свой пост не найден.'); end if;
  if v_post.visibility<>'public' then return jsonb_build_object('ok',false,'message','Для общей ленты пост должен быть публичным.'); end if;
  perform 1 from public.profiles where id=v_uid for update;
  if exists(select 1 from public.today_social_promotions where author_id=v_uid and day_date=v_today) then return jsonb_build_object('ok',false,'already_used',true,'message','Сегодня ты уже продвигал один пост. Следующая возможность появится после полуночи по Москве.'); end if;
  select coalesce(coins,0)::bigint into v_coins from public.profiles where id=v_uid;
  if coalesce(v_coins,0)<250 then return jsonb_build_object('ok',false,'message','Нужно 250 золотых монет.'); end if;
  update public.profiles set coins=coalesce(coins,0)-250 where id=v_uid returning coalesce(coins,0)::bigint into v_coins;
  insert into public.today_social_promotions(post_id,author_id,day_date,price_coins) values(v_post.id,v_uid,v_today,250);
  return jsonb_build_object('ok',true,'coins',v_coins,'day_date',v_today,'message','Пост опубликован в «Что оставили сегодня» до полуночи.');
end;
$$;

create or replace function public.today_social_get_promoted_posts()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_posts jsonb; v_today date:=(now() at time zone 'Europe/Moscow')::date;
begin
  select coalesce(jsonb_agg(jsonb_build_object('promotion_id',q.promotion_id,'post_id',q.post_id,'author_id',q.author_id,'username',q.username,'author_name',q.author_name,'avatar_url',q.avatar_url,'title',q.title,'body',q.body,'created_at',q.created_at,'promoted_at',q.promoted_at) order by q.promoted_at desc),'[]'::jsonb)
  into v_posts from (
    select pr.id promotion_id,p.id post_id,p.author_id,coalesce(to_jsonb(a)->>'username','') username,coalesce(to_jsonb(a)->>'display_name',to_jsonb(a)->>'nickname',to_jsonb(a)->>'username','Участник') author_name,coalesce(to_jsonb(a)->>'avatar_url',to_jsonb(a)->>'photo_url','') avatar_url,p.title,p.body,p.created_at,pr.created_at promoted_at
    from public.today_social_promotions pr join public.today_social_profile_posts p on p.id=pr.post_id join public.profiles a on a.id=p.author_id
    where pr.day_date=v_today and p.visibility='public'
  ) q;
  return jsonb_build_object('ok',true,'day_date',v_today,'posts',v_posts);
end;
$$;

-- Publish-time moderation is server-authoritative across personal and channel posts.
create or replace function public.today_social_report_item(p_content_type text,p_content_id text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  if p_content_type not in ('profile','profile_post','channel','channel_post','chat_message','user') then return jsonb_build_object('ok',false,'message','Неизвестный тип жалобы.'); end if;
  if char_length(trim(coalesce(p_reason,'')))<3 or char_length(p_reason)>500 then return jsonb_build_object('ok',false,'message','Опиши причину жалобы (3–500 символов).'); end if;
  if (select count(*) from public.today_social_reports r where r.reporter_id=auth.uid() and r.created_at>now()-interval '1 hour')>=10 then return jsonb_build_object('ok',false,'message','Лимит жалоб на час достигнут.'); end if;
  insert into public.today_social_reports(reporter_id,content_type,content_id,reason) values(auth.uid(),p_content_type,left(trim(p_content_id),100),trim(p_reason));
  return jsonb_build_object('ok',true,'message','Жалоба отправлена модерации.');
end;
$$;

-- Keep older TODAY's existing daily publication path subject to the same server-side posting ban.
create or replace function public.today_social_guard_legacy_publication()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_until timestamptz;
begin
  if new.user_id is not null then
    select s.muted_until into v_until from public.today_social_moderation_state s where s.user_id=new.user_id;
    if v_until is not null and v_until>now() then
      raise exception using errcode='P0001', message='TODAY_SOCIAL_MUTED: публикации временно запрещены до '||to_char(v_until at time zone 'Europe/Moscow','DD.MM.YYYY HH24:MI')||' МСК';
    end if;
  end if;
  return new;
end;
$$;
do $$
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='today_publications' and c.relkind in ('r','p')) then
    execute 'drop trigger if exists today_social_legacy_publication_mute on public.today_publications';
    execute 'create trigger today_social_legacy_publication_mute before insert or update on public.today_publications for each row execute function public.today_social_guard_legacy_publication()';
  end if;
end;
$$;

-- Grant only this new RPC family. Core TODAY and shop permissions are not modified.
do $$
declare r record;
begin
  for r in select p.proname,p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'today_social_%' loop
    execute format('revoke execute on function %s from public, anon',r.sig);
    if r.proname not in ('today_social_profile_json','today_social_is_friend','today_social_detect_violation','today_social_ensure_global_chat','today_social_guard_legacy_publication') then
      execute format('grant execute on function %s to authenticated',r.sig);
    end if;
  end loop;
end;
$$;
grant execute on function public.today_social_get_promoted_posts() to anon,authenticated;
grant execute on function public.today_social_profile_page(uuid) to anon,authenticated;

commit;
