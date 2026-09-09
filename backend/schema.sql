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
  created_at     timestamptz not null default now(),

  -- ── Pinch managed merchant ──────────────────────────────────
  -- NULL pinch_merchant_id = not onboarded; those venues still charge through
  -- the single hardcoded PINCH_TEST_MERCHANT_ID, which is every venue that
  -- predates this flow. Recording the account does not reroute any money.
  pinch_merchant_id           text,        -- mch_XXX
  pinch_compliance_status     text,        -- compliance.status, e.g. 'new'
  pinch_submission_status     text,        -- in-progress/pending/in-review/approved/rejected
  pinch_merchant_status       text,        -- 'active' once cleared for live payments
  pinch_compliance_notes      text,        -- reviewer notes, surfaced on rejection
  pinch_compliance_updated_at timestamptz,
  pinch_webhook_secret        text,        -- whsec_XXX signing key for this venue's webhook uri
  pinch_contacts              jsonb,       -- [{contact_id: 'con_XXX', ...}] — needed to attach ID docs
  abn                         text,        -- sent to Pinch as companyRegistrationNumber
  afsl_held                   boolean,
  afsl_number                 text,
  austrac_registered          boolean,
  bank_account_name           text,
  bank_bsb                    text,
  bank_account_last3          text,        -- display only; the full number is never stored
  -- Half-finished onboarding, so an abandoned form survives a device change. The
  -- full bank account number passes through here between the bank step and
  -- submission, is stripped from every API read, and is deleted once the
  -- merchant exists.
  onboarding_draft            jsonb
);

-- One venue per Pinch merchant. Partial, so the many un-onboarded venues can all
-- sit at NULL.
create unique index if not exists ix_venues_pinch_merchant_id
  on public.venues (pinch_merchant_id) where pinch_merchant_id is not null;

alter table public.venues enable row level security;

-- Public can read active venues
create policy "venues: public read active"
  on public.venues for select
  using (is_active = true);

-- Only the owner can insert / update / delete
create policy "venues: owner write"
  on public.venues for all
  using (auth.uid() = owner_id);

-- ── public.merchant_documents ─────────────────────────────────
--
-- Metadata for compliance documents forwarded to Pinch. The documents themselves
-- are identity documents (licences, passports, bank statements): they are streamed
-- straight through to Pinch and never persisted, so there is deliberately no path,
-- bucket or blob column. There is no filename column either — filenames of ID
-- documents routinely contain the holder's name and licence number, so `label` is
-- generated by us instead.

create table if not exists public.merchant_documents (
  id                uuid        primary key default gen_random_uuid(),
  venue_id          uuid        not null references public.venues(id) on delete cascade,
  pinch_document_id text        not null unique,   -- doc_XXX; makes a double-POST a no-op
  document_type     text        not null,          -- identity-document | financial-document | business-registration | additional-verification
  pinch_contact_id  text,                          -- con_XXX, for identity documents
  label             text        not null,
  size_bytes        integer,
  content_type      text,
  uploaded_by       uuid,
  created_at        timestamptz not null default now()
);

create index if not exists ix_merchant_documents_venue_id
  on public.merchant_documents (venue_id);

alter table public.merchant_documents enable row level security;

-- Only the venue's owner can see which documents were supplied. There is no
-- public read policy: this is compliance paperwork, not venue content.
create policy "merchant_documents: owner read"
  on public.merchant_documents for select
  using (exists (
    select 1 from public.venues v
    where v.id = merchant_documents.venue_id and v.owner_id = auth.uid()
  ));

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
