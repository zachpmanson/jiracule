import { Link } from '@tanstack/react-router'
import { useBoards } from '../queries'
import { errMsg, groupByProject } from '../util'

export function IndexPage() {
  const { data: boards, isLoading, error } = useBoards()

  if (isLoading) return <div className="placeholder">Loading boards…</div>
  if (error) return <div className="placeholder error">{errMsg(error)}</div>

  const groups = groupByProject(boards)

  return (
    <div>
      <h1>Boards</h1>
      {groups.map((g) => (
        <section key={g.name} className="mb-6">
          <h2 className="text-muted text-xs font-semibold uppercase tracking-[0.04em] mb-1">
            {g.name}
          </h2>
          <ul className="list-none p-0">
            {g.boards.map((b) => (
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
                <span className="muted">{b.type}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
