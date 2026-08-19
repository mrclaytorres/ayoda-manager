import type { CurrentOfferRow, Distribution } from '@/lib/types/database';

// T047 — the offer holder, deliberately the first thing on the screen (SC-003).
export function OfferCard({
  distribution,
  offer,
  eligibleCount,
}: {
  distribution: Distribution;
  offer: CurrentOfferRow | null;
  eligibleCount: number;
}) {
  return (
    <section className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
      <p className="text-xs uppercase tracking-wide text-ink-dim">Distributing</p>
      <p className="mb-3 truncate text-lg font-semibold">{distribution.item_name}</p>

      {offer ? (
        <>
          <p className="text-xs uppercase tracking-wide text-ink-dim">Offer with</p>
          <p className="truncate text-2xl font-bold text-accent">{offer.name}</p>
          <p className="mt-1 text-xs text-ink-dim">
            #{offer.position} in line · {eligibleCount} still eligible
          </p>
        </>
      ) : (
        <p className="text-base font-medium">
          Everyone eligible has passed. Award it manually or record it unclaimed.
        </p>
      )}
    </section>
  );
}
