-- TODAY profile post photos V1.0 · 20261012063051
-- Adds private media for permanent profile posts; no shop/coin or daily-feed tables are changed.
begin;

alter table public.today_social_profile_posts add column if not exists image_path text;
create index if not exists today_social_profile_posts_image_path_idx on public.today_social_profile_posts(image_path) where image_path is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('today-profile-media','today-profile-media',false,15728640,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=15728640,allowed_mime_types=array['image/jpeg'];

drop policy if exists today_profile_media_owner_upload on storage.objects;
create policy today_profile_media_owner_upload on storage.objects for insert to authenticated
with check(bucket_id='today-profile-media'
  and (storage.foldername(name))[1]='profile-posts'
  and (storage.foldername(name))[2]=auth.uid()::text
  and storage.extension(name)='jpg');

drop policy if exists today_profile_media_owner_delete on storage.objects;
create policy today_profile_media_owner_delete on storage.objects for delete to authenticated
using(bucket_id='today-profile-media'
  and (storage.foldername(name))[1]='profile-posts'
  and (storage.foldername(name))[2]=auth.uid()::text);

create or replace function public.today_social_can_view_profile_media(p_path text)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_me uuid:=auth.uid(); v_author uuid; v_post_visibility text; v_allow_visits boolean; v_profile_visibility text;
begin
  -- Owners may read/delete their own orphan upload if the post insert subsequently fails.
  if v_me is not null and left(coalesce(p_path,''),length('profile-posts/'||v_me::text||'/'))='profile-posts/'||v_me::text||'/' then return true; end if;
  select p.author_id,p.visibility into v_author,v_post_visibility
    from public.today_social_profile_posts p where p.image_path=p_path limit 1;
  if v_author is null then return false; end if;
  if v_me=v_author then return true; end if;
  if exists(select 1 from public.today_social_user_blocks b
      where (b.blocker_id=v_me and b.blocked_id=v_author) or (b.blocker_id=v_author and b.blocked_id=v_me)) then return false; end if;
  select coalesce(s.allow_profile_visits,true),coalesce(s.profile_visibility,'public')
    into v_allow_visits,v_profile_visibility
    from (select 1) x left join public.today_social_settings s on s.user_id=v_author;
  if not coalesce(v_allow_visits,true) then return false; end if;
  if v_profile_visibility='private' then return false; end if;
  if v_profile_visibility='friends' and not public.today_social_is_friend(v_me,v_author) then return false; end if;
  if v_post_visibility='private' then return false; end if;
  if v_post_visibility='friends' and not public.today_social_is_friend(v_me,v_author) then return false; end if;
  return true;
end;
$$;
revoke all on function public.today_social_can_view_profile_media(text) from public;
grant execute on function public.today_social_can_view_profile_media(text) to anon,authenticated;

drop policy if exists today_profile_media_visible_read on storage.objects;
create policy today_profile_media_visible_read on storage.objects for select to anon,authenticated
using(bucket_id='today-profile-media' and public.today_social_can_view_profile_media(name));

-- Remove the former three-argument signature so the RPC is not ambiguously exposed beside the image-aware signature.
drop function if exists public.today_social_create_profile_post(text,text,text);
create or replace function public.today_social_create_profile_post(p_title text,p_body text,p_visibility text,p_image_path text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_post public.today_social_profile_posts%rowtype; v_muted timestamptz; v_prefix text; v_filename text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Войди в аккаунт.'); end if;
  select muted_until into v_muted from public.today_social_moderation_state where user_id=v_uid;
  if v_muted is not null and v_muted>now() then return jsonb_build_object('ok',false,'message','Публикации временно ограничены до '||to_char(v_muted at time zone 'Europe/Moscow','DD.MM.YYYY HH24:MI')||' МСК.','muted_until',v_muted); end if;
  if char_length(trim(coalesce(p_body,'')))<1 or char_length(p_body)>5000 then return jsonb_build_object('ok',false,'message','Текст должен содержать от 1 до 5000 символов.'); end if;
  if coalesce(p_visibility,'public') not in ('public','friends','private') then return jsonb_build_object('ok',false,'message','Некорректная видимость публикации.'); end if;
  if p_image_path is not null then
    v_prefix:='profile-posts/'||v_uid::text||'/';
    if left(p_image_path,length(v_prefix))<>v_prefix then return jsonb_build_object('ok',false,'message','Фото должно принадлежать твоему аккаунту.'); end if;
    v_filename:=substr(p_image_path,length(v_prefix)+1);
    if v_filename !~ '^[A-Za-z0-9_-]{8,80}\.jpg$' or position('/' in v_filename)>0 then return jsonb_build_object('ok',false,'message','Некорректный путь к фото.'); end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='today-profile-media' and o.name=p_image_path) then return jsonb_build_object('ok',false,'message','Загруженное фото не найдено. Выбери его ещё раз.'); end if;
  end if;
  insert into public.today_social_profile_posts(author_id,title,body,visibility,image_path)
    values(v_uid,left(trim(coalesce(p_title,'')),140),trim(p_body),coalesce(p_visibility,'public'),p_image_path)
    returning * into v_post;
  return jsonb_build_object('ok',true,'post',jsonb_build_object('id',v_post.id,'title',v_post.title,'body',v_post.body,'visibility',v_post.visibility,'image_path',v_post.image_path,'created_at',v_post.created_at),'message','Публикация сохранена на личной странице.');
end;
$$;
revoke all on function public.today_social_create_profile_post(text,text,text,text) from public,anon;
grant execute on function public.today_social_create_profile_post(text,text,text,text) to authenticated;

-- Existing public/friends/private visibility logic is preserved; only the private storage path is added to post JSON.
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
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'body',q.body,'visibility',q.visibility,'image_path',q.image_path,'created_at',q.created_at,'can_promote',(q.visibility='public' and q.author_id=v_target and v_me=v_target)) order by q.created_at desc),'[]'::jsonb)
    into v_posts from (
      select p.id,p.author_id,p.title,p.body,p.visibility,p.image_path,p.created_at
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
revoke all on function public.today_social_profile_page(uuid) from public;
grant execute on function public.today_social_profile_page(uuid) to anon,authenticated;

create or replace function public.today_social_get_promoted_posts()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_posts jsonb; v_today date:=(now() at time zone 'Europe/Moscow')::date;
begin
  select coalesce(jsonb_agg(jsonb_build_object('promotion_id',q.promotion_id,'post_id',q.post_id,'author_id',q.author_id,'username',q.username,'author_name',q.author_name,'avatar_url',q.avatar_url,'title',q.title,'body',q.body,'image_path',q.image_path,'created_at',q.created_at,'promoted_at',q.promoted_at) order by q.promoted_at desc),'[]'::jsonb)
    into v_posts from (
      select pr.id promotion_id,p.id post_id,p.author_id,coalesce(to_jsonb(a)->>'username','') username,coalesce(to_jsonb(a)->>'display_name',to_jsonb(a)->>'nickname',to_jsonb(a)->>'username','Участник') author_name,coalesce(to_jsonb(a)->>'avatar_url',to_jsonb(a)->>'photo_url','') avatar_url,p.title,p.body,p.image_path,p.created_at,pr.created_at promoted_at
      from public.today_social_promotions pr join public.today_social_profile_posts p on p.id=pr.post_id join public.profiles a on a.id=p.author_id
      where pr.day_date=v_today and p.visibility='public'
    ) q;
  return jsonb_build_object('ok',true,'day_date',v_today,'posts',v_posts);
end;
$$;
revoke all on function public.today_social_get_promoted_posts() from public;
grant execute on function public.today_social_get_promoted_posts() to anon,authenticated;

notify pgrst, 'reload schema';
commit;
