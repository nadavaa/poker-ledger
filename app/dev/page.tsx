import Link from 'next/link'

const SCREENS = [
  {
    href: '/dev/player-sheet?buyins=14',
    label: 'Player sheet, 14 buy-ins (the long-list case)',
  },
  { href: '/dev/player-sheet?buyins=2', label: 'Player sheet, 2 buy-ins' },
  { href: '/dev/player-sheet?buyins=6&cashedOut=1', label: 'Player sheet, cashed out' },
  { href: '/dev/buyin-fields', label: 'Buy-in fields: group settings, new game, edit game' },
  { href: '/dev/stats', label: 'My Stats tab, totals with odd cents' },
  { href: '/dev/stats?net=-30', label: 'My Stats tab, total rounds to $0' },
]

export default function DevIndex() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold">Screen previews</h1>
      <p className="text-sm text-muted-foreground">
        Fake data, local dev only. Buttons do nothing.
      </p>
      {SCREENS.map((s) => (
        <Link key={s.href} href={s.href} className="underline">
          {s.label}
        </Link>
      ))}
    </main>
  )
}
