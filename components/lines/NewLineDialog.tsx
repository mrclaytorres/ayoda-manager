'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { createLine } from '@/lib/actions/lines';
import { lineName } from '@/lib/domain/schemas';

export function NewLineDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setName('');
    setError(null);
  };

  const submit = () => {
    const parsed = lineName.safeParse(name);
    if (!parsed.success) return setError(parsed.error.issues[0].message);

    startTransition(async () => {
      const result = await createLine({ name: parsed.data });
      if (!result.ok) return setError(result.message);
      close();
      // Straight into the new line: the next thing to do is add its members.
      router.push(`/lines/${result.data.id}/roster`);
    });
  };

  return (
    <>
      <Button className="shrink-0 px-3 text-sm" onClick={() => setOpen(true)}>
        New line
      </Button>

      <Dialog open={open} onClose={close} title="New line">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Line name" hint="For example: Weapons, Armour, Talics." error={error}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="off"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={pending || name.trim() === ''}>
              {pending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
