import { useNavigate, useParams } from '@tanstack/react-router'
import { useBoards, useMe } from '../queries'
import { Avatar } from './Avatar'

export function Header() {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { boardId?: string }
  const currentBoardId = params.boardId ?? ''
  const { data: boards } = useBoards()
  const { data: me } = useMe()

  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-surface border-b border-solid border-line">
      <div
        className="font-bold text-base cursor-pointer text-accent"
        onClick={() => navigate({ to: '/' })}
      >
        jiracule
      </div>
      <select
        className="board-switcher"
        value={currentBoardId}
        onChange={(e) => {
          const id = e.target.value
          if (id) navigate({ to: '/board/$boardId', params: { boardId: id } })
        }}
      >
        <option value="" disabled>
          Select a board…
        </option>
        {boards?.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.projectKey ? ` (${b.projectKey})` : ''}
          </option>
        ))}
      </select>
      <div className="flex-1" />
      {me && (
        <div className="flex items-center gap-1.5 text-[13px]" title={me.email ?? me.displayName}>
          <Avatar person={me} />
          <span>{me.displayName}</span>
        </div>
      )}
      <form method="post" action="/auth/logout">
        <button type="submit" className="link-btn logout">
          Log out
        </button>
      </form>
    </header>
  )
}
