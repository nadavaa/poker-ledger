import { describe, expect, it } from 'vitest'
import { firstName, welcomeEmailText } from './welcome-email'

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('Dana Cohen')).toBe('Dana')
    expect(firstName('  Marcus ')).toBe('Marcus')
  })
  it('is null when there is no name', () => {
    expect(firstName(null)).toBeNull()
    expect(firstName('   ')).toBeNull()
  })
})

describe('welcomeEmailText', () => {
  it('greets by first name', () => {
    expect(welcomeEmailText('Dana Cohen').startsWith('Hi Dana,')).toBe(true)
  })
  it('falls back to "there"', () => {
    expect(welcomeEmailText(null).startsWith('Hi there,')).toBe(true)
  })
  it('signs as Nadav and keeps the asks', () => {
    const t = welcomeEmailText('A')
    expect(t.trimEnd().endsWith('Nadav')).toBe(true)
    expect(t).toContain('passing KevesPoker along')
    expect(t).toContain('reply to this email')
    expect(t).not.toMatch(/fewest/i)
  })
})
