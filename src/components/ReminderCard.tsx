import type { NextReminder } from '../types/reminder'
import { assets } from '../utils/assets'
import { formatNextDate } from '../utils/dateUtils'

interface ReminderCardProps {
  nextReminder: NextReminder | null
  skippedToday: boolean
}

export const ReminderCard = ({ nextReminder, skippedToday }: ReminderCardProps) => (
  <section className="next-card">
    <div>
      <p className="section-kicker">
        {skippedToday ? '今天已跳过全部提醒' : '下一次提醒'}
      </p>
      {nextReminder ? (
        <>
          <h2>{formatNextDate(nextReminder.date)}</h2>
          <p>{nextReminder.title}</p>
        </>
      ) : (
        <>
          <h2>今天不需要提醒啦～</h2>
          <p>记得按时吃饭哦</p>
        </>
      )}
    </div>
    <img src={assets.starSmall} alt="" />
  </section>
)
