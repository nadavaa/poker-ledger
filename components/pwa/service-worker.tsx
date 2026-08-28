'use client'

import { useEffect } from 'react'

/** Registers the service worker so the app can be installed and survive a
 *  dead moment of wifi. */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failing is not worth bothering anyone about; the app
      // works exactly as before, just without the offline shell.
    })
  }, [])

  return null
}
