import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

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

  const [{ data: signups }, { data: myMember }] = await Promise.all([
    supabase
      .from('game_signups')
      .select('id, member_id, status, signup_order, group_members(display_name)')
      .eq('game_id', gameId)
      .order('signup_order'),
    supabase
      .from('group_members')
      .select('id, display_name')
      .eq('group_id', game.group_id)
      .eq('profile_id', user.id)
      .maybeSingle(),
  ])

  const confirmed = signups?.filter((s) => s.status === 'confirmed') ?? []
  const waitlist = signups?.filter((s) => s.status === 'waitlist') ?? []
  const mySignup = signups?.find((s) => s.member_id === myMember?.id)
  const isAdmin = myMember?.id === game.admin_member_id
  const isOpen = game.status === 'scheduled' || game.status === 'active'

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
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Confirmed ({confirmed.length}/{game.seat_limit})
        </h2>
        {confirmed.length === 0 && (
          <p className="text-sm text-muted-foreground">Nobody yet.</p>
        )}
        {confirmed.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-center justify-between py-2.5">
              <span className="text-sm">
                {s.group_members?.display_name}
                {s.member_id === myMember?.id && (
                  <span className="text-muted-foreground"> (you)</span>
                )}
              </span>
              {s.member_id === game.admin_member_id && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  admin
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

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

      {isAdmin && (
        <p className="text-xs text-muted-foreground">
          You run this game. Buy-in tracking arrives in Phase 3.
        </p>
      )}
    </main>
  )
}
