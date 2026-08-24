import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Handles the PKCE code exchange for both OAuth (Google) and magic links.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next')
  // Only allow same-origin paths, never absolute URLs.
  const next = rawNext?.startsWith('/') ? rawNext : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
