-- TODAY MEDIA V66: private photo/video storage, albums, music links and media interactions.
-- Additive and re-runnable. Never alters existing user content.
begin;

create table if not exists public.today_media_albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  visibility text not null default 'private' check (visibility in ('public','friends','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists today_media_albums_owner_created_idx on public.today_media_albums(owner_id,created_at desc);
alter table public.today_media_albums enable row level security;
revoke all on table public.today_media_albums from public,anon,authenticated;
grant select on table public.today_media_albums to anon,authenticated;
grant insert,update,delete on table public.today_media_albums to authenticated;

create table if not exists public.today_media_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  album_id uuid references public.today_media_albums(id) on delete set null,
  media_type text not null check (media_type in ('photo','video','music')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  storage_path text,
  external_url text,
  mime_type text,
  file_size bigint check (file_size is null or file_size between 0 and 52428800),
  duration_seconds numeric(8,3),
  visibility text not null default 'public' check (visibility in ('public','friends','private','day')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint today_media_v66_kind_storage_check check (
    (media_type='music' and storage_path is null and external_url is not null and mime_type is null)
    or (media_type='photo' and storage_path is not null and external_url is null and mime_type='image/jpeg')
    or (media_type='video' and storage_path is not null and external_url is null and mime_type in ('video/mp4','video/webm') and (duration_seconds is null or duration_seconds between 0.001 and 60))
  ),
  constraint today_media_v66_external_url_check check (
    external_url is null or external_url ~* '^https://([a-z0-9-]+[.])*(youtube[.]com|youtu[.]be|spotify[.]com|soundcloud[.]com|yandex[.]ru|vk[.]com|music[.]apple[.]com|deezer[.]com)(/|[?#]|$)'
  ),
  constraint today_media_v66_day_expiry_check check (visibility <> 'day' or expires_at is not null)
);
create index if not exists today_media_items_type_created_idx on public.today_media_items(media_type,created_at desc);
create index if not exists today_media_items_owner_created_idx on public.today_media_items(user_id,created_at desc);
create index if not exists today_media_items_album_created_idx on public.today_media_items(album_id,created_at desc);
alter table public.today_media_items enable row level security;
revoke all on table public.today_media_items from public,anon,authenticated;
grant select on table public.today_media_items to anon,authenticated;
grant insert,update,delete on table public.today_media_items to authenticated;

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
  v_expires timestamptz;
  v_album_id uuid;
  v_album_visibility text;
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
  elsif p_source_type = 'media' then
    select m.user_id, m.visibility, m.expires_at, m.album_id into v_author, v_visibility, v_expires, v_album_id
    from public.today_media_items m where m.id::text = p_source_id limit 1;
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
    if v_album_id is not null then
      select a.visibility into v_album_visibility from public.today_media_albums a where a.id=v_album_id;
      if v_album_visibility='private' then return false; end if;
      if v_album_visibility='friends' and (p_viewer is null or not public.today_social_is_friend(p_viewer,v_author)) then return false; end if;
    end if;
    if v_visibility='public' then return true; end if;
    if v_visibility='day' then return v_expires is not null and v_expires > now(); end if;
    if v_visibility='friends' then return p_viewer is not null and public.today_social_is_friend(p_viewer,v_author); end if;
    return false;
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

create or replace function public.today_media_v66_can_view(p_media_id uuid)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select public.today_v65_content_can_view('media',p_media_id::text,auth.uid());
$$;

create or replace function public.today_media_v66_can_view_album(p_album_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_owner uuid; v_vis text; v_profile_vis text; v_visits boolean;
begin
  select a.owner_id,a.visibility into v_owner,v_vis from public.today_media_albums a where a.id=p_album_id;
  if not found then return false; end if;
  if v_uid is not null and v_uid=v_owner then return true; end if;
  if v_uid is not null and exists(select 1 from public.today_social_user_blocks b where (b.blocker_id=v_uid and b.blocked_id=v_owner) or (b.blocker_id=v_owner and b.blocked_id=v_uid)) then return false; end if;
  select coalesce(s.profile_visibility,'public'),coalesce(s.allow_profile_visits,true) into v_profile_vis,v_visits from (select 1) x left join public.today_social_settings s on s.user_id=v_owner;
  if not coalesce(v_visits,true) or coalesce(v_profile_vis,'public')='private' then return false; end if;
  if coalesce(v_profile_vis,'public')='friends' and (v_uid is null or not public.today_social_is_friend(v_uid,v_owner)) then return false; end if;
  if v_vis='public' then return true; end if;
  return v_vis='friends' and v_uid is not null and public.today_social_is_friend(v_uid,v_owner);
end;
$$;

create or replace function public.today_media_v66_prepare_item()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_owner uuid;
begin
  if new.album_id is not null then
    select a.owner_id into v_owner from public.today_media_albums a where a.id=new.album_id;
    if v_owner is null or v_owner is distinct from new.user_id then raise exception 'TODAY_MEDIA_ALBUM_OWNER: альбом принадлежит другому пользователю'; end if;
  end if;
  if tg_op='INSERT' then
    if new.visibility='day' then
      new.expires_at:=(((now() at time zone 'Europe/Moscow')::date + 1)::timestamp at time zone 'Europe/Moscow');
    else
      new.expires_at:=null;
    end if;
  elsif new.visibility is distinct from old.visibility then
    if new.visibility='day' then
      new.expires_at:=(((now() at time zone 'Europe/Moscow')::date + 1)::timestamp at time zone 'Europe/Moscow');
    else
      new.expires_at:=null;
    end if;
  else
    new.expires_at:=old.expires_at;
  end if;
  new.updated_at:=now();
  return new;
end;
$$;
drop trigger if exists today_media_v66_prepare_item_trigger on public.today_media_items;
create trigger today_media_v66_prepare_item_trigger before insert or update on public.today_media_items for each row execute function public.today_media_v66_prepare_item();

-- Extend V65's shared interaction APIs so media cards support the same likes, comments, bookmarks and reposts.
alter table public.today_v65_content_actions drop constraint if exists today_v65_content_actions_source_type_check;
alter table public.today_v65_content_actions add constraint today_v65_content_actions_source_type_check check (source_type in ('daily_user','daily_demo','profile','media'));
alter table public.today_v65_content_comments drop constraint if exists today_v65_content_comments_source_type_check;
alter table public.today_v65_content_comments add constraint today_v65_content_comments_source_type_check check (source_type in ('daily_user','daily_demo','profile','media'));
alter table public.today_v65_content_reposts drop constraint if exists today_v65_content_reposts_source_type_check;
alter table public.today_v65_content_reposts add constraint today_v65_content_reposts_source_type_check check (source_type in ('daily_user','daily_demo','profile','media'));

create or replace function public.today_v65_toggle_action(p_source_type text,p_source_id text,p_action text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_deleted integer;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  if p_action is null or p_action not in ('like','bookmark') then return jsonb_build_object('ok',false,'message','Неизвестное действие.'); end if;
  if p_action='like' and p_source_type not in ('profile','media') then return jsonb_build_object('ok',false,'message','В этой ленте уже используется отдельная система лайков.'); end if;
  if not public.today_v65_content_can_view(p_source_type,p_source_id,v_uid) then return jsonb_build_object('ok',false,'message','Эта публикация больше недоступна.'); end if;
  delete from public.today_v65_content_actions where user_id=v_uid and source_type=p_source_type and source_id=p_source_id and action=p_action;
  get diagnostics v_deleted=row_count;
  if v_deleted>0 then return jsonb_build_object('ok',true,'active',false,'action',p_action,'message',case when p_action='bookmark' then 'Убрано из закладок.' else 'Лайк убран.' end); end if;
  insert into public.today_v65_content_actions(user_id,source_type,source_id,action) values(v_uid,p_source_type,p_source_id,p_action)
  on conflict(user_id,source_type,source_id,action) do nothing;
  return jsonb_build_object('ok',true,'active',true,'action',p_action,'message',case when p_action='bookmark' then 'Сохранено в закладки.' else 'Лайк поставлен.' end);
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
    elsif v_row.source_type='media' then
      select jsonb_build_object('source_type','media','source_id',m.id::text,'title',coalesce(m.title,case m.media_type when 'video' then 'Клип TODAY' when 'photo' then 'Фото TODAY' else 'Музыка TODAY' end),'body',coalesce(m.description,''),'image_url','','author_name',coalesce(nullif(to_jsonb(a)->>'display_name',''),nullif(to_jsonb(a)->>'username',''),'Участник'),'created_at',m.created_at,'media_type',m.media_type,'external_url',coalesce(m.external_url,''))
      into v_item from public.today_media_items m left join public.profiles a on a.id=m.user_id where m.id::text=v_row.source_id;
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
    elsif v_row.source_type='media' then
      select jsonb_build_object('source_type','media','source_id',m.id::text,'title',coalesce(m.title,case m.media_type when 'video' then 'Клип TODAY' when 'photo' then 'Фото TODAY' else 'Музыка TODAY' end),'body',coalesce(m.description,''),'author_name',coalesce(nullif(to_jsonb(a)->>'display_name',''),nullif(to_jsonb(a)->>'username',''),'Участник'),'original_created_at',m.created_at,'media_type',m.media_type,'external_url',coalesce(m.external_url,''))
      into v_item from public.today_media_items m left join public.profiles a on a.id=m.user_id where m.id::text=v_row.source_id;
    end if;
    if v_item is not null then v_rows:=v_rows||jsonb_build_array(v_item||jsonb_build_object('repost_id',v_row.id,'caption',v_row.caption,'reposted_at',v_row.created_at,'reposted_by',v_profile_id)); end if;
  end loop;
  return jsonb_build_object('ok',true,'reposts',v_rows);
end;
$$;

-- Visibility gates for the media index and signed Storage URLs.
revoke all on function public.today_media_v66_can_view(uuid) from public,anon,authenticated;
grant execute on function public.today_media_v66_can_view(uuid) to anon,authenticated;
revoke all on function public.today_media_v66_can_view_album(uuid) from public,anon,authenticated;
grant execute on function public.today_media_v66_can_view_album(uuid) to anon,authenticated;

drop policy if exists today_media_v66_albums_select on public.today_media_albums;
create policy today_media_v66_albums_select on public.today_media_albums for select to anon,authenticated using (public.today_media_v66_can_view_album(id));
drop policy if exists today_media_v66_albums_insert on public.today_media_albums;
create policy today_media_v66_albums_insert on public.today_media_albums for insert to authenticated with check (owner_id=auth.uid());
drop policy if exists today_media_v66_albums_update on public.today_media_albums;
create policy today_media_v66_albums_update on public.today_media_albums for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
drop policy if exists today_media_v66_albums_delete on public.today_media_albums;
create policy today_media_v66_albums_delete on public.today_media_albums for delete to authenticated using (owner_id=auth.uid());

drop policy if exists today_media_v66_items_select on public.today_media_items;
create policy today_media_v66_items_select on public.today_media_items for select to anon,authenticated using (public.today_media_v66_can_view(id));
drop policy if exists today_media_v66_items_insert on public.today_media_items;
create policy today_media_v66_items_insert on public.today_media_items for insert to authenticated with check (user_id=auth.uid());
drop policy if exists today_media_v66_items_update on public.today_media_items;
create policy today_media_v66_items_update on public.today_media_items for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists today_media_v66_items_delete on public.today_media_items;
create policy today_media_v66_items_delete on public.today_media_items for delete to authenticated using (user_id=auth.uid());

create or replace function public.today_media_v66_can_read_path(p_path text)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid;
begin
  select m.id into v_id from public.today_media_items m where m.storage_path=p_path limit 1;
  if v_id is null then return false; end if;
  return public.today_media_v66_can_view(v_id);
end;
$$;
revoke all on function public.today_media_v66_can_read_path(text) from public,anon,authenticated;
grant execute on function public.today_media_v66_can_read_path(text) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('today-media-v66','today-media-v66',false,52428800,array['image/jpeg','video/mp4','video/webm']::text[])
on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=array['image/jpeg','video/mp4','video/webm']::text[];

drop policy if exists today_media_v66_storage_select on storage.objects;
create policy today_media_v66_storage_select on storage.objects for select to anon,authenticated using (bucket_id='today-media-v66' and public.today_media_v66_can_read_path(name));
drop policy if exists today_media_v66_storage_insert on storage.objects;
create policy today_media_v66_storage_insert on storage.objects for insert to authenticated with check (bucket_id='today-media-v66' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists today_media_v66_storage_update on storage.objects;
create policy today_media_v66_storage_update on storage.objects for update to authenticated using (bucket_id='today-media-v66' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='today-media-v66' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists today_media_v66_storage_delete on storage.objects;
create policy today_media_v66_storage_delete on storage.objects for delete to authenticated using (bucket_id='today-media-v66' and (storage.foldername(name))[1]=auth.uid()::text);

do $$
begin
  if to_regclass('public.today_media_albums') is null or to_regclass('public.today_media_items') is null then raise exception 'TODAY V66 verification failed: media tables missing'; end if;
  if not exists(select 1 from pg_class where oid='public.today_media_items'::regclass and relrowsecurity) then raise exception 'TODAY V66 verification failed: media RLS off'; end if;
  if not exists(select 1 from storage.buckets where id='today-media-v66' and public=false) then raise exception 'TODAY V66 verification failed: private media bucket missing'; end if;
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='today_v65_content_can_view') then raise exception 'TODAY V66 verification failed: V65 content visibility RPC missing'; end if;
end;
$$;
commit;
