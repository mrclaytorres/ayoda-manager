import Link from 'next/link';
import { Mark } from '@/components/ui/Mark';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold tracking-wide">
        <Mark className="h-7 w-7 shrink-0" />
        aYoda Manager
      </h1>
      {children}
      <p className="pt-6 text-center text-sm">
        <Link href="/guide" className="text-ink-dim hover:text-ink">
          How to use this app
        </Link>
      </p>
    </div>
  );
}
