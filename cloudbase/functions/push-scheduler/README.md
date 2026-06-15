# lunch-reminder-scheduler

CloudBase 定时云函数，用于每分钟扫描 `push_clients` 集合并发送三餐提醒。

## 逻辑

- 分页读取 `push_clients`
- 使用每个客户端保存的 IANA timezone 计算当地日期、星期和 `HH:mm`
- 检查三餐开关、时间、工作日模式、今日跳过和 `lastSent`
- 成功发送后更新 `lastSent`
- 404 / 410 失效订阅会删除
- 单个客户端失败不会中断整个批次

## 环境变量

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

不要把 `VAPID_PRIVATE_KEY` 写入源码、README 或日志。

## 部署提示

本函数依赖兄弟目录 `../shared`。如果通过控制台单独上传函数目录，请确保部署包中同时包含 `shared` 目录，或按 `cloudbase/DEPLOYMENT.md` 的说明打包上传。
