import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme-toggle'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: errorMessage } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    supabase
      .from('group_members')
      .select('id, group_id, groups(id, name)')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .order('created_at'),
  ])

  const groupIds = (memberships ?? []).map((m) => m.group_id)
  const myMemberIds = (memberships ?? []).map((m) => m.id)

  const [{ data: allMembers }, { data: lifetime }] = await Promise.all([
    groupIds.length
      ? supabase
          .from('group_members')
          .select('id, group_id')
          .in('group_id', groupIds)
          .eq('is_active', true)
      : Promise.resolve({ data: [] }),
    myMemberIds.length
      ? supabase
          .from('member_lifetime')
          .select('member_id, lifetime_net_cents')
          .in('member_id', myMemberIds)
      : Promise.resolve({ data: [] }),
  ])

  const memberCount = new Map<string, number>()
  for (const m of allMembers ?? []) {
    memberCount.set(m.group_id, (memberCount.get(m.group_id) ?? 0) + 1)
  }
  const netByMemberId = new Map(
    (lifetime ?? []).map((l) => [l.member_id, l.lifetime_net_cents])
  )

  async function createGroup(formData: FormData) {
    'use server'
    const name = String(formData.get('name') ?? '').trim()
    if (!name) return
    const supabase = await createClient()
    const { data: groupId, error } = await supabase.rpc('create_group', {
      group_name: name,
    })
    if (error) {
      redirect(`/?error=${encodeURIComponent(error.message)}`)
    }
    redirect(`/groups/${groupId}`)
  }

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  const hasGroups = (memberships?.length ?? 0) > 0

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <h1 className="text-lg font-semibold">
            {profile?.display_name ?? user.email}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <form action={signOut}>
            <Button variant="ghost" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      {errorMessage && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {hasGroups ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Your groups
            </h2>
            {memberships?.map(
              (m) =>
                m.groups && (
                  <Link key={m.id} href={`/groups/${m.groups.id}`}>
                    <Card className="transition-colors hover:bg-muted/50">
                      <CardContent className="flex items-center justify-between gap-3 py-4">
                        <div className="min-w-0">
                          <p className="truncate text-[0.95rem] font-medium">
                            {m.groups.name}
                          </p>
                          <p className="money text-xs text-muted-foreground">
                            {memberCount.get(m.group_id) ?? 0}{' '}
                            {memberCount.get(m.group_id) === 1
                              ? 'member'
                              : 'members'}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end">
                          <p
                            className={`money-display text-2xl font-semibold ${
                              (netByMemberId.get(m.id) ?? 0) > 0
                                ? 'text-up'
                                : (netByMemberId.get(m.id) ?? 0) < 0
                                  ? 'text-down'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {(netByMemberId.get(m.id) ?? 0) > 0 ? '+' : ''}
                            {formatCents(netByMemberId.get(m.id) ?? 0)}
                          </p>
                          <p className="text-[0.7rem] uppercase tracking-[0.06em] text-muted-foreground">
                            lifetime
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
            )}
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create group</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createGroup} className="flex gap-2">
                  <Input
                    name="name"
                    required
                    placeholder="Tuesday crew"
                    maxLength={80}
                  />
                  <Button type="submit">Create</Button>
                </form>
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <section className="flex flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Start with a group
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                A group is the crew you play with. It holds your players, your
                games, and the running balances between you. Games live inside
                a group, so make one to get started — or ask someone to send
                you their group&apos;s invite link.
              </p>
              <form action={createGroup} className="flex gap-2">
                <Input
                  name="name"
                  required
                  placeholder="Tuesday crew"
                  maxLength={80}
                />
                <Button type="submit">Create group</Button>
              </form>
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  )
}
