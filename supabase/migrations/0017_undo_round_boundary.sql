-- T061 — undo across a round boundary. FR-035, research R-008.
-- Implemented in 0013 via reopen_round_for_undo. This migration records the rule it enforces.

comment on function public.reopen_round_for_undo(uuid) is
  'FR-035 across a round boundary: reopens a completed round, and deletes a subsequently started '
  'round only when that round holds no distributions. Otherwise raises GS008 — cascading through a '
  'round with real activity would destroy records the officer did not ask to lose.';
