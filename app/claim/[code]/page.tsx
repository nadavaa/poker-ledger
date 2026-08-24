import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { code } = await params
  const { error: errorMessage } = await searchParams
  const supabase = await createClient()

  const { data: preview } = await supabase
    .rpc('member_preview_by_claim', { code })
    .maybeSingle()

  if (!preview) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
        <p className="text-sm">This claim link is invalid.</p>
        <Button render={<Link href="/" />}>Go home</Button>
      </main>
    )
  }

  async function claim() {
    'use server'
    const supabase = await createClient()
    const { data: groupId, error } = await supabase.rpc('claim_member', {
      code,
    })
    if (error) {
      redirect(`/claim/${code}?error=${encodeURIComponent(error.message)}`)
    }
    redirect(`/groups/${groupId}`)
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            Are you {preview.member_name} in {preview.group_name}?
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {preview.already_claimed ? (
            <p className="text-sm text-muted-foreground">
              This member has already been claimed.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Claiming links this player and all their history to your
                account.
              </p>
              <form action={claim}>
                <Button type="submit" className="w-full">
                  Yes, that&apos;s me
                </Button>
              </form>
            </>
          )}
          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
