import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { App } from '../App'
import { LoadCell } from '../components/LoadCell'
import { CapacityGrid } from '../components/CapacityGrid'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('shows a positive overage below display precision without reporting zero hours over', () => {
  render(<table><tbody><tr><LoadCell allocated={40} capacity={39.99999} /></tr></tbody></table>)

  expect(screen.getByText('< 0.0001 h over')).toBeTruthy()
})

function page(weeklyHours: number) {
  return Response.json({
    weeks: ['2026-01-05'], total: 1, pageSize: 25,
    people: [{ id: 5, name: 'Eli', weeklyHours, weeks: { '2026-01-05': { allocated: 20, capacity: weeklyHours } } }],
  })
}

it('keeps the draft on failed PATCH and retries a failed refresh without saving twice', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(page(0))
    .mockResolvedValueOnce(new Response(null, { status: 500 }))
    .mockResolvedValueOnce(Response.json({ id: 5, weeklyHours: 24 }))
    .mockRejectedValueOnce(new Error('read offline'))
    .mockResolvedValueOnce(page(24))
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit weekly hours for Eli' }))
  const input = screen.getByRole('spinbutton') as HTMLInputElement
  fireEvent.change(input, { target: { value: '24' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect((await screen.findByRole('alert')).textContent).toContain('Save failed')
  expect(input.value).toBe('24')
  expect(screen.getByText('20 h over')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  const retry = await screen.findByRole('button', { name: 'Retry' })
  expect(screen.getByText('Weekly hours saved for Eli.')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('may be stale')
  expect(screen.getByText('20 h over')).toBeTruthy()
  fireEvent.click(retry)

  await screen.findByRole('button', { name: 'Edit weekly hours for Eli' })
  const row = await screen.findByRole('row', { name: /Eli/ })
  expect(within(row).getByText('24 h / week')).toBeTruthy()
  expect(row.textContent).toContain('20 / 24 h')
  expect(within(row).queryByText('20 h over')).toBeNull()
  const writes = fetcher.mock.calls.filter(([, options]) => options?.method === 'PATCH')
  expect(writes).toHaveLength(2)
  expect(writes[0][0]).toBe('/api/people/5')
  expect(JSON.parse(writes[0][1].body)).toEqual({ weeklyHours: 24 })
})

it('shows an initial error, then retains and identifies the last loaded range on navigation failure', async () => {
  const fetcher = vi.fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(page(0))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(page(24))
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  await screen.findByRole('table')
  fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('2025-12-29 to 2026-01-16, page 1')
  expect(screen.getByText('20 h over')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Edit weekly hours for Eli' })).toBeNull()
  fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
  await screen.findByRole('button', { name: 'Edit weekly hours for Eli' })
  expect(screen.queryByRole('alert')).toBeNull()
})

it('moves both ends by a week across the year boundary and applies a custom range', async () => {
  const fetcher = vi.fn().mockImplementation(async () => page(0))
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  await screen.findByRole('table')
  fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
  await screen.findByRole('table')
  expect(fetcher.mock.lastCall?.[0]).toBe('/api/capacity?from=2026-01-05&to=2026-01-23&page=1')
  fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
  await screen.findByRole('table')
  expect(fetcher.mock.lastCall?.[0]).toBe('/api/capacity?from=2025-12-29&to=2026-01-16&page=1')
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-14' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply range' }))
  await screen.findByRole('table')
  expect(fetcher.mock.lastCall?.[0]).toBe('/api/capacity?from=2026-01-14&to=2026-01-16&page=1')
})

it('renders loads by the header dates and flags only weeks above capacity', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    weeks: ['2026-01-05', '2026-01-12', '2026-01-19'],
    people: [{
      id: 5, name: 'Eli', weeklyHours: 20,
      weeks: {
        '2026-01-19': { allocated: 0, capacity: 0 },
        '2026-01-12': { allocated: 20, capacity: 20 },
        '2026-01-05': { allocated: 22.5, capacity: 20 },
      },
    }],
    total: 1, pageSize: 25,
  })))

  render(<CapacityGrid initialRange={{ from: '2026-01-05', to: '2026-01-25' }} />)

  const row = await screen.findByRole('row', { name: /Eli/ })
  const cells = within(row).getAllByRole('cell')

  expect(cells).toHaveLength(3)
  expect(cells[0].textContent).toContain('22.5 / 20 h')
  expect(within(cells[0]).getByText('2.5 h over')).toBeTruthy()
  expect(cells[1].textContent).toBe('20 / 20 h')
  expect(cells[2].textContent).toBe('0 / 0 h')
  expect(within(row).getAllByText(/h over/)).toHaveLength(1)
})

