# lunch-reminder-push-api

CloudBase HTTP 云函数版本的 Web Push API。

## 接口

- `GET /api/health`
- `GET /api/vapid-public-key`
- `POST /api/subscriptions`
- `PUT /api/subscriptions/:clientId/settings`
- `DELETE /api/subscriptions/:clientId`
- `POST /api/subscriptions/:clientId/test`
- `POST /api/subscriptions/:clientId/test-empty`
- `GET /api/subscriptions/:clientId/diagnostics`

## 环境变量

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `ALLOWED_ORIGIN`

不要把 `VAPID_PRIVATE_KEY` 写入源码、README 或日志。

## 部署提示

本函数依赖兄弟目录 `../shared`。如果通过控制台单独上传函数目录，请确保部署包中同时包含 `shared` 目录，或按 `cloudbase/DEPLOYMENT.md` 的说明打包上传。
