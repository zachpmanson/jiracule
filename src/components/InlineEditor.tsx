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
  className?: string
}) {
  return (
    <div className={`editor${className ? ` ${className}` : ''}`}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
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
