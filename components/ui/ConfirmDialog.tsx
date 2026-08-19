'use client';

import { Button } from './Button';
import { Dialog } from './Dialog';

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  pending = false,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <div className="mb-5 text-sm text-ink-dim">{body}</div>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button variant="danger" className="flex-1" onClick={onConfirm} disabled={pending}>
          {pending ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
