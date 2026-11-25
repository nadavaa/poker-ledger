import { CopyLinkButton } from '@/components/copy-link-button'
import { QrLinkButton } from '@/components/qr-link-button'

/** The group invite QR beside Copy invite, and a member's claim QR. */
export default function Page() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Test Group</h1>
      <div className="flex flex-wrap items-center gap-2">
        <CopyLinkButton path="/join/dev-invite" label="Copy invite" />
        <QrLinkButton
          path="/join/dev-invite"
          title="Join Test Group"
          description="Scan with a phone camera to join the group."
          size="icon-sm"
        />
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-border p-3">
        <span>Gilad</span>
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
