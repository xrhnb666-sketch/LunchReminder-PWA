# LunchReminder-PWA CloudBase 部署说明

目标环境：

- CloudBase 环境 ID：`lunch-reminder-d0gm3tznc07536699`
- 静态网站域名：`https://lunch-reminder-d0gm3tznc07536699-1443161613.tcloudbaseapp.com`
- HTTP 云函数：`lunch-reminder-push-api`
- 定时云函数：`lunch-reminder-scheduler`
- 数据库集合：`push_clients`

本文只说明部署步骤，不包含任何 VAPID private key。

## 1. 创建数据库集合

1. 打开腾讯云 CloudBase 控制台。
2. 进入环境 `lunch-reminder-d0gm3tznc07536699`。
3. 打开「数据库」。
4. 新建集合：`push_clients`。
5. 文档 ID 使用前端生成的 `clientId`。

推荐文档结构：

```json
{
  "version": 1,
  "clientId": "uuid",
  "subscription": {
    "endpoint": "https://...",
    "expirationTime": null,
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  },
  "contentEncodings": ["aes128gcm"],
  "timezone": "Asia/Shanghai",
  "settings": {
    "breakfast": { "time": "08:00", "enabled": true, "title": "早餐", "subtitle": "清晨能量" },
    "lunch": { "time": "12:00", "enabled": true, "title": "午餐", "subtitle": "先吃饭呀" },
    "dinner": { "time": "18:00", "enabled": true, "title": "晚餐", "subtitle": "好好收尾" },
    "weekdaysOnly": false,
    "skippedDate": null,
    "notificationMessages": {
      "breakfast": ["早餐时间到了"],
      "lunch": ["午饭时间到了"],
      "dinner": ["晚饭时间到了"]
    }
  },
  "createdAt": "ISO time",
  "updatedAt": "ISO time",
  "lastSent": {},
  "lastTestSentAt": "ISO time"
}
```

## 2. 创建 HTTP 云函数

1. 进入「云函数」。
2. 新建函数：`lunch-reminder-push-api`。
3. 运行环境选择 Node.js 18 或更高版本。
4. 选择空白函数。
5. 上传 `cloudbase/functions/push-api` 的代码。
6. 注意：`push-api/index.js` 依赖兄弟目录 `cloudbase/functions/shared`。如果控制台上传单个目录不会包含兄弟目录，请打包时把 `shared` 一并放入部署包，保持 `../shared` 可被 require。
7. 点击「保存并安装依赖」。

本地准备依赖可执行：

```bash
cd cloudbase/functions/push-api
npm install
```

## 3. 设置 HTTP 云函数环境变量

在 `lunch-reminder-push-api` 的环境变量中设置：

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `ALLOWED_ORIGIN`

推荐：

```text
ALLOWED_ORIGIN=https://lunch-reminder-d0gm3tznc07536699-1443161613.tcloudbaseapp.com
VAPID_SUBJECT=mailto:你的邮箱
```

不要把 `VAPID_PRIVATE_KEY` 写入源码、文档、GitHub 或日志。

## 4. 配置 HTTP 访问服务

1. 在 `lunch-reminder-push-api` 函数详情中开启 HTTP 访问服务。
2. 确认路由可以访问 `/api/health`。
3. 记录生成的 HTTP API 地址，例如：

```text
https://你的-cloudbase-http-函数地址
```

健康检查：

```bash
curl https://你的-cloudbase-http-函数地址/api/health
```

预期：

```json
{
  "ok": true,
  "service": "LunchReminder CloudBase Push API"
}
```

## 5. 创建 scheduler 云函数

1. 新建函数：`lunch-reminder-scheduler`。
2. 运行环境选择 Node.js 18 或更高版本。
3. 选择空白函数。
4. 上传 `cloudbase/functions/push-scheduler` 的代码。
5. 注意：`push-scheduler/index.js` 依赖兄弟目录 `cloudbase/functions/shared`。如果控制台上传单个目录不会包含兄弟目录，请打包时把 `shared` 一并放入部署包，保持 `../shared` 可被 require。
6. 点击「保存并安装依赖」。

本地准备依赖可执行：

```bash
cd cloudbase/functions/push-scheduler
npm install
```

## 6. 设置 scheduler 环境变量

在 `lunch-reminder-scheduler` 的环境变量中设置：

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

这些值必须和 HTTP 云函数一致。

## 7. 添加每分钟定时触发器

在 `lunch-reminder-scheduler` 函数的触发器中新增定时触发器：

```text
* * * * *
```

含义：每分钟执行一次。

## 8. 设置前端 VITE_PUSH_API_URL

复制 HTTP 云函数地址，在前端构建环境中设置：

```text
VITE_PUSH_API_URL=https://你的-cloudbase-http-函数地址
```

本地测试可写入 `.env.local`，不要提交 `.env.local`：

```text
VITE_PUSH_API_URL=https://你的-cloudbase-http-函数地址
```

## 9. 重新构建和部署静态网站

在项目根目录执行：

```bash
npm run build
```

然后把 `dist/` 部署到 CloudBase 静态网站托管根目录。

## 10. 测试顺序

1. 访问 `GET /api/health`。
2. 访问 `GET /api/vapid-public-key`，确认前端能拿到当前公钥。
3. 在浏览器中重新开启推送，触发 `POST /api/subscriptions`。
4. 调用 `GET /api/subscriptions/:clientId/diagnostics`，只检查指纹，不查看原始订阅。
5. 调用 `POST /api/subscriptions/:clientId/test-empty`，测试无 payload 推送。
6. 调用 `POST /api/subscriptions/:clientId/test`，测试 JSON payload 推送。
7. 等待 `lunch-reminder-scheduler` 每分钟执行，验证定时通知。

## 11. Cloudflare Worker 备份

原 `worker/` 目录仍保留，不影响 CloudBase 版本。迁移完成后，前端只需要把 `VITE_PUSH_API_URL` 指向 CloudBase HTTP 云函数地址即可。
