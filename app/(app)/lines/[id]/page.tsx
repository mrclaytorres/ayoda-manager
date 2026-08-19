import Link from 'next/link';
import { LiveDistribution } from '@/components/line/LiveDistribution';
import { LineList } from '@/components/line/LineList';
import { OfferCard } from '@/components/line/OfferCard';
import { ItemPool } from '@/components/line/ItemPool';
import { ReorderDialog } from '@/components/line/ReorderDialog';
import { RoundHeader } from '@/components/line/RoundHeader';
import { loadLineState } from '@/lib/queries/line';

// T046 / T053 — one line's board.
export default async function LinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { round, line, distribution, offer, responses, members, pool } = await loadLineState(id);

  // T053 — no active round. Without this, the MVP has no way to begin.
  if (!round) {
    const hasRoster = members.length > 0;
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">No round in progress</h1>
        {hasRoster ? (
          <>
            <p className="text-sm text-ink-dim">
              {members.length} member{members.length === 1 ? '' : 's'} on the roster, ready to be
              ranked by Combat Power.
            </p>
            <Link
              href={`/lines/${id}/round/start`}
              className="tap flex w-full items-center justify-center rounded-xl bg-accent px-4 py-2.5 font-semibold text-surface"
            >
              Start a round
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-dim">
              Add members to the roster before starting a round.
            </p>
            <Link
              href={`/lines/${id}/roster`}
              className="tap flex w-full items-center justify-center rounded-xl bg-accent px-4 py-2.5 font-semibold text-surface"
            >
              Go to the roster
            </Link>
          </>
        )}
      </div>
    );
  }

  const eligibleCount = line.filter((row) => row.eligible).length;

  return (
    <div className="space-y-5">
      <RoundHeader round={round} line={line} />

      {distribution ? (
        <>
          {/* SC-003 — the offer holder is the first thing rendered. */}
          <OfferCard distribution={distribution} offer={offer} eligibleCount={eligibleCount} />
          <LiveDistribution
            distribution={distribution}
            offer={offer}
            line={line}
            responses={responses}
          />
        </>
      ) : (
        <>
          <ItemPool lineId={id} pool={pool} />
          <LineList line={line} passedMemberIds={[]} offerMemberId={null} />
          {/* Between distributions is the natural moment to fix the order, so it sits under the
              line rather than competing with the pool. */}
          {line.length > 1 && <ReorderDialog roundId={round.id} line={line} />}
        </>
      )}
    </div>
  );
}
