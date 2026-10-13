-- TODAY PERSONALIZATION V67
-- Additive notification inbox, unread counts, universal search and user-interest preferences.
-- No existing rows are removed and no existing data tables are rewritten.
begin;

create table if not exists public.today_v67_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('comment','reply','like','repost','friend_request','friend_accepted','message','poll_vote')),
  title text not null check (char_length(title) between 1 and 140),
  body text not null default '' check (char_length(body) <= 320),
  href text not null default '/',
  object_type text not null default 'social',
  object_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists today_v67_notifications_recipient_created_idx
  on public.today_v67_notifications(recipient_id,created_at desc);
create index if not exists today_v67_notifications_unread_idx
  on public.today_v67_notifications(recipient_id,created_at desc) where read_at is null;
alter table public.today_v67_notifications enable row level security;
revoke all on table public.today_v67_notifications from public,anon,authenticated;

create table if not exists public.today_v67_user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  interests text[] not null default array['Истории','Фото','Музыка']::text[],
  feed_mode text not null default 'for_you' check (feed_mode in ('for_you','latest','popular')),
  updated_at timestamptz not null default now()
);
alter table public.today_v67_user_preferences enable row level security;
revoke all on table public.today_v67_user_preferences from public,anon,authenticated;

create or replace function public.today_v67_emit_notification(
  p_recipient uuid,
  p_actor uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_href text,
  p_object_type text,
  p_object_id text,
  p_dedupe_key text,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if p_recipient is null or (p_actor is not null and p_recipient=p_actor) then return; end if;
  if p_event_type not in ('comment','reply','like','repost','friend_request','friend_accepted','message','poll_vote') then return; end if;
  -- Notification destinations are local routes only; never store arbitrary external URLs.
  if coalesce(p_href,'') !~ '^(/|#)' or coalesce(p_dedupe_key,'')='' then return; end if;
  insert into public.today_v67_notifications(
    recipient_id,actor_id,event_type,title,body,href,object_type,object_id,dedupe_key,metadata
  ) values (
    p_recipient,p_actor,p_event_type,left(p_title,140),left(coalesce(p_body,''),320),left(p_href,500),
    coalesce(p_object_type,'social'),left(coalesce(p_object_id,''),160),p_dedupe_key,
    case when jsonb_typeof(p_metadata)='object' then p_metadata else '{}'::jsonb end
  ) on conflict(dedupe_key) do nothing;
end;
$$;

create or replace function public.today_v67_on_content_comment()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_owner uuid;
  v_parent_author uuid;
  v_event text;
  v_title text;
  v_href text:='/profile.html';
begin
  if new.deleted_at is not null then return new; end if;
  if new.source_type='profile' then
    select p.author_id into v_owner from public.today_social_profile_posts p where p.id::text=new.source_id limit 1;
  elsif new.source_type='media' then
    select m.user_id into v_owner from public.today_media_items m where m.id::text=new.source_id limit 1;
  elsif new.source_type='daily_user' then
    select d.user_id into v_owner from public.today_publications d
      where d.id::text=new.source_id and d.day_date=(now() at time zone 'Europe/Moscow')::date limit 1;
  end if;
  v_event:=case when new.parent_comment_id is null then 'comment' else 'reply' end;
  v_title:=case when new.parent_comment_id is null then 'Новый комментарий' else 'Новый ответ' end;
  perform public.today_v67_emit_notification(v_owner,new.user_id,v_event,v_title,
    'К твоей публикации добавили комментарий.',v_href,new.source_type,new.source_id,
    'comment:'||new.id::text||':'||coalesce(v_owner::text,'none'),jsonb_build_object('comment_id',new.id,'source_type',new.source_type,'source_id',new.source_id));
  if new.parent_comment_id is not null then
    select c.user_id into v_parent_author from public.today_v65_content_comments c
      where c.id=new.parent_comment_id and c.deleted_at is null limit 1;
    if v_parent_author is not null and v_parent_author is distinct from v_owner then
      perform public.today_v67_emit_notification(v_parent_author,new.user_id,'reply','Ответ на твой комментарий',
        'На твой комментарий ответили.',v_href,new.source_type,new.source_id,
        'reply:'||new.id::text||':'||v_parent_author::text,jsonb_build_object('comment_id',new.id,'parent_comment_id',new.parent_comment_id,'source_type',new.source_type,'source_id',new.source_id));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists today_v67_notify_content_comment on public.today_v65_content_comments;
create trigger today_v67_notify_content_comment after insert on public.today_v65_content_comments
for each row execute function public.today_v67_on_content_comment();

create or replace function public.today_v67_on_content_action()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_owner uuid; v_created timestamptz; v_href text:='/profile.html';
begin
  if new.action<>'like' then return new; end if;
  if new.source_type='profile' then
    select p.author_id into v_owner from public.today_social_profile_posts p where p.id::text=new.source_id limit 1;
  elsif new.source_type='media' then
    select m.user_id into v_owner from public.today_media_items m where m.id::text=new.source_id limit 1;
  elsif new.source_type='daily_user' then
    select d.user_id into v_owner from public.today_publications d where d.id::text=new.source_id and d.day_date=(now() at time zone 'Europe/Moscow')::date limit 1;
  end if;
  v_created:=coalesce(new.created_at,now());
  perform public.today_v67_emit_notification(v_owner,new.user_id,'like','Новая отметка «Нравится»',
    'К твоей публикации проявили интерес.',v_href,new.source_type,new.source_id,
    'like:'||new.source_type||':'||new.source_id||':'||new.user_id::text||':'||to_char(v_created at time zone 'UTC','YYYYMMDDHH24MISSUS'),
    jsonb_build_object('source_type',new.source_type,'source_id',new.source_id));
  return new;
end;
$$;
drop trigger if exists today_v67_notify_content_action on public.today_v65_content_actions;
create trigger today_v67_notify_content_action after insert on public.today_v65_content_actions
for each row execute function public.today_v67_on_content_action();

create or replace function public.today_v67_on_content_repost()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_owner uuid;
begin
  if new.source_type='profile' then
    select p.author_id into v_owner from public.today_social_profile_posts p where p.id::text=new.source_id limit 1;
  elsif new.source_type='media' then
    select m.user_id into v_owner from public.today_media_items m where m.id::text=new.source_id limit 1;
  elsif new.source_type='daily_user' then
    select d.user_id into v_owner from public.today_publications d where d.id::text=new.source_id and d.day_date=(now() at time zone 'Europe/Moscow')::date limit 1;
  end if;
  perform public.today_v67_emit_notification(v_owner,new.user_id,'repost','Твоей публикацией поделились',
    case when char_length(coalesce(new.caption,''))>0 then left(new.caption,240) else 'Твой материал поделились в TODAY.' end,
    '/profile.html',new.source_type,new.source_id,'repost:'||new.id::text||':'||coalesce(v_owner::text,'none'),
    jsonb_build_object('source_type',new.source_type,'source_id',new.source_id));
  return new;
end;
$$;
drop trigger if exists today_v67_notify_content_repost on public.today_v65_content_reposts;
create trigger today_v67_notify_content_repost after insert on public.today_v65_content_reposts
for each row execute function public.today_v67_on_content_repost();

create or replace function public.today_v67_on_friend_change()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if tg_op='INSERT' then
    if new.status='pending' then
      perform public.today_v67_emit_notification(new.addressee_id,new.requester_id,'friend_request','Новая заявка в друзья',
        'Кто-то хочет добавить тебя в друзья.','/?open=friends','friend_request',new.requester_id::text,
        'friend-request:'||new.id::text||':'||new.addressee_id::text,jsonb_build_object('friendship_id',new.id));
    end if;
  elsif tg_op='UPDATE' then
    if old.status is distinct from new.status and new.status='accepted' then
      perform public.today_v67_emit_notification(new.requester_id,new.addressee_id,'friend_accepted','Заявка принята',
        'Теперь вы друзья в TODAY.','/?open=friends','friendship',new.id::text,
        'friend-accepted:'||new.id::text||':'||new.requester_id::text,jsonb_build_object('friendship_id',new.id));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists today_v67_notify_friend_change on public.today_social_friends;
create trigger today_v67_notify_friend_change after insert or update on public.today_social_friends
for each row execute function public.today_v67_on_friend_change();

create or replace function public.today_v67_on_chat_message()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare r record; v_title text;
begin
  -- The shared global room is intentionally excluded to prevent one public message
  -- from creating an inbox alert for every member of TODAY.
  if exists(select 1 from public.today_social_chats c where c.id=new.chat_id and c.type='global') then
    return new;
  end if;
  select coalesce(nullif(to_jsonb(p)->>'display_name',''),nullif(to_jsonb(p)->>'username',''),'Участник')
    into v_title from public.profiles p where p.id=new.sender_id;
  for r in select cm.user_id from public.today_social_chat_members cm
    where cm.chat_id=new.chat_id and cm.user_id<>new.sender_id
  loop
    perform public.today_v67_emit_notification(r.user_id,new.sender_id,'message','Новое сообщение',
      coalesce(v_title,'Участник')||' написал(а) тебе.','/?open=chats','chat',new.chat_id::text,
      'message:'||new.id::text||':'||r.user_id::text,jsonb_build_object('chat_id',new.chat_id));
  end loop;
  return new;
end;
$$;
drop trigger if exists today_v67_notify_chat_message on public.today_social_chat_messages;
create trigger today_v67_notify_chat_message after insert on public.today_social_chat_messages
for each row execute function public.today_v67_on_chat_message();

create or replace function public.today_v67_on_poll_vote()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_owner uuid;
begin
  select p.author_id into v_owner from public.today_social_profile_posts p where p.id=new.post_id;
  perform public.today_v67_emit_notification(v_owner,new.user_id,'poll_vote','Голос в твоём опросе',
    'Кто-то проголосовал в твоём опросе.','/profile.html','profile_poll',new.post_id::text,
    'poll-vote:'||new.post_id::text||':'||new.user_id::text||':'||to_char(coalesce(new.created_at,now()) at time zone 'UTC','YYYYMMDDHH24MISSUS'),
    jsonb_build_object('post_id',new.post_id,'option_index',new.option_index));
  return new;
end;
$$;
drop trigger if exists today_v67_notify_poll_vote on public.today_v65_profile_poll_votes;
create trigger today_v67_notify_poll_vote after insert on public.today_v65_profile_poll_votes
for each row execute function public.today_v67_on_poll_vote();

create or replace function public.today_v67_list_notifications(p_limit integer default 40,p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_limit integer:=least(greatest(coalesce(p_limit,40),1),100); v_items jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы открыть уведомления.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'event_type',q.event_type,'title',q.title,'body',q.body,'href',q.href,
    'object_type',q.object_type,'object_id',q.object_id,'metadata',q.metadata,
    'created_at',q.created_at,'read_at',q.read_at,
    'actor_id',q.actor_id,'actor_name',q.actor_name,'actor_avatar',q.actor_avatar
  ) order by q.created_at desc),'[]'::jsonb) into v_items
  from (
    select n.*,coalesce(nullif(to_jsonb(p)->>'display_name',''),nullif(to_jsonb(p)->>'username',''),'Участник') actor_name,
      coalesce(to_jsonb(p)->>'avatar_url',to_jsonb(p)->>'photo_url','') actor_avatar
    from public.today_v67_notifications n left join public.profiles p on p.id=n.actor_id
    where n.recipient_id=v_uid and (p_before is null or n.created_at<p_before)
    order by n.created_at desc limit v_limit
  ) q;
  return jsonb_build_object('ok',true,'items',v_items,'unread_count',(
    select count(*) from public.today_v67_notifications n where n.recipient_id=v_uid and n.read_at is null
  ));
