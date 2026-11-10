import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CopyLinkButton } from '@/components/copy-link-button'

/**
 * Shown to a group's owner or admin until the group has its first game. A
 * host who found the app on their own has nobody to show them around; this
 * is the three things to do, in order. Disappears by itself once a game exists.
 */
export function FirstGameGuide({
  groupId,
  invitePath,
}: {
  groupId: string
  invitePath: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your first game in 3 steps</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <ol className="flex flex-col gap-4">
          <li className="flex flex-col gap-2">
            <p>
              <span className="font-semibold">1. Get your players in.</span>{' '}
              <span className="text-muted-foreground">
                Send the invite link to your group chat. Someone without the
                app? Add them by name in{' '}
                <Link
                  href={`/groups/${groupId}/edit`}
                  className="underline underline-offset-2"
                >
                  Edit group
                </Link>
                ; they can claim their history later.
              </span>
            </p>
            <div>
              <CopyLinkButton path={invitePath} label="Copy invite" />
            </div>
          </li>
          <li>
            <span className="font-semibold">2. Schedule a game.</span>{' '}
            <span className="text-muted-foreground">
              Tap New game, set the seats and buy-in, and share the game link.
              Players sign themselves up; once the seats are full, the rest go
              on a waitlist.
            </span>
          </li>
          <li>
            <span className="font-semibold">3. Play.</span>{' '}
            <span className="text-muted-foreground">
              At the table, tap Start game and add each buy-in as it happens.
              At the end, type everyone&apos;s chips; once the count matches,
              settle up and everyone gets who to pay, with a Venmo or Zelle
              button.
            </span>
          </li>
        </ol>
        <Link
          href="/demo"
          className="w-fit text-sm font-medium underline underline-offset-2"
        >
          See a finished night first →
        </Link>
      </CardContent>
    </Card>
  )
}
