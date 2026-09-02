import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/supabase/auth'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'

export default async function WelcomePage() {
  const supabase = await createClient()
  const user = await getSessionUser(supabase)
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, onboarding_completed_at')
    .eq('id', user.id)
    .maybeSingle()

  // Already done, or skipped earlier — never show it twice.
  if (profile?.onboarding_completed_at) redirect('/')

  return (
    <OnboardingFlow
      userId={user.id}
      initialName={profile?.display_name ?? ''}
      hasPhoto={Boolean(profile?.avatar_url)}
      avatarUrl={profile?.avatar_url ?? null}
    />
  )
}
