import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adoptGoogleAvatar } from '@/lib/supabase/adopt-google-avatar'

// Completes magic-link sign-in. Handles both link styles:
// - token_hash (custom email template): works from any browser
// - code (default template, PKCE): only works in the browser that
//   requested the link, because the code verifier lives in a cookie there
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next')
  // Only allow same-origin paths, never absolute URLs.
  const next = rawNext?.startsWith('/') ? rawNext : '/'

  const supabase = await createClient()

  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      if (data.user) await adoptGoogleAvatar(supabase, data.user)
      return NextResponse.redirect(`${origin}${next}`)
    }
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (data.user) await adoptGoogleAvatar(supabase, data.user)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
