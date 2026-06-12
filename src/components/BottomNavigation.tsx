import type { AppPage } from '../types/reminder'
import { assets } from '../utils/assets'

const tabs: Array<{ key: AppPage; label: string; icon: string }> = [
  { key: 'home', label: '首页', icon: assets.navHome },
  { key: 'history', label: '历史', icon: assets.navHistory },
  { key: 'statistics', label: '统计', icon: assets.navStats },
  { key: 'settings', label: '设置', icon: assets.navSettings },
]

interface BottomNavigationProps {
  currentPage: AppPage
  onChange: (page: AppPage) => void
}

export const BottomNavigation = ({ currentPage, onChange }: BottomNavigationProps) => (
  <nav className="bottom-navigation" aria-label="底部导航">
    {tabs.map((tab) => (
      <button
        key={tab.key}
        type="button"
        className={currentPage === tab.key ? 'active' : ''}
        onClick={() => onChange(tab.key)}
      >
        <img src={tab.icon} alt="" />
        <span>{tab.label}</span>
      </button>
    ))}
  </nav>
)
