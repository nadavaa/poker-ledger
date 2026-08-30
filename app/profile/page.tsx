import { redirect } from 'next/navigation'

/** The page moved to /settings; old links keep working. */
export default function ProfileRedirect() {
  redirect('/settings')
}
