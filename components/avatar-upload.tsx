'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { storagePath } from '@/lib/avatar'
import { Avatar } from '@/components/avatar'
import { Button } from '@/components/ui/button'
import { DotsButton } from '@/components/action-sheet'
import { PopoverMenu, PopoverMenuItem } from '@/components/popover-menu'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_EDGE = 512

type Stage = 'idle' | 'reading' | 'uploading' | 'saving'

/**
 * Shared by people and groups. Resizes to 512px webp before uploading —
 * these end up as 40px circles, and a 4MB phone photo is pure waste — then
 * writes a fresh uuid path and deletes the object it replaced.
 */
export function AvatarUpload({
  bucket,
  ownerId,
  entityId,
  name,
  currentUrl,
  onSaved,
  variant = 'buttons',
}: {
  bucket: 'avatars' | 'group-avatars'
  /** First path segment. The storage policy checks this. */
  ownerId: string
  entityId: string
  name: string
  currentUrl: string | null
  /** Persists the new value (or null) wherever it belongs. */
  onSaved: (path: string | null) => Promise<{ error: string | null }>
  /** 'menu' tucks the actions behind a dots button; 'buttons' keeps them
   *  visible, which is what a dedicated onboarding step wants. */
  variant?: 'buttons' | 'menu'
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const menuAnchor = useRef<HTMLSpanElement>(null)

  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const busy = stage !== 'idle'

  async function resize(file: File): Promise<Blob> {
    // createImageBitmap is what refuses HEIC on browsers that can't decode it.
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser could not process that image.')
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not re-encode that image.'))),
        'image/webp',
        0.85
      )
    )
  }

  async function onPick(file: File) {
    setError(null)

    if (file.size > MAX_BYTES) {
      setError(
        `That photo is ${(file.size / 1024 / 1024).toFixed(1)}MB. Pick one under 5MB.`
      )
      return
    }

    let blob: Blob
    try {
      setStage('reading')
      blob = await resize(file)
    } catch {
      setStage('idle')
      // Almost always HEIC on a browser that can't decode it.
      setError(
        "This browser can't open that photo — iPhone HEIC photos only open in Safari. Set Camera → Formats to “Most Compatible”, or pick a different photo."
      )
      return
    }

    const previous = storagePath(currentUrl)
    const path = `${ownerId}/${crypto.randomUUID()}.webp`

    setStage('uploading')
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, blob, { contentType: 'image/webp', upsert: false })

    if (uploadError) {
      setStage('idle')
      setError(uploadError.message)
      return
    }

    setStage('saving')
    const { error: saveError } = await onSaved(path)
    if (saveError) {
      // Don't leave an orphan behind if the row didn't take it.
      await supabase.storage.from(bucket).remove([path])
      setStage('idle')
      setError(saveError)
      return
    }

    // Only once the new one is safely referenced.
    if (previous) await supabase.storage.from(bucket).remove([previous])

    setPreview(URL.createObjectURL(blob))
    setStage('idle')
    router.refresh()
  }

  async function removePhoto() {
    setError(null)
    setStage('saving')
    const previous = storagePath(currentUrl)
    const { error: saveError } = await onSaved(null)
    if (saveError) {
      setStage('idle')
      setError(saveError)
      return
    }
    if (previous) await supabase.storage.from(bucket).remove([previous])
    setPreview(null)
    setStage('idle')
    router.refresh()
  }

  const label: Record<Stage, string> = {
    idle: currentUrl ? 'Change photo' : 'Add photo',
    reading: 'Preparing…',
    uploading: 'Uploading…',
    saving: 'Saving…',
  }

  return (
    <div className="flex items-center gap-3">
      {preview ? (
        <span
          className="inline-flex size-16 shrink-0 overflow-hidden rounded-full"
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL */}
          <img src={preview} alt="" className="size-full object-cover" />
        </span>
      ) : (
        <Avatar id={entityId} name={name} url={currentUrl} bucket={bucket} size={64} />
      )}

      <div className="flex min-w-0 flex-col gap-1.5">
        {variant === 'menu' ? (
          <div className="flex items-center gap-2">
            {busy && (
              <span className="text-sm text-muted-foreground">
                {label[stage]}
              </span>
            )}
            <span ref={menuAnchor} className="inline-flex">
              <DotsButton
                label="Photo options"
                onClick={() => setMenuOpen((v) => !v)}
              />
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {label[stage]}
            </Button>
            {currentUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={removePhoto}
              >
                Remove photo
              </Button>
            )}
          </div>
        )}

        <PopoverMenu
          open={menuOpen}
          anchorRef={menuAnchor}
          onClose={() => setMenuOpen(false)}
          label="Photo options"
        >
          <PopoverMenuItem
            disabled={busy}
            onClick={() => {
              setMenuOpen(false)
              fileInput.current?.click()
            }}
          >
            {currentUrl ? 'Change photo' : 'Add photo'}
          </PopoverMenuItem>
          {/* No photo means nothing to remove — no dead item. */}
          {currentUrl && (
            <PopoverMenuItem
              destructive
              disabled={busy}
              onClick={() => {
                setMenuOpen(false)
                removePhoto()
              }}
            >
              Remove photo
            </PopoverMenuItem>
          )}
        </PopoverMenu>

        {busy && (
          <p className="text-xs text-muted-foreground">
            {label[stage]} Photos are shrunk to 512px before upload.
          </p>
        )}
        {error && <p className="text-xs text-down">{error}</p>}

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = '' // so picking the same file twice still fires
            if (f) onPick(f)
          }}
        />
      </div>
    </div>
  )
}
