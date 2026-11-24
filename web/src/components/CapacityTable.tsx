import { useEffect, useState } from 'react'
import type { CapacityPage, DateRange, PersonLoad } from '../capacity.types'
import { hourFormatter } from '../utils'
import { LoadCell } from './LoadCell'
import { WeeklyHours } from './WeeklyHours'
import './CapacityTable.modules.css'

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

const weekDate = new Intl.DateTimeFormat('en', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
})

export function CapacityTable({ from, to, page, onPage, saving, onSaving }: CapacityTableProps) {
  const [editingID, setEditingID] = useState<number | null>(null)
  const [revision, setRevision] = useState(0)
  const [lastRead, setLastRead] = useState<LoadedPage | null>(null)
  const [failure, setFailure] = useState({ request: '', message: '' })
  const [savedNotice, setSavedNotice] = useState({ range: '', text: '' })

  const range = from + '/' + to + '/' + page
  const request = range + '/' + revision
  const failed = failure.request === request
  let current = false
  if (lastRead !== null) {
    current = lastRead.request === request
  }

  useEffect(() => {
    const controller = new AbortController()
    setEditingID(null)
    setFailure({ request: '', message: '' })

    const timeout = window.setTimeout(() => {
      controller.abort()
      setFailure({ request, message: 'Loading capacity timed out.' })
    }, 15_000)

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

        setFailure({ request, message: 'Could not load the requested capacity.' })
      } finally {
        window.clearTimeout(timeout)
      }
    }

    void load()

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
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
        {failure.message}{staleMessage} <button onClick={refresh}>Retry</button>
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
    <div className="capacity-table">
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
                  <WeeklyHours person={person} formattedHours={hourFormatter.format(person.weeklyHours)}
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
    </div>
  )
}
