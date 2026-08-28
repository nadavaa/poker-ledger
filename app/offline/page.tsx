export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">You&apos;re offline</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Buy-ins you tapped while offline are saved on this phone and will send
        themselves as soon as you&apos;re back on.
      </p>
    </main>
  )
}
