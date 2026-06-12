import { MealCard } from '../components/MealCard'
import { ReminderCard } from '../components/ReminderCard'
import { ToggleSwitch } from '../components/ToggleSwitch'
import type { MealType, NextReminder, ReminderSettings } from '../types/reminder'
import { assets } from '../utils/assets'
import { getTodayKey } from '../utils/dateUtils'
import { mealOrder } from '../utils/defaults'

interface HomePageProps {
  settings: ReminderSettings
  nextReminder: NextReminder | null
  onMealEnabledChange: (mealType: MealType, enabled: boolean) => void
  onMealTimeChange: (mealType: MealType, time: string) => void
  onSkipTodayChange: (skipped: boolean) => void
}

export const HomePage = ({
  settings,
  nextReminder,
  onMealEnabledChange,
  onMealTimeChange,
  onSkipTodayChange,
}: HomePageProps) => {
  const skippedToday = settings.skippedDate === getTodayKey()

  return (
    <main className="page home-page">
      <header className="page-header home-header">
        <div>
          <h1>三餐提醒</h1>
          <p>按时吃饭，照顾自己</p>
        </div>
        <img src={assets.plant} alt="" />
      </header>

      <section className="meal-list" aria-label="三餐提醒设置">
        {mealOrder.map((mealType) => (
          <MealCard
            key={mealType}
            meal={settings[mealType]}
            skippedToday={skippedToday}
            onTimeChange={(time) => onMealTimeChange(mealType, time)}
            onEnabledChange={(enabled) => onMealEnabledChange(mealType, enabled)}
          />
        ))}
      </section>

      <section className="skip-card">
        <img src={assets.skipCloud} alt="" />
        <div>
          <h2>今日跳过全部</h2>
          <p>开启后今天不再提醒</p>
        </div>
        <ToggleSwitch
          checked={skippedToday}
          label="今日跳过全部"
          onChange={onSkipTodayChange}
        />
      </section>

      <ReminderCard nextReminder={nextReminder} skippedToday={skippedToday} />

      <section className="feature-note">
        <h2>网页提醒说明</h2>
        <p>当前版本先保存本地设置和离线访问。Web Push 会在下一阶段接入。</p>
      </section>
    </main>
  )
}
