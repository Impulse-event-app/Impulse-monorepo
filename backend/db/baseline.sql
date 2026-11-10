-- ──────────────────────────────────────────────────────────────
-- Impulse · database baseline
--
-- The full schema as of Alembic revision b3f6a2d8e914, taken from the live
-- database with pg_dump --schema-only (no data). Alembic's history starts on
-- top of a database that already had these tables, so a brand-new database
-- gets this file first and is then stamped at b3f6a2d8e914; every later
-- change is an ordinary Alembic migration.
--
-- Don't edit this by hand or apply it yourself: run
--   uv run python scripts/bootstrap_db.py
-- which refuses to touch a database that already has tables.
-- ──────────────────────────────────────────────────────────────

--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: interaction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.interaction_type AS ENUM (
    'view',
    'save',
    'booking',
    'rating'
);

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.users (id, email, phone)
  values (new.id, new.email, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

--
-- Name: update_venue_rating(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_venue_rating() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: booking_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    user_id uuid,
    display_name text,
    seat_token text,
    seat_label text,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    ballot jsonb,
    ballot_at timestamp with time zone,
    share_amount_cents integer,
    deposit_cents integer,
    balance_cents integer,
    covered_by_member_id uuid,
    pinch_payer_id text,
    pinch_source_id text,
    deposit_payment_id text,
    deposit_status text DEFAULT 'unpaid'::text NOT NULL,
    deposit_attempt integer DEFAULT 0 NOT NULL,
    balance_payment_id text,
    balance_status text DEFAULT 'unpaid'::text NOT NULL,
    payment_note text,
    payment_followup boolean DEFAULT false NOT NULL,
    stripe_payment_method_id text,
    hold_status text,
    hold_expires_at timestamp with time zone
);

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid,
    user_id uuid,
    slot_time text,
    num_people integer NOT NULL,
    total_paid numeric(10,2) NOT NULL,
    confirmation_code text,
    status text DEFAULT 'collecting'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    redeemed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    has_voting boolean DEFAULT false NOT NULL,
    split_mode text DEFAULT 'even'::text NOT NULL,
    locked_unit_price_cents integer,
    locked_price_cents integer,
    initiator_member_id uuid,
    share_deadline timestamp with time zone,
    split_confirmed_at timestamp with time zone,
    spots_held boolean DEFAULT false NOT NULL,
    join_token text,
    voting_deadline timestamp with time zone,
    stripe_payout_id text,
    payout_status text,
    CONSTRAINT ck_bookings_deal_unless_voting CHECK ((has_voting OR (deal_id IS NOT NULL)))
);

--
-- Name: deal_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_schedules (
    id uuid NOT NULL,
    venue_id uuid NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    description text,
    unit text,
    original_price numeric(10,2) NOT NULL,
    discount_pct numeric(5,2) NOT NULL,
    slots jsonb NOT NULL,
    weekdays smallint[] NOT NULL,
    starts_on date,
    ends_on date,
    max_group_size integer DEFAULT 6 NOT NULL,
    total_spots integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    description text,
    original_price numeric(10,2) NOT NULL,
    discount_pct numeric(5,2) NOT NULL,
    deal_price numeric(10,2) NOT NULL,
    date text NOT NULL,
    slots jsonb NOT NULL,
    max_group_size integer DEFAULT 6 NOT NULL,
    total_spots integer NOT NULL,
    spots_remaining integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    unit text,
    deal_date date,
    schedule_id uuid
);

