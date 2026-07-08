import { useNavigate, useParams } from '@tanstack/react-router'
import { useBoards, useMe } from '../queries'

export function Header() {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { boardId?: string }
  const currentBoardId = params.boardId ?? ''
  const { data: boards } = useBoards()
  const { data: me } = useMe()

  return (
    <header className="topbar">
      <div className="brand" onClick={() => navigate({ to: '/' })}>
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
      <div className="spacer" />
      {me && (
        <div className="me" title={me.email ?? me.displayName}>
          {me.avatarUrl && <img src={me.avatarUrl} alt="" className="avatar" />}
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
