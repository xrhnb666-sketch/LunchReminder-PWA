import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { formatCheckinErrorDetails, type CheckinRequestErrorDetails } from '../services/checkinErrors'
import type { MealCheckin, SkipReason } from '../types/checkin'
import { assets } from '../utils/assets'
import { buildHistoryDisplayRows } from '../utils/checkinUi'
import { mealLabels, mealOrder } from '../utils/defaults'

interface HistoryPageProps {
  records: MealCheckin[]
  loading: boolean
  error: CheckinRequestErrorDetails | null
  onRangeChange: (days: 7 | 30) => void
}

const statusText: Record<MealCheckin['status'], string> = {
  pending: '待打卡',
  completed: '已完成',
  snoozed: '稍后提醒',
  skipped: '已跳过',
}

const skipReasonText: Record<SkipReason, string> = {
  already_ate: '已经吃过了',
  not_hungry: '今天不饿',
  unwell: '身体不舒服',
  inconvenient: '时间不方便',
  other: '其他',
}

const formatIsoTime = (value: string | null) => {
  if (!value) return null
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

const toDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDateRange = (days: 7 | 30) => {
  const dates: string[] = []
  const cursor = new Date()
  for (let index = 0; index < days; index += 1) {
    dates.push(toDateKey(cursor))
    cursor.setDate(cursor.getDate() - 1)
  }
  return dates
}

export const HistoryPage = ({ records, loading, error, onRangeChange }: HistoryPageProps) => {
  const [days, setDays] = useState<7 | 30>(7)

  useEffect(() => {
    onRangeChange(days)
  }, [days, onRangeChange])

  const dates = useMemo(() => getDateRange(days), [days])
  const rows = useMemo(() => buildHistoryDisplayRows(dates, records), [dates, records])
  const hasRecords = records.length > 0
  const showInitialLoading = loading && !hasRecords
  const showError = !loading && error && !hasRecords
  const showEmpty = !loading && !error && !hasRecords
  const errorText = error ? formatCheckinErrorDetails(error) : null

  return (
    <main className="page history-page">
      <header className="page-header">
        <h1>历史记录</h1>
      </header>

      <div className="history-range-tabs" role="tablist" aria-label="历史范围">
        {[7, 30].map((range) => (
          <button
            key={range}
            type="button"
            className={days === range ? 'active' : ''}
            onClick={() => setDays(range as 7 | 30)}
          >
            最近 {range} 天
          </button>
        ))}
      </div>

      {showInitialLoading ? (
        <section className="checkin-history-list" aria-busy="true">
          <p className="history-loading">加载中...</p>
        </section>
      ) : null}

      {showError && (
        <EmptyState
          image={assets.bear}
          title="历史记录读取失败"
          subtitle={errorText ?? ''}
        />
      )}

      {showEmpty ? (
        <EmptyState
          image={assets.bear}
          title="还没有打卡记录"
          subtitle="下一次提醒后，可以在这里看到自己的吃饭记录。"
        />
      ) : !showInitialLoading && !showError ? (
        <section className="checkin-history-list" aria-busy={loading}>
          {errorText && <p className="history-inline-error">{errorText}</p>}
          {rows.map(({ localDate, recordsByMeal }) => {
            return (
              <article key={localDate} className="history-day">
                <h2>{localDate}</h2>
                <div className="history-meal-list">
                  {mealOrder.map((mealType) => {
                    const record = recordsByMeal[mealType]
                    return (
                      <div key={mealType} className={`history-meal history-meal-${record?.status ?? 'empty'}`}>
                        <strong>{mealLabels[mealType]}</strong>
                        <span>{record ? statusText[record.status] : '暂无记录'}</span>
                        {record && (
                          <dl>
                            <div>
                              <dt>计划</dt>
                              <dd>{record.scheduledTime}</dd>
                            </div>
                            <div>
                              <dt>完成</dt>
                              <dd>{formatIsoTime(record.completedAt) ?? '-'}</dd>
                            </div>
                            <div>
                              <dt>延后</dt>
                              <dd>{record.snoozeMinutes ? `${record.snoozeMinutes} 分钟` : '-'}</dd>
                            </div>
                            <div>
                              <dt>原因</dt>
                              <dd>{record.skipReason ? skipReasonText[record.skipReason] : '-'}</dd>
                            </div>
                          </dl>
                        )}
                      </div>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </section>
      ) : null}
    </main>
  )
}
