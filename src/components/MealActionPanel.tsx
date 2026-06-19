import type { MealCheckin } from '../types/checkin'
import type { MealReminder } from '../types/reminder'

interface MealActionPanelProps {
  meal: MealReminder
  localDate: string
  record?: MealCheckin
  disabled: boolean
  onComplete: () => void
  onSnooze: (minutes: 10 | 20 | 30) => void
  onSkip: () => void
  onClose: () => void
}

const statusText: Record<MealCheckin['status'], string> = {
  pending: '待打卡',
  completed: '已完成',
  snoozed: '稍后提醒',
  skipped: '已跳过',
}

export const MealActionPanel = ({
  meal,
  localDate,
  record,
  disabled,
  onComplete,
  onSnooze,
  onSkip,
  onClose,
}: MealActionPanelProps) => {
  const terminal = record?.status === 'completed' || record?.status === 'skipped'

  return (
    <section className={`meal-action-panel meal-action-panel-${meal.type}`} aria-label={`${meal.title}打卡操作`}>
      <div className="meal-action-header">
        <div>
          <p>{localDate}</p>
          <h2>{meal.title}</h2>
          <span>{record ? statusText[record.status] : '待打卡'}</span>
        </div>
        <button type="button" className="panel-close-button" aria-label="关闭打卡面板" onClick={onClose}>
          ×
        </button>
      </div>

      <button
        type="button"
        className="primary-action"
        disabled={disabled || terminal}
        onClick={onComplete}
      >
        已吃饭
      </button>

      <div className="snooze-actions" aria-label="稍后提醒">
        {[10, 20, 30].map((minutes) => (
          <button
            key={minutes}
            type="button"
            className="secondary-action"
            disabled={disabled || terminal}
            onClick={() => onSnooze(minutes as 10 | 20 | 30)}
          >
            {minutes} 分钟后提醒
          </button>
        ))}
      </div>

      <button
        type="button"
        className="skip-meal-action"
        disabled={disabled || terminal}
        onClick={onSkip}
      >
        跳过本餐
      </button>
    </section>
  )
}
