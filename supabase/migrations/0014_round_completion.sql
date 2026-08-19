-- T058 — round completion on the award path.
-- Implemented in 0011 via maybe_complete_round, which record_award calls after setting received_at.
-- This migration adds the guarantee that a round can never be left active with an empty line,
-- independently of which code path emptied it.

comment on function public.maybe_complete_round(uuid) is
  'FR-037: completes a round when no eligible entries remain. Called from record_award and from the '
  'round_entries delete trigger. No new round is created — the officer chooses the next ordering.';