it('cancels an edit without persisting the draft', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(page(20))
  vi.stubGlobal('fetch', fetcher)

  render(<App />)

  const edit = await screen.findByRole('button', { name: 'Edit weekly hours for Eli' })
  fireEvent.click(edit)
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '12' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(screen.queryByRole('spinbutton')).toBeNull()
  expect(screen.getByRole('button', { name: 'Edit weekly hours for Eli' }).textContent).toContain('20 h / week')
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('pages through the roster and disables navigation at either boundary', async () => {
  function rosterPage(name: string, id: number) {
    return Response.json({
      weeks: ['2026-01-05'],
      people: [{ id, name, weeklyHours: 20, weeks: { '2026-01-05': { allocated: 10, capacity: 20 } } }],
      total: 2, pageSize: 1,
    })
  }

  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(rosterPage('Ada', 1))
    .mockResolvedValueOnce(rosterPage('Eli', 2))
    .mockResolvedValueOnce(rosterPage('Ada', 1))

  vi.stubGlobal('fetch', fetcher)
  render(<App />)

  await screen.findByRole('row', { name: /Ada/ })
  expect(screen.getByRole('button', { name: 'Previous page' }).hasAttribute('disabled')).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await screen.findByRole('row', { name: /Eli/ })

  expect(fetcher).toHaveBeenNthCalledWith(2, '/api/capacity?from=2025-12-29&to=2026-01-16&page=2', expect.anything())
  expect(screen.getByText('People 2–2 of 2')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled')).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
  await screen.findByRole('row', { name: /Ada/ })

  expect(screen.getByText('People 1–1 of 2')).toBeTruthy()
})

it.each([false, true])('can retry a stalled capacity read (previous roster: %s)', async (warm) => {
  const fetcher = vi.fn<typeof fetch>()

  if (warm) {
    fetcher.mockResolvedValueOnce(page(0))
  }

  fetcher.mockImplementationOnce(() => new Promise<Response>(() => {}))
  fetcher.mockResolvedValueOnce(page(24))
  vi.stubGlobal('fetch', fetcher)

  if (warm) {
    render(<App />)
    await screen.findByRole('table')
  }

  vi.useFakeTimers()
  try {
    if (warm) {
      fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    } else {
      render(<App />)
    }

    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })

    expect(screen.getByRole('alert').textContent).toContain('timed out')
    expect(Boolean(screen.queryByRole('table'))).toBe(warm)
  } finally {
    vi.useRealTimers()
  }

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByRole('button', { name: 'Edit weekly hours for Eli' })
  expect(screen.getByRole('row', { name: /Eli/ }).textContent).toContain('20 / 24 h')
})

it('preserves unapplied dates until the manager resets or applies them', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => page(0)))
  render(<App />)
  await screen.findByRole('table')

  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-13' } })
  const next = screen.getByRole('button', { name: 'Next week' })
  expect(next.hasAttribute('disabled')).toBe(true)
  fireEvent.click(next)
  expect(screen.getByDisplayValue('2026-01-13')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Reset dates' }))
  expect(screen.getByDisplayValue('2025-12-29')).toBeTruthy()
  expect(next.hasAttribute('disabled')).toBe(false)
})

it('protects a changed hours draft across page and date controls until canceled', async () => {
  const response = await page(40).json()
  response.total = 50
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(response)))
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit weekly hours for Eli' }))

  const nextPage = screen.getByRole('button', { name: 'Next page' })
  expect(nextPage.hasAttribute('disabled')).toBe(false)
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '17.25' } })
  for (const name of ['Next page', 'Apply range', 'Previous week', 'Next week']) {
    expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true)
  }

  fireEvent.click(nextPage)
  expect(screen.getByDisplayValue('17.25')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(nextPage.hasAttribute('disabled')).toBe(false)
})
