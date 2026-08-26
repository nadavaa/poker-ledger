import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default async function HomePage() {
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
      .select('id, role, groups(id, name)')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .order('created_at'),
  ])

  async function createGroup(formData: FormData) {
    'use server'
    const name = String(formData.get('name') ?? '').trim()
    if (!name) return
    const supabase = await createClient()
    const { data: groupId, error } = await supabase.rpc('create_group', {
      group_name: name,
    })
    if (error) throw new Error(error.message)
    redirect(`/groups/${groupId}`)
  }

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <h1 className="text-lg font-semibold">
            {profile?.display_name ?? user.email}
          </h1>
        </div>
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </header>

      <Button render={<Link href="/games/new" />} nativeButton={false}>
        New game
      </Button>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Your groups
        </h2>
        {memberships?.length ? (
          memberships.map(
            (m) =>
              m.groups && (
                <Link key={m.id} href={`/groups/${m.groups.id}`}>
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-base">
                        {m.groups.name}
                        <span className="text-xs font-normal text-muted-foreground">
                          {m.role}
                        </span>
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </Link>
              )
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            No groups yet. Create one below or ask for an invite link.
          </p>
        )}
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create a group</CardTitle>
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
    </main>
  )
}
