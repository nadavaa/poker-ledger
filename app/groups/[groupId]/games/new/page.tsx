import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/supabase/auth'
import { dollarsToCents } from '@/lib/money'
import { DEFAULT_TIME_ZONE, fromZonedInput } from '@/lib/time'
import { NewGameForm } from './new-game-form'

export default async function NewGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { groupId } = await params
  const { error: errorMessage } = await searchParams
  const supabase = await createClient()

  const user = await getSessionUser(supabase)
  if (!user) redirect('/login')

  // The group comes from the route now; RLS hides groups you don't belong to.
  const { data: group } = await supabase
    .from('groups')
    .select('id, name, default_buyin_cents, chips_per_dollar, default_seat_limit, timezone')
    .eq('id', groupId)
    .maybeSingle()

  if (!group) notFound()

  const tz = group.timezone ?? DEFAULT_TIME_ZONE

  async function createGame(formData: FormData) {
    'use server'
    const supabase = await createClient()

    const scheduledAt = String(formData.get('scheduled_at') ?? '')
    const seatLimit = Number(formData.get('seat_limit'))
    const chipsPerDollar = Number(formData.get('chips_per_dollar'))
    const playing = formData.get('playing') === 'on'

    let buyinCents: number
    try {
      buyinCents = dollarsToCents(String(formData.get('buyin') ?? ''))
    } catch {
      redirect(
        `/groups/${groupId}/games/new?error=Enter+a+valid+buy-in+amount`
      )
    }

    // The field is a naive wall clock. Reading it with new Date() in a server
    // action parsed it in the server's zone — UTC on Vercel — which is how
    // every game ended up stored four hours late.
    let scheduledIso: string
    try {
      scheduledIso = fromZonedInput(scheduledAt, tz)
    } catch {
      redirect(
        `/groups/${groupId}/games/new?error=${encodeURIComponent(
          'Pick a date and time.'
        )}`
      )
    }

    const { data: gameId, error } = await supabase.rpc('create_game', {
      p_scheduled_at: scheduledIso,
      p_group_id: groupId,
      p_new_group_name: null,
      p_name: String(formData.get('name') ?? ''),
      p_location: String(formData.get('location') ?? ''),
      p_seat_limit: seatLimit,
      p_buyin_cents: buyinCents,
      p_chips_per_dollar: chipsPerDollar,
      p_playing: playing,
    })

    if (error) {
      redirect(
        `/groups/${groupId}/games/new?error=${encodeURIComponent(error.message)}`
      )
    }
    redirect(`/games/${gameId}`)
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div>
        <Link
          href={`/groups/${groupId}`}
          className="text-xs text-muted-foreground"
        >
          &larr; {group.name}
        </Link>
        <h1 className="text-lg font-semibold">New game</h1>
      </div>
      <NewGameForm
        defaults={group}
        timeZone={tz}
        action={createGame}
        errorMessage={errorMessage}
      />
    </main>
  )
}
