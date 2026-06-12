import type { AppState, MealReminder, MealType, ReminderSettings } from '../types/reminder'
import { assets } from './assets'

export const mealOrder: MealType[] = ['breakfast', 'lunch', 'dinner']

export const mealLabels: Record<MealType, string> = {
  breakfast: '早餐提醒',
  lunch: '午餐提醒',
  dinner: '晚餐提醒',
}

const mealDefaults: Record<MealType, MealReminder> = {
  breakfast: {
    type: 'breakfast',
    time: '08:00',
    enabled: false,
    title: '早餐',
    subtitle: '清晨能量',
    icon: assets.breakfast,
  },
  lunch: {
    type: 'lunch',
    time: '12:00',
    enabled: true,
    title: '午餐',
    subtitle: '先吃饭呀',
    icon: assets.lunch,
  },
  dinner: {
    type: 'dinner',
    time: '18:00',
    enabled: false,
    title: '晚餐',
    subtitle: '好好收尾',
    icon: assets.dinner,
  },
}

export const createDefaultSettings = (): ReminderSettings => ({
  version: 1,
  breakfast: { ...mealDefaults.breakfast },
  lunch: { ...mealDefaults.lunch },
  dinner: { ...mealDefaults.dinner },
  weekdaysOnly: false,
  skippedDate: null,
  themeMode: 'system',
  notificationMessages: {
    breakfast: ['早餐时间到了', '记得吃早餐，开启活力一天'],
    lunch: ['午饭时间到了', '别忘记吃饭', '放下工作先吃饭'],
    dinner: ['晚饭时间到了', '辛苦一天，记得好好吃饭'],
  },
})

export const createDefaultState = (): AppState => ({
  version: 1,
  settings: createDefaultSettings(),
  history: [],
})
