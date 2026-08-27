import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { BuyInGrid } from '@/components/game/buy-in-grid'
import { PreStartPanel } from '@/components/game/pre-start-panel'
import { LiveRoster } from '@/components/game/live-roster'
import type { Buyin } from '@/components/game/use-game-buyins'

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
      'id, group_id, name, scheduled_at, location, seat_limit, default_buyin_cents, chips_per_dollar, status, admin_member_id, groups(name)'
    )
    .eq('id', gameId)
    .maybeSingle()

  // RLS hides games in groups you don't belong to.
  if (!game) notFound()

  const [{ data: signups }, { data: members }, { data: buyins }, { data: transfers }] =
    await Promise.all([
      supabase
        .from('game_signups')
        .select(
          'id, member_id, status, signup_order, group_members(display_name)'
        )
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
        .select(
          'id, member_id, amount_cents, chips, note, created_at, created_by_member_id, voided_at, void_reason'
        )
        .eq('game_id', gameId)
        .order('created_at', { ascending: false }),
      supabase
        .from('game_admin_transfers')
        .select('id, created_at, was_forced, from_member_id, to_member_id')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false }),
    ])

  const myMember = members?.find((m) => m.profile_id === user.id) ?? null
  const confirmed = signups?.filter((s) => s.status === 'confirmed') ?? []
  const waitlist = signups?.filter((s) => s.status === 'waitlist') ?? []
  const mySignup = signups?.find((s) => s.member_id === myMember?.id)

  const isAdmin = myMember?.id === game.admin_member_id
  const isOpen = game.status === 'scheduled' || game.status === 'active'
  const started = game.status !== 'scheduled'
  // RLS is the real guard on every write below; this only decides what to draw.
  const runsTheGame = isAdmin && isOpen

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

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
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
        <p className="text-sm text-muted-foreground">
          {formatCents(game.default_buyin_cents)} buy-in ·{' '}
          {game.chips_per_dollar} chips/$ · {confirmed.length}/
          {game.seat_limit} seats
          {game.status !== 'scheduled' && ` · ${game.status}`}
        </p>
      </header>

      {myMember && (
        <Card>
          <CardContent className="flex items-center justify-between gap-2 py-3">
            <span className="text-sm font-medium">{myStatusLabel}</span>
            {isOpen &&
              (mySignup && mySignup.status !== 'withdrawn' ? (
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
              ))}
          </CardContent>
        </Card>
      )}

      {errorMessage && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {runsTheGame ? (
        game.status === 'scheduled' ? (
          <PreStartPanel
            gameId={gameId}
            players={players}
            available={available}
            defaultBuyinCents={game.default_buyin_cents}
          />
        ) : (
          <BuyInGrid
            gameId={gameId}
            players={players}
            adminMemberId={game.admin_member_id}
            defaultBuyinCents={game.default_buyin_cents}
            chipsPerDollar={Number(game.chips_per_dollar)}
            initialBuyins={(buyins ?? []) as Buyin[]}
            available={available}
          />
        )
      ) : (
        <LiveRoster
          gameId={gameId}
          players={players}
          adminMemberId={game.admin_member_id}
          myMemberId={myMember?.id ?? null}
          initialBuyins={(buyins ?? []) as Buyin[]}
          started={started}
        />
      )}

      {waitlist.length > 0 && (
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

            {transfers && transfers.length > 0 && (
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Handoff history
                </h3>
                {transfers.map((t) => (
                  <p key={t.id} className="text-xs text-muted-foreground">
                    {nameOf.get(t.from_member_id) ?? 'someone'} →{' '}
                    {nameOf.get(t.to_member_id) ?? 'someone'}
                    {t.was_forced && ' (forced)'} ·{' '}
                    {new Date(t.created_at).toLocaleString()}
                  </p>
                ))}
              </div>
            )}
          </div>
        </details>
      )}
    </main>
  )
}
