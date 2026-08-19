/**
 * T018 — database types.
 *
 * Hand-written to match supabase/migrations. Regenerate against a running stack with
 * `npm run db:types`, which overwrites this file from the live schema.
 */

export type OrderingMode = 'current_cp' | 'carry_previous' | 'manual';
export type RoundStatus = 'active' | 'complete';
export type DistributionStatus = 'in_progress' | 'awarded' | 'unclaimed';
export type AwardMode = 'sequence' | 'manual';
export type OfferResponseKind = 'pass' | 'accept';

export interface Profile {
  id: string;
  guild_name: string;
  created_at: string;
}

export interface Line {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

export interface Member {
  id: string;
  owner_id: string;
  line_id: string;
  name: string;
  /** Optional: a hand-arranged line may never use it. */
  combat_power: number | null;
  created_at: string;
  updated_at: string;
}

export interface Round {
  id: string;
  owner_id: string;
  line_id: string;
  round_number: number;
  ordering_mode: OrderingMode;
  status: RoundStatus;
  started_at: string;
  completed_at: string | null;
  /** Set once the officer rearranges a live round by hand; ordering_mode keeps the initial choice. */
  reordered_at: string | null;
}

export interface RoundEntry {
  id: string;
  owner_id: string;
  round_id: string;
  member_id: string;
  ranked_cp: number | null;
  position_seq: number;
  received_at: string | null;
}

export interface Distribution {
  id: string;
  owner_id: string;
  round_id: string;
  item_id: string | null;
  item_name: string;
  status: DistributionStatus;
  recipient_member_id: string | null;
  recipient_name: string | null;
  award_mode: AwardMode | null;
  client_action_id: string;
  created_at: string;
  closed_at: string | null;
}

export interface OfferResponse {
  id: string;
  distribution_id: string;
  owner_id: string;
  member_id: string | null;
  member_name: string;
  kind: OfferResponseKind;
  seq: number;
  client_action_id: string;
  created_at: string;
}

export interface Item {
  id: string;
  owner_id: string;
  line_id: string;
  name: string;
  seq: number;
  created_at: string;
}

/** A row of `v_item_pool` — items still waiting to be distributed. */
export type ItemPoolRow = Item;

/** A row of `v_round_line` — the line exactly as displayed. */
export interface RoundLineRow {
  round_id: string;
  line_id: string;
  owner_id: string;
  member_id: string;
  name: string;
  ranked_cp: number | null;
  current_cp: number | null;
  cp_change_pending: boolean;
  received_at: string | null;
  eligible: boolean;
  position: number;
  tied: boolean;
  /** What they took this round. Non-null exactly when `eligible` is false. */
  received_item: string | null;
}

/** A row of `v_current_offer` — whose turn it is. */
export interface CurrentOfferRow {
  distribution_id: string;
  owner_id: string;
  member_id: string;
  name: string;
  position: number;
}
