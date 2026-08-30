'use client'

import { formatCents } from '@/lib/money'
import { Card, CardContent } from '@/components/ui/card'
import { ActivityFeed } from './activity-feed'
import { useGameBuyins, type Buyin } from './use-game-buyins'
import { useSignupRefresh } from './use-signup-refresh'
import { PotHeader } from './pot-header'
import { CollapsibleSection } from '@/components/collapsible-section'
import type { Player } from './buy-in-grid'

/**
 * Read-only live view for players: what everyone has staked, and the feed of
 * every buy-in as it happens. This is what kills "did you write mine down?".
 */
export function LiveRoster({
  gameId,
  players,
  adminMemberId,
  myMemberId,
  initialBuyins,
  started,
  startedAt,
  beforeActivity,
}: {
  gameId: string
  players: Player[]
  adminMemberId: string
  myMemberId: string | null
  initialBuyins: Buyin[]
  /** Before the first hand nobody has staked anything, so show no money. */
  started: boolean
  startedAt: string | null
  /** Rendered between the roster and the feed — the food order lives here. */
  beforeActivity?: React.ReactNode
}) {
  const { buyins, totalsByMember, potCents, potChips } = useGameBuyins(
    gameId,
    initialBuyins
  )
  useSignupRefresh(gameId)
  const names = new Map(players.map((p) => [p.memberId, p.name]))
  const mine = myMemberId ? totalsByMember.get(myMemberId) : undefined

  return (
    <div className="flex flex-col gap-4">
      {started && (
        <PotHeader
          potCents={potCents}
          potChips={potChips}
          startedAt={startedAt}
        />
      )}

      {started && myMemberId && (
        <div className="flex items-end justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            You&apos;ve staked
          </span>
          <span className="money-display text-2xl font-semibold">
            {formatCents(mine?.cents ?? 0)}
            <span className="money ml-1.5 text-xs font-normal text-muted-foreground">
              {mine?.count ?? 0}×
            </span>
          </span>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Confirmed ({players.length})
        </h2>
        {players.map((p) => {
          const total = totalsByMember.get(p.memberId)
          return (
            <Card key={p.memberId}>
              <CardContent className="flex items-center justify-between gap-2 py-3">
                <span className="text-sm">
                  {p.name}
                  {p.memberId === myMemberId && (
                    <span className="text-muted-foreground"> (you)</span>
                  )}
                  {p.memberId === adminMemberId && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      admin
                    </span>
                  )}
                </span>
                {started && (
                  <span className="money-display shrink-0 text-lg font-semibold">
                    {formatCents(total?.cents ?? 0)}
                    <span className="money ml-1.5 text-xs font-normal text-muted-foreground">
                      {total?.count ?? 0}×
                    </span>
                  </span>
                )}
              </CardContent>
            </Card>
          )
        })}
      </section>

      {beforeActivity}

      {started && (
        <CollapsibleSection title="Activity">
          <ActivityFeed
            buyins={buyins}
            names={names}
            adminMemberId={adminMemberId}
            myMemberId={myMemberId}
          />
        </CollapsibleSection>
      )}
    </div>
  )
}
