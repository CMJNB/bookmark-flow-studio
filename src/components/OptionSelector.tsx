import type { ReactNode } from "react"

export type OptionSelectorOption<T> = {
  value: T
  label: ReactNode
  title?: string
}

export type OptionSelectorProps<T> = {
  label: string
  options: OptionSelectorOption<T>[]
  value: T
  onChange: (value: T) => void
}

export function OptionSelector<T extends string | number>({
  label,
  options,
  value,
  onChange
}: OptionSelectorProps<T>): JSX.Element {
  return (
    <section className="compare-viewer-sort-controls">
      <div className="compare-viewer-sort-label">{label}</div>
      <div className="compare-viewer-sort-buttons">
        {options.map((option) => (
          <button
            key={option.value}
            className={`page-btn ${value === option.value ? "active" : ""}`}
            onClick={() => onChange(option.value)}
            title={option.title}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  )
}

