import { EmptyState } from '../components/EmptyState'
import type { MealCheckin } from '../types/checkin'
import type { MealType } from '../types/reminder'
import { assets } from '../utils/assets'
import { getCheckinStats } from '../utils/checkinStats'

interface StatisticsPageProps {
  records: MealCheckin[]
}

const distribution: Array<{ meal: MealType; label: string; color: string }> = [
  { meal: 'breakfast', label: '早餐', color: '#F6C36A' },
  { meal: 'lunch', label: '午餐', color: '#FF8A35' },
  { meal: 'dinner', label: '晚餐', color: '#6EAE67' },
]

export const StatisticsPage = ({ records }: StatisticsPageProps) => {
  const stats = getCheckinStats(records)

  if (!stats.hasData) {
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
        <h2>最近 7 天</h2>
        <div className="stats-grid">
          <StatCell label="总完成" value={stats.last7.completed} />
          <StatCell label="完成率" value={`${stats.last7.completionRate}%`} />
          <StatCell label="打卡天数" value={stats.last7.activeDays} />
          <StatCell label="已跳过" value={stats.last7.skipped} />
        </div>
      </section>

      <section className="stats-card">
        <h2>最近 30 天</h2>
        <div className="stats-grid">
          <StatCell label="总完成" value={stats.last30.completed} />
          <StatCell label="完成率" value={`${stats.last30.completionRate}%`} />
          <StatCell label="打卡天数" value={stats.last30.activeDays} />
          <StatCell label="已跳过" value={stats.last30.skipped} />
        </div>
      </section>

      <section className="stats-card">
        <h2>餐次分布</h2>
        <div className="distribution-list">
          {distribution.map((item) => {
            const count = stats.completedByMeal[item.meal]
            const percent = stats.last30.completed === 0 ? 0 : Math.round((count / stats.last30.completed) * 100)
            return (
              <div key={item.meal} className="distribution-row">
                <span>{item.label}</span>
                <div className="progress-track">
                  <div style={{ width: `${percent}%`, background: item.color }} />
                </div>
                <strong>{count}</strong>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}

const StatCell = ({ label, value }: { label: string; value: number | string }) => (
  <div className="stat-cell">
    <strong>{value}</strong>
    <span>{label}</span>
  </div>
)
