// A tiny element builder. Everything the widgets show that came from the
// database (player names, locations, game names) goes in as text, never as
// markup, so a name like "<img onerror=...>" is only ever a name.

type Child = Node | string | null | false | undefined

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: {
    class?: string
    text?: string
    attrs?: Record<string, string>
    on?: Partial<Record<'click', () => void>>
  } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (props.class) el.className = props.class
  if (props.text !== undefined) el.textContent = props.text
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v)
  if (props.on?.click) el.addEventListener('click', props.on.click)
  for (const c of children) {
    if (c === null || c === false || c === undefined) continue
    el.append(c)
  }
  return el
}

export function mount(root: HTMLElement, ...children: Child[]) {
  root.replaceChildren(...(children.filter(Boolean) as (Node | string)[]))
}
