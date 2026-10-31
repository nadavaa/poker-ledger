import { GUIDES } from '@/lib/guides'
import { landing, MCP_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/landing-copy'

// Public pages only. Optional and not read by the major crawlers today; kept
// short and truthful. Never list an invite, claim, game or group address.
export const dynamic = 'force-static'

export function GET() {
  const body = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    landing.money.body[0],
    '',
    '## Pages',
    '',
    `- [Home, demo and FAQ](${SITE_URL}): what it is, an interactive demo with invented players, and common questions`,
    `- [Use KevesPoker with Claude or ChatGPT](${SITE_URL}/ai-connector): connector address ${MCP_URL}, setup, and what it can and cannot do`,
    ...GUIDES.map((g) => `- [${g.title}](${SITE_URL}/guides/${g.slug}): ${g.description}`),
    '',
  ].join('\n')

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
