import { useState, type FormEvent } from 'react'
import type { PersonLoad } from '../capacity.types'
import './WeeklyHours.modules.css'

interface WeeklyHoursProps {
  person: PersonLoad
  formattedHours: string
  editable: boolean
  editingID: number | null
  onEdit: (id: number | null) => void
  saving: boolean
  onSaving: (saving: boolean) => void
  onSaved: () => void
  onDirty: (dirty: boolean) => void
}

export function WeeklyHours({
  person, formattedHours, editable, editingID, onEdit, saving, onSaving, onSaved, onDirty,
}: WeeklyHoursProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  function startEditing() {
    setDraft(String(person.weeklyHours))
    setError('')
    onEdit(person.id)
  }

  function updateDraft(value: string) {
    setDraft(value)
    onDirty(value === '' || Number(value) !== person.weeklyHours)
  }

  function cancel() {
    onDirty(false)
    onEdit(null)
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
      <button className="weekly-hours-edit" disabled={editingID !== null}
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
  let draftHint = null
  if (draft === '' || Number(draft) !== person.weeklyHours) {
    draftHint = <small>Save or cancel your hours before navigating.</small>
  }
  if (error) {
    errorMessage = <small role="alert">{error}</small>
  }

  return (
    <form className="weekly-hours-editor" onSubmit={save}>
      <input autoFocus required disabled={saving} type="number" min="0" max="168" step="any"
        aria-label={'Weekly hours for ' + person.name} value={draft}
        onChange={event => updateDraft(event.target.value)} />

      <button className="primary" disabled={saving}>{saveLabel}</button>
      <button type="button" disabled={saving} onClick={cancel}>Cancel</button>

      {errorMessage}
      {draftHint}
    </form>
  )
}