--
-- Name: live_activity_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_activity_tokens (
    id uuid NOT NULL,
    booking_id uuid NOT NULL,
    member_id uuid NOT NULL,
    push_token text NOT NULL,
    environment text DEFAULT 'production'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: merchant_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchant_documents (
    id uuid NOT NULL,
    venue_id uuid NOT NULL,
    pinch_document_id text NOT NULL,
    document_type text NOT NULL,
    pinch_contact_id text,
    label text NOT NULL,
    size_bytes integer,
    content_type text,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outcomes (
    id uuid NOT NULL,
    recommendation_id uuid,
    venue_id uuid NOT NULL,
    discount_pct numeric(5,2) NOT NULL,
    spots_offered integer NOT NULL,
    spots_filled integer NOT NULL,
    slot_datetime timestamp with time zone,
    hours_to_slot_at_publish numeric(8,2),
    observed_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_methods (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    pinch_source_id text NOT NULL,
    card_scheme text,
    display_card_number text,
    expiry_date text,
    card_holder_name text,
    funding text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendations (
    id uuid NOT NULL,
    venue_id uuid NOT NULL,
    discount_pct numeric(5,2) NOT NULL,
    window_start time without time zone NOT NULL,
    window_end time without time zone NOT NULL,
    spot_cap integer NOT NULL,
    predicted_fill numeric(5,4) NOT NULL,
    ci_low numeric(5,4) NOT NULL,
    ci_high numeric(5,4) NOT NULL,
    is_exploratory boolean DEFAULT false NOT NULL,
    exploration_delta integer,
    prior_strength numeric(6,2) NOT NULL,
    rationale text,
    status text DEFAULT 'pending'::text NOT NULL,
    accepted_discount numeric(5,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: settlement_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlement_lines (
    id uuid NOT NULL,
    settlement_id uuid NOT NULL,
    pinch_line_id text,
    pinch_payment_id text,
    booking_id uuid,
    venue_id uuid,
    kind text,
    line_type text,
    gross_cents integer DEFAULT 0 NOT NULL,
    fees_cents integer DEFAULT 0 NOT NULL,
    total_cents integer DEFAULT 0 NOT NULL,
    venue_amount_cents integer DEFAULT 0 NOT NULL,
    description text,
    transaction_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlements (
    id uuid NOT NULL,
    pinch_transfer_id text NOT NULL,
    pinch_merchant_id text,
    venue_id uuid,
    status text DEFAULT 'processing'::text NOT NULL,
    amount_cents integer DEFAULT 0 NOT NULL,
    total_fees_cents integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'AUD'::text NOT NULL,
    reference text,
    account_name text,
    bsb text,
    account_number text,
    transfer_date timestamp with time zone,
    summary jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: user_venue_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_venue_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    event_type public.interaction_type NOT NULL,
    rating smallint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_venue_interactions_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text,
    phone text,
    full_name text,
    avatar_url text,
    home_suburb text,
    preferred_acts text[] DEFAULT '{}'::text[] NOT NULL,
    party_size integer DEFAULT 2 NOT NULL,
    age_bracket integer,
    notifications_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expo_push_token text,
    accessibility_needs text[] DEFAULT '{}'::text[] NOT NULL,
    pinch_payer_id text,
    stripe_customer_id text,
    apple_refresh_token text
);

--
-- Name: venue_params; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_params (
    venue_id uuid NOT NULL,
    category text NOT NULL,
    capacity_per_slot integer NOT NULL,
    slot_duration_mins integer NOT NULL,
    baseline_price_cents integer NOT NULL,
    dead_zone_days text[] DEFAULT '{}'::text[] NOT NULL,
    dead_zone_start time without time zone,
    dead_zone_end time without time zone,
    max_discount_pct integer DEFAULT 35 NOT NULL,
    existing_promos text,
    operating_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: venue_reels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_reels (
    id uuid NOT NULL,
    venue_id uuid NOT NULL,
    video_url text NOT NULL,
    poster_url text,
    caption text,
    source_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: venues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    description text,
    address text,
    suburb text,
    lat double precision,
    lng double precision,
    phone text,
    email text,
    website text,
    opening_hours text,
    is_active boolean DEFAULT true NOT NULL,
    avg_rating numeric(3,2) DEFAULT 0 NOT NULL,
    total_ratings integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    google_place_id text,
    image_url text,
    accessibility_features text[] DEFAULT '{}'::text[] NOT NULL,
    pinch_merchant_id text,
    pinch_compliance_status text,
    pinch_submission_status text,
    pinch_merchant_status text,
    pinch_compliance_notes text,
    pinch_compliance_updated_at timestamp with time zone,
    pinch_webhook_secret text,
    pinch_contacts jsonb,
    abn text,
    afsl_held boolean,
    afsl_number text,
    austrac_registered boolean,
    bank_account_name text,
    bank_bsb text,
    bank_account_last3 text,
    onboarding_draft jsonb,
    stripe_account_id text,
    stripe_transfers_status text,
    stripe_requirements jsonb,
    stripe_status_updated_at timestamp with time zone,
    pilot_ends_at timestamp with time zone
);

--
-- Name: waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    area text NOT NULL,
    referral_code text NOT NULL,
    referred_by text,
    referral_count integer DEFAULT 0 NOT NULL,
    "position" integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    preferred_activities text[] DEFAULT '{}'::text[] NOT NULL,
    other_activity text
);

--
-- Name: booking_participants booking_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_participants
    ADD CONSTRAINT booking_participants_pkey PRIMARY KEY (id);

--
-- Name: booking_participants booking_participants_seat_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_participants
    ADD CONSTRAINT booking_participants_seat_token_key UNIQUE (seat_token);

--
-- Name: bookings bookings_confirmation_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_confirmation_code_key UNIQUE (confirmation_code);

--
-- Name: bookings bookings_join_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_join_token_key UNIQUE (join_token);

--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);

--
-- Name: deal_schedules deal_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_schedules
    ADD CONSTRAINT deal_schedules_pkey PRIMARY KEY (id);

--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);

--
-- Name: live_activity_tokens live_activity_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_activity_tokens
    ADD CONSTRAINT live_activity_tokens_pkey PRIMARY KEY (id);

--
-- Name: live_activity_tokens live_activity_tokens_push_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_activity_tokens
    ADD CONSTRAINT live_activity_tokens_push_token_key UNIQUE (push_token);

--
-- Name: merchant_documents merchant_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_documents
    ADD CONSTRAINT merchant_documents_pkey PRIMARY KEY (id);

--
-- Name: outcomes outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcomes
    ADD CONSTRAINT outcomes_pkey PRIMARY KEY (id);

--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);

--
-- Name: recommendations recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_pkey PRIMARY KEY (id);

--
-- Name: settlement_lines settlement_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_lines
    ADD CONSTRAINT settlement_lines_pkey PRIMARY KEY (id);

--
-- Name: settlements settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_pkey PRIMARY KEY (id);

--
-- Name: merchant_documents uq_merchant_documents_pinch_document_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_documents
    ADD CONSTRAINT uq_merchant_documents_pinch_document_id UNIQUE (pinch_document_id);

--
-- Name: payment_methods uq_payment_methods_pinch_source_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT uq_payment_methods_pinch_source_id UNIQUE (pinch_source_id);

--
-- Name: settlements uq_settlements_pinch_transfer_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT uq_settlements_pinch_transfer_id UNIQUE (pinch_transfer_id);

--
-- Name: waitlist uq_waitlist_email; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT uq_waitlist_email UNIQUE (email);

--
-- Name: waitlist uq_waitlist_referral_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT uq_waitlist_referral_code UNIQUE (referral_code);

--
-- Name: user_venue_interactions user_venue_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_venue_interactions
    ADD CONSTRAINT user_venue_interactions_pkey PRIMARY KEY (id);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: venue_params venue_params_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_params
    ADD CONSTRAINT venue_params_pkey PRIMARY KEY (venue_id);

--
-- Name: venue_reels venue_reels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_reels
    ADD CONSTRAINT venue_reels_pkey PRIMARY KEY (id);

--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id);

--
-- Name: waitlist waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);

--
-- Name: ix_booking_participants_balance_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_booking_participants_balance_payment_id ON public.booking_participants USING btree (balance_payment_id);

--
-- Name: ix_booking_participants_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_booking_participants_booking_id ON public.booking_participants USING btree (booking_id);

--
-- Name: ix_booking_participants_deposit_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_booking_participants_deposit_payment_id ON public.booking_participants USING btree (deposit_payment_id);

--
-- Name: ix_deal_schedules_venue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_deal_schedules_venue_id ON public.deal_schedules USING btree (venue_id);

--
-- Name: ix_live_activity_tokens_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_live_activity_tokens_booking_id ON public.live_activity_tokens USING btree (booking_id);

--
-- Name: ix_merchant_documents_venue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_merchant_documents_venue_id ON public.merchant_documents USING btree (venue_id);

--
-- Name: ix_outcomes_recommendation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_outcomes_recommendation_id ON public.outcomes USING btree (recommendation_id);

--
-- Name: ix_outcomes_venue_id_discount_pct; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_outcomes_venue_id_discount_pct ON public.outcomes USING btree (venue_id, discount_pct);

--
-- Name: ix_payment_methods_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_payment_methods_user_id ON public.payment_methods USING btree (user_id);

--
-- Name: ix_recommendations_venue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_recommendations_venue_id ON public.recommendations USING btree (venue_id);

--
-- Name: ix_settlement_lines_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_settlement_lines_booking_id ON public.settlement_lines USING btree (booking_id);

--
-- Name: ix_settlement_lines_pinch_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_settlement_lines_pinch_payment_id ON public.settlement_lines USING btree (pinch_payment_id);

--
-- Name: ix_settlement_lines_settlement_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_settlement_lines_settlement_id ON public.settlement_lines USING btree (settlement_id);

--
-- Name: ix_settlement_lines_venue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_settlement_lines_venue_id ON public.settlement_lines USING btree (venue_id);

--
-- Name: ix_settlements_venue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_settlements_venue_id ON public.settlements USING btree (venue_id);

--
-- Name: ix_venue_reels_venue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_venue_reels_venue_id ON public.venue_reels USING btree (venue_id);

--
-- Name: ix_venues_pinch_merchant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_venues_pinch_merchant_id ON public.venues USING btree (pinch_merchant_id) WHERE (pinch_merchant_id IS NOT NULL);

--
-- Name: ix_waitlist_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_waitlist_created_at ON public.waitlist USING btree (created_at, id);

--
-- Name: ix_waitlist_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_waitlist_email_lower ON public.waitlist USING btree (lower(email));

--
-- Name: ix_waitlist_referred_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_waitlist_referred_by ON public.waitlist USING btree (referred_by);

--
-- Name: uq_booking_participants_booking_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_booking_participants_booking_user ON public.booking_participants USING btree (booking_id, user_id) WHERE (user_id IS NOT NULL);

--
-- Name: uq_deals_schedule_date; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_deals_schedule_date ON public.deals USING btree (schedule_id, deal_date) WHERE (schedule_id IS NOT NULL);

--
-- Name: uq_payment_methods_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_payment_methods_one_default ON public.payment_methods USING btree (user_id) WHERE is_default;

--
-- Name: user_venue_interactions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_venue_interactions_user_id_idx ON public.user_venue_interactions USING btree (user_id);

--
-- Name: user_venue_interactions_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_venue_interactions_venue_id_idx ON public.user_venue_interactions USING btree (venue_id);

--
-- Name: users_stripe_customer_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_stripe_customer_id_key ON public.users USING btree (stripe_customer_id);

--
-- Name: venues_stripe_account_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX venues_stripe_account_id_key ON public.venues USING btree (stripe_account_id);

--
-- Name: user_venue_interactions on_rating_inserted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_rating_inserted AFTER INSERT ON public.user_venue_interactions FOR EACH ROW WHEN ((new.event_type = 'rating'::public.interaction_type)) EXECUTE FUNCTION public.update_venue_rating();

--
-- Name: booking_participants booking_participants_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_participants
    ADD CONSTRAINT booking_participants_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);

--
-- Name: booking_participants booking_participants_covered_by_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_participants
    ADD CONSTRAINT booking_participants_covered_by_member_id_fkey FOREIGN KEY (covered_by_member_id) REFERENCES public.booking_participants(id);

--
-- Name: booking_participants booking_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_participants
    ADD CONSTRAINT booking_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: bookings bookings_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE RESTRICT;

--
-- Name: bookings bookings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: deal_schedules deal_schedules_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_schedules
    ADD CONSTRAINT deal_schedules_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

--
-- Name: deals deals_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.deal_schedules(id) ON DELETE SET NULL;

--
-- Name: deals deals_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

--
-- Name: bookings fk_bookings_initiator_member; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT fk_bookings_initiator_member FOREIGN KEY (initiator_member_id) REFERENCES public.booking_participants(id);

--
-- Name: live_activity_tokens live_activity_tokens_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_activity_tokens
    ADD CONSTRAINT live_activity_tokens_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;

--
-- Name: live_activity_tokens live_activity_tokens_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_activity_tokens
    ADD CONSTRAINT live_activity_tokens_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.booking_participants(id) ON DELETE CASCADE;

--
-- Name: merchant_documents merchant_documents_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_documents
    ADD CONSTRAINT merchant_documents_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

--
-- Name: outcomes outcomes_recommendation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcomes
    ADD CONSTRAINT outcomes_recommendation_id_fkey FOREIGN KEY (recommendation_id) REFERENCES public.recommendations(id) ON DELETE SET NULL;

--
-- Name: outcomes outcomes_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcomes
    ADD CONSTRAINT outcomes_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

--
-- Name: payment_methods payment_methods_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: recommendations recommendations_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

--
-- Name: settlement_lines settlement_lines_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_lines
    ADD CONSTRAINT settlement_lines_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);

