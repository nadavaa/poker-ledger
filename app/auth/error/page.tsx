import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
      <p className="text-sm">
        Sign-in link was invalid or expired. Try again.
      </p>
      <Button render={<Link href="/login" />} nativeButton={false}>
        Back to login
      </Button>
    </main>
  )
}
