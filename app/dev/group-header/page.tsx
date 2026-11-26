import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QrLinkButton } from '@/components/qr-link-button'
import { ShareLinkButton } from '@/components/share-link-button'

/** The group header two ways: buttons under the name (current), or beside
 *  it on the right. ?layout=side|below&name=... */
function Buttons({ name }: { name: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="outline" size="icon-sm" aria-label="Edit group">
        <Pencil className="size-4" aria-hidden />
      </Button>
      <ShareLinkButton path="/join/dev" title={`Join ${name}`} label="Share invite link" />
      <QrLinkButton path="/join/dev" title={`Join ${name}`} size="icon-sm" />
    </div>
  )
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ layout?: string; name?: string }>
}) {
  const { layout = 'side', name = 'Poker @ NYC 🇮🇱' } = await searchParams
  const tabs = (
    <div className="flex rounded-2xl bg-muted p-1 text-sm">
      {['Games', 'Members', 'My Stats'].map((t, i) => (
        <span key={t} className={`flex-1 rounded-xl py-2 text-center ${i === 0 ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'}`}>
          {t}
        </span>
      ))}
    </div>
  )
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      {layout === 'side' ? (
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs text-muted-foreground">&larr; All groups</span>
            <h1 className="text-lg font-semibold tracking-tight break-words">{name}</h1>
          </div>
          <Buttons name={name} />
        </header>
      ) : (
        <header className="flex flex-col gap-3">
          <div>
            <span className="text-xs text-muted-foreground">&larr; All groups</span>
            <h1 className="text-lg font-semibold tracking-tight break-words">{name}</h1>
          </div>
          <Buttons name={name} />
        </header>
      )}
      {tabs}
    </main>
  )
}
