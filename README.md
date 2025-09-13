# Travenion

Travenion 是一个中文旅游计划网站示例。

## 运行

```bash
npm install
node src/server.js
```

默认后端端口为 `8311`，所有前端与接口均在 `/travenion` 路径下。
使用 MySQL 数据库，相关连接信息可通过环境变量配置：

- `DB_HOST` (默认 `localhost`)
- `DB_PORT` (默认 `3306`)
- `DB_USER` (默认 `root`)
- `DB_PASS`
- `DB_NAME` (默认 `travenion`)
- `APP_PORT` (默认 `8311`)
- `JWT_SECRET`

Swagger 接口定义见 `openapi.yaml`。
