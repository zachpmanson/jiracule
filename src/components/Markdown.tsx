import { Fragment } from 'react'
import { parseMarkdown, type MdBlock, type MdInline } from '../markdown'

// Markdown renders a Markdown string (the wire format the server derives from a
// Jira issue's ADF) into React elements. It parses with the dependency-free
// parser in ../markdown — the write path uses Atlassian's transformers instead
// (see ../server/adf.ts) — and the server only derives this subset from ADF, so
// the rendered view matches what a save round-trips for the constructs the
// parser knows.
export function Markdown({ source }: { source: string }) {
  return (
    <div className="md">
      {parseMarkdown(source).map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  )
}

function Inline({ nodes }: { nodes: MdInline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case 'text':
            return <Fragment key={i}>{n.text}</Fragment>
          case 'break':
            return <br key={i} />
          case 'code':
            return <code key={i}>{n.text}</code>
          case 'strong':
            return (
              <strong key={i}>
                <Inline nodes={n.children} />
              </strong>
            )
          case 'em':
            return (
              <em key={i}>
                <Inline nodes={n.children} />
              </em>
            )
          case 'strike':
            return (
              <s key={i}>
                <Inline nodes={n.children} />
              </s>
            )
          case 'link':
            return (
              <a key={i} className="inline-link" href={n.href} target="_blank" rel="noreferrer">
                <Inline nodes={n.children} />
              </a>
            )
        }
      })}
    </>
  )
}

function Block({ block }: { block: MdBlock }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p>
          <Inline nodes={block.children} />
        </p>
      )
    case 'heading': {
      const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      return (
        <Tag>
          <Inline nodes={block.children} />
        </Tag>
      )
    }
    case 'bulletList':
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline nodes={item} />
            </li>
          ))}
        </ul>
      )
    case 'orderedList':
      return (
        <ol start={block.start}>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline nodes={item} />
            </li>
          ))}
        </ol>
      )
    case 'codeBlock':
      return (
        <pre>
          <code>{block.text}</code>
        </pre>
      )
    case 'blockquote':
      return (
        <blockquote>
          {block.children.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </blockquote>
      )
    case 'rule':
      return <hr />
  }
}
