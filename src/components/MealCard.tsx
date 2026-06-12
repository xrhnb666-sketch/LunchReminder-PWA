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
      <div
        className="meal-time-picker"
        role="button"
        aria-label={`修改${meal.title}提醒时间，当前${meal.time}`}
      >
        <span className="meal-time-display" aria-hidden="true">
          {meal.time}
        </span>
        <input
          className="meal-time-native-input"
          type="time"
          value={meal.time}
          aria-label={`修改${meal.title}提醒时间，当前${meal.time}`}
          onChange={(event) => onTimeChange(event.target.value)}
        />
      </div>
      <span className="meal-card-subtitle">{skippedToday ? '今日已跳过' : meal.subtitle}</span>
    </label>
    <ToggleSwitch
      checked={meal.enabled}
      label={`${meal.title}开关`}
      onChange={onEnabledChange}
    />
  </article>
)
