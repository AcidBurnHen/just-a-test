export function shiftWeek(value: string, direction: number) {
  const date = new Date(value + 'T00:00:00Z')

  date.setUTCDate(date.getUTCDate() + direction * 7)

  return date.toISOString().slice(0, 10)
}

export const hourFormatter = new Intl.NumberFormat('en', { maximumFractionDigits: 4 })
