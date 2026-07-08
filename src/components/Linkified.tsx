import { Fragment } from 'react'
import type { InlineSegment } from '../types'

const URL_RE = /(https?:\/\/[^\s<]+)/g
const TRAILING = /[.,;:!?)\]}>'"]+$/ // punctuation that usually isn't part of the URL

// Linkified renders a plain string, turning bare http(s) URLs into links.
export function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>
        const trail = part.match(TRAILING)?.[0] ?? ''
        const url = trail ? part.slice(0, -trail.length) : part
        return (
          <Fragment key={i}>
            <a className="inline-link" href={url} target="_blank" rel="noreferrer">
              {url}
            </a>
            {trail}
          </Fragment>
        )
      })}
    </>
  )
}

// RichText renders inline segments extracted from ADF: link segments become an
// <a> tag on their label text; plain segments still get bare-URL linkification.
export function RichText({ segments }: { segments: InlineSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.href ? (
          <a key={i} className="inline-link" href={seg.href} target="_blank" rel="noreferrer">
            {seg.text}
          </a>
        ) : (
          <Linkified key={i} text={seg.text} />
        ),
      )}
    </>
  )
}
