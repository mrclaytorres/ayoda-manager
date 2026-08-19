'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { closeUnclaimed } from '@/lib/actions/distribution';

/**
 * T050 — settling a distribution nobody accepted (FR-034).
 * The two ways out sit side by side because the officer is choosing between them, not being warned.
 */
export function ClosePrompt({
  distributionId,
  onError,
}: {
  distributionId: string;
  onError: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      className="w-full"
      disabled={pending}
      onClick={() => {
        const clientActionId = crypto.randomUUID();
        startTransition(async () => {
          const result = await closeUnclaimed({ distributionId, clientActionId });
          onError(result.ok ? null : result.message);
        });
      }}
    >
      Record as unclaimed
    </Button>
  );
}
