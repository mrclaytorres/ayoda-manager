-- T011: enumerations for round, distribution, and response state.

create type public.ordering_mode       as enum ('current_cp', 'carry_previous');
create type public.round_status        as enum ('active', 'complete');
create type public.distribution_status as enum ('in_progress', 'awarded', 'unclaimed');
create type public.award_mode          as enum ('sequence', 'manual');
create type public.offer_response_kind as enum ('pass', 'accept');
