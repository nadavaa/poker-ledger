'use client'

import { useEffect, useState } from 'react'

/**
 * A hidden form field carrying the browser's IANA zone, so a new group starts
 * in the zone its creator is in rather than New York. Filled after mount:
 * the server can't know the phone's zone. Empty means "use the default".
 */
export function BrowserTimeZoneInput() {
  const [tz, setTz] = useState('')
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only read
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''), [])
  return <input type="hidden" name="timezone" value={tz} />
}
