import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function JoinPage({
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
    .rpc('group_preview_by_invite', { code })
    .maybeSingle()

  if (!preview) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
        <p className="text-sm">This invite link is invalid.</p>
        <Button render={<Link href="/" />} nativeButton={false}>
          Go home
        </Button>
      </main>
    )
  }

  async function join() {
    'use server'
    const supabase = await createClient()
    const { data: groupId, error } = await supabase.rpc(
      'join_group_by_invite',
      { code }
    )
    if (error) {
      redirect(`/join/${code}?error=${encodeURIComponent(error.message)}`)
    }
    redirect(`/groups/${groupId}`)
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Join {preview.group_name}?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {preview.member_count}{' '}
            {preview.member_count === 1 ? 'member' : 'members'}
          </p>
          <form action={join}>
            <Button type="submit" className="w-full">
              Join group
            </Button>
          </form>
          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
