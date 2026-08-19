'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { recordAward, recordPass, undoLastAction } from '@/lib/actions/distribution';
import type { ActionResult } from '@/lib/domain/errors';

/**
 * T048 — pass / award / undo.
 *
 * The clientActionId is minted here, per gesture, and reused verbatim on retry. That is what makes
 * a retry after a dropped connection safe (FR-048) — the database recognises the id and returns the
 * original row instead of creating a second one.
 */
export function PassAwardControls({
  distributionId,
  offerMemberId,
  offerName,
  canUndo,
  onError,
}: {
  distributionId: string;
  offerMemberId: string | null;
  offerName: string | null;
  canUndo: boolean;
  onError: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [retry, setRetry] = useState<(() => void) | null>(null);

  const run = (label: string, fn: (actionId: string) => Promise<ActionResult<unknown>>) => {
    const actionId = crypto.randomUUID();
    const attempt = () => {
      startTransition(async () => {
        onError(null);
        const result = await fn(actionId);
        if (!result.ok) {
          onError(result.message);
          // Same id — retrying cannot duplicate.
          setRetry(() => attempt);
        } else {
          setRetry(null);
        }
      });
    };
    attempt();
  };

  return (
    <div className="space-y-2">
      {offerMemberId && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={pending}
            onClick={() =>
              run('pass', (clientActionId) =>
                recordPass({ distributionId, memberId: offerMemberId, clientActionId }),
              )
            }
          >
            {offerName} passes
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={pending}
            onClick={() =>
              run('award', (clientActionId) =>
                recordAward({
                  distributionId,
                  memberId: offerMemberId,
                  mode: 'sequence',
                  clientActionId,
                }),
              )
            }
          >
            Award to {offerName}
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        {canUndo && (
          <Button
            variant="ghost"
            className="flex-1"
            disabled={pending}
            onClick={() => run('undo', () => undoLastAction({ distributionId }))}
          >
            Undo last action
          </Button>
        )}
        {retry && (
          <Button variant="secondary" className="flex-1" disabled={pending} onClick={retry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
