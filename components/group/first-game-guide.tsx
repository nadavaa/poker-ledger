import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CopyLinkButton } from '@/components/copy-link-button'
import { Steps } from '@/components/steps'

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
      <CardContent className="flex flex-col gap-5">
        <Steps
          steps={[
            {
              title: 'Get your players in',
              body: 'Send the invite link to your group chat.',
              extra: (
                <div className="pt-1">
                  <CopyLinkButton path={invitePath} label="Copy invite" />
                </div>
              ),
            },
            {
              title: 'Schedule a game',
              body: 'Tap New game and share the game link so players can sign up.',
            },
            {
              title: 'Play',
              body: 'Add buy-ins as they happen, count chips at the end, and settle up.',
            },
          ]}
        />
        <Link
          href={`/demo?group=${groupId}`}
          className="w-fit text-sm font-medium underline underline-offset-2"
        >
          See a demo first →
        </Link>
      </CardContent>
    </Card>
  )
}
