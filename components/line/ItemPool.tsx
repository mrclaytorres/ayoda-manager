'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Textarea } from '@/components/ui/Field';
import { addItems, removeItem } from '@/lib/actions/items';
import { startDistribution } from '@/lib/actions/distribution';
import { itemNameList } from '@/lib/domain/schemas';
import type { ItemPoolRow } from '@/lib/types/database';

/**
 * The loot waiting to be handed out, and the pick that starts a distribution.
 *
 * Entry is a textarea rather than a row of inputs because the officer arrives with a whole list
 * after a raid — one item per line is the fastest way to get it in on a phone. It sits behind a
 * dialog so the pool and the line stay the whole screen once the loot is in.
 */
export function ItemPool({ lineId, pool }: { lineId: string; pool: ItemPoolRow[] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setDraft('');
    setAddError(null);
  };

  const add = () => {
    const parsed = itemNameList.safeParse(draft);
    if (!parsed.success) return setAddError(parsed.error.issues[0].message);

    startTransition(async () => {
      const result = await addItems({ lineId, names: parsed.data });
      if (!result.ok) setAddError(result.message);
      else close();
    });
  };

  const distribute = (item: ItemPoolRow) => {
    // FR-048: minted here, once per tap, so a retry cannot open a second distribution.
    const clientActionId = crypto.randomUUID();
    setBusyId(item.id);
    startTransition(async () => {
      const result = await startDistribution({ itemId: item.id, clientActionId });
      setBusyId(null);
      setActionError(result.ok ? null : result.message);
    });
  };

  const remove = (item: ItemPoolRow) => {
    setBusyId(item.id);
    startTransition(async () => {
      const result = await removeItem({ id: item.id });
      setBusyId(null);
      setActionError(result.ok ? null : result.message);
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink-dim">
          Item pool{pool.length > 0 && ` · ${pool.length}`}
        </h2>
        {pool.length > 0 && (
          <Button
            variant="secondary"
            className="shrink-0 px-3 text-sm"
            onClick={() => setOpen(true)}
          >
            Add items
          </Button>
        )}
      </div>

      {actionError && (
        <p role="alert" className="rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm">
          {actionError}
        </p>
      )}

      {pool.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-dim">
            No items yet. Add what dropped, then pick one to distribute.
          </p>
          <Button className="w-full" onClick={() => setOpen(true)}>
            Add items
          </Button>
        </div>
      ) : (
        // Chips rather than full-width rows: a pool of a dozen items then costs a couple of
        // lines instead of a screenful, and the name itself is the button that hands it out.
        <ul className="flex flex-wrap gap-2">
          {pool.map((item) => (
            <li
              key={item.id}
              className="flex items-center overflow-hidden rounded-xl border border-accent/40 bg-surface-2"
            >
              <button
                onClick={() => distribute(item)}
                disabled={pending}
                aria-label={`Distribute ${item.name}`}
                className="max-w-[14rem] truncate bg-accent/10 px-3 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-45"
              >
                {busyId === item.id && pending ? 'Starting…' : item.name}
              </button>
              {/* Its own target, divided from the name: removing is not what a mis-tap should do. */}
              <button
                onClick={() => remove(item)}
                disabled={pending}
                aria-label={`Remove ${item.name} from the pool`}
                className="border-l border-accent/40 px-2.5 text-lg leading-none text-ink-dim hover:bg-danger/20 hover:text-ink disabled:opacity-45"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onClose={close} title="Add items to the pool">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Field label="Item names" hint="One per line." error={addError}>
            <Textarea
              name="itemNames"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              placeholder={'Force Blade\nChakra Ring'}
              autoComplete="off"
            />
          </Field>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={close}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={pending || draft.trim() === ''}>
              {pending ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
