-- ──────────────────────────────────────────────────────────────
-- Impulse · Supabase schema
-- Run this once in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/ihxaejkvyowkdzynhhuv/sql
-- ──────────────────────────────────────────────────────────────

-- ── public.users ─────────────────────────────────────────────
-- Mirrors auth.users and stores app-specific profile data.
-- A row is created automatically via trigger on every new signup.

create table if not exists public.users (
  id          uuid        primary key references auth.users(id) on delete cascade,
  email       text,
  phone       text,
  full_name   text,
  avatar_url  text,
  suburb      text,
  acts        text[]      default '{}',
  party_size  integer     default 2,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Row-level security: users can only see and edit their own row
alter table public.users enable row level security;

create policy "users: read own row"
  on public.users for select
  using (auth.uid() = id);

create policy "users: insert own row"
  on public.users for insert
  with check (auth.uid() = id);

create policy "users: update own row"
  on public.users for update
  using (auth.uid() = id);

-- Trigger: auto-create a users row on every new Supabase Auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, phone)
  values (new.id, new.email, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
