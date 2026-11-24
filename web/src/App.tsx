import { AppHeader } from './components/AppHeader'
import { AppSection } from './components/AppSection'
import { CapacityGrid } from './components/CapacityGrid'

const initialRange = { from: '2025-12-29', to: '2026-01-16' }

export function App() {
  return (
    <main>
      <AppHeader />

      <AppSection>
        <CapacityGrid initialRange={initialRange} />
      </AppSection>
    </main>
  )
}
