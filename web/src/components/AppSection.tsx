import './AppSection.modules.css'
import type { ReactNode } from 'react'

export function AppSection({ children }: { children: ReactNode }) {
  return (
    <section className="app-section" aria-label="Team capacity planner">
      {children}
    </section>
  )
}
