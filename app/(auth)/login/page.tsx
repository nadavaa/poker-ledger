import type { Metadata } from 'next'
import Link from 'next/link'
import { Chip } from '@/components/landing/chip'
import { SiteShell } from '@/components/landing/site-chrome'
import { LoginForm } from '@/components/login/login-form'
import { login as copy, SITE_NAME } from '@/lib/landing-copy'
import { loginContext, safeNext } from '@/lib/login'

export const metadata: Metadata = {
  title: `Sign in · ${SITE_NAME}`,
}

/** A quiet stack of the landing page's chips. Decoration only, desktop only. */
function ChipStack() {
  return (
    <div aria-hidden className="relative hidden h-[30rem] w-full max-w-[26rem] lg:block">
      <div
        className="lp-drop absolute right-0 top-4 opacity-70 blur-[3px]"
        style={{ ['--d' as string]: '120ms' }}
      >
        <Chip tone="bone" size={200} style={{ transform: 'rotate(-14deg)' }} />
      </div>
      <div
        className="lp-drop absolute left-4 top-[38%]"
        style={{ ['--d' as string]: '260ms' }}
      >
        <Chip tone="green" size={150} style={{ transform: 'rotate(-8deg)' }} />
      </div>
      <div
        className="lp-drop absolute bottom-6 right-[18%] opacity-60 blur-[2px]"
        style={{ ['--d' as string]: '380ms' }}
      >
        <Chip tone="ink" size={170} style={{ transform: 'rotate(18deg)' }} />
      </div>
      <div
        className="lp-drop absolute bottom-[30%] right-[8%]"
        style={{ ['--d' as string]: '500ms' }}
      >
        <Chip tone="ink" size={76} style={{ transform: 'rotate(22deg)' }} />
      </div>
    </div>
  )
}

// Sign-in and sign-up are one step: the first magic link or Google sign-in
// creates the account. Signed-in visitors never see this page (middleware
// sends them on to ?next).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next: rawNext } = await searchParams
  const next = safeNext(rawNext)
  const context = loginContext(next)

  return (
    <SiteShell>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 pb-20 pt-10 lg:grid-cols-[1fr_0.9fr] lg:gap-16 lg:pt-16">
        <div className="flex w-full max-w-md flex-col gap-6">
          {context && (
            <p
              className="lp-rise flex gap-3 rounded-xl border bg-card px-4 py-3 text-sm"
              style={{ ['--d' as string]: '0ms' }}
            >
              <span
                aria-hidden
                className="mt-[0.6em] h-px w-3 shrink-0 bg-[color:var(--lp-accent)]"
              />
              {copy.invite[context]}
            </p>
          )}
          <div className="flex flex-col gap-3">
            <h1
              className="lp-display lp-rise text-[clamp(2.2rem,5vw,3.4rem)]"
              style={{ ['--d' as string]: '60ms' }}
            >
              {copy.heading}
            </h1>
            <p
              className="lp-rise text-lg text-muted-foreground"
              style={{ ['--d' as string]: '140ms' }}
            >
              {copy.sub}
            </p>
          </div>
          <div className="lp-rise" style={{ ['--d' as string]: '220ms' }}>
            <LoginForm next={next} />
          </div>
          <p
            className="lp-rise text-sm text-muted-foreground"
            style={{ ['--d' as string]: '300ms' }}
          >
            {copy.pitch}{' '}
            <Link href="/" className="font-medium text-foreground underline underline-offset-4">
              {copy.back}
            </Link>
          </p>
        </div>
        <ChipStack />
      </main>
    </SiteShell>
  )
}
