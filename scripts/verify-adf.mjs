// Verifies the Markdown → ADF write path (`src/server/adf.ts`): every construct
// the app supports must produce schema-valid ADF, and a GFM pipe table must
// produce a real `table` node rather than literal pipes.
//
// Run with: pnpm verify:adf
//
// Node runs the TypeScript module directly (type stripping), so this checks the
// actual implementation rather than a copy of it. `@atlaskit/adf-utils` is a
// dev-only dependency for exactly this check.
import { markdownToAdf } from '../src/server/adf.ts'
// The validator ships as a child entry point; resolve the CJS build explicitly
// so plain Node can load it (the ESM build uses directory imports Node rejects).
import { validator } from '@atlaskit/adf-utils/dist/cjs/validator/validator.js'

// The validator probes an uninitialised feature-gate client and logs a noisy
// (harmless) error on first use; keep it out of the check's output.
function quiet(fn) {
  const { error, warn } = console
  console.error = () => {}
  console.warn = () => {}
  try {
    return fn()
  } finally {
    console.error = error
    console.warn = warn
  }
}

const validate = quiet(() => validator())

const cases = [
  { name: 'paragraphs', src: 'one\n\ntwo', want: ['paragraph'] },
  { name: 'headings', src: '# H1\n\n## H2\n\n### H3', want: ['heading'] },
  { name: 'bullet list', src: '- a\n- b', want: ['bulletList'] },
  { name: 'ordered list', src: '3. a\n4. b', want: ['orderedList'] },
  { name: 'nested list', src: '- a\n  - b', want: ['bulletList'] },
  { name: 'code block', src: '```js\nconst x = 1\n```', want: ['codeBlock'] },
  { name: 'blockquote', src: '> a\n> b', want: ['blockquote'] },
  { name: 'thematic break', src: '---', want: ['rule'] },
  { name: 'inline marks', src: '**b** *i* ~~s~~ `c` [l](https://e.com)', want: ['paragraph'] },
  { name: 'bare url', src: 'see https://example.com/x', want: ['paragraph'], marks: ['link'] },
  { name: 'image', src: '![alt](https://example.com/i.png)', want: ['mediaSingle', 'media'] },
  { name: 'hard break', src: 'one\ntwo', want: ['hardBreak'] },
  { name: 'gfm table', src: '| A | B |\n| --- | --- |\n| 1 | 2 |', want: ['table'] },
]

const failures = []
const collect = (node, acc) => {
  if (!node || typeof node !== 'object') return acc
  if (typeof node.type === 'string') acc.push(node.type)
  for (const m of Array.isArray(node.marks) ? node.marks : []) {
    if (typeof m?.type === 'string') acc.push(m.type)
  }
  for (const c of Array.isArray(node.content) ? node.content : []) collect(c, acc)
  return acc
}

for (const { name, src, want, marks } of cases) {
  const doc = markdownToAdf(src)
  const types = collect(doc, [])
  const missing = [...want, ...(marks ?? [])].filter((t) => !types.includes(t))
  const valid = quiet(() => validate(doc).valid)
  if (!valid || missing.length) {
    failures.push(`${name}: valid=${valid}${missing.length ? ` missing=[${missing}]` : ''}`)
  }
  console.log(
    `${valid && !missing.length ? 'ok  ' : 'FAIL'} ${name}${missing.length ? ` (missing ${missing})` : ''}`,
  )
}

// An empty or blank description must still be a valid doc with content: Jira
// rejects a document with no content.
for (const src of ['', '   \n\n']) {
  const doc = markdownToAdf(src)
  const ok = doc.content.length === 1 && doc.content[0].type === 'paragraph'
  if (!ok) failures.push(`empty guard for ${JSON.stringify(src)}: ${JSON.stringify(doc.content)}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'} empty guard ${JSON.stringify(src)}`)
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\nall adf write-path checks passed')