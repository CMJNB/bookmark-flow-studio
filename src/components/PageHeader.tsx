import type { ReactNode } from "react"

export type PageHeaderProps = {
  title: string
  subtitle?: string
  meta?: ReactNode
}

export function PageHeader({ title, subtitle, meta }: PageHeaderProps): JSX.Element {
  return (
    <header className="compare-viewer-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {meta ? <div className="compare-viewer-meta">{meta}</div> : null}
    </header>
  )
}
