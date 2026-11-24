import type { ReactNode } from 'react'

export function AppSection({ children }: { children: ReactNode }) {
  return (
    <section className="panel" aria-label="Team capacity planner">
      {children}
    </section>
  )
}
