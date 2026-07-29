import { useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useBoards, useMe } from '../queries'
import { Avatar } from './Avatar'

export function Header() {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { boardId?: string }
  const currentBoardId = params.boardId ?? ''
  const { data: boards } = useBoards()
  const { data: me } = useMe()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the account menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

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
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[13px] rounded-card px-1.5 py-1 cursor-pointer bg-transparent border-none hover:bg-canvas"
            title={me.email ?? me.displayName}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Avatar person={me} />
            <span>{me.displayName}</span>
            <span className="text-muted" aria-hidden>
              ▾
            </span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 min-w-40 flex flex-col bg-surface border border-solid border-line rounded-card shadow-card py-1 z-10"
            >
              <a
                role="menuitem"
                href="/auth/token"
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-[13px] text-fg no-underline hover:bg-canvas"
                onClick={() => setMenuOpen(false)}
              >
                Debug: bearer token
              </a>
              <form method="post" action="/auth/logout">
                <button
                  type="submit"
                  role="menuitem"
                  className="w-full text-left px-3 py-1.5 text-[13px] text-muted bg-transparent border-none cursor-pointer hover:bg-canvas hover:text-fg"
                >
                  Log out
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
