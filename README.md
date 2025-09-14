# Travenion

Travenion 是一个中文旅游计划网站示例。

## 运行

```bash
npm install
node src/server.js
```

默认后端端口为 `8311`，所有前端与接口均在 `/travenion` 路径下。

## 数据库配置

使用 MySQL 数据库，相关连接信息可通过环境变量配置：

- `DB_HOST` (默认 `localhost`)
- `DB_PORT` (默认 `3306`)
- `DB_USER` (默认 `root`)
- `DB_PASS`
- `DB_NAME` (默认 `travenion`)
- `APP_PORT` (默认 `8311`)
- `JWT_SECRET`

## 地图API配置

本项目支持OpenStreetMap和百度地图两种地图服务，采用安全的配置文件管理方式。

### 快速配置

1. 复制配置模板文件：
```bash
cp public/js/config.example.js public/js/config.js
```

2. 编辑 `public/js/config.js` 文件，配置您的API密钥：
```javascript
const MAP_CONFIG = {
    BAIDU_MAP_API_KEY: '您的百度地图API密钥',
    DEFAULT_MAP_PROVIDER: 'openstreetmap' // 或 'baidu'
};
```

### OpenStreetMap 使用说明

OpenStreetMap 无需申请API密钥，项目中通过 Leaflet 库进行加载和显示。

### 百度地图API密钥获取

1. 访问 [百度地图开放平台](https://lbsyun.baidu.com/)
2. 注册开发者账号
3. 创建应用并获取API密钥(AK)
4. 配置服务权限

### 安全特性

- ✅ **配置文件分离**：API密钥不再硬编码在HTML中
- ✅ **动态加载**：根据配置按需加载地图API
- ✅ **Git忽略**：配置文件已添加到 `.gitignore`，防止意外提交
- ✅ **错误提示**：提供详细的配置指导和错误信息
- ✅ **模板文件**：提供 `config.example.js` 作为配置参考

### 注意事项

- 请根据您的用户群体选择合适的地图服务
- OpenStreetMap 适合海外用户
- 百度地图适合中国大陆用户
- `config.js` 文件包含敏感信息，请勿提交到公共代码仓库
- 部署时请确保正确配置 `config.js` 文件

Swagger 接口定义见 `openapi.yaml`。
