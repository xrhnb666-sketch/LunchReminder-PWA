# 三餐打卡第一阶段部署说明

本次代码只生成部署包，不会自动创建或修改腾讯云资源。

上线前请手动完成：

1. 在 CloudBase 数据库中创建 `meal_checkins` 集合。
2. 上传 `cloudbase/deploy/lunch-reminder-push-api-checkin.zip` 到 `lunch-reminder-push-api`。
3. 上传 `cloudbase/deploy/lunch-reminder-scheduler-checkin.zip` 到 `lunch-reminder-scheduler`。
4. 重新构建并部署前端静态站点。
5. 在 iPhone 主屏 PWA 上验证普通餐次通知、点击通知进入打卡、完成/跳过、10/20/30 分钟稍后提醒和历史记录。

稍后提醒采用发送前抢占策略：优先避免重复发送；如果抢占成功后运行环境在发送或最终写回前极端崩溃，可能漏发一次稍后提醒。

不要在文档、前端环境变量或部署包中写入任何私钥。
