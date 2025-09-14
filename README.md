# Travenion

Travenion 是一个中文旅游计划网站。

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

## API文档

Swagger 接口定义见 `openapi.yaml`。

启动服务后，可访问 [http://localhost:8311/travenion/api-docs](http://localhost:8311/travenion/api-docs) 查看完整的API文档和调试界面。

## 完整部署指南

本指南将详细说明如何在生产环境中部署Travenion应用，包括代码拉取、环境配置、nginx反向代理和systemd服务管理。

### 1. 环境准备

#### 系统要求
- Ubuntu 20.04+ / CentOS 8+ / RHEL 8+
- Node.js 16.x 或更高版本
- MySQL 8.0 或更高版本
- Nginx 1.18 或更高版本

#### 安装Node.js
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

#### 安装MySQL
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install mysql-server
sudo mysql_secure_installation

# CentOS/RHEL
sudo yum install mysql-server
sudo systemctl start mysqld
sudo systemctl enable mysqld
sudo mysql_secure_installation
```

#### 安装Nginx
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 2. 代码部署

#### 创建部署用户
```bash
sudo useradd -m -s /bin/bash travenion
sudo usermod -aG sudo travenion
```

#### 拉取代码
```bash
# 切换到部署用户
sudo su - travenion

# 拉取代码到指定目录
cd /home/travenion
git clone https://github.com/your-username/Travenion.git
cd Travenion

# 安装依赖
npm install --production
```

### 3. 数据库配置

#### 创建数据库和用户
```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE travenion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'travenion'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON travenion.* TO 'travenion'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

#### 配置环境变量
```bash
# 创建环境配置文件
sudo nano /home/travenion/Travenion/.env
```

添加以下内容：
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=travenion
DB_PASS=your_secure_password
DB_NAME=travenion
APP_PORT=8311
JWT_SECRET=your_jwt_secret_key_here
NODE_ENV=production
```

#### 初始化数据库表
```bash
# 首次部署时，确保数据库为空或删除现有表
# 应用会按正确的依赖顺序自动创建所有表
mysql -u travenion -p travenion -e "DROP DATABASE IF EXISTS travenion; CREATE DATABASE travenion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

**注意事项：**
- 应用启动时会自动创建所有必需的数据表
- 表创建顺序已优化，避免外键依赖问题
- 如果遇到表创建错误，请确保数据库为空状态

#### 配置地图API
```bash
# 复制配置模板
cp public/js/config.example.js public/js/config.js

# 编辑配置文件
nano public/js/config.js
```

### 4. Nginx配置

#### 创建Nginx配置文件
```bash
sudo nano /etc/nginx/sites-available/travenion
```

根据部署需求，可以选择以下两种配置方式：

**方式一：独立域名部署（推荐用于生产环境）**
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为您的域名或IP地址
    
    # 安全头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # 日志配置
    access_log /var/log/nginx/travenion_access.log;
    error_log /var/log/nginx/travenion_error.log;
    
    # 反向代理到Node.js应用
    location / {
        proxy_pass http://127.0.0.1:8311;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        proxy_pass http://127.0.0.1:8311;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
```

**方式二：子路径部署（适用于多应用共享域名）**
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为您的域名或IP地址
    
    # 安全头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # 日志配置
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;
    
    # Travenion应用 - 子路径部署
    location /travenion/ {
        proxy_pass http://127.0.0.1:8311/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # 重定向根路径到travenion（可选）
    location = /travenion {
        return 301 /travenion/;
    }
    
    # 其他应用可以添加在这里
    # location /other-app/ {
    #     proxy_pass http://127.0.0.1:8080/;
    #     proxy_set_header Host $host;
    # }
    
    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
```

**子路径部署说明：**
- 应用将通过 `http://your-domain.com/travenion/` 访问
- API文档地址为 `http://your-domain.com/travenion/api-docs`
- 可以在同一域名下部署多个应用，每个应用使用不同的子路径
- 注意 `proxy_pass` 末尾的 `/` 很重要，它会去掉 `/travenion` 前缀再转发给后端应用

#### 启用站点配置
```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/travenion /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重新加载Nginx
sudo systemctl reload nginx
```

#### 配置说明

**注意：** 当前配置为HTTP部署，适用于内网环境或开发测试。如果需要在公网部署，强烈建议配置HTTPS以确保安全性。

如果后续需要启用HTTPS，可以使用Let's Encrypt免费证书：
```bash
# 安装Certbot
sudo apt install certbot python3-certbot-nginx  # Ubuntu/Debian
# 或
sudo yum install certbot python3-certbot-nginx  # CentOS/RHEL

# 获取SSL证书
sudo certbot --nginx -d your-domain.com
```

### 5. Systemd服务配置

#### 创建systemd服务文件
```bash
sudo nano /etc/systemd/system/travenion.service
```

添加以下内容：
```ini
[Unit]
Description=Travenion Travel Planning Application
Documentation=https://github.com/your-username/Travenion
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=travenion
Group=travenion
WorkingDirectory=/home/travenion/Travenion
Environment=NODE_ENV=production
EnvironmentFile=/home/travenion/Travenion/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
KillMode=mixed
KillSignal=SIGINT
TimeoutStopSec=5
SyslogIdentifier=travenion

# 安全设置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/home/travenion/Travenion

# 资源限制
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
```

#### 启动和管理服务
```bash
# 重新加载systemd配置
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start travenion

# 设置开机自启
sudo systemctl enable travenion

# 查看服务状态
sudo systemctl status travenion

# 查看服务日志
sudo journalctl -u travenion -f

# 重启服务
sudo systemctl restart travenion

# 停止服务
sudo systemctl stop travenion
```

### 6. 防火墙配置

#### UFW防火墙（Ubuntu/Debian）
```bash
# 启用UFW
sudo ufw enable

# 允许SSH
sudo ufw allow ssh

# 允许HTTP
sudo ufw allow 'Nginx HTTP'

# 查看状态
sudo ufw status
```

#### Firewalld防火墙（CentOS/RHEL）
```bash
# 启用firewalld
sudo systemctl start firewalld
sudo systemctl enable firewalld

# 允许HTTP
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload

# 查看状态
sudo firewall-cmd --list-all
```

### 7. 监控和维护

#### 日志管理
```bash
# 查看应用日志
sudo journalctl -u travenion --since "1 hour ago"

# 查看Nginx日志
sudo tail -f /var/log/nginx/travenion_access.log
sudo tail -f /var/log/nginx/travenion_error.log

# 配置日志轮转
sudo nano /etc/logrotate.d/travenion
```

添加以下内容：
```
/var/log/nginx/travenion_*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        systemctl reload nginx
    endscript
}
```

#### 性能监控
```bash
# 安装htop和iotop
sudo apt install htop iotop  # Ubuntu/Debian
sudo yum install htop iotop  # CentOS/RHEL

# 监控系统资源
htop
iotop

# 监控Node.js进程
ps aux | grep node
```

#### 数据库备份
```bash
# 创建备份脚本
sudo nano /home/travenion/backup.sh
```

添加以下内容：
```bash
#!/bin/bash
BACKUP_DIR="/home/travenion/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="travenion"
DB_USER="travenion"
DB_PASS="your_secure_password"

mkdir -p $BACKUP_DIR
mysqldump -u$DB_USER -p$DB_PASS $DB_NAME > $BACKUP_DIR/travenion_$DATE.sql

# 保留最近30天的备份
find $BACKUP_DIR -name "travenion_*.sql" -mtime +30 -delete
```

```bash
# 设置执行权限
chmod +x /home/travenion/backup.sh

# 添加到crontab（每天凌晨2点备份）
crontab -e
# 添加：0 2 * * * /home/travenion/backup.sh
```

### 8. 故障排除

#### 常见问题

1. **服务无法启动**
   ```bash
   # 检查服务状态
   sudo systemctl status travenion
   
   # 查看详细日志
   sudo journalctl -u travenion -n 50
   
   # 检查端口占用
   sudo netstat -tlnp | grep 8311
   ```

2. **数据库连接失败**
   ```bash
   # 测试数据库连接
   mysql -u travenion -p travenion
   
   # 检查MySQL服务状态
   sudo systemctl status mysql
   ```

3. **数据库表创建失败（外键依赖错误）**
   ```bash
   # 错误信息：Failed to open the referenced table 'Users'
   # 解决方案：重新初始化数据库
   mysql -u travenion -p
   ```
   
   ```sql
   DROP DATABASE travenion;
   CREATE DATABASE travenion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   EXIT;
   ```
   
   ```bash
   # 重启应用，让表按正确顺序创建
   sudo systemctl restart travenion
   ```

4. **Nginx配置错误**
     ```bash
     # 测试Nginx配置
     sudo nginx -t
     
     # 查看Nginx错误日志
     sudo tail -f /var/log/nginx/error.log
     ```
 
 5. **端口访问问题**
     ```bash
     # 检查端口是否被占用
     sudo netstat -tlnp | grep :80
     
     # 检查防火墙状态
     sudo ufw status  # Ubuntu/Debian
     sudo firewall-cmd --list-all  # CentOS/RHEL
     ```

### 9. 更新部署

#### 应用更新流程
```bash
# 1. 备份当前版本
cd /home/travenion
cp -r Travenion Travenion_backup_$(date +%Y%m%d)

# 2. 拉取最新代码
cd Travenion
git pull origin main

# 3. 安装新依赖
npm install --production

# 4. 重启服务
sudo systemctl restart travenion

# 5. 检查服务状态
sudo systemctl status travenion
```

#### 回滚操作
```bash
# 如果更新出现问题，可以快速回滚
cd /home/travenion
rm -rf Travenion
mv Travenion_backup_YYYYMMDD Travenion
sudo systemctl restart travenion
```

### 10. 安全建议

1. **定期更新系统和依赖**
   ```bash
   # 更新系统包
   sudo apt update && sudo apt upgrade  # Ubuntu/Debian
   sudo yum update  # CentOS/RHEL
   
   # 更新Node.js依赖
   npm audit
   npm update
   ```

2. **配置fail2ban防止暴力攻击**
   ```bash
   sudo apt install fail2ban  # Ubuntu/Debian
   sudo yum install fail2ban  # CentOS/RHEL
   
   sudo systemctl start fail2ban
   sudo systemctl enable fail2ban
   ```

3. **定期备份重要数据**
   - 数据库备份
   - 配置文件备份
   - 上传文件备份

4. **监控系统资源和日志**
   - 设置磁盘空间监控
   - 配置异常日志告警
   - 监控服务可用性

通过以上完整的部署指南，您可以在生产环境中安全、稳定地运行Travenion应用。
