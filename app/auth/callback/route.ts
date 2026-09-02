import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adoptGoogleAvatar } from '@/lib/supabase/adopt-google-avatar'

// Handles the PKCE code exchange for both OAuth (Google) and magic links.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next')
  // Only allow same-origin paths, never absolute URLs.
  const next = rawNext?.startsWith('/') ? rawNext : '/'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Best effort, never blocking: a missing photo is not a failed sign-in.
      if (data.user) await adoptGoogleAvatar(supabase, data.user)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
