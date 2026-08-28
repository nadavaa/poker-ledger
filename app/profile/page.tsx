import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const { error: errorMessage, saved } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, venmo_handle')
      .eq('id', user.id)
      .single(),
    supabase
      .from('group_members')
      .select('id, group_id, groups(name)')
      .eq('profile_id', user.id)
      .eq('is_active', true),
  ])

  const myMemberIds = (memberships ?? []).map((m) => m.id)

  const [{ data: lifetime }, { data: totals }, { data: games }] =
    await Promise.all([
      myMemberIds.length
        ? supabase
            .from('member_lifetime')
            .select('member_id, group_id, games_played, lifetime_net_cents')
            .in('member_id', myMemberIds)
        : Promise.resolve({ data: [] }),
      myMemberIds.length
        ? supabase
            .from('game_player_totals')
            .select('game_id, member_id, buyin_cents, net_cents')
            .in('member_id', myMemberIds)
        : Promise.resolve({ data: [] }),
      myMemberIds.length
        ? supabase
            .from('games')
            .select('id, name, scheduled_at, status, group_id, groups(name)')
            .eq('status', 'settled')
            .order('scheduled_at', { ascending: false })
            .limit(25)
        : Promise.resolve({ data: [] }),
    ])

  const groupName = new Map(
    (memberships ?? []).map((m) => [m.group_id, m.groups?.name ?? 'Group'])
  )
  const netByGame = new Map(
    (totals ?? []).map((t) => [t.game_id, t.net_cents])
  )
  // Only games I actually played in, newest first.
  const history = (games ?? []).filter((g) => netByGame.has(g.id))

  async function saveProfile(formData: FormData) {
    'use server'
    const supabase = await createClient()
    const name = String(formData.get('display_name') ?? '').trim()
    const handle = String(formData.get('venmo_handle') ?? '').trim()

    if (name) {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name })
        .eq('id', user!.id)
      if (error) {
        redirect(`/profile?error=${encodeURIComponent(error.message)}`)
      }
    }

    // Goes to the profile and to every member row, so the Venmo buttons other
    // players see actually resolve to a handle.
    const { error } = await supabase.rpc('set_my_venmo_handle', {
      p_handle: handle,
    })
    if (error) {
      redirect(`/profile?error=${encodeURIComponent(error.message)}`)
    }
    revalidatePath('/profile')
    redirect('/profile?saved=1')
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <header>
        <Link href="/" className="text-xs text-muted-foreground">
          &larr; All groups
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Profile</h1>
      </header>

      {errorMessage && (
        <p className="rounded-xl bg-down-soft px-3 py-2 text-sm text-down">
          {errorMessage}
        </p>
      )}
      {saved && (
        <p className="rounded-xl bg-up-soft px-3 py-2 text-sm text-up">
          Saved.
        </p>
      )}

      <Card>
        <CardContent className="py-4">
          <form action={saveProfile} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="display_name">Display name</Label>
              <Input
                id="display_name"
                name="display_name"
                required
                maxLength={80}
                defaultValue={profile?.display_name ?? ''}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="venmo_handle">Venmo handle</Label>
              <Input
                id="venmo_handle"
                name="venmo_handle"
                maxLength={60}
                placeholder="your-venmo"
                defaultValue={profile?.venmo_handle ?? ''}
              />
              <p className="text-xs text-muted-foreground">
                Used to prefill the Venmo link when someone owes you. Leave it
                blank and they&apos;ll get your name and the amount to copy
                instead.
              </p>
            </div>
            <Button className="h-11 rounded-xl" type="submit">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Lifetime by group
        </h2>
        {(lifetime ?? []).length === 0 && (
          <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
            No settled games yet.
          </p>
        )}
        {(lifetime ?? []).map((l) => (
          <Card key={l.member_id}>
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {groupName.get(l.group_id) ?? 'Group'}
                </p>
                <p className="money text-xs text-muted-foreground">
                  {l.games_played}{' '}
                  {l.games_played === 1 ? 'game' : 'games'}
                </p>
              </div>
              {/* Balances never merge across groups: separate cards, separate
                  numbers. */}
              <span
                className={`money-display shrink-0 text-xl font-semibold ${
                  l.lifetime_net_cents > 0
                    ? 'text-up'
                    : l.lifetime_net_cents < 0
                      ? 'text-down'
                      : 'text-muted-foreground'
                }`}
              >
                {l.lifetime_net_cents > 0 ? '+' : ''}
                {formatCents(l.lifetime_net_cents)}
              </span>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Game history
        </h2>
        {history.length === 0 && (
          <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
            Nothing settled yet.
          </p>
        )}
        {history.map((g) => {
          const net = netByGame.get(g.id) ?? 0
          return (
            <Link key={g.id} href={`/games/${g.id}`}>
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {g.name ?? formatDay(g.scheduled_at)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {g.groups?.name} · {formatDay(g.scheduled_at)}
                    </p>
                  </div>
                  <span
                    className={`money-display shrink-0 text-lg font-semibold ${
                      net > 0
                        ? 'text-up'
                        : net < 0
                          ? 'text-down'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {net > 0 ? '+' : ''}
                    {formatCents(net)}
                  </span>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </section>
    </main>
  )
}
