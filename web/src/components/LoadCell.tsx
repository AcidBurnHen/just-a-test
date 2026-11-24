import type { WeekLoad } from '../capacity.types'
import { hourFormatter } from '../utils'
import './LoadCell.modules.css'

export function LoadCell({ allocated, capacity }: WeekLoad) {
  let percent = 0
  let className = 'load-cell'
  let overage = null

  if (allocated > capacity) {
    percent = 100
    className = 'load-cell over'
    const excess = allocated - capacity
    let label = hourFormatter.format(excess)

    if (excess < 0.0001) {
      label = '< 0.0001'
    }

    overage = <span className="overage">{label} h over</span>
  } else if (capacity > 0) {
    percent = allocated / capacity * 100
  }

  return (
    <td className={className}>
      <div className="numbers"><strong>{hourFormatter.format(allocated)}</strong> / {hourFormatter.format(capacity)} h</div>
      <div className="track" aria-hidden="true"><i style={{ width: percent + '%' }} /></div>
      {overage}
    </td>
  )
}
