// The one place a widget talks to its host: connect, take the host's theme,
// and hand over tool results. Everything else a widget does goes through the
// App this returns (callServerTool, updateModelContext).

import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps'
import type { ToolResultLike } from '@/lib/mcp/ui/shape'

export function startApp(
  name: string,
  onResult: (result: ToolResultLike) => void,
  onInput?: (args: Record<string, unknown>) => void,
  /** Show this theme whatever the host is in. Omit to follow the host. */
  fixedTheme?: 'light' | 'dark'
): App {
  const app = new App({ name, version: '0.1.0' })
  if (fixedTheme) applyDocumentTheme(fixedTheme)

  const applyContext = (ctx: McpUiHostContext | undefined) => {
    if (!ctx) return
    if (ctx.theme || fixedTheme) applyDocumentTheme(fixedTheme ?? ctx.theme!)
    // Colours, type sizes and radii. Host fonts are left alone on purpose:
    // loading one would be a network request, and these views make none.
    if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables)
    const inset = ctx.safeAreaInsets
    if (inset) {
      const root = document.documentElement.style
      root.setProperty('--inset-top', `${inset.top}px`)
      root.setProperty('--inset-right', `${inset.right}px`)
      root.setProperty('--inset-bottom', `${inset.bottom}px`)
      root.setProperty('--inset-left', `${inset.left}px`)
    }
  }

  // Handlers go on before connect(), or an early message is dropped.
  app.ontoolresult = (result) => onResult(result as ToolResultLike)
  if (onInput) app.ontoolinput = (p) => onInput((p?.arguments ?? {}) as Record<string, unknown>)
  app.onhostcontextchanged = (ctx) => applyContext({ ...app.getHostContext(), ...ctx })

  app.connect().then(
    () => applyContext(app.getHostContext()),
    () => showFatal('Could not connect to the app that is showing this.')
  )
  return app
}

export function showFatal(message: string) {
  const root = document.getElementById('root')
  if (root) root.textContent = message
}
