// A tiny, dependency-free Markdown parser for the **render side**.
//
// Jira stores rich text as ADF (Atlassian Document Format). We use Markdown as
// the neutral wire format between server and browser: the server converts ADF →
// Markdown on read (`adfToMarkdown`, in server/jira.server.ts), and this parser
// turns that Markdown back into React elements for display (`Markdown.tsx`).
//
// The write direction — Markdown → ADF — no longer lives here. It is Atlassian's
// own `MarkdownTransformer` + `JSONTransformer`, in `server/adf.ts`, so the
// browser bundle does not carry the ADF parser chain. The header of that file
// records why the split was made and what keeps the two sides from disagreeing.
//
// Supported: paragraphs, ATX headings, bullet/ordered lists (flat), fenced code
// blocks, blockquotes, thematic breaks, and inline **strong**, *emphasis*,
// ~~strike~~, `code`, [links](url), and bare URLs. Intentionally omitted for a
// first pass: nested lists, multi-line list items, tables, and `_underscore_`
// emphasis (so identifiers like snake_case are never mangled).

export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: MdInline[] }
  | { type: 'em'; children: MdInline[] }
  | { type: 'strike'; children: MdInline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: MdInline[] }
  | { type: 'break' }

export type MdBlock =
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'heading'; level: number; children: MdInline[] }
  | { type: 'bulletList'; items: MdInline[][] }
  | { type: 'orderedList'; start: number; items: MdInline[][] }
  | { type: 'codeBlock'; lang?: string; text: string }
  | { type: 'blockquote'; children: MdBlock[] }
  | { type: 'rule' }

const BARE_URL = /^https?:\/\/[^\s<]+/
const URL_TRAIL = /[.,;:!?)\]}>'"]+$/ // trailing punctuation that usually isn't part of the URL

// --- inline ---------------------------------------------------------------

// parseInline turns a run of text into inline nodes. It scans left-to-right,
// buffering plain text and breaking out whenever it recognises a delimiter.
export function parseInline(text: string): MdInline[] {
  const nodes: MdInline[] = []
  let buf = ''
  const flush = () => {
    if (buf) nodes.push({ type: 'text', text: buf })
    buf = ''
  }
  let i = 0
  while (i < text.length) {
    const c = text[i]
    // Backslash escape: the next char is always literal.
    if (c === '\\' && i + 1 < text.length) {
      buf += text[i + 1]
      i += 2
      continue
    }
    // `inline code` — no nested formatting inside.
    if (c === '`') {
      const close = text.indexOf('`', i + 1)
      if (close !== -1) {
        flush()
        nodes.push({ type: 'code', text: text.slice(i + 1, close) })
        i = close + 1
        continue
      }
    }
    // [label](href)
    if (c === '[') {
      const link = matchLink(text, i)
      if (link) {
        flush()
        nodes.push({ type: 'link', href: link.href, children: parseInline(link.label) })
        i = link.end
        continue
      }
    }
    // **strong** / *emphasis* (asterisks only; see the file header on underscores)
    if (c === '*') {
      const em = matchEmphasis(text, i)
      if (em) {
        flush()
        nodes.push({ type: em.strong ? 'strong' : 'em', children: parseInline(em.inner) })
        i = em.end
        continue
      }
    }
    // ~~strike~~
    if (c === '~' && text[i + 1] === '~') {
      const close = text.indexOf('~~', i + 2)
      if (close !== -1) {
        flush()
        nodes.push({ type: 'strike', children: parseInline(text.slice(i + 2, close)) })
        i = close + 2
        continue
      }
    }
    // Bare URL → link.
    if ((c === 'h' || c === 'H') && BARE_URL.test(text.slice(i))) {
      let url = text.slice(i).match(BARE_URL)![0]
      const trail = url.match(URL_TRAIL)?.[0] ?? ''
      if (trail) url = url.slice(0, -trail.length)
      flush()
      nodes.push({ type: 'link', href: url, children: [{ type: 'text', text: url }] })
      i += url.length
      continue
    }
    buf += c
    i++
  }
  flush()
  return nodes
}

