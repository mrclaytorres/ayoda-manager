import { ResetRoundDialog } from './ResetRoundDialog';
import type { Round, RoundLineRow } from '@/lib/types/database';

const ORDERING_LABEL: Record<Round['ordering_mode'], string> = {
  current_cp: 'ranked by current Combat Power',
  carry_previous: 'previous sequence carried forward',
  manual: 'arranged by hand',
};

// T064 — round number, ordering choice, and progress. FR-022, FR-039.
export function RoundHeader({ round, line }: { round: Round; line: RoundLineRow[] }) {
  const received = line.filter((row) => !row.eligible).length;

  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">Round {round.round_number}</h2>
        <p className="text-xs text-ink-dim">
          <span className="tabular-nums">
            {received} of {line.length}
          </span>{' '}
          received · {ORDERING_LABEL[round.ordering_mode]}
          {/* FR-022: the mode says how the round started; this says it no longer follows from
              that choice alone. */}
          {round.reordered_at && round.ordering_mode !== 'manual' && ', then rearranged'}
        </p>
      </div>
      <ResetRoundDialog roundId={round.id} roundNumber={round.round_number} received={received} />
    </header>
  );
}
