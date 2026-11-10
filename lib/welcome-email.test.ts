import { describe, expect, it } from 'vitest'
import { firstName, welcomeEmailHtml, welcomeEmailText } from './welcome-email'

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
    expect(t.trimEnd().endsWith('May the flop be with you,\nNadav')).toBe(true)
    expect(t).toContain('passing KevesPoker along')
    expect(t).toContain('reply to this email')
    expect(t).not.toMatch(/fewest/i)
  })
})

describe('welcomeEmailHtml', () => {
  it('has the formatting', () => {
    const h = welcomeEmailHtml('Dana')
    expect(h).toContain('Hi Dana,')
    expect(h).toContain('<em>KevesPoker</em>')
    expect(h).toContain('<strong>Tracks every buy-in</strong>')
    expect(h).toContain('<strong><u>One ask:</u></strong>')
    expect(h).toContain('<u>Here&#39;s what it does for your game:</u>'.replace('&#39;', "'"))
    expect(h.match(/<li>/g)).toHaveLength(3)
  })
  it('escapes the name', () => {
    expect(welcomeEmailHtml('<b>x</b>')).toContain('Hi &lt;b&gt;x&lt;/b&gt;,')
  })
  it('says the same words as the text version', () => {
    const strip = (s: string) =>
      s.replace(/<br>/g, ' ').replace(/<li>/g, '- ').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
    expect(strip(welcomeEmailHtml('Dana'))).toBe(
      welcomeEmailText('Dana').replace(/\s+/g, ' ').trim()
    )
  })
})
