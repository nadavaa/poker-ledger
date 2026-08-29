import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/supabase/auth'
import { formatCents } from '@/lib/money'
import { ProfileForm } from '@/components/profile/profile-form'
import { AvatarUpload } from '@/components/avatar-upload'
import { Card, CardContent } from '@/components/ui/card'

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function ProfilePage() {
  const supabase = await createClient()

  const user = await getSessionUser(supabase)
  if (!user) redirect('/login')

  const [{ data: profile }, { data: payment }, { data: memberships }] =
    await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, avatar_url')
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

  async function saveAvatar(path: string | null) {
    'use server'
    const supabase = await createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: path })
      .eq('id', user!.id)
    return { error: error?.message ?? null }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <header>
        <Link href="/" className="text-xs text-muted-foreground">
          &larr; All groups
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Profile</h1>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          {/* Path is prefixed with the user's auth id, which is exactly what
              the storage policy checks. */}
          <AvatarUpload
            bucket="avatars"
            ownerId={user.id}
            entityId={user.id}
            name={profile?.display_name ?? ''}
            currentUrl={profile?.avatar_url ?? null}
            onSaved={saveAvatar}
          />

          <ProfileForm
            userId={user.id}
            initial={{
              displayName: profile?.display_name ?? '',
              venmoHandle: payment?.venmo_handle ?? null,
              phone: payment?.phone_number ?? null,
              preferred: payment?.preferred_payment_method ?? null,
            }}
          />
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
