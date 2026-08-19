// T022 — Next 16 renamed middleware.ts to proxy.ts. A file named middleware.ts is inert here:
// sessions would silently stop refreshing and officers would appear to be logged out at random.
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
