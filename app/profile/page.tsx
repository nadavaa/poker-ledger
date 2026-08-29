import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/supabase/auth'
import { formatCents } from '@/lib/money'
import { formatPhone } from '@/lib/payment'
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

  const user = await getSessionUser(supabase)
  if (!user) redirect('/login')

  const [{ data: profile }, { data: payment }, { data: memberships }] =
    await Promise.all([
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single(),
    // phone_number isn't granted to anyone on the table, including you.
    supabase.rpc('my_payment_details').maybeSingle(),
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
    const phone = String(formData.get('phone_number') ?? '').trim()
    const preferred = String(formData.get('preferred') ?? '').trim()

    if (name) {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name })
        .eq('id', user!.id)
      if (error) {
        redirect(`/profile?error=${encodeURIComponent(error.message)}`)
      }
    }

    // Goes to the profile and to every member row, so what other players see
    // actually resolves. The phone is normalised to E.164 in the database.
    const { error } = await supabase.rpc('set_my_payment_details', {
      p_venmo_handle: handle || null,
      p_phone: phone || null,
      p_preferred: preferred || null,
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
                defaultValue={payment?.venmo_handle ?? ''}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone_number">Phone for Zelle</Label>
              <Input
                id="phone_number"
                name="phone_number"
                type="tel"
                inputMode="tel"
                maxLength={20}
                placeholder="(555) 123-4567"
                defaultValue={
                  payment?.phone_number
                    ? formatPhone(payment.phone_number)
                    : ''
                }
              />
              <p className="text-xs text-muted-foreground">
                Only shown to someone who owes you money from a settled game,
                and to that game&apos;s admin. Never on the members list.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preferred">Preferred method</Label>
              <select
                id="preferred"
                name="preferred"
                defaultValue={payment?.preferred_payment_method ?? ''}
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="">No preference</option>
                <option value="venmo">Venmo</option>
                <option value="zelle">Zelle</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Whichever you pick shows first when someone pays you. Fill in
                either, both, or neither.
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
