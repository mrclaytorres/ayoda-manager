'use client';

import { useState } from 'react';
import { BackToPool } from './BackToPool';
import { ClosePrompt } from './ClosePrompt';
import { LineList } from './LineList';
import { ManualAwardDialog } from './ManualAwardDialog';
import { PassAwardControls } from './PassAwardControls';
import type {
  CurrentOfferRow,
  Distribution,
  OfferResponse,
  RoundLineRow,
} from '@/lib/types/database';

/**
 * T051 — the client shell that owns error state for the live distribution, so a GS code becomes a
 * message with a safe retry rather than a raw Postgres error.
 */
export function LiveDistribution({
  distribution,
  offer,
  line,
  responses,
}: {
  distribution: Distribution;
  offer: CurrentOfferRow | null;
  line: RoundLineRow[];
  responses: OfferResponse[];
}) {
  const [error, setError] = useState<string | null>(null);
  const passed = responses.filter((r) => r.kind === 'pass');
  const everyoneHasPassed = offer === null;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm">
          {error}
        </p>
      )}

      <PassAwardControls
        distributionId={distribution.id}
        offerMemberId={offer?.member_id ?? null}
        offerName={offer?.name ?? null}
        canUndo={responses.length > 0}
        onError={setError}
      />

      {/* The ways out that are not "someone took it": award off-sequence, settle it unclaimed,
          or back out of the whole thing because the wrong item was picked. */}
      <div className="flex flex-col gap-2">
        <ManualAwardDialog distributionId={distribution.id} line={line} onError={setError} />
        {everyoneHasPassed && <ClosePrompt distributionId={distribution.id} onError={setError} />}
        <BackToPool
          distributionId={distribution.id}
          itemName={distribution.item_name}
          responseCount={responses.length}
          onError={setError}
        />
      </div>

      <LineList
        line={line}
        passedMemberIds={passed.map((r) => r.member_id).filter((id): id is string => !!id)}
        offerMemberId={offer?.member_id ?? null}
      />
    </div>
  );
}