--
-- Name: settlement_lines settlement_lines_settlement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_lines
    ADD CONSTRAINT settlement_lines_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.settlements(id);

--
-- Name: settlement_lines settlement_lines_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_lines
    ADD CONSTRAINT settlement_lines_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);

--
-- Name: settlements settlements_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);

--
-- Name: user_venue_interactions user_venue_interactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_venue_interactions
    ADD CONSTRAINT user_venue_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: user_venue_interactions user_venue_interactions_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_venue_interactions
    ADD CONSTRAINT user_venue_interactions_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: venue_params venue_params_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_params
    ADD CONSTRAINT venue_params_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

--
-- Name: venue_reels venue_reels_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_reels
    ADD CONSTRAINT venue_reels_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

--
-- Name: venues venues_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: booking_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_participants booking_participants: read own seat; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "booking_participants: read own seat" ON public.booking_participants FOR SELECT USING ((auth.uid() = user_id));

--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings bookings: participants read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bookings: participants read" ON public.bookings FOR SELECT USING ((id IN ( SELECT booking_participants.booking_id
   FROM public.booking_participants
  WHERE (booking_participants.user_id = auth.uid()))));

--
-- Name: bookings bookings: user cancel own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bookings: user cancel own" ON public.bookings FOR UPDATE USING ((auth.uid() = user_id));

