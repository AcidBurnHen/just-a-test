import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

import { App } from '../App'
import { AppHeader } from '../components/AppHeader'
import { AppSection } from '../components/AppSection'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('AppHeader introduces the page and explains the two hour totals', () => {
  render(<AppHeader />)

  const header = within(screen.getByRole('banner'))

  expect(header.getByRole('heading', { level: 1 }).textContent).toBe('Team capacity')
  expect(header.getByText(/assigned hours with available hours/i)).toBeTruthy()
})

it('AppSection exposes its children inside the named planner region', () => {
  render(<AppSection><button>Open roster</button></AppSection>)

  const planner = screen.getByRole('region', { name: 'Team capacity planner' })

  expect(within(planner).getByRole('button', { name: 'Open roster' })).toBeTruthy()
})

it('App loads its default dates and shows the empty roster inside the planner', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    weeks: [], people: [], total: 0, pageSize: 25,
  }))

  vi.stubGlobal('fetch', fetcher)
  render(<App />)

  const main = within(screen.getByRole('main'))
  const planner = within(main.getByRole('region', { name: 'Team capacity planner' }))

  expect(main.getByRole('heading', { name: 'Team capacity' })).toBeTruthy()
  expect(planner.getByRole('status').textContent).toContain('Loading')
  expect(await planner.findByText('No people in the roster.')).toBeTruthy()
  expect(planner.queryByRole('table')).toBeNull()
  expect(fetcher).toHaveBeenCalledWith('/api/capacity?from=2025-12-29&to=2026-01-16&page=1', expect.anything())
})
