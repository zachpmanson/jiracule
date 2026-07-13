import { Link } from '@tanstack/react-router'
import { useBoards } from '../queries'
import { errMsg } from '../util'

export function IndexPage() {
  const { data: boards, isLoading, error } = useBoards()

  if (isLoading) return <div className="placeholder">Loading boards…</div>
  if (error) return <div className="placeholder error">{errMsg(error)}</div>

  return (
    <div>
      <h1>Boards</h1>
      <ul className="list-none p-0">
        {boards?.map((b) => (
          <li
            key={b.id}
            className="flex gap-2.5 items-baseline py-2 border-b border-solid border-line"
          >
            <Link
              to="/board/$boardId"
              params={{ boardId: b.id }}
              className="text-accent no-underline font-semibold hover:underline"
            >
              {b.name}
            </Link>
            <span className="muted">
              {b.type}
              {b.projectKey ? ` · ${b.projectKey}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
