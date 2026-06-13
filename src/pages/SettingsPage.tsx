import { InstallGuide } from '../components/InstallGuide'
import { ToggleSwitch } from '../components/ToggleSwitch'
import type { PushStatus } from '../hooks/usePushNotifications'
import type { ReminderSettings, ThemeMode } from '../types/reminder'
import { assets } from '../utils/assets'
import { getTodayKey } from '../utils/dateUtils'

interface SettingsPageProps {
  settings: ReminderSettings
  push: {
    status: PushStatus
    message: string
    syncing: boolean
    enablePush: () => Promise<void>
    disablePush: () => Promise<void>
    sendTest: () => Promise<void>
    syncSettings: () => Promise<void>
  }
  onWeekdaysOnlyChange: (enabled: boolean) => void
  onSkipTodayChange: (skipped: boolean) => void
  onThemeModeChange: (themeMode: ThemeMode) => void
}

export const SettingsPage = ({
  settings,
  push,
  onWeekdaysOnlyChange,
  onSkipTodayChange,
  onThemeModeChange,
}: SettingsPageProps) => {
  const skippedToday = settings.skippedDate === getTodayKey()

  return (
    <main className="page settings-page">
      <header className="page-header settings-header">
        <h1>设置</h1>
        <img src={assets.plant} alt="" />
      </header>

      <section className="settings-group">
        <h2>提醒设置</h2>
        <SettingToggle
          image={assets.breakfast}
          title="仅工作日提醒"
          subtitle="周六周日自动跳过"
          checked={settings.weekdaysOnly}
          onChange={onWeekdaysOnlyChange}
        />
        <SettingToggle
          image={assets.skipCloud}
          title="今日跳过全部"
          subtitle="开启后今天不再提醒"
          checked={skippedToday}
          onChange={onSkipTodayChange}
        />
      </section>

      <section className="settings-group">
        <h2>通知设置</h2>
        <PushNotificationCard push={push} />
        <SettingRow image={assets.stars} title="通知文案入口" subtitle="当前使用三餐默认文案" />
      </section>

      <section className="settings-group">
        <h2>外观设置</h2>
        <div className="theme-options">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={settings.themeMode === option.value ? 'selected' : ''}
              onClick={() => onThemeModeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-group">
        <h2>安装</h2>
        <InstallGuide />
      </section>

      <section className="settings-group">
        <h2>关于</h2>
        <SettingRow image={assets.bear} title="三餐提醒" subtitle="版本 1.0.0" />
        <p className="about-copy">所有数据目前仅保存在本机浏览器。不需要账号和登录。</p>
      </section>
    </main>
  )
}

const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色模式' },
  { value: 'dark', label: '深色模式' },
]

const SettingRow = ({
  image,
  title,
  subtitle,
}: {
  image: string
  title: string
  subtitle: string
}) => (
  <article className="setting-row">
    <img src={image} alt="" />
    <div>
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </div>
  </article>
)

const PushNotificationCard = ({ push }: { push: SettingsPageProps['push'] }) => {
  const needsInstall = push.status === 'needs-install'
  const canEnable = push.status === 'disabled' || push.status === 'sync-failed'
  const enabled = push.status === 'enabled'
  return (
    <article className="push-card">
      <div className="push-card-header">
        <img src={assets.skipCloud} alt="" />
        <div>
          <h3>推送通知</h3>
          <p>{pushStatusLabel(push.status)}</p>
        </div>
      </div>
      {push.message && <p className="push-message">{push.message}</p>}
      {needsInstall && (
        <p className="push-message">
          请先将“三餐提醒”添加到主屏幕：使用 Safari 打开，点击分享，选择“添加到主屏幕”，再从桌面打开。
        </p>
      )}
      <div className="push-actions">
        {canEnable && (
          <button type="button" className="primary-action" onClick={() => void push.enablePush()}>
            启用推送提醒
          </button>
        )}
        {enabled && (
          <>
            <button type="button" className="primary-action" onClick={() => void push.sendTest()}>
              发送测试通知
            </button>
            <button type="button" className="secondary-action" onClick={() => void push.syncSettings()}>
              {push.syncing ? '同步中...' : '重新同步'}
            </button>
            <button type="button" className="secondary-action" onClick={() => void push.disablePush()}>
              关闭推送提醒
            </button>
          </>
        )}
      </div>
    </article>
  )
}

const pushStatusLabel = (status: PushStatus) => {
  switch (status) {
    case 'checking':
      return '正在检查支持情况'
    case 'unsupported':
      return '浏览器不支持'
    case 'needs-install':
      return '需要先添加到主屏幕'
    case 'disabled':
      return '尚未启用'
    case 'requesting':
      return '请求权限中'
    case 'enabled':
      return '已启用'
    case 'denied':
      return '权限被拒绝'
    case 'sync-failed':
      return '同步失败'
  }
}

const SettingToggle = ({
  image,
  title,
  subtitle,
  checked,
  onChange,
}: {
  image: string
  title: string
  subtitle: string
  checked: boolean
  onChange: (checked: boolean) => void
}) => (
  <article className="setting-row">
    <img src={image} alt="" />
    <div>
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </div>
    <ToggleSwitch checked={checked} label={title} onChange={onChange} />
  </article>
)
