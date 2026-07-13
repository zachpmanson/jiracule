import type { Assignee } from '../types'

// Avatar renders a person's photo, falling back to their initials on a colored
// chip. `sm` is the 20px card/detail size; the default is the 24px header size.
export function Avatar({ person, size = 'md' }: { person: Assignee; size?: 'sm' | 'md' }) {
  // sm is the 20px card/detail size; md the 24px header size.
  const sizeCls = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6'
  return person.avatarUrl ? (
    <img
      src={person.avatarUrl}
      alt=""
      title={person.displayName}
      className={`${sizeCls} rounded-full`}
    />
  ) : (
    <span
      className={`${sizeCls} inline-flex items-center justify-center rounded-full bg-accent text-accent-fg text-[9px] font-bold`}
      title={person.displayName}
    >
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
