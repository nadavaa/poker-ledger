import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/supabase/auth'
import { Button } from '@/components/ui/button'

// The page an AI app sends you to when you add Poker Ledger as a connector.
// Supabase Auth is the authorization server; this is only the consent screen
// it requires us to host. Sign-in has already happened by the time it
// renders — proxy.ts sends a signed-out visitor to /login and back with the
// authorization_id intact.

export const metadata = { title: 'Connect an AI app · Poker Ledger' }

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>
}) {
  const { authorization_id: authorizationId } = await searchParams
  if (!authorizationId) return <Problem>This link is missing its request id.</Problem>

  const supabase = await createClient()
  const user = await getSessionUser(supabase)
  if (!user) redirect('/login')

  const { data, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId)

  if (error || !data) {
    return (
      <Problem>
        This connection request has expired or was already used. Start again
        from your AI app.
      </Problem>
    )
  }
  // Already approved before: straight back to the app.
  if (!('authorization_id' in data)) redirect(data.redirect_url)

  async function decide(formData: FormData) {
    'use server'
    const supabase = await createClient()
    const approve = formData.get('decision') === 'approve'
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId!, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId!, {
          skipBrowserRedirect: true,
        })
    if (error || !data) redirect('/oauth/consent?error=1')
    redirect(data.redirect_url)
  }

  const clientName = data.client.name || 'An AI app'

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">
          Connect {clientName} to Poker Ledger?
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {data.user.email}. Only approve this if you just asked
          your AI app to connect.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-4 text-sm">
        <p className="font-medium">{clientName} will be able to read:</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Your groups, and the games in them</li>
          <li>Who was seated or waitlisted, and the results of settled games</li>
          <li>Your own stats, and what you owe or are owed</li>
        </ul>
        <p className="font-medium">It will not be able to:</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Sign you up, log buy-ins, settle, or change anything</li>
          <li>See phone numbers, invite links, or claim codes</li>
        </ul>
        <p className="text-muted-foreground">
          It sees exactly what you can see in the app, and nothing more. You
          can disconnect it from your AI app at any time.
        </p>
      </div>

      <form action={decide} className="flex flex-col gap-2">
        <Button type="submit" name="decision" value="approve" size="lg">
          Allow
        </Button>
        <Button
          type="submit"
          name="decision"
          value="deny"
          variant="outline"
          size="lg"
        >
          Deny
        </Button>
      </form>
    </main>
  )
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center">
      <p className="max-w-xs text-sm text-muted-foreground">{children}</p>
    </main>
  )
}