end;
$$;

create or replace function public.today_v67_mark_notification_read(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_count integer;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  update public.today_v67_notifications set read_at=coalesce(read_at,now()) where id=p_id and recipient_id=v_uid;
  get diagnostics v_count=row_count;
  return jsonb_build_object('ok',true,'updated',v_count>0);
end;
$$;

create or replace function public.today_v67_mark_all_notifications_read()
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_count integer;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  update public.today_v67_notifications set read_at=now() where recipient_id=v_uid and read_at is null;
  get diagnostics v_count=row_count;
  return jsonb_build_object('ok',true,'updated',v_count);
end;
$$;

create or replace function public.today_v67_get_unread_counts()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_notes integer:=0; v_messages integer:=0; v_friends integer:=0;
begin
  if v_uid is null then return jsonb_build_object('ok',true,'notifications',0,'messages',0,'friend_requests',0,'total',0); end if;
  select count(*)::integer into v_notes from public.today_v67_notifications where recipient_id=v_uid and read_at is null;
  select count(*)::integer into v_friends from public.today_social_friends where addressee_id=v_uid and status='pending';
  select count(*)::integer into v_messages
  from public.today_social_chat_members cm
  join public.today_social_chats ch on ch.id=cm.chat_id and ch.type<>'global'
  join public.today_social_chat_messages m on m.chat_id=cm.chat_id and m.sender_id<>v_uid
  left join public.today_social_chat_reads r on r.user_id=v_uid and r.chat_id=cm.chat_id
  where cm.user_id=v_uid and m.created_at>coalesce(r.last_read_at,'epoch'::timestamptz);
  return jsonb_build_object('ok',true,'notifications',v_notes,'messages',v_messages,'friend_requests',v_friends,'total',v_notes+v_messages+v_friends);
end;
$$;

create or replace function public.today_v67_get_preferences()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_row public.today_v67_user_preferences%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы синхронизировать интересы.'); end if;
  select * into v_row from public.today_v67_user_preferences where user_id=v_uid;
  if not found then return jsonb_build_object('ok',true,'interests',array['Истории','Фото','Музыка']::text[],'feed_mode','for_you'); end if;
  return jsonb_build_object('ok',true,'interests',v_row.interests,'feed_mode',v_row.feed_mode,'updated_at',v_row.updated_at);
end;
$$;

create or replace function public.today_v67_save_preferences(p_interests text[] default null,p_feed_mode text default 'for_you')
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_uid uuid:=auth.uid(); v_interests text[]; v_mode text:=coalesce(p_feed_mode,'for_you');
  v_allowed text[]:=array['Песни','Истории','Факты','Тренды','Моменты','Следы','Вопросы','Фото','Клипы','Музыка','Каналы']::text[];
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт, чтобы сохранить интересы.'); end if;
  if v_mode not in ('for_you','latest','popular') then v_mode:='for_you'; end if;
  select coalesce(array_agg(x),array[]::text[]) into v_interests
    from (select distinct trim(t.value) x from unnest(coalesce(p_interests,array[]::text[])) as t(value)
      where trim(t.value)=any(v_allowed) order by x limit 8) q;
  insert into public.today_v67_user_preferences(user_id,interests,feed_mode,updated_at)
    values(v_uid,v_interests,v_mode,now())
    on conflict(user_id) do update set interests=excluded.interests,feed_mode=excluded.feed_mode,updated_at=now();
  return jsonb_build_object('ok',true,'interests',v_interests,'feed_mode',v_mode,'updated_at',now());
end;
$$;

create or replace function public.today_v67_global_search(p_query text,p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_query text:=left(trim(coalesce(p_query,'')),100); v_limit integer:=least(greatest(coalesce(p_limit,40),1),50); v_items jsonb;
begin
  if char_length(v_query)<2 then return jsonb_build_object('ok',true,'items','[]'::jsonb,'message','Введи минимум два символа.'); end if;
  with candidates as (
    select 'person'::text result_type,p.id::text result_id,'person'::text source_type,
      coalesce(nullif(to_jsonb(p)->>'display_name',''),nullif(to_jsonb(p)->>'nickname',''),nullif(to_jsonb(p)->>'full_name',''),nullif(to_jsonb(p)->>'username',''),'Участник') title,
      left(coalesce('@'||nullif(to_jsonb(p)->>'username','')||' · ','')||coalesce(to_jsonb(p)->>'bio','Участник TODAY'),240) snippet,
      p.id author_id,coalesce(nullif(to_jsonb(p)->>'display_name',''),nullif(to_jsonb(p)->>'username',''),'Участник') author_name,
      coalesce(to_jsonb(p)->>'avatar_url',to_jsonb(p)->>'photo_url','') avatar_url,null::timestamptz created_at,
      case when position(lower(v_query) in lower(coalesce(to_jsonb(p)->>'username',''))) = 1 then 12 else 7 end score
    from public.profiles p left join public.today_social_settings st on st.user_id=p.id
    where position(lower(v_query) in lower(concat_ws(' ',to_jsonb(p)->>'display_name',to_jsonb(p)->>'nickname',to_jsonb(p)->>'username',to_jsonb(p)->>'bio'))) > 0
      and (p.id=v_uid or (coalesce(st.allow_profile_visits,true) and (
        coalesce(st.profile_visibility,'public')='public' or
        (coalesce(st.profile_visibility,'public')='friends' and v_uid is not null and public.today_social_is_friend(v_uid,p.id))
      )))
      and not exists(select 1 from public.today_social_user_blocks b where v_uid is not null and ((b.blocker_id=v_uid and b.blocked_id=p.id) or (b.blocker_id=p.id and b.blocked_id=v_uid)))
    union all
    select 'post','daily:'||d.id::text,'daily_user',
      coalesce(nullif(left(coalesce(to_jsonb(d)->>'title',''),140),''),case coalesce(to_jsonb(d)->>'kind','') when 'song' then 'Песня дня' when 'story' then 'История дня' when 'fact' then 'Факт дня' when 'trend' then 'Тренд дня' else 'Публикация дня' end),
      left(coalesce(to_jsonb(d)->>'body',''),240),d.user_id,
      coalesce(nullif(to_jsonb(p)->>'display_name',''),nullif(to_jsonb(p)->>'username',''),'Участник'),coalesce(to_jsonb(p)->>'avatar_url',''),d.created_at,8
    from public.today_publications d left join public.profiles p on p.id=d.user_id
    where d.day_date=(now() at time zone 'Europe/Moscow')::date
      and position(lower(v_query) in lower(concat_ws(' ',to_jsonb(d)->>'title',to_jsonb(d)->>'body',to_jsonb(d)->>'kind'))) > 0
      and public.today_v65_content_can_view('daily_user',d.id::text,v_uid)
    union all
    select 'post','demo:'||d.id::text,'daily_demo',
      case coalesce(to_jsonb(d)->>'kind','') when 'song' then 'Песня дня' when 'story' then 'История дня' when 'fact' then 'Факт дня' when 'trend' then 'Тренд дня' else 'Публикация дня' end,
      left(coalesce(to_jsonb(d)->>'body',''),240),null::uuid,coalesce(to_jsonb(d)->>'display_name','Участник TODAY'),coalesce(to_jsonb(d)->>'avatar_url',''),d.created_at,5
    from public.demo_contributions d
    where d.day_date=(now() at time zone 'Europe/Moscow')::date
      and position(lower(v_query) in lower(concat_ws(' ',to_jsonb(d)->>'body',to_jsonb(d)->>'kind',to_jsonb(d)->>'display_name'))) > 0
      and public.today_v65_content_can_view('daily_demo',d.id::text,v_uid)
    union all
    select 'post','profile:'||p.id::text,'profile',coalesce(nullif(p.title,''),'Запись на стене'),left(p.body,240),p.author_id,
      coalesce(nullif(to_jsonb(a)->>'display_name',''),nullif(to_jsonb(a)->>'username',''),'Участник'),coalesce(to_jsonb(a)->>'avatar_url',''),p.created_at,6
    from public.today_social_profile_posts p join public.profiles a on a.id=p.author_id
    where position(lower(v_query) in lower(concat_ws(' ',p.title,p.body))) > 0
      and public.today_v65_content_can_view('profile',p.id::text,v_uid)
    union all
    select 'channel',c.id::text,'channel',c.title,left(coalesce(c.description,''),240),c.owner_id,
      coalesce(nullif(to_jsonb(a)->>'display_name',''),nullif(to_jsonb(a)->>'username',''),'Участник'),coalesce(to_jsonb(a)->>'avatar_url',''),c.created_at,7
    from public.today_social_channels c join public.profiles a on a.id=c.owner_id
    where position(lower(v_query) in lower(concat_ws(' ',c.title,c.description))) > 0
      and (c.visibility='public' or exists(select 1 from public.today_social_channel_members cm where cm.channel_id=c.id and cm.user_id=v_uid))
      and not exists(select 1 from public.today_social_user_blocks b where v_uid is not null and ((b.blocker_id=v_uid and b.blocked_id=c.owner_id) or (b.blocker_id=c.owner_id and b.blocked_id=v_uid)))
    union all
    select 'media',m.id::text,'media',m.title,left(coalesce(m.description,''),240),m.user_id,
      coalesce(nullif(to_jsonb(a)->>'display_name',''),nullif(to_jsonb(a)->>'username',''),'Участник'),coalesce(to_jsonb(a)->>'avatar_url',''),m.created_at,
      case when m.media_type='video' then 10 when m.media_type='photo' then 9 else 8 end
    from public.today_media_items m join public.profiles a on a.id=m.user_id
    where position(lower(v_query) in lower(concat_ws(' ',m.title,m.description,m.media_type))) > 0
      and public.today_v65_content_can_view('media',m.id::text,v_uid)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'result_type',z.result_type,'result_id',z.result_id,'source_type',z.source_type,'title',z.title,
    'snippet',z.snippet,'author_id',z.author_id,'author_name',z.author_name,'avatar_url',z.avatar_url,
    'created_at',z.created_at,'score',z.score
  ) order by z.score desc,z.created_at desc nulls last),'[]'::jsonb) into v_items
  from (select * from candidates order by score desc,created_at desc nulls last limit v_limit) z;
  return jsonb_build_object('ok',true,'query',v_query,'items',v_items);
