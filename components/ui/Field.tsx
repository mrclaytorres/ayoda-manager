import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

/**
 * The hint and error sit OUTSIDE the <label>. With a wrapping label the accessible name is the
 * label's entire text content, so keeping the hint inside would make the control's name
 * "Combat Power Whole number, 0 or more." — wrong for screen readers and for any test that looks
 * a field up by its label.
 */
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-dim">{label}</span>
        {children}
      </label>
      {hint && !error && <span className="mt-1 block text-xs text-ink-dim">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full min-h-[44px] rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-base text-ink placeholder:text-ink-dim/60 focus:border-accent focus:outline-none ${className}`}
    />
  );
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-base text-ink placeholder:text-ink-dim/60 focus:border-accent focus:outline-none ${className}`}
    />
  );
}