--
-- Name: bookings bookings: user insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bookings: user insert own" ON public.bookings FOR INSERT WITH CHECK ((auth.uid() = user_id));

--
-- Name: bookings bookings: user read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bookings: user read own" ON public.bookings FOR SELECT USING ((auth.uid() = user_id));

--
-- Name: deal_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
-- Name: deals deals: public read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deals: public read active" ON public.deals FOR SELECT USING (((is_active = true) AND (spots_remaining > 0)));

--
-- Name: deals deals: venue owner write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deals: venue owner write" ON public.deals USING ((EXISTS ( SELECT 1
   FROM public.venues v
  WHERE ((v.id = deals.venue_id) AND (v.owner_id = auth.uid())))));

--
-- Name: user_venue_interactions interactions: user read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "interactions: user read own" ON public.user_venue_interactions FOR SELECT USING ((auth.uid() = user_id));

--
-- Name: user_venue_interactions interactions: user write own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "interactions: user write own" ON public.user_venue_interactions FOR INSERT WITH CHECK ((auth.uid() = user_id));

--
-- Name: live_activity_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.live_activity_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: user_venue_interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_venue_interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users: insert own row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users: insert own row" ON public.users FOR INSERT WITH CHECK ((auth.uid() = id));

--
-- Name: users users: read own row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users: read own row" ON public.users FOR SELECT USING ((auth.uid() = id));

