'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'

export type PaymentMethodRow = {
  memberId: string
  name: string
  /** With the default already applied: no Venmo or Zelle on file means cash. */
  paysCash: boolean
  hasApp: boolean
}

/**
 * A mixed game: who pays cash tonight and who pays by app. Cash players
 * settle with each other first, so the fewer people who cross over, the
 * fewer people need to find an ATM.
 *
 * Each player flips their own; the admin can flip anyone's. set_pays_cash()
 * checks both and refuses once the game is settled.
 */
export function PaymentMethodsPanel({
  gameId,
  rows,
  myMemberId,
  isAdmin,
}: {
  gameId: string
  rows: PaymentMethodRow[]
  myMemberId: string | null
  isAdmin: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [errors, setErrors] = useState<Record<string, string>>({})
  // The tap shows at once; the write and the page refresh catch up behind it.
  // Waiting for the refresh first made every tap take about a second.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  // When the server's answer arrives it wins, so a stale override never
  // shadows what the database actually holds.
  const serverSig = rows.map((r) => `${r.memberId}:${r.paysCash}`).join(',')
  const [seenSig, setSeenSig] = useState(serverSig)
  if (seenSig !== serverSig) {
    setSeenSig(serverSig)
    setOverrides({})
  }

  if (rows.length === 0) return null

  const shown = rows.map((r) =>
    r.memberId in overrides ? { ...r, paysCash: overrides[r.memberId] } : r
  )

  async function setCash(memberId: string, paysCash: boolean) {
    setErrors((e) => ({ ...e, [memberId]: '' }))
    setOverrides((o) => ({ ...o, [memberId]: paysCash }))
    const { error } = await supabase.rpc('set_pays_cash', {
      p_game_id: gameId,
      p_member_id: memberId,
      p_pays_cash: paysCash,
    })
    if (error) {
      setOverrides((o) => {
        const rest = { ...o }
        delete rest[memberId]
        return rest
      })
      setErrors((e) => ({ ...e, [memberId]: error.message }))
      return
    }
    router.refresh()
  }

  const cashCount = shown.filter((r) => r.paysCash).length

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground">
          Paying tonight
        </h2>
        <p className="text-xs text-muted-foreground">
          {cashCount} cash · {rows.length - cashCount} app. Cash players settle
          with each other first.
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col divide-y divide-border py-0">
          {shown.map((r) => {
            const canChange = isAdmin || r.memberId === myMemberId
            return (
              <div key={r.memberId} className="flex flex-col gap-1 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm">
                    {r.name}
                    {r.memberId === myMemberId && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </span>
                  {canChange ? (
                    <div
                      role="group"
                      aria-label={`How ${r.name} pays`}
                      className="flex shrink-0 rounded-lg border border-border p-0.5 text-xs"
                    >
                      {[
                        { cash: true, label: 'Cash' },
                        { cash: false, label: 'App' },
                      ].map((o) => (
                        <button
                          key={o.label}
                          type="button"
                          aria-pressed={r.paysCash === o.cash}
                          onClick={() =>
                            r.paysCash !== o.cash && setCash(r.memberId, o.cash)
                          }
                          className="rounded-md px-3 py-1 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {r.paysCash ? 'Cash' : 'App'}
                    </span>
                  )}
                </div>
                {!r.paysCash && !r.hasApp && (
                  <p className="text-xs text-pending">
                    No Venmo or Zelle on file, so others can&apos;t pay{' '}
                    {r.memberId === myMemberId ? 'you' : 'them'} by app.
                  </p>
                )}
                {errors[r.memberId] && (
                  <p className="text-xs text-down">{errors[r.memberId]}</p>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </section>
  )
}
