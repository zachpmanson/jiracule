import type { Assignee } from '../types'

// Avatar renders a person's photo, falling back to their initials on a colored
// chip. `sm` is the 20px card/detail size; the default is the 24px header size.
export function Avatar({ person, size = 'md' }: { person: Assignee; size?: 'sm' | 'md' }) {
  const cls = `avatar${size === 'sm' ? ' sm' : ''}`
  return person.avatarUrl ? (
    <img src={person.avatarUrl} alt="" title={person.displayName} className={cls} />
  ) : (
    <span className={`${cls} initials`} title={person.displayName}>
      {person.displayName.slice(0, 2).toUpperCase()}
    </span>
  )
}

// Person is an avatar + name, or a muted "Unassigned" when there is no person.
export function Person({ person }: { person?: Assignee }) {
  if (!person) return <span className="muted">Unassigned</span>
  return (
    <span className="person">
      <Avatar person={person} size="sm" />
      {person.displayName}
    </span>
  )
}
