# 三餐提醒 PWA

一个 mobile-first 的三餐提醒 PWA。当前阶段完成本地设置、离线缓存、安装配置和治愈风界面，为下一阶段 Web Push 预留 Service Worker。

## 已完成

- 首页三餐提醒卡片
- 早餐 / 午餐 / 晚餐独立开关
- 每餐时间自定义
- 今日跳过全部 / 取消跳过
- 仅工作日提醒
- 下一次提醒动态计算
- 历史页面空状态和记录结构
- 统计页面空状态和统计计算
- 设置页
- iOS 添加到主屏幕说明
- localStorage 持久化
- PWA Manifest
- Inject Manifest 自定义 Service Worker
- 离线静态资源缓存

## 暂未实现

- Web Push 订阅
- 服务端定时任务
- 云同步
- 登录系统
- 自定义提示音
- 浏览器通知权限申请

## 开发命令

```bash
npm install
npm run dev
npm run lint
npm run build
```

本地地址：

```text
http://127.0.0.1:5173/
```
