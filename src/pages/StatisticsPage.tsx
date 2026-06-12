import { EmptyState } from '../components/EmptyState'
import type { HistoryRecord, MealType } from '../types/reminder'
import { assets } from '../utils/assets'
import { getHistoryStats } from '../utils/dateUtils'

interface StatisticsPageProps {
  history: HistoryRecord[]
}

const distribution: Array<{ meal: MealType; label: string; color: string }> = [
  { meal: 'breakfast', label: '早餐', color: '#F6C36A' },
  { meal: 'lunch', label: '午餐', color: '#FF8A35' },
  { meal: 'dinner', label: '晚餐', color: '#6EAE67' },
]

export const StatisticsPage = ({ history }: StatisticsPageProps) => {
  const stats = getHistoryStats(history)

  if (stats.total === 0) {
    return (
      <main className="page statistics-page">
        <header className="page-header">
          <h1>统计分析</h1>
          <p>看看最近有没有好好吃饭</p>
        </header>
        <EmptyState
          image={assets.bear}
          title="暂无统计数据"
          subtitle="继续坚持按时吃饭吧～"
        />
      </main>
    )
  }

  return (
    <main className="page statistics-page">
      <header className="page-header">
        <h1>统计分析</h1>
        <p>看看最近有没有好好吃饭</p>
      </header>

      <section className="stats-card">
        <h2>今日数据</h2>
        <div className="stats-grid">
          <StatCell label="今日提醒" value={stats.today} />
          <StatCell label="本周提醒" value={stats.week} />
          <StatCell label="本月提醒" value={stats.month} />
          <StatCell label="连续记录" value={stats.streakDays} />
        </div>
      </section>

      <section className="stats-card">
        <h2>餐次分布</h2>
        <div className="distribution-list">
          {distribution.map((item) => {
            const count = stats[item.meal]
            const percent = Math.round((count / stats.total) * 100)
            return (
              <div key={item.meal} className="distribution-row">
                <span>{item.label}</span>
                <div className="progress-track">
                  <div style={{ width: `${percent}%`, background: item.color }} />
                </div>
                <strong>{percent}%</strong>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}

const StatCell = ({ label, value }: { label: string; value: number }) => (
  <div className="stat-cell">
    <strong>{value}</strong>
    <span>{label}</span>
  </div>
)
