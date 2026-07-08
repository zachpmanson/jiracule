import { Link } from '@tanstack/react-router'
import { useBoards } from '../queries'

export function IndexPage() {
  const { data: boards, isLoading, error } = useBoards()

  if (isLoading) return <div className="placeholder">Loading boards…</div>
  if (error) return <div className="placeholder error">{(error as Error).message}</div>

  return (
    <div className="board-list">
      <h1>Boards</h1>
      <ul>
        {boards?.map((b) => (
          <li key={b.id}>
            <Link to="/board/$boardId" params={{ boardId: b.id }}>
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
