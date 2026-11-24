import { useEffect, useState, type FormEvent } from 'react'
import { shiftWeek } from '../utils'

interface DateRange {
  from: string
  to: string
}

interface WeekLoad {
  allocated: number
  capacity: number
}

interface PersonLoad {
  id: number
  name: string
  weeklyHours: number
  weeks: Record<string, WeekLoad>
}

interface CapacityPage {
  people: PersonLoad[]
  weeks: string[]
  total: number
  pageSize: number
}

interface CapacityTableProps extends DateRange {
  page: number
  onPage: (page: number) => void
  saving: boolean
  onSaving: (saving: boolean) => void
}

interface LoadedPage extends DateRange {
  data: CapacityPage
  page: number
  request: string
}

const hours = new Intl.NumberFormat('en', { maximumFractionDigits: 4 })
const weekDate = new Intl.DateTimeFormat('en', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
})

interface WeeklyHoursProps {
  person: PersonLoad
  formattedHours: string
  editable: boolean
  editingID: number | null
  onEdit: (id: number | null) => void
  saving: boolean
  onSaving: (saving: boolean) => void
  onSaved: () => void
}

function WeeklyHours({
  person, formattedHours, editable, editingID, onEdit, saving, onSaving, onSaved,
}: WeeklyHoursProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  function startEditing() {
    setDraft(String(person.weeklyHours))
    setError('')
    onEdit(person.id)
  }

  async function save(event: FormEvent) {
    event.preventDefault()

    onSaving(true)
    setError('')

    try {
      const response = await fetch('/api/people/' + person.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyHours: Number(draft) }),
      })

      if (!response.ok) {
        throw new Error('Could not update weekly hours.')
      }

      onSaved()
    } catch {
      setError('Save failed. Check your connection and try again.')
    } finally {
      onSaving(false)
    }
  }

  if (!editable) {
    return <small>{formattedHours} h / week</small>
  }

  if (editingID !== person.id) {
    return (
      <button className="edit" disabled={editingID !== null}
        aria-label={'Edit weekly hours for ' + person.name} onClick={startEditing}>
        {formattedHours} h / week <span>Edit</span>
      </button>
    )
  }

  let saveLabel = 'Save'
  if (saving) {
    saveLabel = 'Saving…'
  }

  let errorMessage = null
  if (error) {
    errorMessage = <small role="alert">{error}</small>
  }

  return (
    <form className="editor" onSubmit={save}>
      <input autoFocus required disabled={saving} type="number" min="0" max="168" step="any"
        aria-label={'Weekly hours for ' + person.name} value={draft}
        onChange={event => setDraft(event.target.value)} />

      <button className="primary" disabled={saving}>{saveLabel}</button>
      <button type="button" disabled={saving} onClick={() => onEdit(null)}>Cancel</button>

      {errorMessage}
    </form>
  )
}

function LoadCell({ allocated, capacity }: WeekLoad) {
  let percent = 0
  let className = ''
  let overage = null

  if (allocated > capacity) {
    percent = 100
    className = 'over'
    overage = <span className="overage">{hours.format(allocated - capacity)} h over</span>
  } else if (capacity > 0) {
    percent = allocated / capacity * 100
  }

  return (
    <td className={className}>
      <div className="numbers"><strong>{hours.format(allocated)}</strong> / {hours.format(capacity)} h</div>
      <div className="track" aria-hidden="true"><i style={{ width: percent + '%' }} /></div>
      {overage}
    </td>
  )
}

function CapacityTable({ from, to, page, onPage, saving, onSaving }: CapacityTableProps) {
  const [editingID, setEditingID] = useState<number | null>(null)
  const [revision, setRevision] = useState(0)
  const [lastRead, setLastRead] = useState<LoadedPage | null>(null)
  const [failedRequest, setFailedRequest] = useState('')
  const [savedNotice, setSavedNotice] = useState({ range: '', text: '' })

  const range = from + '/' + to + '/' + page
  const request = range + '/' + revision
  const failed = failedRequest === request
  let current = false
  if (lastRead !== null) {
    current = lastRead.request === request
  }

  useEffect(() => {
    const controller = new AbortController()
    setEditingID(null)
    setFailedRequest('')

    async function load() {
      try {
        const params = new URLSearchParams({ from, to, page: String(page) })
        const response = await fetch('/api/capacity?' + params, { signal: controller.signal })

        if (!response.ok) {
          throw new Error('Could not load capacity.')
        }

        const result: CapacityPage = await response.json()

        if (controller.signal.aborted) {
          return
        }

        setLastRead({ data: result, from, to, page, request })
      } catch {
        if (controller.signal.aborted) {
          return
        }

        setFailedRequest(request)
      }
    }

    void load()

    return () => controller.abort()
  }, [from, to, page, revision, request])

  function refresh() {
    setRevision(v => v + 1)
  }

  function navigate(next: number) {
    setSavedNotice({ range: '', text: '' })
    setEditingID(null)
    onPage(next)
  }

  function saved(person: PersonLoad) {
    setEditingID(null)
    setSavedNotice({ range, text: 'Weekly hours saved for ' + person.name + '.' })
    refresh()
  }

  let notice = null
  if (savedNotice.range === range) {
    notice = <p className="notice" role="status">{savedNotice.text}</p>
  }

  let status = null
  if (failed) {
    let staleMessage = ''
    if (lastRead !== null) {
      staleMessage = ` Showing previously loaded data for ${lastRead.from} to ${lastRead.to}, page ${lastRead.page}. It may be stale.`
    }

    status = (
      <div className="state" role="alert">
        Could not load the requested capacity.{staleMessage} <button onClick={refresh}>Retry</button>
      </div>
    )
  } else if (!current) {
    status = <p className="state" role="status">Loading capacity…</p>
  }

  if (lastRead === null) {
    return status
  }

  const { data, page: displayedPage } = lastRead

  if (data.people.length === 0) {
    return <>{notice}{status}<p className="state">No people in the roster.</p></>
  }

  return (
    <>
      {notice}
      {status}
      <div className="scroll" role="region" aria-label="Weekly allocations" tabIndex={0}>
        <table>
          <caption className="sr-only">Allocated hours / available hours for the selected workdays</caption>
          <thead>
            <tr>
              <th scope="col">Team member</th>
              {data.weeks.map(week => (
                <th key={week} scope="col">
                  <span>Week of</span>{weekDate.format(new Date(week + 'T00:00:00Z'))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.people.map(person => (
              <tr key={person.id}>
                <th scope="row">
                  <div className="name">{person.name}</div>
                  <WeeklyHours person={person} formattedHours={hours.format(person.weeklyHours)}
                    editable={current && !failed} editingID={editingID} onEdit={setEditingID}
                    saving={saving} onSaving={onSaving} onSaved={() => saved(person)} />
                </th>
                {data.weeks.map(date => <LoadCell key={date} {...person.weeks[date]} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer>
        <span>People {(displayedPage - 1) * data.pageSize + 1}–{Math.min(displayedPage * data.pageSize, data.total)} of {data.total}</span>
        <div className="arrows">
          <button disabled={saving || page === 1} onClick={() => navigate(page - 1)}>Previous page</button>
          <button disabled={saving || page * data.pageSize >= data.total} onClick={() => navigate(page + 1)}>Next page</button>
        </div>
      </footer>
    </>
  )
}

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
    <>
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
    </>
  )
}
