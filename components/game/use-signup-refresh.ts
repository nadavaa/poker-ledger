'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Roster changes — a withdrawal, an admin removal, a waitlist promotion —
 * happen in the database, so re-render the server component when one lands.
 * Buy-in amounts come through their own subscription; this is only the seats.
 */
export function useSignupRefresh(gameId: string) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const channel = supabase
      .channel(`signups:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_signups',
          filter: `game_id=eq.${gameId}`,
        },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, gameId, router])
}