--
-- Name: users users: update own row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users: update own row" ON public.users FOR UPDATE USING ((auth.uid() = id));

--
-- Name: venue_reels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_reels ENABLE ROW LEVEL SECURITY;

--
-- Name: venues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

--
-- Name: venues venues: owner write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "venues: owner write" ON public.venues USING ((auth.uid() = owner_id));

--
-- Name: venues venues: public read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "venues: public read active" ON public.venues FOR SELECT USING ((is_active = true));

--
-- PostgreSQL database dump complete
--

-- ──────────────────────────────────────────────────────────────
-- Supabase-side objects pg_dump --schema=public leaves out
-- ──────────────────────────────────────────────────────────────

-- A public.users row for every new Supabase Auth sign-up.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- The app subscribes to booking changes over Supabase Realtime.
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;

-- Storage: venue hero photos (uploaded from venue-web) and Discover reels.
-- Both public-read; photo writes are scoped to the owner's "<uid>/" prefix.
INSERT INTO storage.buckets (id, name, public) VALUES
  ('venue-photos', 'venue-photos', true),
  ('venue-reels', 'venue-reels', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "venue-photos: public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'venue-photos');
CREATE POLICY "venue-photos: owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'venue-photos' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "venue-photos: owner modify" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'venue-photos' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "venue-photos: owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'venue-photos' AND (storage.foldername(name))[1] = (auth.uid())::text);
