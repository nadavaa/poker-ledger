import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { landing, nav, SITE_NAME } from '@/lib/landing-copy'
import '@/components/landing/landing.css'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b lp-header">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {SITE_NAME}
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            render={<Link href="/login" />}
            nativeButton={false}
          >
            {landing.hero.signIn}
          </Button>
        </div>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{landing.footer}</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="py-2 hover:text-foreground">
              {n.label}
            </Link>
          ))}
          <Link href="/login" className="py-2 hover:text-foreground">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  )
}

// Wraps every public page so they share one ground, one set of tokens and the
// same header and footer.
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp flex min-h-screen flex-col">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  )
}
