'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { removeLine, renameLine } from '@/lib/actions/lines';
import { lineName } from '@/lib/domain/schemas';
import type { Line } from '@/lib/types/database';

/**
 * Rename or delete one line.
 *
 * Deleting takes the line's members, items, rounds, and their history with it, so it asks for the
 * line's name back — the same shape of guard as the history deletion, for the same reason.
 */
export function LineSettings({ line }: { line: Line }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(line.name);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setName(line.name);
    setConfirmation('');
    setError(null);
  };

  const save = () => {
    const parsed = lineName.safeParse(name);
    if (!parsed.success) return setError(parsed.error.issues[0].message);

    startTransition(async () => {
      const result = await renameLine({ id: line.id, name: parsed.data });
      if (!result.ok) return setError(result.message);
      close();
      router.refresh();
    });
  };

  const destroy = () => {
    startTransition(async () => {
      const result = await removeLine({ id: line.id });
      if (!result.ok) return setError(result.message);
      close();
      router.push('/');
    });
  };

  const nameMatches = confirmation === line.name;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="min-h-[44px] shrink-0 px-2 text-sm text-ink-dim hover:text-ink"
      >
        Settings
      </button>

      <Dialog open={open} onClose={close} title={`${line.name} settings`}>
        <div className="space-y-5">
          <div className="space-y-3">
            <Field label="Line name" error={error}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </Field>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={save}
                disabled={pending || name.trim() === '' || name === line.name}
              >
                {pending ? 'Saving…' : 'Rename'}
              </Button>
            </div>
          </div>

          <div className="space-y-3 border-t border-line pt-4">
            <p className="text-sm text-ink-dim">
              Deleting this line removes its members, its item pool, and every round it has run,
              including their history. Nothing else is affected.
            </p>
            <Field label={`Type ${line.name} to confirm`}>
              <Input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                aria-label={`Type ${line.name} to confirm`}
              />
            </Field>
            <Button
              variant="danger"
              className="w-full"
              onClick={destroy}
              disabled={pending || !nameMatches}
            >
              {pending ? 'Deleting…' : 'Delete this line'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
