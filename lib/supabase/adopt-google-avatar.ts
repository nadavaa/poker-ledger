import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * Copies the photo Google supplies at signup into our own bucket, once.
 *
 * Never hotlinks googleusercontent.com: those URLs expire, and the failure
 * shows up months later as a broken avatar nobody can explain. Only runs when
 * avatar_url is null, so a photo the user uploaded is never overwritten — on
 * this sign-in or any later one. Magic-link users have no picture and fall
 * through silently, and any failure is swallowed: nothing here may block a
 * sign-in.
 */
export async function adoptGoogleAvatar(
  supabase: SupabaseClient<Database>,
  user: User
): Promise<void> {
  try {
    const meta = user.user_metadata ?? {}
    const remote =
      (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
      (typeof meta.picture === 'string' && meta.picture) ||
      null
    if (!remote) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle()

    // Already has one — theirs or a previously adopted copy. Leave it alone.
    if (!profile || profile.avatar_url) return

    const response = await fetch(remote)
    if (!response.ok) return
    const blob = await response.blob()
    if (!blob.size || blob.size > 5 * 1024 * 1024) return

    const type = blob.type || 'image/jpeg'
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
    // Same path convention as an upload, so the storage policy accepts it.
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { contentType: type, upsert: false })
    if (uploadError) return

    const { error: saveError } = await supabase
      .from('profiles')
      .update({ avatar_url: path })
      .eq('id', user.id)
      .is('avatar_url', null) // last guard against a race with a real upload

    if (saveError) {
      await supabase.storage.from('avatars').remove([path])
    }
  } catch {
    // A missing avatar is not worth a failed sign-in.
  }
}
