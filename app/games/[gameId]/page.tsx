import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { centsToChips, formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { BuyInGrid } from '@/components/game/buy-in-grid'
import { ScheduledView } from '@/components/game/scheduled-view'
import { LiveRoster } from '@/components/game/live-roster'
import { CashoutPanel } from '@/components/game/cashout-panel'
import { SettledView } from '@/components/game/settled-view'
import { StatusBanner } from '@/components/game/status-banner'
import type { Buyin } from '@/components/game/use-game-buyins'

const BUYIN_COLUMNS =
  'id, member_id, amount_cents, chips, note, created_at, created_by_member_id, voided_at, void_reason'

/** Start time passed and nobody ever hit Start. Server-rendered, so "now" is
 *  request time. */
function isOverdue(status: string, scheduledAt: string) {
  return status === 'scheduled' && new Date(scheduledAt).getTime() < Date.now()
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { gameId } = await params
  const { error: errorMessage } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: game } = await supabase
    .from('games')
    .select(
      'id, group_id, name, scheduled_at, location, seat_limit, default_buyin_cents, chips_per_dollar, status, admin_member_id, started_at, settled_at, groups(name)'
    )
    .eq('id', gameId)
    .maybeSingle()

  // RLS hides games in groups you don't belong to.
  if (!game) notFound()

  const [
    { data: signups },
    { data: members },
    { data: buyins },
    { data: totals },
  ] = await Promise.all([
    supabase
      .from('game_signups')
      .select('id, member_id, status, signup_order, group_members(display_name)')
      .eq('game_id', gameId)
      .order('signup_order'),
    supabase
      .from('group_members')
      .select('id, display_name, profile_id, is_active')
      .eq('group_id', game.group_id)
      .eq('is_active', true)
      .order('display_name'),
    supabase
      .from('buyins')
      .select(BUYIN_COLUMNS)
      .eq('game_id', gameId)
      .order('created_at', { ascending: false }),
    supabase
      .from('game_player_totals')
      .select(
        'member_id, display_name, buyin_cents, buyin_chips, cashout_cents, cashout_chips, adjustment_cents, net_cents'
      )
      .eq('game_id', gameId),
  ])

  const counting = game.status === 'reconciling'
  const settled = game.status === 'settled'
  const cancelled = game.status === 'cancelled'

  const [{ data: settlements }, { data: adjustments }] = await Promise.all([
    settled
      ? supabase
          .from('settlements')
          .select('id, from_member_id, to_member_id, amount_cents, status')
          .eq('game_id', gameId)
          .order('amount_cents', { ascending: false })
      : Promise.resolve({ data: null }),
    settled || counting
      ? supabase
          .from('game_adjustments')
          .select('id, member_id, amount_cents, reason')
          .eq('game_id', gameId)
      : Promise.resolve({ data: null }),
  ])

  const myMember = members?.find((m) => m.profile_id === user.id) ?? null
  const confirmed = signups?.filter((s) => s.status === 'confirmed') ?? []
  const waitlist = signups?.filter((s) => s.status === 'waitlist') ?? []
  const mySignup = signups?.find((s) => s.member_id === myMember?.id)

  const isAdmin = myMember?.id === game.admin_member_id
  const isOpen = game.status === 'scheduled' || game.status === 'active'
  const runsTheGame = isAdmin && isOpen
  const overdue = isOverdue(game.status, game.scheduled_at)

  const players = confirmed.map((s) => ({
    memberId: s.member_id,
    name: s.group_members?.display_name ?? 'Unknown',
  }))
  const nameOf = new Map((members ?? []).map((m) => [m.id, m.display_name]))

  // Anyone in the group not already in the game. A withdrawn signup can be
  // re-added, so it doesn't count as taken.
  const taken = new Set(
    (signups ?? [])
      .filter((s) => s.status !== 'withdrawn')
      .map((s) => s.member_id)
  )
  const available = (members ?? [])
    .filter((m) => !taken.has(m.id))
    .map((m) => ({ id: m.id, name: m.display_name }))

  async function joinGame() {
    'use server'
    const supabase = await createClient()
    if (!myMember) return
    const { error } = mySignup
      ? await supabase
          .from('game_signups')
          .update({ status: 'waitlist' }) // trigger recomputes to confirmed if a seat is free
          .eq('id', mySignup.id)
      : await supabase
          .from('game_signups')
          .insert({ game_id: gameId, member_id: myMember.id })
    if (error) {
      redirect(`/games/${gameId}?error=${encodeURIComponent(error.message)}`)
    }
    revalidatePath(`/games/${gameId}`)
  }

  async function withdraw() {
    'use server'
    const supabase = await createClient()
    if (!mySignup) return
    const { error } = await supabase
      .from('game_signups')
      .update({ status: 'withdrawn' })
      .eq('id', mySignup.id)
    if (error) {
      redirect(`/games/${gameId}?error=${encodeURIComponent(error.message)}`)
    }
    revalidatePath(`/games/${gameId}`)
  }

  async function endGame() {
    'use server'
    const supabase = await createClient()
    const { error } = await supabase.rpc('begin_reconciliation', {
      p_game_id: gameId,
    })
    if (error) {
      redirect(`/games/${gameId}?error=${encodeURIComponent(error.message)}`)
    }
    revalidatePath(`/games/${gameId}`)
  }

  async function reopenGame() {
    'use server'
    const supabase = await createClient()
    const { error } = await supabase.rpc('reopen_game', { p_game_id: gameId })
    if (error) {
      redirect(`/games/${gameId}?error=${encodeURIComponent(error.message)}`)
    }
    revalidatePath(`/games/${gameId}`)
  }

  async function handOff(formData: FormData) {
    'use server'
    const toMemberId = String(formData.get('to_member_id') ?? '')
    const reason = String(formData.get('reason') ?? '')
    if (!toMemberId) return
    const supabase = await createClient()
    const { error } = await supabase.rpc('transfer_game_admin', {
      p_game_id: gameId,
      p_to_member_id: toMemberId,
      p_reason: reason || null,
    })
    if (error) {
      redirect(`/games/${gameId}?error=${encodeURIComponent(error.message)}`)
    }
    // The old admin loses write access immediately.
    revalidatePath(`/games/${gameId}`)
  }

  const myStatusLabel = !mySignup
    ? 'Not signed up'
    : mySignup.status === 'confirmed'
      ? 'You’re in'
      : mySignup.status === 'waitlist'
        ? `Waitlist #${waitlist.findIndex((w) => w.id === mySignup.id) + 1}`
        : 'Withdrawn'

  const chipsPerDollar = Number(game.chips_per_dollar)

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <header>
        <Link
          href={`/groups/${game.group_id}`}
          className="text-xs text-muted-foreground"
        >
          &larr; {game.groups?.name}
        </Link>
        <h1 className="text-lg font-semibold">
          {game.name ?? formatWhen(game.scheduled_at)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatWhen(game.scheduled_at)}
          {game.location && ` · ${game.location}`}
        </p>
      </header>

      <StatusBanner
        status={game.status}
        overdue={overdue}
        buyinCents={game.default_buyin_cents}
        chips={centsToChips(game.default_buyin_cents, chipsPerDollar)}
        detail={
          overdue
            ? 'Start time has passed'
            : game.status === 'scheduled'
              ? `${formatCents(game.default_buyin_cents)} = ${centsToChips(
                  game.default_buyin_cents,
                  chipsPerDollar
                )} chips`
              : undefined
        }
      />

      {errorMessage && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {myMember && isOpen && (
        <Card>
          <CardContent className="flex items-center justify-between gap-2 py-3">
            <span className="text-sm font-medium">{myStatusLabel}</span>
            {mySignup && mySignup.status !== 'withdrawn' ? (
              <form action={withdraw}>
                <Button variant="outline" size="sm" type="submit">
                  Withdraw
                </Button>
              </form>
            ) : (
              <form action={joinGame}>
                <Button size="sm" type="submit">
                  {confirmed.length >= game.seat_limit
                    ? 'Join waitlist'
                    : "I'm in"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Each state renders a different page. */}
      {game.status === 'scheduled' && (
        <ScheduledView
          gameId={gameId}
          players={players}
          available={available}
          seatLimit={game.seat_limit}
          defaultBuyinCents={game.default_buyin_cents}
          myMemberId={myMember?.id ?? null}
          isAdmin={isAdmin}
        />
      )}

      {game.status === 'active' &&
        (runsTheGame ? (
          <BuyInGrid
            gameId={gameId}
            players={players}
            adminMemberId={game.admin_member_id}
            defaultBuyinCents={game.default_buyin_cents}
            chipsPerDollar={chipsPerDollar}
            initialBuyins={(buyins ?? []) as Buyin[]}
            available={available}
            startedAt={game.started_at}
          />
        ) : (
          <LiveRoster
            gameId={gameId}
            players={players}
            adminMemberId={game.admin_member_id}
            myMemberId={myMember?.id ?? null}
            initialBuyins={(buyins ?? []) as Buyin[]}
            started
            startedAt={game.started_at}
          />
        ))}

      {counting &&
        (isAdmin ? (
          <>
            <CashoutPanel
              gameId={gameId}
              chipsPerDollar={chipsPerDollar}
              hasAdjustments={(adjustments?.length ?? 0) > 0}
              rows={(totals ?? []).map((t) => ({
                memberId: t.member_id,
                name: t.display_name,
                buyinCents: t.buyin_cents,
                buyinChips: t.buyin_chips,
                adjustmentCents: t.adjustment_cents,
                chips:
                  t.cashout_chips === null ? null : String(t.cashout_chips),
              }))}
            />
            <form action={reopenGame}>
              <Button variant="ghost" size="sm" type="submit">
                Back to the game
              </Button>
            </form>
          </>
        ) : (
          <LiveRoster
            gameId={gameId}
            players={players}
            adminMemberId={game.admin_member_id}
            myMemberId={myMember?.id ?? null}
            initialBuyins={(buyins ?? []) as Buyin[]}
            started
            startedAt={game.started_at}
          />
        ))}

      {settled && (
        <SettledView
          rows={(totals ?? []).map((t) => ({
            memberId: t.member_id,
            name: t.display_name,
            buyinCents: t.buyin_cents,
            buyinChips: t.buyin_chips,
            cashoutCents: t.cashout_cents,
            cashoutChips: t.cashout_chips,
            adjustmentCents: t.adjustment_cents,
            netCents: t.net_cents,
          }))}
          transfers={(settlements ?? []).map((s) => ({
            id: s.id,
            fromMemberId: s.from_member_id,
            toMemberId: s.to_member_id,
            amountCents: s.amount_cents,
            status: s.status,
          }))}
          adjustments={(adjustments ?? []).map((a) => ({
            id: a.id,
            memberId: a.member_id,
            amountCents: a.amount_cents,
            reason: a.reason,
          }))}
          names={nameOf}
          myMemberId={myMember?.id ?? null}
          startedAt={game.started_at}
          settledAt={game.settled_at}
        />
      )}

      {cancelled && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Roster ({confirmed.length})
          </h2>
          {confirmed.map((s) => (
            <Card key={s.id}>
              <CardContent className="py-2.5 text-sm">
                {s.group_members?.display_name}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {runsTheGame && game.status === 'active' && (
        <form action={endGame}>
          <Button variant="outline" className="w-full" type="submit">
            End game &amp; count chips
          </Button>
        </form>
      )}

      {waitlist.length > 0 && !settled && !cancelled && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Waitlist ({waitlist.length})
          </h2>
          {waitlist.map((s, i) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between py-2.5">
                <span className="text-sm">
                  {s.group_members?.display_name}
                  {s.member_id === myMember?.id && (
                    <span className="text-muted-foreground"> (you)</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">#{i + 1}</span>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {runsTheGame && (
        <details className="rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Game settings
          </summary>
          <div className="flex flex-col gap-3 pt-3">
            <form action={handOff} className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="to_member_id">
                Hand off admin
              </label>
              <p className="text-xs text-muted-foreground">
                They get write access immediately and you lose it. Every
                handoff is logged.
              </p>
              <select
                id="to_member_id"
                name="to_member_id"
                required
                defaultValue=""
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="" disabled>
                  Pick a member…
                </option>
                {members
                  ?.filter((m) => m.id !== game.admin_member_id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                    </option>
                  ))}
              </select>
              <input
                name="reason"
                maxLength={120}
                placeholder="Reason (optional)"
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              />
              <Button variant="outline" size="sm" type="submit">
                Transfer admin
              </Button>
            </form>
          </div>
        </details>
      )}
    </main>
  )
}
