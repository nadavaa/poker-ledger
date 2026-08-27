'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Buyin = {
  id: string
  member_id: string
  amount_cents: number
  chips: number
  note: string | null
  created_at: string
  created_by_member_id: string
  voided_at: string | null
  void_reason: string | null
  is_auto: boolean
}

/**
 * Live buy-ins for one game. Seeds from the server render, then keeps up via
 * Realtime. Rows are keyed by id so a local write and its Realtime echo
 * collapse into one entry.
 */
export function useGameBuyins(gameId: string, initial: Buyin[]) {
  const [byId, setById] = useState<Map<string, Buyin>>(
    () => new Map(initial.map((b) => [b.id, b]))
  )
  const supabase = useMemo(() => createClient(), [])

  const merge = useCallback((rows: Buyin[]) => {
    setById((prev) => {
      const next = new Map(prev)
      for (const row of rows) next.set(row.id, row)
      return next
    })
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel(`buyins:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'buyins',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          // Realtime hands us the row as it exists in the DB, which is truth.
          const row = payload.new as Buyin | Record<string, never>
          if (row && 'id' in row) merge([row as Buyin])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, gameId, merge])

  const buyins = useMemo(
    () =>
      [...byId.values()].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      ),
    [byId]
  )

  const live = useMemo(() => buyins.filter((b) => !b.voided_at), [buyins])

  const totalsByMember = useMemo(() => {
    const totals = new Map<string, { cents: number; count: number }>()
    for (const b of live) {
      const cur = totals.get(b.member_id) ?? { cents: 0, count: 0 }
      totals.set(b.member_id, {
        cents: cur.cents + b.amount_cents,
        count: cur.count + 1,
      })
    }
    return totals
  }, [live])

  const potCents = useMemo(
    () => live.reduce((sum, b) => sum + b.amount_cents, 0),
    [live]
  )

  return { buyins, live, totalsByMember, potCents, merge }
}
