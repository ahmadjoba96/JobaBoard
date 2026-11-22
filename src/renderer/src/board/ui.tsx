import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export function ColorRow({
  colors,
  value,
  onChange,
  custom
}: {
  colors: string[]
  value: string
  onChange: (c: string) => void
  custom?: boolean
}): JSX.Element {
  return (
    <div className="colors" role="radiogroup">
      {colors.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={value === c}
          aria-label={c === 'transparent' ? 'No fill' : 'Color ' + c}
          className={'swatch' + (value === c ? ' on' : '') + (c === 'transparent' ? ' none' : '')}
          style={{ background: c === 'transparent' ? undefined : c }}
          onClick={() => onChange(c)}
        />
      ))}
      {custom && (
        <label className="swatch custom" title="Custom color">
          <input type="color" value={value.startsWith('#') && value.length === 7 ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
        </label>
      )}
    </div>
  )
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }): JSX.Element {
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export interface PromptField {
  key: string
  label: string
  placeholder?: string
  initial?: string
}

/** Replacement for window.prompt (which Electron does not support). */
export function PromptModal({
  title,
  fields,
  submitLabel = 'OK',
  onSubmit,
  onClose
}: {
  title: string
  fields: PromptField[]
  submitLabel?: string
  onSubmit: (values: Record<string, string>) => void
  onClose: () => void
}): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.initial ?? ''])))
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    first.current?.focus()
    first.current?.select()
  }, [])
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(values)
          onClose()
        }}
      >
        {fields.map((f, i) => (
          <label key={f.key} className="field">
            <span>{f.label}</span>
            <input
              ref={i === 0 ? first : undefined}
              value={values[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          </label>
        ))}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export interface ToastMsg {
  id: number
  text: string
  kind: 'info' | 'error'
}

export function Toasts({ items }: { items: ToastMsg[] }): JSX.Element {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function useToasts(): [ToastMsg[], (text: string, kind?: 'info' | 'error') => void] {
  const [items, setItems] = useState<ToastMsg[]>([])
  const seq = useRef(0)
  const push = useRef((text: string, kind: 'info' | 'error' = 'info') => {
    const id = ++seq.current
    setItems((l) => [...l.slice(-3), { id, text, kind }])
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === 'error' ? 4500 : 2200)
  })
  return [items, push.current]
}
