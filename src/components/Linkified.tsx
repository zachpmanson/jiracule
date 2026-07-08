import { Fragment } from 'react'

const URL_RE = /(https?:\/\/[^\s<]+)/g
const TRAILING = /[.,;:!?)\]}>'"]+$/ // punctuation that usually isn't part of the URL

// Linkified renders plain text with any http(s) URLs turned into clickable
// links, preserving surrounding text and whitespace (the container uses
// white-space: pre-wrap for newlines).
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
