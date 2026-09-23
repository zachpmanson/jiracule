// Server-only: Markdown → ADF for Jira's v3 API, via Atlassian's own
// transformers.
//
// This replaces the hand-rolled ADF writer that used to sit in `../markdown`.
// The reasoning, recorded here where that writer's rationale used to live: ADF
// is a ProseMirror-shaped rich tree, so the conversion worth owning is
// `ADF ↔ HTML`, and `Markdown ↔ HTML` is the half a standard parser should own.
// `@atlaskit/editor-markdown-transformer` is built exactly that way — internally
// `markdown-it` + `markdown-it-table` + `@atlaskit/adf-schema` — and, unlike a
// hand-rolled subset, it can grow constructs (tables, nested lists) rather than
// having to add a case per node type.
//
//   Markdown --MarkdownTransformer.parse()--> ProseMirror node
//            --JSONTransformer.encode()----> ADF JSON
//
// It is **write-only**: `MarkdownTransformer.encode()` throws ("not implemented
// yet"), so ADF → Markdown remains the reader in `jira.server.ts` (`adfToMarkdown`).
//
// Why this module is separate from `../markdown` (and server-only): the renderer
// still parses Markdown with the dependency-free parser there, so keeping the
// Atlassian chain out of that module keeps `adf-schema` + `markdown-it` + `lodash`
// out of the browser bundle. `jira.server.ts` is the only importer.
//
// What keeps render and write from disagreeing: the wire format. `adfToMarkdown`
// only ever emits the Markdown subset the render parser understands, so jiracule's
// own writes read back and render exactly. A table (or any node the reader has no
// case for) written here will render *flattened* on read until the ADF → Markdown
// direction grows table support — that read-path work is deliberately out of scope
// here, and this is the visible edge of it.
import MarkdownIt from 'markdown-it'
import { MarkdownTransformer } from '@atlaskit/editor-markdown-transformer'
import { JSONTransformer } from '@atlaskit/editor-json-transformer'
import type { JSONDocNode } from '@atlaskit/editor-json-transformer'

// A tokenizer configured to match the app's existing wire format rather than
// markdown-it's defaults:
//   - `linkify: true` keeps bare URLs autolinked (the old parser did this).
//   - the `newline` rule (off in the `zero` preset) maps a single line break to
//     a `hardBreak`, which is what the old parser did for every paragraph line.
// The remaining rules are enabled per-schema by `MarkdownTransformer` itself.
const tokenizer = new MarkdownIt('zero', { html: false, linkify: true })
tokenizer.enable(['entity', 'escape', 'newline'])

const markdownTransformer = new MarkdownTransformer(undefined, tokenizer)
const jsonTransformer = new JSONTransformer()

// markdownToAdf converts Markdown source into an ADF document for Jira's v3 API.
export function markdownToAdf(src: string): JSONDocNode {
  const doc = jsonTransformer.encode(markdownTransformer.parse(src))
  // Jira rejects a document with no content (and an empty text node), so an
  // empty or blank description becomes a single empty paragraph.
  if (doc.content.length === 0) doc.content.push({ type: 'paragraph' })
  return doc
}