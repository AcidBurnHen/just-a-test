import { useState, type FormEvent } from 'react'
import type { DateRange } from '../capacity.types'
import { shiftWeek } from '../utils'
import { CapacityTable } from './CapacityTable'
import './CapacityGrid.modules.css'

export function CapacityGrid({ initialRange }: { initialRange: DateRange }) {
  const [range, setRange] = useState(initialRange)
  const [draft, setDraft] = useState(initialRange)
  const [page, setPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function select(next: DateRange) {
    setError('')
    setDraft(next)
    setRange(next)
  }

  function apply(event: FormEvent) {
    event.preventDefault()

    const limit = new Date(draft.from + 'T00:00:00Z')
    limit.setUTCFullYear(limit.getUTCFullYear() + 2)

    if (draft.to < draft.from || new Date(draft.to + 'T00:00:00Z') > limit) {
      setError('Choose an end date within two years of the start date.')

      return
    }

    select(draft)
  }

  function move(direction: number) {
    const from = shiftWeek(range.from, direction)
    const to = shiftWeek(range.to, direction)

    select({ from, to })
  }

  let rangeError = null

  if (error) {
    rangeError = <p role="alert" className="notice">{error}</p>
  }

  return (
    <div className="capacity-grid">
      <div className="toolbar">
        <form className="dates" onSubmit={apply}>
          <label>From<input type="date" required value={draft.from}
            onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
          <label>To<input type="date" required value={draft.to}
            onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
          <button className="primary" disabled={saving}>Apply range</button>
        </form>
        <div className="arrows" aria-label="Week navigation">
          <button disabled={saving} onClick={() => move(-1)} aria-label="Previous week">← Week</button>
          <button disabled={saving} onClick={() => move(1)} aria-label="Next week">Week →</button>
        </div>
      </div>
      {rangeError}
      <CapacityTable {...range} page={page} onPage={setPage} saving={saving} onSaving={setSaving} />
    </div>
  )
}
