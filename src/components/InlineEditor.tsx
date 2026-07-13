import { InlineError } from './InlineError'

// InlineEditor is the shared textarea + error + actions block used for editing a
// title/description and composing a comment. Controlled: the parent owns the
// draft value. Omit `onCancel` for composers that only have a submit action.
export function InlineEditor({
  value,
  onChange,
  onSave,
  onCancel,
  pending = false,
  error,
  saveLabel = 'Save',
  savingLabel = 'Saving…',
  rows = 2,
  autoFocus = false,
  placeholder,
  requireNonEmpty = false,
  singleLine = false,
  className,
}: {
  value: string
  onChange: (v: string) => void
  onSave: () => void
  onCancel?: () => void
  pending?: boolean
  error?: unknown
  saveLabel?: string
  savingLabel?: string
  rows?: number
  autoFocus?: boolean
  placeholder?: string
  requireNonEmpty?: boolean
  // Single-line fields (e.g. a title) save on plain Enter; multi-line fields
  // (descriptions, comments) reserve Enter for newlines and save on Cmd/Ctrl+Enter.
  singleLine?: boolean
  className?: string
}) {
  const canSave = !pending && !(requireNonEmpty && !value.trim())
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter') return
    const wantsSave = singleLine ? !e.shiftKey : e.metaKey || e.ctrlKey
    if (!wantsSave) return
    e.preventDefault()
    if (canSave) onSave()
  }
  return (
    <div className={`editor${className ? ` ${className}` : ''}`}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={singleLine ? 1 : rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
      />
      <InlineError error={error} />
      <div className="editor-actions">
        {onCancel && <button onClick={onCancel}>Cancel</button>}
        <button
          className="primary"
          onClick={onSave}
          disabled={pending || (requireNonEmpty && !value.trim())}
        >
          {pending ? savingLabel : saveLabel}
        </button>
      </div>
    </div>
  )
}
