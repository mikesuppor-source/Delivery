import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

// Shared UI kit. Styles live in ./ui.css (loaded by app/layout.tsx) and follow the
// surrounding theme: desk colours by default, dark courier colours inside .theme-courier.

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ')

export type ButtonVariant = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'subtle' | 'info' | 'on' | 'toggle' | 'link' | 'alert'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  /** Stretch to share the row with sibling buttons. */
  grow?: boolean
}

export function Button({ variant = 'primary', size = 'md', grow, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('ui-btn', 'ui-btn--' + variant, size !== 'md' && 'ui-btn--' + size, grow && 'ui-btn--grow', className)}
      {...rest}
    />
  )
}

export function Pill({ tone = 'success', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: 'success' | 'success-soft' | 'tag' }) {
  return <span className={cx('ui-pill', 'ui-pill--' + tone, className)} {...rest} />
}

export function Panel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('ui-panel', className)} {...rest} />
}

export interface NoticeProps {
  tone: 'info' | 'warning'
  icon?: ReactNode
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
}

/** Highlighted message with an optional row of actions. */
export function Notice({ tone, icon, title, children, actions }: NoticeProps) {
  return (
    <div className={cx('ui-notice', 'ui-notice--' + tone)} role={tone === 'warning' ? 'alert' : undefined}>
      <div className="ui-notice__title">
        {icon && <span aria-hidden="true">{icon}</span>}
        <span>{title}</span>
      </div>
      {children && <p className="ui-notice__body">{children}</p>}
      {actions && <div className="ui-notice__actions">{actions}</div>}
    </div>
  )
}

export interface StatCardProps {
  label: ReactNode
  value: ReactNode
  suffix?: ReactNode
  footnote?: ReactNode
  accentFootnote?: boolean
  badge?: ReactNode
  tone?: 'default' | 'success'
  /** Makes the card a real button, so it works with keyboards and screen readers. */
  onClick?: () => void
}

export function StatCard({ label, value, suffix, footnote, accentFootnote, badge, tone = 'default', onClick }: StatCardProps) {
  const className = cx('ui-stat', tone === 'success' && 'ui-stat--success')
  const content = (
    <>
      <span className="ui-stat__head">
        <span className="ui-stat__label">{label}</span>
        {badge}
      </span>
      <span className="ui-stat__value">
        {value}
        {suffix && <span className="ui-stat__suffix">{suffix}</span>}
      </span>
      {footnote && <span className={cx('ui-stat__foot', accentFootnote && 'ui-stat__foot--accent')}>{footnote}</span>}
    </>
  )
  return onClick ? (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  )
}

export function StatGrid({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('ui-stats', className)} {...rest} />
}

export function Toast({ tone, children }: { tone: 'success' | 'error'; children: ReactNode }) {
  return (
    <div className={cx('ui-toast', 'ui-toast--' + tone)} role="status" aria-live="polite">
      <span aria-hidden="true">{tone === 'success' ? '✓' : '⚠'}</span>
      <span>{children}</span>
    </div>
  )
}

export type StatusTone = 'ok' | 'busy' | 'error' | 'idle'

/** Bordered status box: a coloured dot and message, actions that wrap below on narrow screens, optional details. */
export function StatusPanel({ tone, message, actions, children }: { tone: StatusTone; message: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx('ui-status', 'ui-status--' + tone)} role="status">
      <div className="ui-status__row">
        <div className="ui-status__message">
          <span className={cx('ui-dot', tone !== 'idle' && 'ui-dot--' + tone)} aria-hidden="true" />
          <span>{message}</span>
        </div>
        {actions && <div className="ui-status__actions">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function Card({ tone = 'default', className, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: 'default' | 'success' | 'danger' }) {
  return <div className={cx('ui-card', tone !== 'default' && 'ui-card--' + tone, className)} {...rest} />
}

export type TagTone = 'info' | 'sky' | 'danger' | 'neutral' | 'success' | 'success-soft' | 'warning' | 'violet'

export function Tag({ tone, pill, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone: TagTone; pill?: boolean }) {
  return <span className={cx('ui-tag', 'ui-tag--' + tone, pill && 'ui-tag--pill', className)} {...rest} />
}

/** A Tag that is also a link (e.g. a map or tracking shortcut). */
export function TagLink({ tone, className, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { tone: TagTone }) {
  return <a className={cx('ui-tag', 'ui-tag--' + tone, className)} {...rest} />
}

/** Order status chip; colours follow the status name (delivered, picked_up, assigned, failed, ...). */
export function StatusChip({ status, children }: { status: string; children: ReactNode }) {
  return <span className={cx('ui-chip', 'ui-chip--' + status)}>{children}</span>
}

export function Callout({ tone, title, children }: { tone: 'warning' | 'purple' | 'note'; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx('ui-callout', 'ui-callout--' + tone)}>
      {title}
      {children && (title ? <small>{children}</small> : children)}
    </div>
  )
}

export type TileTone = 'waze' | 'maps' | 'whatsapp' | 'neutral'

/** Icon + label link in a 4-column grid. Without href it renders as a greyed-out placeholder. */
export function ActionTile({ tone, icon, label, href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { tone: TileTone; icon: ReactNode; label: ReactNode }) {
  if (!href) {
    return (
      <div className="ui-tile ui-tile--disabled" aria-disabled="true">
        {icon}
        <span>{label}</span>
      </div>
    )
  }
  return (
    <a href={href} className={cx('ui-tile', 'ui-tile--' + tone)} {...rest}>
      {icon}
      <span>{label}</span>
    </a>
  )
}

export function ActionTiles({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('ui-tiles', className)} {...rest} />
}

export function SoftLink({ tone, className, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { tone: 'green' | 'blue' }) {
  return <a className={cx('ui-soft-link', 'ui-soft-link--' + tone, className)} {...rest} />
}

// --- Design Foundation Kit Additions -----------------------
export * from './status-badge'
export * from './money-text'
export * from './kpi-card'
export * from './data-table'
export * from './filter-bar'
export * from './empty-state'
export * from './drawer'
export * from './tabs'
export * from './date-range-picker'
export * from './confirm-dialog'
export * from './skeleton'
export { ToastProvider, useToast } from './toast'

