import { redirect } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// T072 — the callback for password reset and email confirmation links.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    // `next` is a runtime value, so typedRoutes cannot verify it here.
    if (!error) redirect(next as Parameters<typeof redirect>[0]);
  }

  redirect('/login?error=link-invalid');
}
