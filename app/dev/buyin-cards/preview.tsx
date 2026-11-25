'use client'

import { useState } from 'react'
import { PlayerCard } from '@/components/game/buy-in-grid'
import { useTwoTap } from '@/components/game/use-two-tap'

const PLAYERS = ['Gilad', 'Nadav', 'Itay', 'Omer', 'Roni', 'Tal'].map((n) => ({
  memberId: `dev-${n.toLowerCase()}`,
  name: n,
}))
const BUYIN = 5000

/**
 * The real cards and two-tap logic with a fake database: a confirm takes
 * 400ms to "save", like a slow phone connection.
 */
export function BuyinCardsPreview() {
  const [totals, setTotals] = useState<Record<string, { cents: number; count: number }>>({
    'dev-gilad': { cents: 10000, count: 2 },
    'dev-nadav': { cents: 5000, count: 1 },
  })
  const [log, setLog] = useState<string[]>([])
  const twoTap = useTwoTap(async (memberId) => {
    await new Promise((r) => setTimeout(r, 400))
    setTotals((t) => {
      const cur = t[memberId] ?? { cents: 0, count: 0 }
      return { ...t, [memberId]: { cents: cur.cents + BUYIN, count: cur.count + 1 } }
    })
    setLog((l) => [`+$50 for ${memberId.slice(4)}`, ...l].slice(0, 5))
  })

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <p className="text-sm text-muted-foreground">
        Tap once to arm, again to add. Fake data.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {PLAYERS.map((p) => (
          <PlayerCard
            key={p.memberId}
            player={p}
            total={totals[p.memberId]}
            cashedOut={p.name === 'Tal' ? { chips: 800, cents: 8000 } : null}
            defaultBuyinCents={BUYIN}
            armKey={twoTap.armed?.memberId === p.memberId ? twoTap.armed.key : null}
            adding={twoTap.adding[p.memberId] ?? 0}
            onTap={() => twoTap.tap(p.memberId)}
            onLongPress={() => twoTap.disarm()}
          />
        ))}
      </div>
      <ul className="text-xs text-muted-foreground">
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <div className="h-[60vh]" />
    </main>
  )
}