// matchLink: `text[start]` is '['. Returns the label, href, and end index (just
// past the closing ')'), or null if this isn't a well-formed link.
function matchLink(text: string, start: number): { label: string; href: string; end: number } | null {
  let j = start + 1
  let depth = 1
  let label = ''
  while (j < text.length && depth > 0) {
    const ch = text[j]
    if (ch === '\\' && j + 1 < text.length) {
      label += text[j + 1]
      j += 2
      continue
    }
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) break
    }
    label += ch
    j++
  }
  if (depth !== 0 || text[j + 1] !== '(') return null
  let k = j + 2
  let href = ''
  while (k < text.length && text[k] !== ')') {
    if (text[k] === '\\' && k + 1 < text.length) {
      href += text[k + 1]
      k += 2
      continue
    }
    href += text[k]
    k++
  }
  if (text[k] !== ')') return null
  return { label, href: href.trim(), end: k + 1 }
}

// matchEmphasis: `text[start]` is '*'. Handles '**strong**' and '*em*'.
function matchEmphasis(text: string, start: number): { strong: boolean; inner: string; end: number } | null {
  const strong = text[start + 1] === '*'
  const marker = strong ? '**' : '*'
  const from = start + marker.length
  let idx = from
  while (true) {
    idx = text.indexOf(marker, idx)
    if (idx === -1) return null
    // For '*em*', a following '*' means this is really '**' — let the strong
    // branch handle it instead of matching an empty emphasis.
    if (!strong && text[idx + 1] === '*') {
      idx += 1
      continue
    }
    const inner = text.slice(from, idx)
    if (inner.length === 0) {
      idx += marker.length
      continue
    }
    return { strong, inner, end: idx + marker.length }
  }
}

// --- blocks ---------------------------------------------------------------

const FENCE = /^```(\w*)\s*$/
const FENCE_CLOSE = /^```\s*$/
const HEADING = /^(#{1,6})\s+(.*)$/
const RULE = /^(-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE = /^>\s?/
const BULLET = /^[-*+]\s+/
const ORDERED = /^(\d+)[.)]\s+/

function isBlockStart(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line)
  )
}

// parseMarkdown turns a Markdown string into a flat list of block nodes.
export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }
    const fence = line.match(FENCE)
    if (fence) {
      i++
      const code: string[] = []
      while (i < lines.length && !FENCE_CLOSE.test(lines[i])) code.push(lines[i++])
      if (i < lines.length) i++ // consume the closing fence
      blocks.push({ type: 'codeBlock', lang: fence[1] || undefined, text: code.join('\n') })
      continue
    }
    const heading = line.match(HEADING)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2].trim()) })
      i++
      continue
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(lines[i++].replace(QUOTE, ''))
      blocks.push({ type: 'blockquote', children: parseMarkdown(quoted.join('\n')) })
      continue
    }
    if (BULLET.test(line)) {
      const items: MdInline[][] = []
      while (i < lines.length && BULLET.test(lines[i])) items.push(parseInline(lines[i++].replace(BULLET, '')))
      blocks.push({ type: 'bulletList', items })
      continue
    }
    const ordered = line.match(ORDERED)
    if (ordered) {
      const items: MdInline[][] = []
      while (i < lines.length && ORDERED.test(lines[i])) items.push(parseInline(lines[i++].replace(ORDERED, '')))
      blocks.push({ type: 'orderedList', start: parseInt(ordered[1], 10), items })
      continue
    }
    // Paragraph: consecutive non-blank lines that don't start another block.
    // Each source line becomes a hard break within the paragraph.
    const para: MdInline[] = []
    let first = true
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      if (!first) para.push({ type: 'break' })
      para.push(...parseInline(lines[i]))
      first = false
      i++
    }
    blocks.push({ type: 'paragraph', children: para })
  }
  return blocks
}


