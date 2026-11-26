'use client'

import { useState } from 'react'
import { PlayerSheet } from '@/components/game/buy-in-grid'
import type { Buyin } from '@/components/game/use-game-buyins'

const MEMBER = 'dev-member-gilad'

function fakeBuyins(count: number): Buyin[] {
  const start = Date.parse('2026-11-21T20:00:00Z')
  return Array.from({ length: count }, (_, i) => ({
    id: `dev-buyin-${i}`,
    member_id: MEMBER,
    amount_cents: 5000,
    chips: 500,
    note: i === 3 ? 'paid cash' : null,
    created_at: new Date(start + i * 9 * 60_000).toISOString(),
    created_by_member_id: 'dev-admin',
    voided_at: i === 1 ? new Date(start + 10 * 60_000).toISOString() : null,
    void_reason: i === 1 ? 'admin correction' : null,
  }))
}

/** The real PlayerSheet over a fake game screen, so overlap is visible. */
export function PlayerSheetPreview({
  count,
  cashedOut,
}: {
  count: number
  cashedOut: boolean
}) {
  const [open, setOpen] = useState(true)
  const noop = () => {}
  return (
    <main className="mx-auto flex max-w-md flex-col gap-2.5 p-4">
      <p className="text-sm text-muted-foreground">Fake game screen behind the sheet</p>
      <div className="grid grid-cols-2 gap-2.5">
        {['Gilad', 'Nadav', 'Itay', 'Omer', 'Roni', 'Tal'].map((n) => (
          <div key={n} className="min-h-[7.5rem] rounded-2xl border border-border bg-card p-3.5">
            {n}
          </div>
        ))}
      </div>
      {!open && (
        <button className="underline" onClick={() => setOpen(true)}>
          Reopen sheet
        </button>
      )}
      <PlayerSheet
        open={open}
        player={{ memberId: MEMBER, name: 'Gilad' }}
        chipsPerDollar={10}
        defaultBuyinCents={5000}
        buyins={fakeBuyins(count)}
        cashout={
          cashedOut
            ? { memberId: MEMBER, chips: 1200, recordedAt: '2026-11-21T23:00:00Z', leftTable: true }
            : null
        }
        timeZone="America/New_York"
        onClose={() => setOpen(false)}
        onAdd={noop}
        onVoid={noop}
        onRemove={noop}
        onCashOut={noop}
        onUndoCashOut={noop}
      />
    </main>
  )
}