end;
$$;

-- Keep server-only tables inaccessible to direct client queries; the SECURITY DEFINER RPCs
-- above enforce recipient/owner checks and return only the caller's own records.
revoke all on function public.today_v67_emit_notification(uuid,uuid,text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.today_v67_on_content_comment() from public,anon,authenticated;
revoke all on function public.today_v67_on_content_action() from public,anon,authenticated;
revoke all on function public.today_v67_on_content_repost() from public,anon,authenticated;
revoke all on function public.today_v67_on_friend_change() from public,anon,authenticated;
revoke all on function public.today_v67_on_chat_message() from public,anon,authenticated;
revoke all on function public.today_v67_on_poll_vote() from public,anon,authenticated;
revoke all on function public.today_v67_list_notifications(integer,timestamptz) from public;
revoke all on function public.today_v67_mark_notification_read(uuid) from public;
revoke all on function public.today_v67_mark_all_notifications_read() from public;
revoke all on function public.today_v67_get_unread_counts() from public;
revoke all on function public.today_v67_get_preferences() from public;
revoke all on function public.today_v67_save_preferences(text[],text) from public;
revoke all on function public.today_v67_global_search(text,integer) from public;
grant execute on function public.today_v67_list_notifications(integer,timestamptz) to authenticated;
grant execute on function public.today_v67_mark_notification_read(uuid) to authenticated;
grant execute on function public.today_v67_mark_all_notifications_read() to authenticated;
grant execute on function public.today_v67_get_unread_counts() to authenticated;
grant execute on function public.today_v67_get_preferences() to authenticated;
grant execute on function public.today_v67_save_preferences(text[],text) to authenticated;
grant execute on function public.today_v67_global_search(text,integer) to anon,authenticated;

commit;
