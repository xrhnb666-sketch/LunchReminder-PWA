import { InstallGuide } from '../components/InstallGuide'
import { ToggleSwitch } from '../components/ToggleSwitch'
import type { ReminderSettings, ThemeMode } from '../types/reminder'
import { assets } from '../utils/assets'
import { getTodayKey } from '../utils/dateUtils'

interface SettingsPageProps {
  settings: ReminderSettings
  onWeekdaysOnlyChange: (enabled: boolean) => void
  onSkipTodayChange: (skipped: boolean) => void
  onThemeModeChange: (themeMode: ThemeMode) => void
}

export const SettingsPage = ({
  settings,
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
        <SettingRow
          image={assets.stars}
          title="通知文案入口"
          subtitle="已预留，下一阶段接入推送后开放"
        />
        <SettingRow image={assets.skipCloud} title="推送状态" subtitle="尚未启用" />
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
