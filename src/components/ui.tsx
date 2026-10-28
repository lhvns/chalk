import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { parseNum } from '../lib/format'

// ---------- Sheet: bottom sheet on phones, dialog on desktop ----------

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  accent,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  accent?: string
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const titleId = useId()

  // Push a history entry while open so Android's back button closes the sheet
  // instead of leaving the screen.
  useEffect(() => {
    if (!open) return
    const key = Math.random().toString(36).slice(2)
    history.pushState({ sheet: key }, '')
    let popped = false
    const onPop = () => {
      // With stacked sheets only the one whose entry was popped closes.
      if (history.state?.sheet === key) return
      popped = true
      closeRef.current()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      if (!popped && history.state?.sheet === key) history.back()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={accent ? ({ '--accent': accent } as CSSProperties) : undefined}
      >
        <div className="sheet-head">
          <h2 id={titleId} className="display">
            {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ---------- Numeric input that tolerates half-typed values ("62.", "") ----------

export function NumberInput({
  value,
  onChange,
  placeholder,
  suffix,
  label,
  decimals = true,
  precision = 2,
  className = 'input',
  autoFocus,
}: {
  value: number | null | undefined
  onChange: (v: number | null) => void
  placeholder?: string
  suffix?: string
  label?: string
  decimals?: boolean
  /** Decimal places shown when the field isn't being edited. */
  precision?: number
  className?: string
  autoFocus?: boolean
}) {
  const fmt = (v: number | null | undefined) => (v == null || !isFinite(v) ? '' : String(Math.round(v * 10 ** precision) / 10 ** precision))
  const [text, setText] = useState(fmt(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(fmt(value))
  }, [value])

  const input = (
    <input
      className={className}
      inputMode={decimals ? 'decimal' : 'numeric'}
      enterKeyHint="next"
      value={text}
      placeholder={placeholder}
      aria-label={label}
      autoFocus={autoFocus}
      onFocus={(e) => {
        focused.current = true
        e.currentTarget.select()
      }}
      onBlur={() => {
        focused.current = false
        setText(fmt(value))
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,-]/g, '')
        setText(t)
        onChange(parseNum(t))
      }}
    />
  )
  if (!suffix) return input
  return (
    <div className="input-suffix">
      {input}
      <em>{suffix}</em>
    </div>
  )
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className ?? ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

// ---------- Segmented control ----------

export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------- Two-tap destructive button (no blocking browser dialogs) ----------

export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Tap again to confirm',
  className = 'btn btn-danger',
}: {
  onConfirm: () => void
  children: ReactNode
  confirmLabel?: string
  className?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3500)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      className={`${className} ${armed ? 'armed' : ''}`}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}

export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div>{children}</div>
    </div>
  )
}

export function Meter({ value, max, over = false }: { value: number; max: number; over?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div
      className={`meter ${over && value > max ? 'over' : ''}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Sets the section accent for everything inside it. */
export const accent = (name: 'lift' | 'cardio' | 'body' | 'food') =>
  ({ '--accent': `var(--${name})` }) as CSSProperties
