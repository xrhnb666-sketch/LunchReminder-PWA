import type { MealReminder } from '../types/reminder'
import { ToggleSwitch } from './ToggleSwitch'

interface MealCardProps {
  meal: MealReminder
  skippedToday: boolean
  onTimeChange: (time: string) => void
  onEnabledChange: (enabled: boolean) => void
}

export const MealCard = ({ meal, skippedToday, onTimeChange, onEnabledChange }: MealCardProps) => (
  <article className={`meal-card meal-card-${meal.type}`}>
    <img className="meal-card-icon" src={meal.icon} alt="" />
    <label className="meal-card-body">
      <span className="meal-card-title">{meal.title}</span>
      <input
        className="meal-time-input"
        type="time"
        value={meal.time}
        aria-label={`${meal.title}时间`}
        onChange={(event) => onTimeChange(event.target.value)}
      />
      <span className="meal-card-subtitle">{skippedToday ? '今日已跳过' : meal.subtitle}</span>
    </label>
    <ToggleSwitch
      checked={meal.enabled}
      label={`${meal.title}开关`}
      onChange={onEnabledChange}
    />
  </article>
)
