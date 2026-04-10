import type { ReactNode } from "react"

export type EmptyStateProps = {
  message: string
  icon?: string
  action?: ReactNode
}

export function EmptyState({ message, icon, action }: EmptyStateProps): JSX.Element {
  return (
    <section className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <div className="empty-state-message">{message}</div>
      {action && <div className="empty-state-action">{action}</div>}
    </section>
  )
}
