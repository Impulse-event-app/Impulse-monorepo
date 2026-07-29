-- ──────────────────────────────────────────────────────────────
-- Impulse · Supabase schema
-- Run this once in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/pdcevxkvgtptjczzsmkh/sql
-- ──────────────────────────────────────────────────────────────

-- ── public.users ─────────────────────────────────────────────
-- Mirrors auth.users and stores app-specific profile data.
-- Populated across the onboarding flow; used as cold-start signal
-- for the recommender (suburb + preferred_acts + party_size).
-- A row is created automatically via trigger on every new signup.

create table if not exists public.users (
  id                     uuid        primary key references auth.users(id) on delete cascade,
  email                  text,
  phone                  text,
  full_name              text,
  avatar_url             text,
  -- Onboarding: step 4
  home_suburb            text,
  -- Onboarding: step 5  e.g. '{"Bowling","Karaoke","Pool"}'
  preferred_acts         text[]      not null default '{}',
  -- Onboarding: accessibility  e.g. '{"Wheelchair access","Hearing assistance"}'
  accessibility_needs    text[]      not null default '{}',
  -- Onboarding: step 6  default 2, max typically 10
  party_size             integer     not null default 2,
  -- Onboarding: step 3  stored as lower bound of bracket: 18 | 25 | 35 | 45
  age_bracket            integer,
  -- Onboarding: step 7
  notifications_enabled  boolean     not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
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

-- ── public.venues ─────────────────────────────────────────────
-- Owned by a Supabase user (venue operator).
-- lat/lng stored for the map tab; avg_rating is a denormalised
-- aggregate updated by trigger on user_venue_interactions.

create table if not exists public.venues (
  id             uuid        primary key default gen_random_uuid(),
  owner_id       uuid        not null references public.users(id) on delete cascade,
  name           text        not null,
  category       text        not null,
  description    text,
  address        text,
  suburb         text,
  lat            double precision,
  lng            double precision,
  phone          text,
  email          text,
  website        text,
  opening_hours  text,
  image_url      text,        -- hero photo, uploaded via venue-web to Supabase Storage
  -- disability-friendly features, e.g. '{"Step-free entry","Accessible bathroom"}'
  accessibility_features text[] not null default '{}',
  is_active      boolean     not null default true,
  -- denormalised aggregate — updated by trigger
  avg_rating     numeric(3,2) not null default 0,
  total_ratings  integer      not null default 0,
  created_at     timestamptz not null default now()
);

alter table public.venues enable row level security;

-- Public can read active venues
create policy "venues: public read active"
  on public.venues for select
  using (is_active = true);

-- Only the owner can insert / update / delete
create policy "venues: owner write"
  on public.venues for all
  using (auth.uid() = owner_id);

-- ── public.deals ──────────────────────────────────────────────

create table if not exists public.deals (
  id               uuid        primary key default gen_random_uuid(),
  venue_id         uuid        not null references public.venues(id) on delete cascade,
  title            text        not null,
  category         text        not null,
  description      text,
  original_price   numeric(10,2) not null,
  discount_pct     numeric(5,2)  not null,
  deal_price       numeric(10,2) not null,   -- computed on insert/update
  date             text        not null,      -- e.g. "Monday 3 June 2026"
  slots            jsonb       not null,      -- ["5:00 PM", "6:00 PM"]
  max_group_size   integer     not null default 6,
  total_spots      integer     not null,
  spots_remaining  integer     not null,
  is_active        boolean     not null default true,
  expires_at       timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.deals enable row level security;

create policy "deals: public read active"
  on public.deals for select
  using (is_active = true and spots_remaining > 0);

create policy "deals: venue owner write"
  on public.deals for all
  using (
    exists (
      select 1 from public.venues v
      where v.id = venue_id and v.owner_id = auth.uid()
    )
  );

-- ── public.bookings ───────────────────────────────────────────

create type booking_status as enum ('pending', 'confirmed', 'cancelled', 'attended');

create table if not exists public.bookings (
  id                 uuid           primary key default gen_random_uuid(),
  deal_id            uuid           not null references public.deals(id) on delete restrict,
  user_id            uuid           not null references public.users(id) on delete cascade,
  slot_time          text           not null,
  num_people         integer        not null,
  total_paid         numeric(10,2)  not null,
  confirmation_code  text           not null unique,
  status             booking_status not null default 'confirmed',
  redeemed_at        timestamptz,                                  -- set when venue scans the ticket
  created_at         timestamptz    not null default now()
);

alter table public.bookings enable row level security;

create policy "bookings: user read own"
  on public.bookings for select
  using (auth.uid() = user_id);

create policy "bookings: user insert own"
  on public.bookings for insert
  with check (auth.uid() = user_id);

create policy "bookings: user cancel own"
  on public.bookings for update
  using (auth.uid() = user_id);

-- ── public.user_venue_interactions ────────────────────────────
-- Event log for the recommender.
-- Every view, save, booking, and post-visit rating is written here.
-- event_type: 'view' | 'save' | 'booking' | 'rating'
-- rating: 1–5, only set when event_type = 'rating'

create type interaction_type as enum ('view', 'save', 'booking', 'rating');

create table if not exists public.user_venue_interactions (
  id          uuid             primary key default gen_random_uuid(),
  user_id     uuid             not null references public.users(id) on delete cascade,
  venue_id    uuid             not null references public.venues(id) on delete cascade,
  event_type  interaction_type not null,
  rating      smallint         check (rating between 1 and 5),
  created_at  timestamptz      not null default now()
);

create index on public.user_venue_interactions (user_id);
create index on public.user_venue_interactions (venue_id);

alter table public.user_venue_interactions enable row level security;

create policy "interactions: user write own"
  on public.user_venue_interactions for insert
  with check (auth.uid() = user_id);

create policy "interactions: user read own"
  on public.user_venue_interactions for select
  using (auth.uid() = user_id);

-- ── Trigger: update avg_rating on venues ─────────────────────

create or replace function public.update_venue_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.venues
  set
    avg_rating    = (
      select coalesce(avg(rating), 0)
      from public.user_venue_interactions
      where venue_id = new.venue_id and event_type = 'rating'
    ),
    total_ratings = (
      select count(*)
      from public.user_venue_interactions
      where venue_id = new.venue_id and event_type = 'rating'
    )
  where id = new.venue_id;
  return new;
end;
$$;

drop trigger if exists on_rating_inserted on public.user_venue_interactions;
create trigger on_rating_inserted
  after insert on public.user_venue_interactions
  for each row
  when (new.event_type = 'rating')
  execute procedure public.update_venue_rating();

-- ── Trigger: auto-create a users row on every new Supabase Auth signup

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

-- ── Storage: venue-photos bucket ──────────────────────────────
-- Public-read bucket that holds venue hero photos uploaded from
-- venue-web. Files are keyed by owner: "<auth.uid()>/<uuid>.<ext>",
-- so the RLS policies below scope writes to the uploading owner
-- while anyone can read (the mobile feed loads these URLs directly).

insert into storage.buckets (id, name, public)
values ('venue-photos', 'venue-photos', true)
on conflict (id) do nothing;

-- Anyone can read venue photos
drop policy if exists "venue-photos: public read" on storage.objects;
create policy "venue-photos: public read"
  on storage.objects for select
  using (bucket_id = 'venue-photos');

-- Authenticated users can upload only under their own uid/ prefix
drop policy if exists "venue-photos: owner insert" on storage.objects;
create policy "venue-photos: owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'venue-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners can update / delete only their own files
drop policy if exists "venue-photos: owner modify" on storage.objects;
create policy "venue-photos: owner modify"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'venue-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "venue-photos: owner delete" on storage.objects;
create policy "venue-photos: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'venue-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
