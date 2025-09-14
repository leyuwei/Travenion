// 地图API配置文件模板
// 请复制此文件为 config.js 并配置您的API密钥
// 注意：config.js 文件已被添加到 .gitignore 中，不会被提交到代码仓库

const MAP_CONFIG = {
    // OpenStreetMap 无需API密钥，使用Leaflet库加载

    // 百度地图API密钥
    // 获取方式：https://lbsyun.baidu.com/apiconsole/key
    // 1. 注册百度开发者账号
    // 2. 进入百度地图开放平台
    // 3. 创建应用
    // 4. 获取 AK（API Key）
    // 5. 配置服务权限
    BAIDU_MAP_API_KEY: 'YOUR_BAIDU_MAP_API_KEY',

    // 默认地图服务提供商 ('openstreetmap' 或 'baidu')
    // 建议：
    // - 海外用户使用 'openstreetmap'
    // - 国内用户使用 'baidu'
    DEFAULT_MAP_PROVIDER: 'openstreetmap'
};

// 导出配置对象
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MAP_CONFIG;
} else {
    window.MAP_CONFIG = MAP_CONFIG;
}