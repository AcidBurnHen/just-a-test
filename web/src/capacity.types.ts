export interface DateRange {
  from: string
  to: string
}

export interface WeekLoad {
  allocated: number
  capacity: number
}

export interface PersonLoad {
  id: number
  name: string
  weeklyHours: number
  weeks: Record<string, WeekLoad>
}

export interface CapacityPage {
  people: PersonLoad[]
  weeks: string[]
  total: number
  pageSize: number
}
