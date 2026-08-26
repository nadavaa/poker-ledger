import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { dollarsToCents } from '@/lib/money'
import { NewGameForm } from './new-game-form'

export default async function NewGamePage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; error?: string }>
}) {
  const { group: presetGroup, error: errorMessage } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('group_members')
    .select('groups(id, name, default_buyin_cents, chips_per_dollar, default_seat_limit)')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .order('created_at')

  const groups = (memberships ?? [])
    .map((m) => m.groups)
    .filter((g): g is NonNullable<typeof g> => Boolean(g))

  async function createGame(formData: FormData) {
    'use server'
    const supabase = await createClient()

    const groupChoice = String(formData.get('group') ?? '')
    const newGroupName = String(formData.get('new_group_name') ?? '').trim()
    const scheduledAt = String(formData.get('scheduled_at') ?? '')
    const seatLimit = Number(formData.get('seat_limit'))
    const chipsPerDollar = Number(formData.get('chips_per_dollar'))
    const playing = formData.get('playing') === 'on'

    let buyinCents: number
    try {
      buyinCents = dollarsToCents(String(formData.get('buyin') ?? ''))
    } catch {
      redirect('/games/new?error=Enter+a+valid+buy-in+amount')
    }

    const { data: gameId, error } = await supabase.rpc('create_game', {
      p_scheduled_at: new Date(scheduledAt).toISOString(),
      p_group_id: groupChoice === '__new__' ? null : groupChoice,
      p_new_group_name: groupChoice === '__new__' ? newGroupName : null,
      p_name: String(formData.get('name') ?? ''),
      p_location: String(formData.get('location') ?? ''),
      p_seat_limit: seatLimit,
      p_buyin_cents: buyinCents,
      p_chips_per_dollar: chipsPerDollar,
      p_playing: playing,
    })

    if (error) {
      redirect(`/games/new?error=${encodeURIComponent(error.message)}`)
    }
    redirect(`/games/${gameId}`)
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div>
        <Link href="/" className="text-xs text-muted-foreground">
          &larr; All groups
        </Link>
        <h1 className="text-lg font-semibold">New game</h1>
      </div>
      <NewGameForm
        groups={groups}
        presetGroupId={presetGroup}
        action={createGame}
        errorMessage={errorMessage}
      />
    </main>
  )
}
