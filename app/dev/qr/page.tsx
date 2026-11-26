import { CopyLinkButton } from '@/components/copy-link-button'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QrLinkButton } from '@/components/qr-link-button'
import { ShareLinkButton } from '@/components/share-link-button'
import { MemberRoleMenu } from '@/components/group/member-role-menu'

/** The group header's edit, share and invite QR buttons, a member's claim QR, and the
 *  role menu on their name: three sheets for checking sheet motion. */
export default function Page() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Test Group</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label="Edit group">
          <Pencil className="size-4" aria-hidden />
        </Button>
        <ShareLinkButton
          path="/join/dev-invite"
          title="Join Test Group"
          label="Share invite link"
        />
        <QrLinkButton
          path="/join/dev-invite"
          title="Join Test Group"
          description="Scan with a phone camera to join the group."
          size="icon-sm"
        />
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-border p-3">
        <MemberRoleMenu memberId="dev-gilad" role="member" name="Gilad">
          <span>Gilad</span>
        </MemberRoleMenu>
        <div className="flex items-center gap-2">
          <CopyLinkButton path="/claim/dev-claim" label="Claim link" size="xs" />
          <QrLinkButton
            path="/claim/dev-claim"
            title="Claim link for Gilad"
            description="Scan with their phone camera to link this member to their account."
          />
        </div>
      </div>
    </main>
  )
}
