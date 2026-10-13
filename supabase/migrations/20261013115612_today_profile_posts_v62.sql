-- TODAY NATIVE INTEGRATION V62: persistent personal profile wall, separate from the daily feed.
create table if not exists public.profile_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  image_url text,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_posts_content_check check (
    (length(btrim(body)) between 1 and 5000) or (length(btrim(body)) = 0 and nullif(btrim(image_url), '') is not null)
  ),
  constraint profile_posts_image_url_length_check check (image_url is null or length(image_url) <= 2048)
);

alter table public.profile_posts add column if not exists body text not null default '';
alter table public.profile_posts add column if not exists image_url text;
alter table public.profile_posts add column if not exists image_path text;
alter table public.profile_posts add column if not exists created_at timestamptz not null default now();
alter table public.profile_posts add column if not exists updated_at timestamptz not null default now();
create index if not exists profile_posts_owner_created_idx on public.profile_posts (user_id, created_at desc);
alter table public.profile_posts enable row level security;
revoke all on table public.profile_posts from anon, public;
grant select, insert, update, delete on table public.profile_posts to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_posts' and policyname='profile_posts_select_own') then
    create policy profile_posts_select_own on public.profile_posts for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_posts' and policyname='profile_posts_insert_own') then
    create policy profile_posts_insert_own on public.profile_posts for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_posts' and policyname='profile_posts_update_own') then
    create policy profile_posts_update_own on public.profile_posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_posts' and policyname='profile_posts_delete_own') then
    create policy profile_posts_delete_own on public.profile_posts for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;
