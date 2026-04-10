import type { ReactNode } from "react"

export type TabButtonProps = {
  isActive: boolean
  onClick: () => void
  children: ReactNode
}

export function TabButton({ isActive, onClick, children }: TabButtonProps): JSX.Element {
  return (
    <button className={`page-btn ${isActive ? "active" : ""}`} onClick={onClick}>
      {children}
    </button>
  )
}
