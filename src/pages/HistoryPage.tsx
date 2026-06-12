import { EmptyState } from '../components/EmptyState'
import type { HistoryRecord } from '../types/reminder'
import { assets } from '../utils/assets'
import { mealLabels } from '../utils/defaults'

interface HistoryPageProps {
  history: HistoryRecord[]
}

export const HistoryPage = ({ history }: HistoryPageProps) => {
  const deliveredHistory = history.filter((item) => item.status === 'delivered')

  return (
    <main className="page history-page">
      <header className="page-header">
        <h1>历史记录</h1>
      </header>

      {deliveredHistory.length === 0 ? (
        <EmptyState
          image={assets.bear}
          title="今天还没有提醒记录哦"
          subtitle="记得按时吃饭～"
        />
      ) : (
        <section className="timeline">
          {deliveredHistory.map((record) => (
            <article key={record.id} className="history-item">
              <img src={assetForMeal(record.mealType)} alt="" />
              <div>
                <h2>{mealLabels[record.mealType]}</h2>
                <p>{new Date(record.scheduledAt).toLocaleString('zh-CN')}</p>
              </div>
              <span>{record.title}</span>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}

const assetForMeal = (mealType: HistoryRecord['mealType']) => {
  if (mealType === 'breakfast') return assets.breakfast
  if (mealType === 'lunch') return assets.lunch
  return assets.dinner
}
