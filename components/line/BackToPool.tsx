'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cancelDistribution } from '@/lib/actions/distribution';

/**
 * FR-055 — the way out of a distribution started on the wrong item.
 *
 * Distinct from "record as unclaimed", which means the item was offered and nobody took it and so
 * belongs in the history. This means it should never have been started, so the record goes and the
 * item returns to the pool.
 */
export function BackToPool({
  distributionId,
  itemName,
  responseCount,
  onError,
}: {
  distributionId: string;
  itemName: string;
  responseCount: number;
  onError: (message: string | null) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const cancel = () => {
    startTransition(async () => {
      const result = await cancelDistribution({ distributionId });
      setConfirming(false);
      onError(result.ok ? null : result.message);
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        className="w-full"
        disabled={pending}
        // Nothing recorded yet means nothing to lose, so the ask would be noise.
        onClick={() => (responseCount === 0 ? cancel() : setConfirming(true))}
      >
        <span aria-hidden="true">←</span> Back to the pool
      </Button>

      <ConfirmDialog
        open={confirming}
        title="Discard this distribution?"
        confirmLabel="Discard"
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={cancel}
        body={
          <>
            {responseCount} recorded {responseCount === 1 ? 'response' : 'responses'} will be
            cleared, and <span className="text-ink">{itemName}</span> goes back to the pool. Nothing
            is written to the history.
          </>
        }
      />
    </>
  );
}
