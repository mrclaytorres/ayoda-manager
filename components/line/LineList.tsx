import type { RoundLineRow } from '@/lib/types/database';

// T047 — the line as displayed. FR-015, FR-017, FR-019, FR-024.
export function LineList({
  line,
  passedMemberIds,
  offerMemberId,
}: {
  line: RoundLineRow[];
  passedMemberIds: string[];
  offerMemberId: string | null;
}) {
  const passed = new Set(passedMemberIds);

  return (
    <ol className="space-y-1.5">
      {line.map((row) => {
        const isOffer = row.member_id === offerMemberId;
        return (
          <li
            key={row.member_id}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              isOffer
                ? 'border-accent bg-accent/10'
                : row.eligible
                  ? 'border-line bg-surface-2'
                  : 'border-line/50 bg-surface-2/40 opacity-60'
            }`}
          >
            <span className="w-6 shrink-0 text-sm tabular-nums text-ink-dim">{row.position}</span>

            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{row.name}</span>
              <span className="block text-xs text-ink-dim">
                {row.ranked_cp === null ? (
                  <span className="italic">no Combat Power</span>
                ) : (
                  <>
                    <span className="tabular-nums">{row.ranked_cp.toLocaleString()}</span> CP
                  </>
                )}
                {/* FR-019 — both values, so the officer knows what the round was ranked on. */}
                {row.cp_change_pending && (
                  <span className="text-accent">
                    {' '}
                    → {row.current_cp === null ? 'none' : row.current_cp.toLocaleString()} next
                    round
                  </span>
                )}
                {/* FR-017 — the tie is visible so it can be settled by guild convention. */}
                {row.tied && <span className="text-ink-dim"> · tied</span>}
              </span>
            </span>

            {/* FR-056 — the status column, right-aligned. Capped and allowed to wrap rather than
                shrink-0: a long item name would otherwise push the row off a 360px screen. */}
            <span className="max-w-[45%] text-right text-xs">
              {!row.eligible && (
                <span className="text-good">received {row.received_item ?? 'this round'}</span>
              )}
              {row.eligible && passed.has(row.member_id) && (
                <span className="text-ink-dim">passed</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
