let planId = new URLSearchParams(location.search).get('id');
let map, mapProvider = 'openstreetmap';
let currentPlan = null;
let days = [];
let files = [];
let currentDayAttractions = []; // 当前编辑的行程日的景点列表

// 从配置文件获取默认地图提供商
if (typeof window.MAP_CONFIG !== 'undefined' && window.MAP_CONFIG.DEFAULT_MAP_PROVIDER) {
  mapProvider = window.MAP_CONFIG.DEFAULT_MAP_PROVIDER;
}

// 地图API加载状态
let osmLoaded = false;
let baiduMapsLoaded = false;

// 动态加载OpenStreetMap (Leaflet)
function loadOSMMapsAPI() {
  return new Promise((resolve, reject) => {
    if (osmLoaded || typeof L !== 'undefined') {
      osmLoaded = true;
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;

    script.onload = () => {
      osmLoaded = true;
      resolve();
    };

    script.onerror = () => {
      reject(new Error('OpenStreetMap API加载失败'));
    };

    document.head.appendChild(script);
  });
}

// 动态加载百度地图API
function loadBaiduMapsAPI() {
  return new Promise((resolve, reject) => {
    if (baiduMapsLoaded || (typeof BMap !== 'undefined')) {
      baiduMapsLoaded = true;
      resolve();
      return;
    }
    
    if (!window.MAP_CONFIG || window.MAP_CONFIG.BAIDU_MAP_API_KEY === 'YOUR_BAIDU_MAP_API_KEY') {
      reject(new Error('百度地图API密钥未配置'));
      return;
    }
    
    // 设置全局回调函数
    window.baiduMapInit = () => {
      baiduMapsLoaded = true;
      resolve();
      // 清理回调函数
      delete window.baiduMapInit;
    };
    
    // 创建script标签，使用callback参数避免document.write问题
    const script = document.createElement('script');
    script.src = `https://api.map.baidu.com/api?v=3.0&ak=${window.MAP_CONFIG.BAIDU_MAP_API_KEY}&callback=baiduMapInit`;
    script.type = 'text/javascript';
    
    script.onerror = () => {
      reject(new Error('百度地图API加载失败'));
      // 清理回调函数
      delete window.baiduMapInit;
    };
    
    document.head.appendChild(script);
  });
}

// 通知系统
function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  // 对于警告类型的长消息，使用特殊样式
  if (type === 'warning' && message.length > 100) {
    notification.innerHTML = `
      <div style="max-height: 200px; overflow-y: auto; white-space: pre-line; font-family: monospace; font-size: 12px; line-height: 1.4; padding-right: 20px;">${message}</div>
      <button onclick="this.parentElement.remove()" style="position: absolute; top: 5px; right: 5px; background: none; border: none; color: inherit; font-size: 18px; cursor: pointer;">&times;</button>
    `;
    notification.style.position = 'relative';
    notification.style.maxWidth = '500px';
    notification.style.padding = '15px';
  } else {
    notification.innerHTML = `
      <span>${message}</span>
      <button onclick="this.parentElement.remove()">&times;</button>
    `;
  }
  
  container.appendChild(notification);
  
  // 警告类型的通知延长显示时间
  const timeout = type === 'warning' ? 15000 : (type === 'error' ? 0 : 5000);
  if (timeout > 0) {
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, timeout);
  }
}

// 加载状态设置
function setLoadingState(element, isLoading) {
  if (!element) return;
  
  const loadingSpan = element.querySelector('.loading');
  const textSpan = element.querySelector('.save-text, .upload-text, .share-text, .update-text');
  
  if (isLoading) {
    element.disabled = true;
    if (loadingSpan) loadingSpan.style.display = 'inline-block';
    if (textSpan) textSpan.style.display = 'none';
  } else {
    element.disabled = false;
    if (loadingSpan) loadingSpan.style.display = 'none';
    if (textSpan) textSpan.style.display = 'inline';
  }
}

// 格式化日期
function formatDate(dateString) {
  if (!dateString) return '未知日期';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '未知日期';
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 获取文件图标
function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = {
    'pdf': '📄',
    'doc': '📝', 'docx': '📝',
    'xls': '📊', 'xlsx': '📊',
    'ppt': '📋', 'pptx': '📋',
    'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'webp': '🖼️',
    'mp4': '🎥', 'avi': '🎥', 'mov': '🎥',
    'mp3': '🎵', 'wav': '🎵',
    'zip': '📦', 'rar': '📦', '7z': '📦',
    'txt': '📄', 'md': '📄',
    'html': '🌐', 'htm': '🌐'
  };
  return icons[ext] || '📄';
}

// 检测地址中的国家，用于百度地图地理编码
function detectCountry(address) {
  if (!address) return '';
  const countries = [
    { pattern: /日本|japan/i, region: '日本' },
    { pattern: /韩国|south korea|korea/i, region: '韩国' },
    { pattern: /美国|usa|united states|u\.s\.a|us/i, region: '美国' },
    { pattern: /英国|united kingdom|uk|great britain|england/i, region: '英国' },
    { pattern: /法国|france/i, region: '法国' },
    { pattern: /德国|germany/i, region: '德国' },
    { pattern: /加拿大|canada/i, region: '加拿大' },
    { pattern: /澳大利亚|australia/i, region: '澳大利亚' },
    { pattern: /新加坡|singapore/i, region: '新加坡' },
    { pattern: /泰国|thailand/i, region: '泰国' },
    { pattern: /马来西亚|malaysia/i, region: '马来西亚' },
    { pattern: /菲律宾|philippines/i, region: '菲律宾' },
    { pattern: /印度|india/i, region: '印度' }
  ];
  for (const { pattern, region } of countries) {
    if (pattern.test(address)) return region;
  }
  return '';
}

// 检测地址是否为经纬度格式
function isCoordinateFormat(address) {
  if (!address || typeof address !== 'string') return null;
  
  // 移除空格并检查格式
  const cleaned = address.trim();
  
  // 匹配经纬度格式：数字,数字 或 数字, 数字
  const coordPattern = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/;
  const match = cleaned.match(coordPattern);
  
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    
    // 验证经纬度范围
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }
  
  return null;
}

// 检查文件是否可以预览
function canPreviewFile(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const previewableTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt', 'md', 'html', 'htm'];
  return previewableTypes.includes(ext);
}

// 预览文件
function previewFile(fileId) {
  const file = files.find(f => f.id === fileId);
  if (!file) {
    showNotification('文件不存在', 'error');
    return;
  }
  
  const ext = file.filename.split('.').pop().toLowerCase();
  const fileUrl = `/travenion/api/plans/${planId}/files/${fileId}`;
  const token = localStorage.getItem('token');
  
  // 创建预览模态框
  const modal = document.createElement('div');
  modal.className = 'modal show';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 90vw; max-height: 90vh; overflow: auto;">
      <div class="modal-header">
        <h3>文件预览 - ${file.filename}</h3>
        <button type="button" onclick="this.closest('.modal').remove()">&times;</button>
      </div>
      <div class="modal-body" style="max-height: 70vh; overflow: auto;">
        <div id="previewContent" style="text-align: center;">
          <div style="padding: 20px;">加载中...</div>
        </div>
      </div>
      <div class="modal-footer">
        <a href="${fileUrl}" target="_blank" class="btn btn-primary">下载文件</a>
        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">关闭</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 根据文件类型显示预览内容
  const previewContent = modal.querySelector('#previewContent');
  
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    // 图片预览
    fetch(fileUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => response.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      previewContent.innerHTML = `
        <img src="${blobUrl}" alt="${file.filename}" 
             style="max-width: 100%; max-height: 60vh; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
      `;
    })
    .catch(error => {
      previewContent.innerHTML = `
        <div style="color: #dc3545; padding: 20px;">
          无法加载图片。<a href="${fileUrl}" target="_blank">点击这里下载文件</a>
        </div>
      `;
    });
  } else if (ext === 'pdf') {
    // PDF预览
    fetch(fileUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => response.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      previewContent.innerHTML = `
        <iframe src="${blobUrl}" 
                style="width: 100%; height: 60vh; border: none; border-radius: 8px;" 
                title="PDF预览">
          <p>您的浏览器不支持PDF预览。<a href="${fileUrl}" target="_blank">点击这里下载文件</a></p>
        </iframe>
      `;
    })
    .catch(error => {
      previewContent.innerHTML = `
        <div style="color: #dc3545; padding: 20px;">
          无法加载PDF文件。<a href="${fileUrl}" target="_blank">点击这里下载文件</a>
        </div>
      `;
    });
  } else if (['txt', 'md', 'html', 'htm'].includes(ext)) {
    // 文本文件预览
    fetch(fileUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(response => response.text())
      .then(text => {
        if (ext === 'md') {
          // 简单的Markdown渲染
          const htmlContent = text
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/gim, '<em>$1</em>')
            .replace(/\n/gim, '<br>');
          previewContent.innerHTML = `
            <div style="text-align: left; padding: 20px; background: #f8f9fa; border-radius: 8px; max-height: 50vh; overflow-y: auto;">
              ${htmlContent}
            </div>
          `;
        } else {
          previewContent.innerHTML = `
            <pre style="text-align: left; padding: 20px; background: #f8f9fa; border-radius: 8px; max-height: 50vh; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word;">${text}</pre>
          `;
        }
      })
      .catch(error => {
        previewContent.innerHTML = `
          <div style="color: #dc3545; padding: 20px;">
            无法加载文件内容。<a href="${fileUrl}" target="_blank">点击这里下载文件</a>
          </div>
        `;
      });
  }
}

// 编辑文件描述
function editFileDescription(fileId) {
  const file = files.find(f => f.id === fileId);
  if (!file) {
    showNotification('文件不存在', 'error');
    return;
  }
  
  const currentDescription = file.description || '';
  
  // 创建编辑模态框
  const modal = document.createElement('div');
  modal.className = 'modal show';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>编辑文件描述</h3>
        <button type="button" onclick="this.closest('.modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 600;">文件名</label>
          <input type="text" value="${file.filename}" readonly style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; background: #f8f9fa;">
        </div>
        <div style="margin-bottom: 15px;">
          <label for="fileDescription" style="display: block; margin-bottom: 5px; font-weight: 600;">描述</label>
          <textarea id="fileDescription" rows="3" 
                    placeholder="为这个文件添加描述..." 
                    style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; resize: vertical;">${currentDescription}</textarea>
          <small style="color: #6b7280;">描述可以帮助您更好地管理和识别文件</small>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">取消</button>
        <button type="button" class="btn btn-primary" onclick="saveFileDescription(${fileId}, this.closest('.modal'))">保存</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 聚焦到文本框
  setTimeout(() => {
    modal.querySelector('#fileDescription').focus();
  }, 100);
}

// 保存文件描述
async function saveFileDescription(fileId, modal) {
  const description = modal.querySelector('#fileDescription').value.trim();
  const saveBtn = modal.querySelector('.btn-primary');
  
  setLoadingState(saveBtn, true);
  
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/files/${fileId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ description })
    });
    
    if (!response.ok) {
      throw new Error('更新失败');
    }
    
    // 更新本地数据
    const fileIndex = files.findIndex(f => f.id === fileId);
    if (fileIndex !== -1) {
      files[fileIndex].description = description;
    }
    
    renderFiles();
    modal.remove();
    showNotification('文件描述已更新', 'success');
    
  } catch (error) {
    console.error('更新文件描述失败:', error);
    showNotification('更新文件描述失败', 'error');
  } finally {
    setLoadingState(saveBtn, false);
  }
}

// 加载计划信息
async function loadPlan() {
  try {
    const response = await fetch(`/travenion/api/plans/${planId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    
    if (!response.ok) {
      throw new Error('加载计划失败');
    }
    
    currentPlan = await response.json();
    
    const planTitle = document.getElementById('planTitle');
    const planDescription = document.getElementById('planDescription');
    
    if (planTitle) {
      planTitle.textContent = currentPlan.title;
      planTitle.title = currentPlan.title;
    }
    if (planDescription) {
      planDescription.textContent = currentPlan.description || '暂无描述';
      planDescription.title = currentPlan.description || '暂无描述';
    }
    
    // 设置默认地图提供商
    if (currentPlan.defaultMap) {
      mapProvider = currentPlan.defaultMap;
    }
    
    // 更新地图按钮状态
    initMapButtons();
    
    await loadDays();
    await loadFiles();
    await loadBookingPlans();
    await loadMap();
    
    // 应用文字滚动效果
    setTimeout(() => {
      addScrollEffectToOverflowText();
    }, 100);
    
  } catch (error) {
    console.error('加载计划失败:', error);
    showNotification('加载计划失败，请刷新页面重试', 'error');
  }
}

// 加载行程安排
async function loadDays() {
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/days`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    
    if (!response.ok) {
      throw new Error('加载行程失败');
    }
    
    days = await response.json();
    
    // 为每一天加载景点数据
    for (let day of days) {
      try {
        const attractionsResponse = await fetch(`/travenion/api/attractions/day/${day.id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (attractionsResponse.ok) {
          day.attractionsList = await attractionsResponse.json();
        } else {
          day.attractionsList = [];
        }
      } catch (error) {
        console.error(`加载第${day.dayIndex}天景点失败:`, error);
        day.attractionsList = [];
      }
    }
    
    renderDays();
    updateStatistics();
    
  } catch (error) {
    console.error('加载行程失败:', error);
    showNotification('加载行程失败', 'error');
  }
}

// 渲染行程列表
function renderDays() {
  const container = document.getElementById('dayList');
  const emptyState = document.getElementById('emptyDays');
  
  if (days.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';
  
  // 获取今天的日期
  const today = new Date().toISOString().split('T')[0];
  
  // 按天数排序
  const sortedDays = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
  
  container.innerHTML = sortedDays.map(day => {
    const isToday = day.date === today;
    const isPast = day.date && day.date < today;
    const isFuture = day.date && day.date > today;
    
    // 根据日期状态设置样式
    let cardStyle = 'margin-bottom: 15px; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);';
    let badgeStyle = 'background: #3b82f6; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600;';
    let todayBadge = '';
    
    if (isToday) {
      cardStyle = 'margin-bottom: 15px; padding: 20px; background: linear-gradient(135deg, #fef3c7 0%, #fbbf24 100%); border-radius: 12px; box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3); border: 2px solid #f59e0b;';
      badgeStyle = 'background: #f59e0b; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600;';
      todayBadge = '<span style="background: #ef4444; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: 8px; animation: pulse 2s infinite;">今天</span>';
    } else if (isPast) {
      cardStyle = 'margin-bottom: 15px; padding: 20px; background: #f9fafb; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); opacity: 0.7;';
      badgeStyle = 'background: #9ca3af; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600;';
    }
    
    return `
    <div class="day-card" style="${cardStyle}">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="${badgeStyle}">
            ${day.dayIndex}
          </div>
          <div>
            <h3 class="text-scroll" style="margin: 0; color: #1f2937;" title="${day.city}">${day.city} ${todayBadge}</h3>
            <p style="margin: 0; color: #6b7280; font-size: 14px;">第${day.dayIndex}天 ${day.date ? formatDate(day.date) : ''}</p>
          </div>
        </div>
        <!-- PC端按钮组 -->
        <div class="day-actions-desktop" style="display: flex; gap: 10px;">
          <button class="btn btn-info paste-btn" onclick="pasteAttraction(${day.id})" style="padding: 8px 12px; font-size: 14px; ${copiedAttraction ? 'background: #17a2b8; color: white; border: 1px solid #17a2b8;' : 'background: #e9ecef; color: #6c757d; border: 1px solid #dee2e6; cursor: not-allowed;'}" title="${copiedAttraction ? `粘贴景点: ${copiedAttraction.name}` : '剪贴板为空'}">
            <i class="fas fa-paste"></i> 粘贴${copiedAttraction ? ` (${copiedAttraction.name})` : ''}
          </button>
          <button class="btn btn-outline" onclick="editDay(${day.id})" style="padding: 8px 12px; font-size: 14px;">编辑</button>
          <button class="btn btn-danger" onclick="deleteDay(${day.id})" style="padding: 8px 12px; font-size: 14px;">删除</button>
        </div>
      </div>
      
      <!-- 移动端按钮组 -->
      <div class="day-actions-mobile" style="display: none; flex-wrap: wrap; gap: 8px; margin-bottom: 15px;">
        <button class="btn btn-info paste-btn" onclick="pasteAttraction(${day.id})" style="padding: 8px 12px; font-size: 14px; ${copiedAttraction ? 'background: #17a2b8; color: white; border: 1px solid #17a2b8;' : 'background: #e9ecef; color: #6c757d; border: 1px solid #dee2e6; cursor: not-allowed;'}" title="${copiedAttraction ? `粘贴景点: ${copiedAttraction.name}` : '剪贴板为空'}">
          <i class="fas fa-paste"></i> 粘贴${copiedAttraction ? ` (${copiedAttraction.name})` : ''}
        </button>
        <button class="btn btn-outline" onclick="editDay(${day.id})" style="padding: 8px 12px; font-size: 14px;">编辑</button>
        <button class="btn btn-danger" onclick="deleteDay(${day.id})" style="padding: 8px 12px; font-size: 14px;">删除</button>
      </div>
      
      ${day.transportation ? `
        <div style="margin-bottom: 10px;">
          <span style="color: #6b7280; font-size: 14px;">🚗 交通方式:</span>
          <span style="margin-left: 8px;">${day.transportation}</span>
        </div>
      ` : ''}
      
      <div>
        <span style="color: #6b7280; font-size: 14px;">🎯 景点安排:</span>
        ${day.attractionsList && day.attractionsList.length > 0 ? `
          <div style="margin-top: 8px;">
            ${day.attractionsList.map((attraction, index) => `
              <div class="main-attraction-item" data-attraction-name="${attraction.name.replace(/"/g, '&quot;')}" style="display: flex; align-items: center; padding: 8px; margin-bottom: 6px; background: #f8fafc; border-radius: 6px; border-left: 3px solid #3b82f6; transition: all 0.2s ease;">
                <span style="background: #3b82f6; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 10px; flex-shrink: 0;">${index + 1}</span>
                <div class="attraction-clickable" style="flex: 1; min-width: 0; cursor: pointer;">
                  <div class="text-scroll" style="font-weight: 500; color: #1f2937; margin-bottom: 2px;" title="${attraction.name}">${attraction.name} <span style="color: #3b82f6; font-size: 12px;">📍 点击查看</span></div>
                  ${attraction.description ? `<div class="text-scroll" style="color: #6b7280; font-size: 13px; margin-bottom: 2px;" title="${attraction.description}">${attraction.description}</div>` : ''}
                  ${attraction.address ? `<div class="text-scroll" style="color: #9ca3af; font-size: 12px;" title="${attraction.address}"><i class="fas fa-map-marker-alt"></i> ${attraction.address}</div>` : ''}
                </div>
                <button type="button" onclick="copyMainAttraction(${day.id}, ${index})" style="background: #17a2b8; color: white; border: none; border-radius: 4px; padding: 4px 6px; font-size: 11px; cursor: pointer; margin-left: 8px; flex-shrink: 0;" title="复制景点">
                  <i class="fas fa-copy"></i>
                </button>
                <button type="button" onclick="navigateToAttraction('${attraction.name.replace(/'/g, '\\\'')}', '${attraction.address ? attraction.address.replace(/'/g, '\\\'') : ''}')" style="background: #28a745; color: white; border: none; border-radius: 4px; padding: 4px 6px; font-size: 11px; cursor: pointer; margin-left: 4px; flex-shrink: 0;" title="导航到此地点">
                  <i class="fas fa-directions"></i>
                </button>
              </div>
            `).join('')}
          </div>
          ${(() => {
            // 检查路线交叉
            const hasCrossing = checkRouteCrossing(day.attractionsList);
            return hasCrossing ? `
              <div style="margin-top: 10px; padding: 12px; background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 8px; border-left: 4px solid #ef4444; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444; font-size: 16px; flex-shrink: 0;"></i>
                <div style="flex: 1;">
                  <div style="color: #dc2626; font-weight: 600; font-size: 14px; margin-bottom: 2px;">⚠️ 路线交叉警告</div>
                  <div style="color: #7f1d1d; font-size: 13px;">当前景点路线存在交叉，可能会走冤枉路。建议重新调整景点顺序以优化路线。</div>
                </div>
              </div>
            ` : '';
          })()}
        ` : `
          <div style="margin-top: 5px; padding: 15px; background: #f8fafc; border-radius: 8px; text-align: center; color: #6b7280; font-style: italic;">
            暂无景点安排
          </div>
        `}
      </div>
    </div>
  `;
  }).join('');
  
  // 为主页面的景点框添加点击事件监听器
  setTimeout(() => {
    const mainAttractionItems = document.querySelectorAll('.main-attraction-item');
    mainAttractionItems.forEach(item => {
      const clickableDiv = item.querySelector('.attraction-clickable');
      if (clickableDiv) {
        clickableDiv.addEventListener('click', () => {
          const attractionName = item.getAttribute('data-attraction-name');
          highlightAttractionOnMap(attractionName);
        });
        
        // 添加悬停效果
        clickableDiv.addEventListener('mouseover', () => {
          item.style.backgroundColor = '#e0f2fe';
          item.style.transform = 'translateX(4px)';
        });
        clickableDiv.addEventListener('mouseout', () => {
          item.style.backgroundColor = '#f8fafc';
          item.style.transform = 'translateX(0)';
        });
      }
    });
    
    // 应用文字滚动效果
    addScrollEffectToOverflowText();
  }, 0);
}

// 加载文件列表
async function loadFiles() {
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/files`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    
    if (!response.ok) {
      throw new Error('加载文件失败');
    }
    
    files = await response.json();
    renderFiles();
    updateStatistics();
    
  } catch (error) {
    console.error('加载文件失败:', error);
    showNotification('加载文件失败', 'error');
  }
}

// 渲染文件列表
function renderFiles() {
  const container = document.getElementById('fileGrid');
  const emptyState = document.getElementById('emptyFiles');
  
  if (files.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';
  
  container.style.display = 'block';
  container.style.maxWidth = '100%';
  
  container.innerHTML = files.map((file, index) => {
    const displayName = file.friendlyName || file.originalName || file.filename;
    const hasFriendlyName = !!file.friendlyName;
    const originalName = file.originalName || file.filename;
    
    return `
    <div class="file-list-item" draggable="true" data-file-id="${file.id}" data-index="${index}"
         ondragstart="onFileDragStart(event)" ondragover="onFileDragOver(event)" ondrop="onFileDrop(event)" ondragend="onFileDragEnd(event)">
      <div class="file-drag-handle" title="拖拽排序">
        <i class="fas fa-grip-vertical"></i>
      </div>
      <div class="file-icon-box">${getFileIcon(file.filename)}</div>
      <div class="file-info-section">
        <div class="file-display-name" title="${originalName}">${displayName}</div>
        ${hasFriendlyName ? `<div class="file-original-name" title="${originalName}">${originalName}</div>` : ''}
        <div class="file-meta-row">
          ${file.fileSize ? `<span class="file-meta-tag file-meta-size"><i class="fas fa-hdd"></i> ${formatFileSize(file.fileSize)}</span>` : ''}
          ${file.mimeType ? `<span class="file-meta-tag file-meta-type">${file.mimeType.split('/')[1] || file.mimeType}</span>` : ''}
          <span class="file-meta-tag file-meta-date"><i class="fas fa-clock"></i> ${formatDate(file.uploadedAt)}</span>
        </div>
        ${file.description ? `<div class="file-desc-preview">${file.description.substring(0, 60)}${file.description.length > 60 ? '...' : ''}</div>` : ''}
      </div>
      <div class="file-actions-group">
        <button onclick="downloadFile(${file.id})" class="file-action-btn file-action-download" title="下载"><i class="fas fa-download"></i></button>
        <button onclick="editFileInfo(${file.id})" class="file-action-btn file-action-edit" title="编辑"><i class="fas fa-edit"></i></button>
        <button onclick="deleteFile(${file.id})" class="file-action-btn file-action-delete" title="删除"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

// 文件拖拽排序功能
let draggedFileIndex = null;

function onFileDragStart(e) {
  draggedFileIndex = parseInt(e.currentTarget.dataset.index);
  e.currentTarget.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
}

function onFileDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  target.style.borderTop = '3px solid #3b82f6';
}

function onFileDrop(e) {
  e.preventDefault();
  const targetIndex = parseInt(e.currentTarget.dataset.index);
  e.currentTarget.style.borderTop = '';
  
  if (draggedFileIndex === null || draggedFileIndex === targetIndex) return;
  
  const movedFile = files.splice(draggedFileIndex, 1)[0];
  files.splice(targetIndex, 0, movedFile);
  
  const fileOrders = files.map((f, i) => ({ fileId: f.id, order: i }));
  
  fetch(`/travenion/api/plans/${planId}/files/reorder`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fileOrders })
  }).then(response => {
    if (response.ok) {
      showNotification('文件顺序已更新', 'success');
    } else {
      showNotification('排序保存失败', 'error');
      loadFiles();
    }
  }).catch(() => {
    showNotification('排序保存失败', 'error');
    loadFiles();
  });
  
  renderFiles();
}

function onFileDragEnd(e) {
  e.currentTarget.style.opacity = '1';
  document.querySelectorAll('.file-list-item').forEach(el => {
    el.style.borderTop = '';
  });
  draggedFileIndex = null;
}

// 编辑文件信息（友好名称 + 描述）
function editFileInfo(fileId) {
  const file = files.find(f => f.id === fileId);
  if (!file) {
    showNotification('文件不存在', 'error');
    return;
  }
  
  const modal = document.createElement('div');
  modal.className = 'modal show';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>编辑文件信息</h3>
        <button type="button" onclick="this.closest('.modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">原始文件名</label>
          <input type="text" value="${(file.originalName || file.filename).replace(/"/g, '&quot;')}" readonly 
                 style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; background: #f8f9fa; color: #6b7280; font-size: 13px;">
        </div>
        <div class="form-group">
          <label class="form-label">简短友好名称</label>
          <input type="text" id="editFileFriendlyName" value="${(file.friendlyName || '').replace(/"/g, '&quot;')}" 
                 placeholder="输入简短易识别的名称..." 
                 style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px;">
          <small style="color: #6b7280; font-size: 12px; margin-top: 4px; display: block;">设置简短名称后，文件列表将显示此名称而非原始长文件名</small>
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea id="editFileDescription" rows="3" placeholder="为文件添加描述..." 
                    style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; resize: vertical; font-size: 14px;">${file.description || ''}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">取消</button>
        <button type="button" class="btn btn-primary" id="saveFileInfoBtn">保存</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('#saveFileInfoBtn').addEventListener('click', async function() {
    const btn = this;
    const friendlyName = modal.querySelector('#editFileFriendlyName').value.trim();
    const description = modal.querySelector('#editFileDescription').value.trim();
    
    setLoadingState(btn, true);
    
    try {
      const response = await fetch(`/travenion/api/plans/${planId}/files/${fileId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ friendlyName, description })
      });
      
      if (!response.ok) throw new Error('更新失败');
      
      const fileIndex = files.findIndex(f => f.id === fileId);
      if (fileIndex !== -1) {
        files[fileIndex].friendlyName = friendlyName;
        files[fileIndex].description = description;
      }
      
      renderFiles();
      modal.remove();
      showNotification('文件信息已更新', 'success');
    } catch (error) {
      console.error('更新文件信息失败:', error);
      showNotification('更新失败', 'error');
    } finally {
      setLoadingState(btn, false);
    }
  });
  
  setTimeout(() => modal.querySelector('#editFileFriendlyName').focus(), 100);
}

// 更新统计信息
function updateStatistics() {
  const totalDays = document.getElementById('totalDays');
  const totalFiles = document.getElementById('totalFiles');
  
  if (totalDays) {
    totalDays.textContent = days.length;
  }
  if (totalFiles) {
    totalFiles.textContent = files.length;
  }
}

// 加载地图
async function loadMap() {
  const mapElement = document.getElementById('map');

  // 清理现有地图实例
  if (map) {
    try {
      if (mapProvider === 'openstreetmap' && map.remove) {
        map.remove();
      } else if (mapProvider === 'baidu' && map.clearOverlays) {
        map.clearOverlays();
      }
    } catch (e) {
      console.warn('清理地图实例时出错:', e);
    }
    map = null;
  }

  // 清理地图容器
  mapElement.innerHTML = '';

  // 显示加载状态
  mapElement.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #6b7280; text-align: center; padding: 20px;"><div style="font-size: 1.2em; margin-bottom: 10px;">🗺️ 正在加载地图...</div><div style="font-size: 0.9em;">请稍候</div></div>';

  // 重置路线服务
  directionsService = null;
  directionsRenderer = null;
  baiduDrivingRoute = null;
  
  try {
    if (mapProvider === 'openstreetmap') {
      // 动态加载OpenStreetMap
      await loadOSMMapsAPI();

      if (typeof L === 'undefined') {
        throw new Error('OpenStreetMap library failed to load');
      }

      map = L.map(mapElement).setView([35.6762, 139.6503], 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // 添加地点标记
      addMapMarkers();

    } else if (mapProvider === 'baidu') {
      // 动态加载百度地图API
      await loadBaiduMapsAPI();

      if (typeof BMap === 'undefined') {
        throw new Error('Baidu Maps library failed to load');
      }

      map = new BMap.Map(mapElement);
      map.centerAndZoom(new BMap.Point(116.404, 39.915), 11);
      map.addControl(new BMap.MapTypeControl());
      map.addControl(new BMap.ScaleControl());
      map.addControl(new BMap.OverviewMapControl());
      map.addControl(new BMap.NavigationControl());

      // 添加地点标记
      addMapMarkers();
    } else {
      throw new Error('Unsupported map provider: ' + mapProvider);
    }
    
  } catch (error) {
    console.error('地图加载失败:', error);
    
    const providerName = mapProvider === 'openstreetmap' ? 'OpenStreetMap' : '百度地图';
    const errorMessage = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #ef4444; text-align: center; padding: 20px;">
        <div style="font-size: 1.2em; margin-bottom: 10px;">⚠️ ${providerName} 加载失败</div>
        <div style="font-size: 0.9em; margin-bottom: 10px;">请检查网络连接</div>
        <div style="font-size: 0.8em; color: #9ca3af;">${error.message}</div>
      </div>
    `;

    mapElement.innerHTML = errorMessage;
  }
}
// 地图标记和路线
let markers = [];
let polylines = [];
let directionsService = null;
let directionsRenderer = null;
let baiduDrivingRoute = null;
let routePolyline = null;
let attractionMarkers = []; // 存储景点标记信息，用于点击放大功能
let routeMode = 'real'; // 'straight' 或 'real'
let routeProfile = 'driving'; // 'driving', 'cycling', 'walking'

// 获取真实路线坐标
async function fetchRealRoute(coordinates) {
  if (!coordinates || coordinates.length < 2) return null;
  
  if (mapProvider === 'openstreetmap') {
    const coordsStr = coordinates.map(c => `${c[1]},${c[0]}`).join(';');
    const profile = routeProfile === 'cycling' ? 'cycling' : routeProfile === 'walking' ? 'foot' : 'driving';
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coordsStr}?overview=full&geometries=geojson`;
    
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Travenion/1.0' }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        }
      }
    } catch (error) {
      console.warn('OSRM路线规划失败:', error.message);
    }
  } else if (mapProvider === 'baidu' && typeof BMap !== 'undefined') {
    try {
      const driving = new BMap.DrivingRoute(map, {
        onSearchComplete: function(results) {
          if (driving.getStatus() === BMAP_STATUS_SUCCESS) {
            const plan = results.getPlan(0);
            const pts = [];
            for (let i = 0; i < plan.getNumRoutes(); i++) {
              const route = plan.getRoute(i);
              const path = route.getPath();
              for (let j = 0; j < path.length; j++) {
                pts.push(new BMap.Point(path[j].lng, path[j].lat));
              }
            }
            return pts;
          }
          return null;
        }
      });
    } catch (error) {
      console.warn('百度地图路线规划失败:', error.message);
    }
  }
  
  return null;
}

// 批量获取路线（分段获取避免路线过长）
async function fetchRealRoutesBatch(allCoordinates) {
  if (allCoordinates.length < 2) return [];
  
  const allRouteSegments = [];
  
  for (let i = 0; i < allCoordinates.length - 1; i++) {
    const segmentCoords = [allCoordinates[i], allCoordinates[i + 1]];
    
    if (mapProvider === 'openstreetmap') {
      const coordsStr = segmentCoords.map(c => `${c[1]},${c[0]}`).join(';');
      const profile = routeProfile === 'cycling' ? 'cycling' : routeProfile === 'walking' ? 'foot' : 'driving';
      const url = `https://router.project-osrm.org/route/v1/${profile}/${coordsStr}?overview=full&geometries=geojson`;
      
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Travenion/1.0' }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.routes && data.routes.length > 0) {
            const routeCoords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            allRouteSegments.push({
              from: i,
              to: i + 1,
              coordinates: routeCoords,
              distance: data.routes[0].distance,
              duration: data.routes[0].duration
            });
            continue;
          }
        }
      } catch (error) {
        console.warn(`OSRM路线规划失败 (段${i}-${i+1}):`, error.message);
      }
    }
    
    allRouteSegments.push({
      from: i,
      to: i + 1,
      coordinates: segmentCoords,
      distance: null,
      duration: null
    });
  }
  
  return allRouteSegments;
}

// 添加地图标记（仅景点）
async function addMapMarkers() {
  if (!map || days.length === 0) return;

  clearMapMarkers();

  if (mapProvider === 'openstreetmap' && typeof L !== 'undefined') {
    console.log('开始处理OpenStreetMap景点标记');
    
    // 清除现有的所有标记和路线
    map.eachLayer(function(layer) {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });
    
    const bounds = L.latLngBounds();
    const sortedDays = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
    
    // 收集所有景点数据
    const allAttractions = [];
    
    for (const day of sortedDays) {
      let dayAttractions = [];
      try {
        const resp = await fetch(`/travenion/api/attractions/day/${day.id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (resp.ok) {
          dayAttractions = await resp.json();
        }
      } catch (err) {
        console.error('获取景点数据失败:', err);
        continue;
      }

      // 按访问顺序排序当天景点
      dayAttractions.sort((a, b) => (a.visitOrder || 0) - (b.visitOrder || 0));
      
      // 为每个景点添加天数和景点序号信息
      dayAttractions.forEach((attraction, index) => {
        allAttractions.push({
          ...attraction,
          dayIndex: day.dayIndex,
          dayCity: day.city,
          dayNumber: day.dayIndex, // 使用原始的dayIndex
          attractionOrder: index + 1,  // 景点序号从1开始
          markerLabel: `${day.dayIndex}-${index + 1}` // 新的标记格式
        });
      });
    }
    
    console.log(`收集到 ${allAttractions.length} 个景点`);
    
    // 处理每个景点的坐标和标记
    const validAttractions = [];
    const pathCoordinates = [];
    const failedAttractions = []; // 收集无法定位的景点
    
    for (let i = 0; i < allAttractions.length; i++) {
      const attraction = allAttractions[i];
      let lat = parseFloat(attraction.latitude);
      let lng = parseFloat(attraction.longitude);
      
      // 如果没有有效坐标，尝试解析地址
      let geocodingFailed = false;
      if (isNaN(lat) || isNaN(lng)) {
        if (attraction.address && attraction.address.trim()) {
          // 首先检查地址是否为经纬度格式
          const coordinates = isCoordinateFormat(attraction.address);
          if (coordinates) {
            lat = coordinates.lat;
            lng = coordinates.lng;
            console.log(`检测到经纬度格式: ${attraction.name} -> ${lat}, ${lng}`);
          } else {
            // 如果不是经纬度格式，进行地理编码
            try {
              console.log(`正在地理编码: ${attraction.name}`);
              
              if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 800));
              }
              
              let searchQuery = '';
              let geocodeSuccess = false;
              
              const queries = [
                `${attraction.name}, ${attraction.dayCity}`,
                attraction.name,
                `${attraction.address}, ${attraction.dayCity}`,
                attraction.address
              ].filter((q, idx, arr) => q && arr.indexOf(q) === idx);
              
              for (const query of queries) {
                if (geocodeSuccess) break;
                searchQuery = query;
                
                const response = await fetch(
                  `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&addressdetails=1`,
                  {
                    headers: {
                      'User-Agent': 'Travenion/1.0 (travel planning application)'
                    }
                  }
                );
                
                if (response.ok) {
                  const data = await response.json();
                  if (data && data.length > 0 && data[0].lat && data[0].lon) {
                    lat = parseFloat(data[0].lat);
                    lng = parseFloat(data[0].lon);
                    geocodeSuccess = true;
                    console.log(`地理编码成功: ${attraction.name} -> ${lat}, ${lng} (query: ${searchQuery})`);
                  }
                }
              }
              
              if (!geocodeSuccess) {
                console.warn(`地理编码无结果: ${attraction.name}`);
                geocodingFailed = true;
              }
            } catch (error) {
              console.warn(`地理编码异常: ${attraction.name}`, error.message);
              geocodingFailed = true;
            }
          }
        } else {
          geocodingFailed = true;
        }
      }
      
      // 如果有有效坐标，创建标记
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        // 创建自定义标记图标
        const markerIcon = L.divIcon({
          className: 'osm-attraction-marker',
          html: `
            <div style="
              background: linear-gradient(135deg, #007bff, #0056b3);
              color: white;
              border-radius: 50%;
              width: 36px;
              height: 36px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 12px;
              border: 3px solid white;
              box-shadow: 0 3px 6px rgba(0,0,0,0.4);
              cursor: pointer;
            ">${attraction.markerLabel}</div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -18]
        });
        
        // 创建并添加标记
        const marker = L.marker([lat, lng], { icon: markerIcon });
        
        // 创建弹出窗口内容
        const popupContent = `
          <div style="min-width: 220px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="background: linear-gradient(135deg, #007bff, #0056b3); color: white; margin: -9px -9px 12px -9px; padding: 12px; border-radius: 4px 4px 0 0;">
              <h4 style="margin: 0; font-size: 16px; font-weight: 600;">${attraction.name}</h4>
              <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">第${attraction.dayNumber}天 · 景点${attraction.markerLabel}</div>
            </div>
            ${attraction.address ? `<div style="margin-bottom: 8px; font-size: 13px; color: #555;"><strong>📍 地址:</strong> ${attraction.address}</div>` : ''}
            ${attraction.description ? `<div style="font-size: 13px; color: #666; line-height: 1.4;"><strong>📝 描述:</strong> ${attraction.description}</div>` : ''}
          </div>
        `;
        
        marker.bindPopup(popupContent, {
          maxWidth: 300,
          className: 'custom-popup'
        });
        
        // 添加到地图
        marker.addTo(map);
        markers.push(marker);
        
        // 存储标记信息用于点击放大功能
        attractionMarkers.push({
          marker: marker,
          attraction: attraction,
          coordinates: [lat, lng]
        });
        
        // 记录有效景点和路径点
        validAttractions.push(attraction);
        pathCoordinates.push([lat, lng]);
        bounds.extend([lat, lng]);
        
        console.log(`添加标记: ${attraction.name} (${attraction.markerLabel})`);
      } else {
        console.warn(`跳过无效坐标的景点: ${attraction.name}`);
        // 收集无法定位的景点信息
        failedAttractions.push({
          name: attraction.name,
          address: attraction.address || '无地址信息',
          dayIndex: attraction.dayIndex + 1,
          globalOrder: attraction.globalOrder,
          geocodingFailed: geocodingFailed
        });
      }
    }
    
    // 如果有无法定位的景点，显示警告提示
    if (failedAttractions.length > 0) {
      const failedList = failedAttractions.map(attr => 
        `• ${attr.name} (第${attr.dayIndex}天, 景点${attr.globalOrder}) - ${attr.address}`
      ).join('\n');
      
      const warningMessage = `⚠️ OpenStreetMap无法定位以下${failedAttractions.length}个景点：\n\n${failedList}\n\n建议：\n1. 检查景点名称和地址是否准确\n2. 尝试使用更具体的地址信息\n3. 或者切换到百度地图查看这些景点`;
      
      // 显示警告通知
      showNotification(warningMessage, 'warning');
      
      // 同时在控制台输出详细信息
      console.warn('OpenStreetMap无法定位的景点详情:', failedAttractions);
    }
    
    // 创建路线连线
    if (pathCoordinates.length > 1) {
      if (routeMode === 'real') {
        showNotification('正在规划真实路线...', 'info');
        const segments = await fetchRealRoutesBatch(pathCoordinates);
        
        let totalDistance = 0;
        let totalDuration = 0;
        let realSegmentsCount = 0;
        
        for (const segment of segments) {
          const segmentColor = '#007bff';
          const routeLine = L.polyline(segment.coordinates, {
            color: segmentColor,
            weight: 4,
            opacity: 0.8,
            smoothFactor: 1
          });
          routeLine.addTo(map);
          polylines.push(routeLine);
          
          if (segment.distance) totalDistance += segment.distance;
          if (segment.duration) totalDuration += segment.duration;
          if (segment.distance) realSegmentsCount++;
        }
        
        if (realSegmentsCount > 0) {
          const distKm = (totalDistance / 1000).toFixed(1);
          const durHours = Math.floor(totalDuration / 3600);
          const durMins = Math.round((totalDuration % 3600) / 60);
          showNotification(`路线规划完成: 约${distKm}公里，预计${durHours > 0 ? durHours + '小时' : ''}${durMins}分钟`, 'success');
        } else {
          showNotification('部分路线使用直线连接（路线服务暂不可用）', 'warning');
        }
      } else {
        const routeLine = L.polyline(pathCoordinates, {
          color: '#007bff',
          weight: 4,
          opacity: 0.8,
          smoothFactor: 1,
          dashArray: '8, 8'
        });
        routeLine.addTo(map);
        polylines.push(routeLine);
      }
      
      console.log(`创建路线连线，包含 ${pathCoordinates.length} 个点`);
    }
    
    // 调整地图视野
    if (bounds.isValid() && pathCoordinates.length > 0) {
      map.fitBounds(bounds.pad(0.1));
    }
    
    console.log(`OpenStreetMap处理完成: ${validAttractions.length}/${allAttractions.length} 个景点成功显示`);
    
    // 地理编码完成后，更新路线交叉检测
    updateRouteCrossingWarnings();

  } else if (mapProvider === 'baidu' && typeof BMap !== 'undefined') {
    const geocoder = new BMap.Geocoder();
    const sortedDays = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
    const viewportPoints = [];

    // 收集所有景点并按全局顺序排序
    const allAttractions = [];
    for (const day of sortedDays) {
      let dayAttractions = [];
      try {
        const resp = await fetch(`/travenion/api/attractions/day/${day.id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (resp.ok) dayAttractions = await resp.json();
      } catch (err) {
        console.error('获取景点数据失败:', err);
      }

      dayAttractions.sort((a, b) => (a.visitOrder || 0) - (b.visitOrder || 0));
      
      // 为每个景点添加天数和景点序号信息
      dayAttractions.forEach((attraction, index) => {
        attraction.dayIndex = day.dayIndex;
        attraction.dayCity = day.city;
        attraction.dayNumber = day.dayIndex; // 使用原始的dayIndex
        attraction.attractionOrder = index + 1;  // 景点序号从1开始
        attraction.markerLabel = `${day.dayIndex}-${index + 1}`; // 新的标记格式
        allAttractions.push(attraction);
      });
    }

    // 按天数和景点顺序进行全局排序
    allAttractions.sort((a, b) => {
      if (a.dayIndex !== b.dayIndex) {
        return a.dayIndex - b.dayIndex;
      }
      return (a.visitOrder || 0) - (b.visitOrder || 0);
    });

    const globalPathPoints = [];
    
    for (const attraction of allAttractions) {
      const point = await new Promise(resolve => {
        if (attraction.latitude && attraction.longitude) {
          resolve(new BMap.Point(attraction.longitude, attraction.latitude));
        } else if (attraction.address) {
          // 检查地址是否为经纬度格式
          const coordResult = isCoordinateFormat(attraction.address);
          if (coordResult) {
            // 直接使用经纬度创建点
            resolve(new BMap.Point(coordResult.lng, coordResult.lat));
          } else {
            // 使用地理编码服务
            const region = detectCountry(attraction.address) || attraction.dayCity;
            geocoder.getPoint(attraction.address, pt => resolve(pt), region);
          }
        } else {
          resolve(null);
        }
      });

      if (point) {
        const marker = new BMap.Marker(point);
        const label = new BMap.Label(attraction.markerLabel, { offset: new BMap.Size(0, -20) });
        label.setStyle({
          color: '#ffffff',
          backgroundColor: '#f59e0b',
          border: '2px solid #ffffff',
          borderRadius: '50%',
          padding: '2px 5px',
          fontWeight: 'bold',
          textAlign: 'center',
          fontSize: '10px'
        });
        marker.setLabel(label);
        map.addOverlay(marker);

        const infoWindow = new BMap.InfoWindow(`
          <div style="padding: 10px;">
            <h5 style="margin: 0 0 8px 0;">${attraction.name}</h5>
            <p style="margin: 4px 0; color: #666; font-size: 13px;">第${attraction.dayNumber}天 - 景点${attraction.markerLabel}</p>
            ${attraction.address ? `<p><strong>地址:</strong> ${attraction.address}</p>` : ''}
            ${attraction.description ? `<p><strong>描述:</strong> ${attraction.description}</p>` : ''}
          </div>`);

        marker.addEventListener('click', () => {
          map.openInfoWindow(infoWindow, point);
        });
        
        // 为标记添加infoWindow属性以便点击放大功能使用
        marker.infoWindow = infoWindow;

        markers.push({ marker, point, attraction, infoWindow });
        
        // 存储标记信息用于点击放大功能
        attractionMarkers.push({
          marker: marker,
          attraction: attraction,
          coordinates: [point.lat, point.lng]
        });
        
        globalPathPoints.push(point);
        viewportPoints.push(point);
      }
    }

    // 创建全局连线
    if (globalPathPoints.length > 1) {
      if (routeMode === 'real') {
        showNotification('正在规划真实路线...', 'info');
        
        let totalDistance = 0;
        let totalDuration = 0;
        let realSegmentsCount = 0;
        
        for (let i = 0; i < globalPathPoints.length - 1; i++) {
          const origin = globalPathPoints[i];
          const destination = globalPathPoints[i + 1];
          
          try {
            const drivingPolicy = routeProfile === 'walking' ? BMAP_DRIVING_POLICY_LEAST_DISTANCE : BMAP_DRIVING_POLICY_LEAST_TIME;
            const driving = new BMap.DrivingRoute(map, {
              policy: drivingPolicy,
              onSearchComplete: function(results) {
                if (driving.getStatus() === BMAP_STATUS_SUCCESS) {
                  const plan = results.getPlan(0);
                  if (plan) {
                    const pts = [];
                    for (let r = 0; r < plan.getNumRoutes(); r++) {
                      const route = plan.getRoute(r);
                      const path = route.getPath();
                      for (let p = 0; p < path.length; p++) {
                        pts.push(path[p]);
                      }
                    }
                    if (pts.length > 0) {
                      const routeLine = new BMap.Polyline(pts, {
                        strokeColor: '#f59e0b',
                        strokeWeight: 4,
                        strokeOpacity: 0.8
                      });
                      map.addOverlay(routeLine);
                      polylines.push(routeLine);
                      realSegmentsCount++;
                    }
                  }
                }
              }
            });
            driving.search(origin, destination);
          } catch (error) {
            console.warn(`百度地图路线规划失败 (段${i}):`, error.message);
          }
          
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        setTimeout(() => {
          if (realSegmentsCount > 0) {
            showNotification('路线规划完成', 'success');
          } else {
            const fallbackLine = new BMap.Polyline(globalPathPoints, {
              strokeColor: '#f59e0b',
              strokeWeight: 3,
              strokeOpacity: 0.8,
              strokeStyle: 'dashed'
            });
            map.addOverlay(fallbackLine);
            polylines.push(fallbackLine);
            showNotification('路线服务暂不可用，使用直线连接', 'warning');
          }
        }, 1000);
      } else {
        const polyline = new BMap.Polyline(globalPathPoints, {
          strokeColor: '#f59e0b',
          strokeWeight: 3,
          strokeOpacity: 0.8,
          strokeStyle: 'dashed'
        });
        map.addOverlay(polyline);
        polylines.push(polyline);
      }
    }

    if (viewportPoints.length > 0) {
      map.setViewport(viewportPoints);
    }
    
    // 地理编码完成后，更新路线交叉检测
    updateRouteCrossingWarnings();
  }
}

// 清除地图标记
function clearMapMarkers() {
  markers.forEach(item => {
    if (mapProvider === 'openstreetmap') {
      map.removeLayer(item);
    } else if (mapProvider === 'baidu') {
      map.removeOverlay(item.marker);
    }
  });
  markers = [];
  attractionMarkers = []; // 清空景点标记信息

  polylines.forEach(polyline => {
    if (mapProvider === 'openstreetmap') {
      map.removeLayer(polyline);
    } else if (mapProvider === 'baidu') {
      map.removeOverlay(polyline);
    }
  });
  polylines = [];

  if (directionsRenderer) {
    directionsRenderer.setDirections({ routes: [] });
  }

  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  }
}

// 景点点击放大功能
function highlightAttractionOnMap(attractionName) {
  const attractionMarker = attractionMarkers.find(item => 
    item.attraction.name === attractionName
  );
  
  if (!attractionMarker) {
    console.warn(`未找到景点标记: ${attractionName}`);
    return;
  }
  
  const { marker, coordinates } = attractionMarker;
  
  if (mapProvider === 'openstreetmap') {
    // OpenStreetMap: 设置视图并打开弹出窗口
    map.setView(coordinates, 16, { animate: true, duration: 1 });
    setTimeout(() => {
      marker.openPopup();
    }, 500);
    
    // 如果浮动小地图可见，也同步更新小地图视图
    if (miniMap && isFloatingMapVisible) {
      const newZoom = Math.max(16 - 2, 1);
      miniMap.setView(coordinates, newZoom);
      
      // 在小地图上也高亮显示对应的标记
      setTimeout(() => {
        miniMap.eachLayer(layer => {
          if (layer instanceof L.Marker) {
            const layerLatLng = layer.getLatLng();
            if (Math.abs(layerLatLng.lat - coordinates[0]) < 0.0001 && 
                Math.abs(layerLatLng.lng - coordinates[1]) < 0.0001) {
              layer.openPopup();
            }
          }
        });
      }, 300);
    }
    
  } else if (mapProvider === 'baidu') {
    // 百度地图: 设置中心点并打开信息窗口
    const point = new BMap.Point(coordinates[1], coordinates[0]); // 注意百度地图坐标顺序
    map.centerAndZoom(point, 16);
    setTimeout(() => {
      if (marker.infoWindow) {
        map.openInfoWindow(marker.infoWindow, point);
      }
    }, 500);
    
    // 如果浮动小地图可见，也同步更新小地图视图
    if (miniMap && isFloatingMapVisible) {
      const newZoom = Math.max(16 - 2, 3);
      miniMap.centerAndZoom(point, newZoom);
      
      // 在小地图上也高亮显示对应的标记
      setTimeout(() => {
        const overlays = miniMap.getOverlays();
        overlays.forEach(overlay => {
          if (overlay instanceof BMap.Marker) {
            const overlayPoint = overlay.getPosition();
            if (Math.abs(overlayPoint.lat - coordinates[0]) < 0.0001 && 
                Math.abs(overlayPoint.lng - coordinates[1]) < 0.0001) {
              const infoWindow = new BMap.InfoWindow(`<strong>${attractionName}</strong>`);
              miniMap.openInfoWindow(infoWindow, overlayPoint);
            }
          }
        });
      }, 300);
    }
  }
  
  console.log(`地图聚焦到景点: ${attractionName}`);
}

// 显示路线
async function showRoute() {
  if (!map || days.length === 0) {
    showNotification('暂无行程数据', 'warning');
    return;
  }

  try {
    // 收集所有景点坐标
    const allPoints = [];
    const sortedDays = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
    
    for (const day of sortedDays) {
      const dayAttractions = day.attractionsList || [];
      dayAttractions.sort((a, b) => (a.visitOrder || 0) - (b.visitOrder || 0));
      
      for (const attraction of dayAttractions) {
        if (attraction.latitude && attraction.longitude) {
          allPoints.push({
            lat: attraction.latitude,
            lng: attraction.longitude,
            name: attraction.name
          });
        }
      }
    }

    if (allPoints.length < 2) {
      showNotification('需要至少2个景点才能显示路线', 'warning');
      return;
    }

    if (mapProvider === 'openstreetmap' && typeof L !== 'undefined') {
      // 清除之前的路线
      if (routePolyline) {
        map.removeLayer(routePolyline);
      }
      
      // 创建路线
      const latlngs = allPoints.map(p => [p.lat, p.lng]);
      routePolyline = L.polyline(latlngs, {
        color: '#ef4444',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 10'
      }).addTo(map);
      
      showNotification('路线已显示', 'success');
      
    } else if (mapProvider === 'baidu' && typeof BMap !== 'undefined') {
      // 清除之前的路线
      if (baiduDrivingRoute) {
        map.removeOverlay(baiduDrivingRoute);
      }
      
      // 创建路线
      const points = allPoints.map(p => new BMap.Point(p.lng, p.lat));
      baiduDrivingRoute = new BMap.Polyline(points, {
        strokeColor: '#ef4444',
        strokeWeight: 4,
        strokeOpacity: 0.8,
        strokeStyle: 'dashed'
      });
      map.addOverlay(baiduDrivingRoute);
      
      showNotification('路线已显示', 'success');
    }
    
  } catch (error) {
    console.error('显示路线失败:', error);
    showNotification('显示路线失败', 'error');
  }
}

// 模态框控制
function openDayModal(dayData = null) {
  const form = document.getElementById('dayForm');
  const title = document.getElementById('dayModalTitle');
  const editId = document.getElementById('editDayId');
  
  if (dayData) {
    title.textContent = '编辑行程';
    editId.value = dayData.id;
    form.dayIndex.value = dayData.dayIndex;
    form.date.value = dayData.date || '';
    form.city.value = dayData.city;
    form.transportation.value = dayData.transportation || '';
    form.attractions.value = dayData.attractions || '';
    
    // 加载该天的景点列表
    loadDayAttractions(dayData.id);
  } else {
    title.textContent = '添加行程';
    editId.value = '';
    form.reset();
    // 自动设置下一天
    const nextDay = days.length > 0 ? Math.max(...days.map(d => d.dayIndex)) + 1 : 1;
    form.dayIndex.value = nextDay;
    
    // 清空景点列表
    currentDayAttractions = [];
    renderAttractionsList();
  }

  openModal('dayModal');
}

function closeDayModal() {
  closeModal('dayModal');
}

function openFileModal() {
  const modal = document.getElementById('fileModal');
  const form = document.getElementById('fileForm');
  form.reset();
  document.getElementById('selectedFiles').innerHTML = '';
  document.querySelector('#fileModal .btn-primary').disabled = true;
  modal.classList.add('show');
}

function closeFileModal() {
  document.getElementById('fileModal').classList.remove('show');
}

// 新的用户分享功能
function sharePlan() {
  if (!currentPlan) {
    showNotification('计划信息加载失败', 'error');
    return;
  }
  
  // 加载用户列表和已分享用户
  loadUsersForSharing();
  openModal('shareModal');
}

// 加载用户列表用于分享
async function loadUsersForSharing() {
  try {
    const response = await fetch('/travenion/api/plans/users', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (response.ok) {
      const users = await response.json();
      renderUsersList(users);
    }
  } catch (error) {
    console.error('加载用户列表失败:', error);
    showNotification('加载用户列表失败', 'error');
  }
  
  // 同时加载已分享的用户
  loadSharedUsers();
}

// 渲染用户列表
function renderUsersList(users) {
  const container = document.getElementById('usersList');
  container.innerHTML = '';
  
  if (users.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #6b7280; margin: 20px 0;">暂无其他用户</p>';
    return;
  }
  
  users.forEach(user => {
    const userDiv = document.createElement('div');
    userDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; background: #f9fafb;';
    userDiv.innerHTML = `
      <div>
        <span style="font-weight: 500; color: #1f2937;">${user.username}</span>
        <small style="color: #6b7280; margin-left: 8px;">${user.email}</small>
      </div>
      <button type="button" class="btn btn-primary" onclick="shareWithUser('${user.username}')" style="font-size: 12px; padding: 6px 8px;">
        <i class="fas fa-share"></i> 分享
      </button>
    `;
    container.appendChild(userDiv);
  });
}

// 分享给指定用户
async function shareWithUser(username) {
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/share`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, permission: 'edit' })
    });
    
    if (response.ok) {
      showNotification(`已分享给 ${username}`, 'success');
      // 重新加载用户列表和已分享列表
      loadUsersForSharing();
    } else {
      const error = await response.json();
      showNotification(error.message || '分享失败', 'error');
    }
  } catch (error) {
    console.error('分享失败:', error);
    showNotification('分享失败', 'error');
  }
}

// 通用模态框控制
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('show');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('show');
  }
}

function closeShareModal() {
  document.getElementById('shareModal').classList.remove('show');
}

function openEditPlanModal() {
  const modal = document.getElementById('editPlanModal');
  const form = document.getElementById('editPlanForm');
  
  if (currentPlan) {
    form.title.value = currentPlan.title;
    form.description.value = currentPlan.description || '';
    form.defaultMap.value = currentPlan.defaultMap || 'openstreetmap';
  }
  
  modal.classList.add('show');
}

function closeEditPlanModal() {
  document.getElementById('editPlanModal').classList.remove('show');
}

// 编辑行程
function editDay(dayId) {
  const day = days.find(d => d.id === dayId);
  if (day) {
    openDayModal(day);
  }
}

// 删除行程
async function deleteDay(dayId) {
  if (!confirm('确定要删除这个行程安排吗？')) {
    return;
  }
  
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/days/${dayId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    
    if (!response.ok) {
      throw new Error('删除失败');
    }
    
    showNotification('行程删除成功', 'success');
    await loadDays();
    loadMap(); // 重新加载地图标记
    
  } catch (error) {
    console.error('删除行程失败:', error);
    showNotification('删除行程失败', 'error');
  }
}

// 下载文件
async function downloadFile(fileId) {
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/files/${fileId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    
    if (!response.ok) {
      throw new Error('下载失败');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    
    // 从响应头获取文件名
    const contentDisposition = response.headers.get('content-disposition');
    let filename = 'download';
    if (contentDisposition) {
      // 优先解析 filename*=UTF-8''... 格式（支持中文）
      const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
      if (filenameStarMatch) {
        filename = decodeURIComponent(filenameStarMatch[1]);
      } else {
        // 回退到普通 filename="..." 格式
        const filenameMatch = contentDisposition.match(/filename="(.+)"/i);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
    }
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
  } catch (error) {
    console.error('下载文件失败:', error);
    showNotification('下载文件失败', 'error');
  }
}

// 删除文件
async function deleteFile(fileId) {
  if (!confirm('确定要删除这个文件吗？')) {
    return;
  }
  
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    
    if (!response.ok) {
      throw new Error('删除失败');
    }
    
    showNotification('文件删除成功', 'success');
    await loadFiles();
    
  } catch (error) {
    console.error('删除文件失败:', error);
    showNotification('删除文件失败', 'error');
  }
}

// 加载已分享用户
async function loadSharedUsers() {
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/shares`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    
    if (response.ok) {
      const shares = await response.json();
      const container = document.getElementById('sharedUsersList');
      
      if (shares.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6b7280; margin: 20px 0;">暂无分享</p>';
      } else {
        container.innerHTML = shares.map(share => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; background: #f9fafb;">
            <div>
              <span style="font-weight: 500; color: #1f2937;">${share.sharedWithUser.username}</span>
              <small style="color: #6b7280; margin-left: 8px;">${share.sharedWithUser.email}</small>
              <span style="color: #059669; margin-left: 8px; font-size: 12px;">${share.permission}</span>
            </div>
            <button class="btn btn-danger" onclick="removeShare('${share.sharedWithUser.username}')" style="font-size: 12px; padding: 6px 8px;">
              <i class="fas fa-times"></i> 移除
            </button>
          </div>
        `).join('');
      }
    }
  } catch (error) {
    console.error('加载分享列表失败:', error);
  }
}

// 移除分享
async function removeShare(username) {
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/shares`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username })
    });
    
    if (!response.ok) {
      throw new Error('移除分享失败');
    }
    
    showNotification('已移除分享', 'success');
    // 重新加载用户列表和已分享列表
    loadUsersForSharing();
    
  } catch (error) {
    console.error('移除分享失败:', error);
    showNotification('移除分享失败', 'error');
  }
}

// 初始化地图按钮状态
function initMapButtons() {
  const osmBtn = document.getElementById('osmMapBtn');
  const baiduBtn = document.getElementById('baiduMapBtn');

  if (!osmBtn || !baiduBtn) return;

  osmBtn.classList.remove('btn-outline', 'btn-primary');
  baiduBtn.classList.remove('btn-outline', 'btn-primary');

  if (mapProvider === 'openstreetmap') {
    osmBtn.classList.add('btn-primary');
    baiduBtn.classList.add('btn-outline');
  } else {
    baiduBtn.classList.add('btn-primary');
    osmBtn.classList.add('btn-outline');
  }
  
  const routeModeBtn = document.getElementById('routeModeBtn');
  if (routeModeBtn) {
    routeModeBtn.classList.remove('btn-outline', 'btn-primary');
    routeModeBtn.classList.add(routeMode === 'real' ? 'btn-primary' : 'btn-outline');
  }
}

// 切换地图提供商
function switchMapProvider(provider) {
  if (provider === mapProvider) return;
  
  // 清理现有地图实例
  if (map) {
    if (mapProvider === 'openstreetmap' && map.remove) {
      map.remove();
    } else if (mapProvider === 'baidu' && map.clearOverlays) {
      map.clearOverlays();
    }
    map = null;
  }
  
  // 清理小地图
  if (miniMap) {
    try {
      if (mapProvider === 'openstreetmap') {
        miniMap.remove();
      } else if (mapProvider === 'baidu') {
        const container = document.getElementById('miniMapContainer');
        if (container) {
          container.innerHTML = '';
        }
      }
    } catch (error) {
      console.warn('清理小地图时出错:', error);
    }
    miniMap = null;
  }
  
  // 清理路线和标记
  markers = [];
  polylines = [];
  directionsService = null;
  directionsRenderer = null;
  baiduDrivingRoute = null;
  routePolyline = null;
  
  mapProvider = provider;
  
  // 更新按钮状态
  initMapButtons();
  
  // 重新加载地图
  loadMap().then(() => {
    // 如果小地图当前可见，重新创建它
    if (isFloatingMapVisible) {
      const container = document.getElementById('miniMapContainer');
      if (container) {
        createMiniMap(container);
      }
    }
  });
}

// 切换路线模式
function toggleRouteMode() {
  routeMode = routeMode === 'real' ? 'straight' : 'real';
  const modeText = document.getElementById('routeModeText');
  const modeBtn = document.getElementById('routeModeBtn');
  if (routeMode === 'real') {
    modeText.textContent = '真实路线';
    modeBtn.classList.remove('btn-outline');
    modeBtn.classList.add('btn-primary');
    modeBtn.style.background = '';
  } else {
    modeText.textContent = '直线连接';
    modeBtn.classList.remove('btn-primary');
    modeBtn.classList.add('btn-outline');
  }
  showNotification(`路线模式: ${routeMode === 'real' ? '真实路线' : '直线连接'}`, 'info');
  loadMap();
}

// 切换出行方式
function toggleRouteProfile() {
  const profiles = ['driving', 'cycling', 'walking'];
  const labels = ['驾车', '骑行', '步行'];
  const icons = ['fa-car', 'fa-bicycle', 'fa-walking'];
  const currentIndex = profiles.indexOf(routeProfile);
  const nextIndex = (currentIndex + 1) % profiles.length;
  
  routeProfile = profiles[nextIndex];
  document.getElementById('routeProfileText').textContent = labels[nextIndex];
  const iconEl = document.getElementById('routeProfileIcon');
  iconEl.className = 'fas ' + icons[nextIndex];
  
  showNotification(`出行方式: ${labels[nextIndex]}`, 'info');
  if (routeMode === 'real') {
    loadMap();
  }
}

// 清除路线
function clearRoute() {
  if (mapProvider === 'openstreetmap' && routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
    showNotification('路线已清除', 'success');
  } else if (mapProvider === 'baidu' && baiduDrivingRoute) {
    baiduDrivingRoute.clearResults();
    showNotification('路线已清除', 'success');
  }
}

// 移动端优化初始化
function initMobileOptimizations() {
  // 检测移动设备
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    // 添加移动端样式类
    document.body.classList.add('mobile-device');
    
    // 优化触摸滚动
    document.body.style.webkitOverflowScrolling = 'touch';
    
    // 禁用双击缩放
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
    
    // 添加触摸事件处理
    addTouchEventHandlers();
  }
}

// 添加触摸事件处理
function addTouchEventHandlers() {
  // 为按钮添加触摸反馈
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('touchstart', function() {
      this.style.transform = 'scale(0.95)';
    });
    
    btn.addEventListener('touchend', function() {
      this.style.transform = 'scale(1)';
    });
  });
  
  // 为卡片添加触摸效果
  document.querySelectorAll('.day-card, .file-card').forEach(card => {
    card.addEventListener('touchstart', function() {
      this.style.transform = 'scale(0.98)';
    });
    
    card.addEventListener('touchend', function() {
      this.style.transform = 'scale(1)';
    });
  });
  
  // 优化模态框在移动端的显示
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('touchmove', function(e) {
      // 防止背景滚动
      if (e.target === this) {
        e.preventDefault();
      }
    });
  });
}

// 事件监听器
document.addEventListener('DOMContentLoaded', () => {
  // 移动端适配初始化
  initMobileOptimizations();
  
  // 初始化地图按钮状态
  initMapButtons();
  
  // 地图提供商切换
  const osmMapBtn = document.getElementById('osmMapBtn');
  const baiduMapBtn = document.getElementById('baiduMapBtn');

  if (osmMapBtn) {
    osmMapBtn.addEventListener('click', () => {
      switchMapProvider('openstreetmap');
    });
  }

  if (baiduMapBtn) {
    baiduMapBtn.addEventListener('click', () => {
      switchMapProvider('baidu');
    });
  }
  
  // 刷新地图
  const refreshMapBtn = document.getElementById('refreshMapBtn');
  if (refreshMapBtn) {
    refreshMapBtn.addEventListener('click', () => {
      // 清理现有地图和相关变量
      markers = [];
      polylines = [];
      directionsService = null;
      directionsRenderer = null;
      baiduDrivingRoute = null;
      routePolyline = null;
      
      loadMap();
      showNotification('地图已刷新', 'success');
    });
  }
  
  // 路线控制功能已移除
  
  // 添加行程按钮
  const addDayBtn = document.getElementById('addDayBtn');
  if (addDayBtn) {
    addDayBtn.addEventListener('click', () => {
      openDayModal();
    });
  }

  // AI规划提示词按钮
  const aiPromptBtn = document.getElementById('aiPromptBtn');
  if (aiPromptBtn) {
    aiPromptBtn.addEventListener('click', () => { generateAIPrompt(); });
  }

  // 导入AI规划按钮
  const aiImportBtn = document.getElementById('aiImportBtn');
  if (aiImportBtn) {
    aiImportBtn.addEventListener('click', () => { openAIImportModal(); });
  }
  
  // 上传文件按钮
  const uploadFileBtn = document.getElementById('uploadFileBtn');
  if (uploadFileBtn) {
    uploadFileBtn.addEventListener('click', () => {
      openFileModal();
    });
  }
  
  // 分享按钮
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      sharePlan();
    });
  }
  
  // 编辑计划按钮
  const editPlanBtn = document.getElementById('editPlanBtn');
  if (editPlanBtn) {
    editPlanBtn.addEventListener('click', () => {
      openEditPlanModal();
    });
  }

  // 导出按钮
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      showExportOptions();
    });
  }

  // 打印按钮
  const printBtn = document.getElementById('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      printItinerary();
    });
  }

  // 机酒计划按钮
  const addBookingPlanBtn = document.getElementById('addBookingPlanBtn');
  if (addBookingPlanBtn) {
    addBookingPlanBtn.addEventListener('click', () => openBookingPlanModal());
  }
  const exportBookingsPdfBtn = document.getElementById('exportBookingsPdfBtn');
  if (exportBookingsPdfBtn) {
    exportBookingsPdfBtn.addEventListener('click', () => exportBookingsToPDF());
  }
  // 初始化机酒计划的下拉选项
  initBookingPlatformOptions();

  // 分享选项切换
  const enableSharingCheckbox = document.getElementById('enableSharing');
  if (enableSharingCheckbox) {
    enableSharingCheckbox.addEventListener('change', toggleShareOptions);
  }
  
  // 行程表单提交
  const dayForm = document.getElementById('dayForm');
  if (dayForm) {
    dayForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      setLoadingState(submitBtn, true);
    }
    
    try {
      const formData = new FormData(e.target);
      const editId = document.getElementById('editDayId').value;
      
      // 将FormData转换为JSON对象
      const data = {};
      for (let [key, value] of formData.entries()) {
        data[key] = value;
      }
      
      const url = editId 
        ? `/travenion/api/plans/${planId}/days/${editId}`
        : `/travenion/api/plans/${planId}/days`;
      
      const method = editId ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error(editId ? '更新行程失败' : '添加行程失败');
      }
      
      // 获取保存后的行程日ID
      let dayId = editId;
      if (!dayId) {
        const responseData = await response.json();
        dayId = responseData.id;
      }
      
      // 保存景点数据
      const attractionsSaved = await saveAttractions(dayId);
      if (!attractionsSaved) {
        showNotification('行程保存成功，但景点保存失败', 'warning');
      } else {
        showNotification(editId ? '行程更新成功' : '行程添加成功', 'success');
      }
      
      closeDayModal();
      await loadDays();
      loadMap(); // 重新加载地图标记
      
    } catch (error) {
      console.error('提交行程失败:', error);
      showNotification(error.message, 'error');
    } finally {
      if (submitBtn) {
        setLoadingState(submitBtn, false);
      }
    }
    });
  }
  
  // 文件上传表单
  const fileInput = document.getElementById('fileInput');
  const fileUploadArea = document.getElementById('fileUploadArea');
  const selectedFilesDiv = document.getElementById('selectedFiles');
  const uploadBtn = document.querySelector('#fileModal .btn-primary');
  
  // 文件选择
  fileInput.addEventListener('change', (e) => {
    updateSelectedFiles(e.target.files);
  });
  
  // 拖拽上传
  fileUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadArea.style.background = '#f0f9ff';
    fileUploadArea.style.borderColor = '#3b82f6';
  });
  
  fileUploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    fileUploadArea.style.background = '';
    fileUploadArea.style.borderColor = '';
  });
  
  fileUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUploadArea.style.background = '';
    fileUploadArea.style.borderColor = '';
    updateSelectedFiles(e.dataTransfer.files);
  });
  
  // 更新选中文件显示
  function updateSelectedFiles(files) {
    if (files.length === 0) {
      selectedFilesDiv.innerHTML = '';
      uploadBtn.disabled = true;
      return;
    }
    
    selectedFilesDiv.innerHTML = `
      <h4 style="margin-bottom: 10px;">选中的文件 (${files.length}个):</h4>
      ${Array.from(files).map(file => `
        <div style="display: flex; align-items: center; gap: 10px; padding: 8px; background: #f8fafc; border-radius: 6px; margin-bottom: 5px;">
          <span>${getFileIcon(file.name)}</span>
          <span style="flex: 1;">${file.name}</span>
          <span style="color: #6b7280; font-size: 12px;">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
        </div>
      `).join('')}
    `;
    
    uploadBtn.disabled = false;
    fileInput.files = files;
  }
  
  // 文件上传表单提交
  const fileForm = document.getElementById('fileForm');
  if (fileForm) {
    fileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    setLoadingState(submitBtn, true);
    
    try {
      const files = fileInput.files;
      
      // 逐个上传文件
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);
        
        const response = await fetch(`/travenion/api/plans/${planId}/files`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          body: formData
        });
        
        if (!response.ok) {
          throw new Error(`文件 ${files[i].name} 上传失败`);
        }
      }
      
      showNotification('文件上传成功', 'success');
      closeFileModal();
      await loadFiles();
      
    } catch (error) {
      console.error('文件上传失败:', error);
      showNotification('文件上传失败', 'error');
    } finally {
      setLoadingState(submitBtn, false);
    }
    });
  }
  
  // 分享表单提交
  const shareForm = document.getElementById('shareForm');
  if (shareForm) {
    shareForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    setLoadingState(submitBtn, true);
    
    try {
      const formData = new FormData(e.target);
      const username = formData.get('username');
      
      const response = await fetch(`/travenion/api/plans/${planId}/shares`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '分享失败');
      }
      
      showNotification('分享成功', 'success');
      e.target.reset();
      loadSharedUsers();
      
    } catch (error) {
      console.error('分享失败:', error);
      showNotification(error.message, 'error');
    } finally {
      setLoadingState(submitBtn, false);
    }
    });
  }
  
  // 编辑计划表单提交
  const editPlanForm = document.getElementById('editPlanForm');
  if (editPlanForm) {
    editPlanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    setLoadingState(submitBtn, true);
    
    try {
      const formData = new FormData(e.target);
      const data = {
        title: formData.get('title'),
        description: formData.get('description'),
        defaultMap: formData.get('defaultMap')
      };
      
      const response = await fetch(`/travenion/api/plans/${planId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error('更新计划失败');
      }
      
      showNotification('计划更新成功', 'success');
      closeEditPlanModal();
      await loadPlan();
      
    } catch (error) {
      console.error('更新计划失败:', error);
      showNotification('更新计划失败', 'error');
    } finally {
      setLoadingState(submitBtn, false);
    }
    });
  }
  
  // ESC键关闭模态框
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDayModal();
      closeFileModal();
      closeShareModal();
      closeEditPlanModal();
    }
  });
  
  // 点击模态框背景关闭
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
      }
    });
  });
});

// 页面加载动画
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.querySelectorAll('.fade-in').forEach((el, index) => {
      setTimeout(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, index * 100);
    });
  }, 100);
});

// 初始化
if (!localStorage.getItem('token')) {
  window.location.href = 'index.html';
} else {
  loadPlan();
}

// ==================== AI规划功能 ====================

// 生成AI规划提示词
function generateAIPrompt() {
  const planTitle = currentPlan ? (currentPlan.title || '旅行计划') : '旅行计划';
  const planDesc = currentPlan ? (currentPlan.description || '') : '';
  const existingDays = days && days.length > 0 ? days.length : 0;

  let existingInfo = '';
  if (existingDays > 0) {
    const sorted = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
    existingInfo = '\n\n## 已有行程（可参考或覆盖）\n';
    sorted.forEach(d => {
      const attractions = (d.attractionsList || []).map(a => a.name).join('、');
      existingInfo += `- 第${d.dayIndex}天 ${d.city || ''}：${attractions || '（暂无景点）'}\n`;
    });
  }

  const prompt = `你是一位专业的旅行规划师。请为以下旅行计划生成详细的行程安排。

## 旅行计划信息
- 标题：${planTitle}
- 描述：${planDesc || '（无）'}${existingInfo}

## 要求
1. 为每一天规划合理的游览路线，景点按地理位置就近排列
2. 每个景点提供准确的中文名称、地址
3. 估算每个景点的游览时长（分钟）
4. 给出每天的交通方式建议

## 输出格式（严格遵循，必须输出合法JSON，不要输出任何其他内容）
\`\`\`json
{
  "days": [
    {
      "dayIndex": 1,
      "date": "2024-01-01",
      "city": "东京",
      "transportation": "地铁",
      "attractions": [
        {
          "name": "浅草寺",
          "address": "东京都台东区浅草2-3-1",
          "description": "东京最古老的寺庙",
          "estimatedDuration": 90,
          "notes": "建议上午前往避开人流"
        },
        {
          "name": "东京塔",
          "address": "东京都港区芝公园4-2-8",
          "description": "东京地标建筑",
          "estimatedDuration": 60
        }
      ]
    },
    {
      "dayIndex": 2,
      "city": "横滨",
      "transportation": "JR线",
      "attractions": [
        {
          "name": "横滨港未来21",
          "address": "神奈川县横滨市西区",
          "description": "海滨公园",
          "estimatedDuration": 120
        }
      ]
    }
  ]
}
\`\`\`

## 注意事项
- dayIndex 从1开始递增
- date 为 YYYY-MM-DD 格式，若不确定可留空字符串 ""
- attractions 数组每项至少包含 name 和 address
- estimatedDuration 为整数分钟
- 只输出JSON，不要输出任何解释、前言或后语`;

  document.getElementById('aiPromptText').value = prompt;
  openModal('aiPromptModal');
}

// 自定义AI提示词需求
function customizeAIPrompt() {
  const customReq = prompt('请输入您的额外需求（例如：5天、预算中等、亲子游、避免购物点等）：', '5天，预算适中，亲子游');
  if (customReq && customReq.trim()) {
    const ta = document.getElementById('aiPromptText');
    ta.value = '## 额外需求\n' + customReq.trim() + '\n\n---\n\n' + ta.value;
    showNotification('已追加自定义需求', 'success');
  }
}

// 复制AI提示词
function copyAIPrompt() {
  const ta = document.getElementById('aiPromptText');
  ta.select();
  ta.setSelectionRange(0, 99999);
  try {
    document.execCommand('copy');
    showNotification('提示词已复制到剪贴板', 'success');
  } catch (e) {
    showNotification('复制失败，请手动选择复制', 'error');
  }
}

// 打开导入AI规划模态框
function openAIImportModal() {
  document.getElementById('aiImportText').value = '';
  document.getElementById('aiImportPreview').style.display = 'none';
  document.getElementById('aiImportPreview').innerHTML = '';
  document.getElementById('aiImportStatus').style.display = 'none';
  document.getElementById('aiImportStatus').innerHTML = '';
  document.getElementById('aiImportBtnText').textContent = '导入并完善';
  openModal('aiImportModal');
}

// 修正全角/半角符号、多余空格等异常字符
function sanitizeAIJSON(rawText) {
  if (!rawText) return null;
  let text = rawText.trim();

  // 去除AI常见的markdown代码块包裹 ```json ... ``` 或 ``` ... ```
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  // 如果AI在JSON前后输出了多余文字，尝试提取第一个 { 到最后一个 } 之间的内容
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  // 全角空格转半角
  text = text.replace(/\u3000/g, ' ');
  // 全角逗号、冒号转半角（仅在键值上下文中）
  text = text.replace(/，/g, ',').replace(/：/g, ':');
  // 全角引号转半角引号（包括「」『』）
  text = text.replace(/\u201c/g, '"').replace(/\u201d/g, '"');   // 中文双引号
  text = text.replace(/\u2018/g, "'").replace(/\u2019/g, "'");   // 中文单引号
  text = text.replace(/「/g, '"').replace(/」/g, '"');             // 直角引号
  text = text.replace(/『/g, '"').replace(/』/g, '"');
  // 去除键值中的尾随逗号（JSON末尾多余逗号）
  text = text.replace(/,\s*([}\]])/g, '$1');
  // 去除多余空格：键冒号后的空格规范化
  text = text.replace(/"\s*:\s*"/g, '": "');

  return text;
}

// 预览AI导入内容
function previewAIImport() {
  const rawText = document.getElementById('aiImportText').value;
  const previewDiv = document.getElementById('aiImportPreview');
  const statusDiv = document.getElementById('aiImportStatus');

  if (!rawText.trim()) {
    showNotification('请先粘贴AI返回的内容', 'error');
    return;
  }

  const cleaned = sanitizeAIJSON(rawText);
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    previewDiv.style.display = 'block';
    previewDiv.innerHTML = `<div style="padding: 12px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; color: #b91c1c;">
      <i class="fas fa-exclamation-circle"></i> <strong>JSON解析失败</strong><br>
      <span style="font-size: 12px;">${e.message}</span><br>
      <details style="margin-top: 8px;"><summary style="cursor: pointer; font-size: 12px;">查看修正后的内容</summary><pre style="font-size: 11px; max-height: 200px; overflow: auto; white-space: pre-wrap; margin-top: 8px;">${escapeHtml(cleaned)}</pre></details>
    </div>`;
    return;
  }

  if (!data.days || !Array.isArray(data.days) || data.days.length === 0) {
    previewDiv.style.display = 'block';
    previewDiv.innerHTML = `<div style="padding: 12px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; color: #b91c1c;">
      <i class="fas fa-exclamation-circle"></i> 未找到有效的 days 数组
    </div>`;
    return;
  }

  let totalAttractions = 0;
  let missingCoord = 0;
  const daysHtml = data.days.map(d => {
    const attractions = (d.attractions || []);
    totalAttractions += attractions.length;
    missingCoord += attractions.filter(a => !a.latitude || !a.longitude).length;
    const aHtml = attractions.map(a => `<li style="margin: 3px 0;"><i class="fas fa-map-pin" style="color: #3b82f6; font-size: 10px;"></i> ${escapeHtml(a.name || '')} ${a.estimatedDuration ? `<span style="color:#9ca3af;font-size:11px;">(${a.estimatedDuration}分钟)</span>` : ''}</li>`).join('');
    return `<div style="margin-bottom: 8px; padding: 8px; background: #f8fafc; border-radius: 6px;">
      <strong>第${d.dayIndex || '?'}天 · ${escapeHtml(d.city || '')}</strong>
      ${d.transportation ? `<span style="color:#9ca3af;font-size:11px;"> | ${escapeHtml(d.transportation)}</span>` : ''}
      <ul style="margin: 5px 0 0 20px; padding: 0; list-style: none;">${aHtml || '<li style="color:#9ca3af;font-size:12px;">无景点</li>'}</ul>
    </div>`;
  }).join('');

  previewDiv.style.display = 'block';
  previewDiv.innerHTML = `
    <div style="padding: 12px; background: #f0f9ff; border: 1px solid #93c5fd; border-radius: 8px;">
      <div style="font-weight: 600; margin-bottom: 8px;"><i class="fas fa-check-circle" style="color: #22c55e;"></i> 解析成功</div>
      <div style="font-size: 13px; color: #1f2937; margin-bottom: 10px;">
        共 <strong>${data.days.length}</strong> 天，<strong>${totalAttractions}</strong> 个景点
        ${missingCoord > 0 ? `<br><span style="color: #d97706; font-size: 12px;"><i class="fas fa-info-circle"></i> ${missingCoord}个景点缺少坐标，导入时将自动搜索补全</span>` : ''}
      </div>
      <div>${daysHtml}</div>
    </div>`;
  statusDiv.style.display = 'none';
}

// 通过geocode搜索补全景点坐标（复用后端 /api/attractions/geocode）
async function enrichAttractionWithGeocode(attraction) {
  // 已有有效坐标则跳过
  if (attraction.latitude && attraction.longitude &&
      !isNaN(parseFloat(attraction.latitude)) && !isNaN(parseFloat(attraction.longitude))) {
    return;
  }
  const query = attraction.address || attraction.name;
  if (!query) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`/travenion/api/attractions/geocode?q=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      const results = await response.json();
      if (results && results.length > 0) {
        attraction.latitude = results[0].lat;
        attraction.longitude = results[0].lng;
        // 若地址为空，用搜索结果补全
        if (!attraction.address) {
          attraction.address = results[0].name || results[0].display_name;
        }
      }
    }
  } catch (e) {
    console.warn('补全坐标失败:', attraction.name, e.message);
  }
}

// 执行AI导入
async function executeAIImport() {
  const rawText = document.getElementById('aiImportText').value;
  if (!rawText.trim()) {
    showNotification('请先粘贴AI返回的内容', 'error');
    return;
  }

  const cleaned = sanitizeAIJSON(rawText);
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    showNotification('JSON解析失败：' + e.message, 'error');
    return;
  }

  if (!data.days || !Array.isArray(data.days) || data.days.length === 0) {
    showNotification('未找到有效的行程数据', 'error');
    return;
  }

  const btnText = document.getElementById('aiImportBtnText');
  const statusDiv = document.getElementById('aiImportStatus');
  btnText.style.display = 'none';
  btnText.parentElement.querySelector('.loading').style.display = 'inline-block';

  try {
    // 先统计需要补全坐标的景点数
    let enrichmentCount = 0;
    let totalAttractions = 0;
    for (const day of data.days) {
      const attractions = day.attractions || [];
      totalAttractions += attractions.length;
      for (const a of attractions) {
        if (!a.latitude || !a.longitude) enrichmentCount++;
      }
    }

    statusDiv.style.display = 'block';

    // 第一步：补全坐标（带进度）
    if (enrichmentCount > 0) {
      let done = 0;
      statusDiv.innerHTML = `<div style="padding:10px; background:#fef3c7; border:1px solid #fcd34d; border-radius:8px; font-size:13px;">
        <i class="fas fa-spinner fa-spin"></i> 正在搜索并补全坐标 (${done}/${enrichmentCount})...
      </div>`;

      for (const day of data.days) {
        for (const a of (day.attractions || [])) {
          if (!a.latitude || !a.longitude) {
            await enrichAttractionWithGeocode(a);
            done++;
            statusDiv.innerHTML = `<div style="padding:10px; background:#fef3c7; border:1px solid #fcd34d; border-radius:8px; font-size:13px;">
              <i class="fas fa-spinner fa-spin"></i> 正在搜索并补全坐标 (${done}/${enrichmentCount})...
            </div>`;
          }
        }
      }
    }

    // 第二步：逐天创建行程和景点
    let dayDone = 0;
    const totalDays = data.days.length;
    statusDiv.innerHTML = `<div style="padding:10px; background:#dbeafe; border:1px solid #93c5fd; border-radius:8px; font-size:13px;">
      <i class="fas fa-spinner fa-spin"></i> 正在创建行程 (${dayDone}/${totalDays})...
    </div>`;

    for (const day of data.days) {
      // 创建行程日
      const dayBody = {
        dayIndex: parseInt(day.dayIndex) || (dayDone + 1),
        date: day.date || null,
        city: day.city || '未指定',
        transportation: day.transportation || ''
      };
      const dayResp = await fetch(`/travenion/api/plans/${planId}/days`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dayBody)
      });
      if (!dayResp.ok) throw new Error('创建行程日失败');
      const dayData = await dayResp.json();
      const newDayId = dayData.id;

      // 逐个创建景点
      for (const a of (day.attractions || [])) {
        const aBody = {
          name: a.name || '未命名景点',
          address: a.address || '',
          description: a.description || '',
          estimatedDuration: a.estimatedDuration ? parseInt(a.estimatedDuration) : null,
          notes: a.notes || ''
        };
        if (a.latitude && !isNaN(parseFloat(a.latitude))) aBody.latitude = parseFloat(a.latitude);
        if (a.longitude && !isNaN(parseFloat(a.longitude))) aBody.longitude = parseFloat(a.longitude);
        await fetch(`/travenion/api/attractions/day/${newDayId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(aBody)
        });
      }

      dayDone++;
      statusDiv.innerHTML = `<div style="padding:10px; background:#dbeafe; border:1px solid #93c5fd; border-radius:8px; font-size:13px;">
        <i class="fas fa-spinner fa-spin"></i> 正在创建行程 (${dayDone}/${totalDays})...
      </div>`;
    }

    statusDiv.innerHTML = `<div style="padding:10px; background:#d1fae5; border:1px solid #6ee7b7; border-radius:8px; font-size:13px;">
      <i class="fas fa-check-circle"></i> 导入成功！共创建 ${totalDays} 天行程，${totalAttractions} 个景点。
    </div>`;

    showNotification('AI规划导入成功', 'success');
    closeModal('aiImportModal');
    await loadDays();
    loadMap();
  } catch (error) {
    console.error('AI导入失败:', error);
    statusDiv.innerHTML = `<div style="padding:10px; background:#fef2f2; border:1px solid #fca5a5; border-radius:8px; font-size:13px; color:#b91c1c;">
      <i class="fas fa-exclamation-circle"></i> 导入失败：${error.message}
    </div>`;
    showNotification('导入失败：' + error.message, 'error');
  } finally {
    btnText.style.display = 'inline';
    btnText.parentElement.querySelector('.loading').style.display = 'none';
  }
}

// ==================== 景点管理功能 ====================

// 加载行程日的景点列表
async function loadDayAttractions(dayId) {
  try {
    const response = await fetch(`/travenion/api/attractions/day/${dayId}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (response.ok) {
      currentDayAttractions = await response.json();
      renderAttractionsList();
    } else {
      currentDayAttractions = [];
      renderAttractionsList();
    }
  } catch (error) {
    console.error('加载景点失败:', error);
    currentDayAttractions = [];
    renderAttractionsList();
  }
}

// 渲染景点列表
function renderAttractionsList() {
  const container = document.getElementById('attractionsContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (currentDayAttractions.length === 0) {
    container.innerHTML = '<p style="color: #666; text-align: center; margin: 10px 0;">暂无景点，点击下方按钮添加</p>';
    return;
  }
  
  currentDayAttractions.forEach((attraction, index) => {
    const attractionItem = document.createElement('div');
    attractionItem.className = 'attraction-item';
    attractionItem.style.cssText = `
      display: flex;
      align-items: center;
      padding: 10px;
      margin-bottom: 8px;
      background: white;
      border: 1px solid #e1e5e9;
      border-radius: 6px;
      position: relative;
    `;
    
    attractionItem.innerHTML = `
      <div class="attraction-clickable" style="flex: 1; min-width: 0; cursor: pointer;">
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <span style="background: #007bff; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 8px;">${index + 1}</span>
          <strong style="color: #333;">${attraction.name}</strong>
          <span style="margin-left: 8px; color: #007bff; font-size: 12px;">📍 点击查看</span>
        </div>
        ${attraction.description ? `<p style="margin: 0; color: #666; font-size: 14px;">${attraction.description}</p>` : ''}
        ${attraction.address ? `<p style="margin: 2px 0 0 0; color: #888; font-size: 12px;"><i class="fas fa-map-marker-alt"></i> ${attraction.address}</p>` : ''}
      </div>
      <div style="display: flex; gap: 5px; margin-left: 10px;">
        <button type="button" onclick="editAttractionItem(${index})" style="background: #28a745; color: white; border: none; border-radius: 4px; padding: 5px 8px; font-size: 12px; cursor: pointer;">
          <i class="fas fa-edit"></i>
        </button>
        <button type="button" onclick="deleteAttractionItem(${index})" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 5px 8px; font-size: 12px; cursor: pointer;">
          <i class="fas fa-trash"></i>
        </button>
        ${index > 0 ? `<button type="button" onclick="moveAttractionUp(${index})" style="background: #6c757d; color: white; border: none; border-radius: 4px; padding: 5px 8px; font-size: 12px; cursor: pointer;"><i class="fas fa-arrow-up"></i></button>` : ''}
        ${index < currentDayAttractions.length - 1 ? `<button type="button" onclick="moveAttractionDown(${index})" style="background: #6c757d; color: white; border: none; border-radius: 4px; padding: 5px 8px; font-size: 12px; cursor: pointer;"><i class="fas fa-arrow-down"></i></button>` : ''}
        <button type="button" onclick="copyAttraction(${index})" style="background: #17a2b8; color: white; border: none; border-radius: 4px; padding: 5px 8px; font-size: 12px; cursor: pointer;" title="复制景点">
          <i class="fas fa-copy"></i>
        </button>
      </div>
    `;
    
    // 添加点击事件监听器
    const clickableDiv = attractionItem.querySelector('.attraction-clickable');
    clickableDiv.addEventListener('click', () => {
      highlightAttractionOnMap(attraction.name);
    });
    
    // 添加悬停效果
    clickableDiv.addEventListener('mouseover', () => {
      clickableDiv.style.backgroundColor = '#f8f9fa';
    });
    clickableDiv.addEventListener('mouseout', () => {
      clickableDiv.style.backgroundColor = 'transparent';
    });
    
    container.appendChild(attractionItem);
  });
}

// 景点编辑相关变量
let currentEditingAttraction = null;
let isEditingAttraction = false;

// 景点剪贴板变量
let copiedAttraction = null;

// 地理编码搜索相关变量
let geocodeTimer = null;
let selectedGeocodeResult = null;
let geocodeRequestId = 0;

// 添加景点项
function addAttractionItem() {
  currentEditingAttraction = null;
  isEditingAttraction = false;
  selectedGeocodeResult = null;
  document.getElementById('attractionModalTitle').textContent = '添加景点';
  document.getElementById('attractionSaveText').textContent = '保存';
  document.getElementById('attractionName').value = '';
  document.getElementById('attractionAddress').value = '';
  document.getElementById('attractionDescription').value = '';
  document.getElementById('attractionLatitude').value = '';
  document.getElementById('attractionLongitude').value = '';
  const searchInput = document.getElementById('attractionSearchInput');
  if (searchInput) searchInput.value = '';
  document.getElementById('geocodeResults').innerHTML = '';
  document.getElementById('geocodeResults').style.display = 'none';
  openModal('attractionModal');
}

// 关闭景点模态框
function closeAttractionModal() {
  closeModal('attractionModal');
  currentEditingAttraction = null;
  isEditingAttraction = false;
  selectedGeocodeResult = null;
  document.getElementById('geocodeResults').innerHTML = '';
  document.getElementById('geocodeResults').style.display = 'none';
}

// 执行地理编码搜索
async function searchGeocode(query) {
  const resultsContainer = document.getElementById('geocodeResults');
  if (!query || query.trim().length === 0) {
    resultsContainer.style.display = 'none';
    resultsContainer.innerHTML = '';
    return;
  }

  // 请求计数器，用于忽略过期的搜索结果
  const currentRequestId = ++geocodeRequestId;

  resultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #6b7280;"><i class="fas fa-spinner fa-spin"></i> 搜索中...</div>';
  resultsContainer.style.display = 'block';

  // 前端超时保护，防止后端响应过慢时无限等待
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`/travenion/api/attractions/geocode?q=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error('搜索失败');
    }

    const results = await response.json();

    // 如果在等待期间用户又输入了新内容，忽略此次结果
    if (currentRequestId !== geocodeRequestId) return;

    if (results.length === 0) {
      resultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #9ca3af;">未找到匹配的地点，请尝试更详细的地址或直接输入经纬度</div>';
      return;
    }

    resultsContainer.innerHTML = results.map((result, index) => {
      const lat = typeof result.lat === 'number' ? result.lat : parseFloat(result.lat);
      const lng = typeof result.lng === 'number' ? result.lng : parseFloat(result.lng);
      const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      const sourceLabel = result.source === 'nominatim' || result.source === 'photon' ? 'OSM' : result.source === 'baidu' ? '百度' : '坐标';
      return `
      <div class="geocode-result-item" data-index="${index}"
           style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.15s;"
           onclick="selectGeocodeResult(${index})">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: #3b82f6; font-size: 14px;"><i class="fas fa-map-marker-alt"></i></span>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; color: #1f2937; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${result.name}</div>
            <div style="color: #6b7280; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${result.display_name}</div>
          </div>
          <span style="color: #9ca3af; font-size: 10px; flex-shrink: 0;">${sourceLabel}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px; padding-left: 22px; flex-wrap: wrap;">
          <span style="color: #9ca3af; font-size: 11px;"><i class="fas fa-crosshairs"></i> ${coordStr}</span>
          <button type="button" onclick="event.stopPropagation(); selectGeocodeAsCoordinate(${index})"
                  style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer;">
            填入坐标
          </button>
        </div>
      </div>
    `;
    }).join('');

    resultsContainer._geocodeResults = results;

    resultsContainer.querySelectorAll('.geocode-result-item').forEach(item => {
      item.addEventListener('mouseover', () => {
        item.style.background = '#f0f9ff';
      });
      item.addEventListener('mouseout', () => {
        item.style.background = '';
      });
    });

  } catch (error) {
    clearTimeout(timeoutId);
    // 忽略过期的请求结果
    if (currentRequestId !== geocodeRequestId) return;

    if (error.name === 'AbortError') {
      resultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #ef4444;">搜索超时，请重试</div>';
    } else {
      console.error('地理编码搜索失败:', error);
      resultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #ef4444;">搜索失败，请重试</div>';
    }
  }
}

// 选择地理编码结果（填入地点全名）
function selectGeocodeResult(index) {
  const resultsContainer = document.getElementById('geocodeResults');
  const results = resultsContainer._geocodeResults;
  if (!results || !results[index]) return;
  
  const result = results[index];
  selectedGeocodeResult = result;
  
  document.getElementById('attractionAddress').value = result.name || result.display_name;
  document.getElementById('attractionLatitude').value = result.lat;
  document.getElementById('attractionLongitude').value = result.lng;
  
  highlightGeocodeItem(index);
  showNotification(`已填入名称: ${result.name}`, 'success');
}

// 选择地理编码结果（填入经纬度坐标）
function selectGeocodeAsCoordinate(index) {
  const resultsContainer = document.getElementById('geocodeResults');
  const results = resultsContainer._geocodeResults;
  if (!results || !results[index]) return;
  
  const result = results[index];
  selectedGeocodeResult = result;
  
  const lat = typeof result.lat === 'number' ? result.lat : parseFloat(result.lat);
  const lng = typeof result.lng === 'number' ? result.lng : parseFloat(result.lng);
  const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  
  document.getElementById('attractionAddress').value = coordStr;
  document.getElementById('attractionLatitude').value = result.lat;
  document.getElementById('attractionLongitude').value = result.lng;
  
  highlightGeocodeItem(index);
  showNotification(`已填入坐标: ${coordStr}`, 'success');
}

// 高亮选中的搜索结果项
function highlightGeocodeItem(index) {
  const resultsContainer = document.getElementById('geocodeResults');
  resultsContainer.querySelectorAll('.geocode-result-item').forEach((item, i) => {
    item.style.background = i === index ? '#dbeafe' : '';
    item.style.borderLeft = i === index ? '3px solid #3b82f6' : '';
  });
}

// 触发地理编码搜索（带防抖）
function triggerGeocodeSearch(inputValue) {
  if (geocodeTimer) clearTimeout(geocodeTimer);
  selectedGeocodeResult = null;
  document.getElementById('attractionLatitude').value = '';
  document.getElementById('attractionLongitude').value = '';
  
  geocodeTimer = setTimeout(() => {
    searchGeocode(inputValue);
  }, 500);
}

// 保存景点
function saveAttraction() {
  const name = document.getElementById('attractionName').value.trim();
  if (!name) {
    alert('请输入景点名称');
    return;
  }
  
  const address = document.getElementById('attractionAddress').value.trim();
  const description = document.getElementById('attractionDescription').value.trim();
  const latitude = document.getElementById('attractionLatitude').value ? parseFloat(document.getElementById('attractionLatitude').value) : null;
  const longitude = document.getElementById('attractionLongitude').value ? parseFloat(document.getElementById('attractionLongitude').value) : null;
  
  if (isEditingAttraction && currentEditingAttraction !== null) {
    currentDayAttractions[currentEditingAttraction] = {
      ...currentDayAttractions[currentEditingAttraction],
      name: name,
      address: address,
      description: description,
      latitude: latitude,
      longitude: longitude
    };
  } else {
    const newAttraction = {
      name: name,
      description: description,
      address: address,
      latitude: latitude,
      longitude: longitude,
      visitOrder: currentDayAttractions.length + 1
    };
    currentDayAttractions.push(newAttraction);
  }
  
  renderAttractionsList();
  closeAttractionModal();
}

// 编辑景点项
function editAttractionItem(index) {
  const attraction = currentDayAttractions[index];
  if (!attraction) return;
  
  currentEditingAttraction = index;
  isEditingAttraction = true;
  selectedGeocodeResult = null;
  document.getElementById('attractionModalTitle').textContent = '编辑景点';
  document.getElementById('attractionSaveText').textContent = '更新';
  document.getElementById('attractionName').value = attraction.name || '';
  document.getElementById('attractionAddress').value = attraction.address || '';
  document.getElementById('attractionDescription').value = attraction.description || '';
  document.getElementById('attractionLatitude').value = attraction.latitude || '';
  document.getElementById('attractionLongitude').value = attraction.longitude || '';
  const searchInput = document.getElementById('attractionSearchInput');
  if (searchInput) searchInput.value = '';
  document.getElementById('geocodeResults').innerHTML = '';
  document.getElementById('geocodeResults').style.display = 'none';
  openModal('attractionModal');
}

// 删除景点项
function deleteAttractionItem(index) {
  if (!confirm('确定要删除这个景点吗？')) return;
  
  currentDayAttractions.splice(index, 1);
  // 重新排序
  currentDayAttractions.forEach((attraction, i) => {
    attraction.visitOrder = i + 1;
  });
  renderAttractionsList();
}

// 上移景点
function moveAttractionUp(index) {
  if (index <= 0) return;
  
  const temp = currentDayAttractions[index];
  currentDayAttractions[index] = currentDayAttractions[index - 1];
  currentDayAttractions[index - 1] = temp;
  
  // 更新访问顺序
  currentDayAttractions.forEach((attraction, i) => {
    attraction.visitOrder = i + 1;
  });
  
  renderAttractionsList();
}

// 下移景点
function moveAttractionDown(index) {
  if (index >= currentDayAttractions.length - 1) return;
  
  const temp = currentDayAttractions[index];
  currentDayAttractions[index] = currentDayAttractions[index + 1];
  currentDayAttractions[index + 1] = temp;
  
  // 更新访问顺序
  currentDayAttractions.forEach((attraction, i) => {
    attraction.visitOrder = i + 1;
  });
  
  renderAttractionsList();
}

// 复制景点
function copyAttraction(index) {
  if (index < 0 || index >= currentDayAttractions.length) return;
  
  // 深拷贝景点信息
  copiedAttraction = {
    name: currentDayAttractions[index].name,
    address: currentDayAttractions[index].address || '',
    description: currentDayAttractions[index].description || ''
  };
  
  showNotification(`已复制景点: ${copiedAttraction.name}`, 'success');
  
  // 更新粘贴按钮状态
  updatePasteButtonsState();
}

// 从主页面复制景点
function copyMainAttraction(dayId, attractionIndex) {
  // 找到对应的行程日
  const day = days.find(d => d.id === dayId);
  if (!day || !day.attractionsList || attractionIndex < 0 || attractionIndex >= day.attractionsList.length) {
    showNotification('景点信息无效', 'error');
    return;
  }
  
  // 深拷贝景点信息
  copiedAttraction = {
    name: day.attractionsList[attractionIndex].name,
    address: day.attractionsList[attractionIndex].address || '',
    description: day.attractionsList[attractionIndex].description || ''
  };
  
  showNotification(`已复制景点: ${copiedAttraction.name}`, 'success');
  
  // 更新粘贴按钮状态
  updatePasteButtonsState();
}

// 导航到景点功能
function navigateToAttraction(attractionName, attractionAddress) {
  // 构建搜索查询，优先使用地址，如果没有地址则使用景点名称
  const query = attractionAddress || attractionName;
  
  // 检测设备类型
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  
  if (isMobile) {
    // 移动端：显示导航应用选择器
    showNavigationSelector(attractionName, query, isIOS, isAndroid);
  } else {
    // PC端：显示导航选择器
    showPCNavigationSelector(attractionName, query);
  }
}

// 显示导航应用选择器
function showNavigationSelector(attractionName, query, isIOS, isAndroid) {
  // 创建模态框
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
    box-sizing: border-box;
  `;
  
  // 创建选择器内容
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 20px;
    max-width: 400px;
    width: 100%;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  `;
  
  // 标题
  const title = document.createElement('h3');
  title.textContent = `选择导航应用`;
  title.style.cssText = `
    margin: 0 0 15px 0;
    color: #333;
    text-align: center;
    font-size: 18px;
  `;
  
  // 景点信息
  const info = document.createElement('p');
  info.textContent = `导航到: ${attractionName}`;
  info.style.cssText = `
    margin: 0 0 20px 0;
    color: #666;
    text-align: center;
    font-size: 14px;
  `;
  
  // 按钮容器
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;
  
  // 定义导航选项
  const navigationOptions = [];
  
  if (isIOS) {
    navigationOptions.push(
      {
        name: 'Apple 地图',
        icon: '🗺️',
        url: `maps://maps.apple.com/?q=${encodeURIComponent(query)}&dirflg=d`,
        color: '#007AFF'
      },
      {
        name: 'Google 地图',
        icon: '🌍',
        url: `comgooglemaps://?q=${encodeURIComponent(query)}&directionsmode=driving`,
        fallback: `https://maps.google.com/maps?q=${encodeURIComponent(query)}&navigate=yes`,
        color: '#4285F4'
      },
      {
        name: '高德地图',
        icon: '🧭',
        url: `iosamap://path?sourceApplication=Travenion&dname=${encodeURIComponent(attractionName)}&dlat=&dlon=&dev=0&t=0`,
        fallback: `https://uri.amap.com/navigation?to=${encodeURIComponent(query)}`,
        color: '#00C853'
      },
      {
        name: '百度地图',
        icon: '📍',
        url: `baidumap://map/direction?destination=name:${encodeURIComponent(attractionName)}&mode=driving&src=Travenion`,
        fallback: `https://map.baidu.com/?qt=nav&tn=H_APP&c=1&sc=1&ec=1&sn=0&en=0&rn=${encodeURIComponent(query)}`,
        color: '#3F51B5'
      }
    );
  } else if (isAndroid) {
    navigationOptions.push(
      {
        name: 'Google 地图',
        icon: '🌍',
        url: `google.navigation:q=${encodeURIComponent(query)}`,
        fallback: `https://maps.google.com/maps?q=${encodeURIComponent(query)}&navigate=yes`,
        color: '#4285F4'
      },
      {
        name: '高德地图',
        icon: '🧭',
        url: `androidamap://path?sourceApplication=Travenion&dname=${encodeURIComponent(attractionName)}&dlat=&dlon=&dev=0&t=0`,
        fallback: `https://uri.amap.com/navigation?to=${encodeURIComponent(query)}`,
        color: '#00C853'
      },
      {
        name: '百度地图',
        icon: '📍',
        url: `baidumap://map/direction?destination=name:${encodeURIComponent(attractionName)}&mode=driving&src=Travenion`,
        fallback: `https://map.baidu.com/?qt=nav&tn=H_APP&c=1&sc=1&ec=1&sn=0&en=0&rn=${encodeURIComponent(query)}`,
        color: '#3F51B5'
      }
    );
  }
  
  // 添加网页版选项
  navigationOptions.push({
    name: '网页版地图',
    icon: '💻',
    url: `https://maps.google.com/maps?q=${encodeURIComponent(query)}&navigate=yes`,
    color: '#757575'
  });
  
  // 创建导航按钮
  navigationOptions.forEach(option => {
    const button = document.createElement('button');
    button.innerHTML = `${option.icon} ${option.name}`;
    button.style.cssText = `
      padding: 15px;
      border: none;
      border-radius: 8px;
      background: ${option.color};
      color: white;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    `;
    
    button.addEventListener('click', () => {
      document.body.removeChild(modal);
      
      if (option.fallback) {
        // 尝试打开应用，失败则使用网页版
        let appOpened = false;
        
        // 监听页面可见性变化，判断应用是否成功打开
        const handleVisibilityChange = () => {
          if (document.hidden) {
            appOpened = true;
          }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // 尝试打开应用
        window.location.href = option.url;
        
        // 延迟检查是否成功打开应用
        setTimeout(() => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          if (!appOpened) {
            // 应用未打开，使用网页版
            window.open(option.fallback, '_blank');
          }
        }, 2000);
      } else {
        // 直接打开
        if (option.url.startsWith('http')) {
          window.open(option.url, '_blank');
        } else {
          window.location.href = option.url;
        }
      }
      
      showNotification(`正在使用${option.name}导航到: ${attractionName}`, 'success');
    });
    
    // 悬停效果
    button.addEventListener('mouseover', () => {
      button.style.opacity = '0.8';
    });
    
    button.addEventListener('mouseout', () => {
      button.style.opacity = '1';
    });
    
    buttonContainer.appendChild(button);
  });
  
  // 取消按钮
  const cancelButton = document.createElement('button');
  cancelButton.textContent = '取消';
  cancelButton.style.cssText = `
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: white;
    color: #666;
    font-size: 16px;
    cursor: pointer;
    margin-top: 10px;
  `;
  
  cancelButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  // 组装模态框
  content.appendChild(title);
  content.appendChild(info);
  content.appendChild(buttonContainer);
  content.appendChild(cancelButton);
  modal.appendChild(content);
  
  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
  
  // 显示模态框
  document.body.appendChild(modal);
}

// PC端导航选择器
function showPCNavigationSelector(attractionName, query) {
  // 创建模态框
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
    box-sizing: border-box;
  `;
  
  // 创建选择器内容
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 20px;
    max-width: 500px;
    width: 100%;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  `;
  
  // 标题
  const title = document.createElement('h3');
  title.textContent = `选择导航服务`;
  title.style.cssText = `
    margin: 0 0 15px 0;
    color: #333;
    text-align: center;
    font-size: 18px;
  `;
  
  // 景点信息
  const info = document.createElement('p');
  info.textContent = `导航到: ${attractionName}`;
  info.style.cssText = `
    margin: 0 0 20px 0;
    color: #666;
    text-align: center;
    font-size: 14px;
  `;
  
  // 按钮容器
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
  `;
  
  // PC端导航选项
  const navigationOptions = [
    {
      name: 'Google 地图',
      icon: '🌍',
      url: `https://maps.google.com/maps?q=${encodeURIComponent(query)}&navigate=yes`,
      color: '#4285F4',
      description: '全球覆盖，路况实时'
    },
    {
      name: '高德地图',
      icon: '🧭',
      url: `https://uri.amap.com/navigation?to=${encodeURIComponent(query)}`,
      color: '#00C853',
      description: '国内精准，路况详细'
    },
    {
       name: '百度地图',
       icon: '📍',
       url: `https://map.baidu.com/?qt=s&wd=${encodeURIComponent(query)}&c=1`,
       color: '#3F51B5',
       description: '本土化强，POI丰富'
     },
    {
       name: 'OpenStreetMap',
       icon: '🗺️',
       url: `https://www.openstreetmap.org/directions?from=&to=${encodeURIComponent(query)}#map=15`,
       color: '#7EBC6F',
       description: '开源地图，社区维护'
     }
  ];
  
  // 创建导航按钮
  navigationOptions.forEach(option => {
    const button = document.createElement('button');
    button.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
        <span style="font-size: 20px;">${option.icon}</span>
        <span style="font-weight: 600;">${option.name}</span>
      </div>
      <div style="font-size: 12px; color: rgba(255,255,255,0.8); text-align: left;">${option.description}</div>
    `;
    button.style.cssText = `
      padding: 15px;
      border: none;
      border-radius: 8px;
      background: ${option.color};
      color: white;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: left;
      min-height: 70px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    `;
    
    button.addEventListener('click', () => {
      document.body.removeChild(modal);
      window.open(option.url, '_blank');
      showNotification(`正在使用${option.name}导航到: ${attractionName}`, 'success');
    });
    
    // 悬停效果
    button.addEventListener('mouseover', () => {
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    });
    
    button.addEventListener('mouseout', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = 'none';
    });
    
    buttonContainer.appendChild(button);
  });
  
  // 取消按钮
  const cancelButton = document.createElement('button');
  cancelButton.textContent = '取消';
  cancelButton.style.cssText = `
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: white;
    color: #666;
    font-size: 16px;
    cursor: pointer;
    margin-top: 20px;
    width: 100%;
    transition: all 0.2s ease;
  `;
  
  cancelButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  cancelButton.addEventListener('mouseover', () => {
    cancelButton.style.background = '#f5f5f5';
  });
  
  cancelButton.addEventListener('mouseout', () => {
    cancelButton.style.background = 'white';
  });
  
  // 组装模态框
  content.appendChild(title);
  content.appendChild(info);
  content.appendChild(buttonContainer);
  content.appendChild(cancelButton);
  modal.appendChild(content);
  
  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
  
  // ESC键关闭
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(modal);
      document.removeEventListener('keydown', handleKeyDown);
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  
  // 显示模态框
  document.body.appendChild(modal);
}

// 更新粘贴按钮状态
function updatePasteButtonsState() {
  const pasteButtons = document.querySelectorAll('.paste-btn');
  pasteButtons.forEach(button => {
    if (copiedAttraction) {
      button.style.background = '#17a2b8';
      button.style.color = 'white';
      button.style.border = '1px solid #17a2b8';
      button.style.cursor = 'pointer';
      button.title = `粘贴景点: ${copiedAttraction.name}`;
      button.innerHTML = `<i class="fas fa-paste"></i> 粘贴 (${copiedAttraction.name})`;
    } else {
      button.style.background = '#e9ecef';
      button.style.color = '#6c757d';
      button.style.border = '1px solid #dee2e6';
      button.style.cursor = 'not-allowed';
      button.title = '剪贴板为空';
      button.innerHTML = '<i class="fas fa-paste"></i> 粘贴';
    }
  });
}

// 粘贴景点到指定行程日
async function pasteAttraction(dayId) {
  if (!copiedAttraction) {
    showNotification('剪贴板为空，请先复制一个景点', 'warning');
    return;
  }
  
  try {
    // 加载目标行程日的景点列表
    await loadDayAttractions(dayId);
    
    // 添加复制的景点到列表末尾
    currentDayAttractions.push({
      name: copiedAttraction.name,
      address: copiedAttraction.address,
      description: copiedAttraction.description
    });
    
    // 保存到服务器
    await saveAttractions(dayId);
    
    showNotification(`已将景点 "${copiedAttraction.name}" 粘贴到行程中`, 'success');
    
    // 重新加载行程日列表以更新显示
    await loadDays();
    renderDays();
    
    // 重新加载地图标记
    await addMapMarkers();
    
  } catch (error) {
    console.error('粘贴景点失败:', error);
    showNotification('粘贴景点失败，请重试', 'error');
  }
}

// 保存景点到服务器
async function saveAttractions(dayId) {
  try {
    // 获取现有景点
    const existingResponse = await fetch(`/travenion/api/attractions/day/${dayId}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (existingResponse.ok) {
      const existingAttractions = await existingResponse.json();
      // 删除现有景点
      for (const attraction of existingAttractions) {
        await fetch(`/travenion/api/attractions/${attraction.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
      }
    }
    
    // 添加新的景点
    for (const attraction of currentDayAttractions) {
      const body = {
        name: attraction.name,
        address: attraction.address,
        description: attraction.description,
        estimatedDuration: attraction.estimatedDuration,
        notes: attraction.notes
      };
      if (attraction.latitude) body.latitude = attraction.latitude;
      if (attraction.longitude) body.longitude = attraction.longitude;
      await fetch(`/travenion/api/attractions/day/${dayId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    }
    
    return true;
  } catch (error) {
    console.error('保存景点失败:', error);
    return false;
  }
}

// 浮动小地图功能
let miniMap = null;
let isFloatingMapVisible = false;
let mainMapContainer = null;

// 初始化浮动小地图
function initFloatingMiniMap() {
  mainMapContainer = document.querySelector('.map-container');
  const floatingMiniMap = document.getElementById('floatingMiniMap');
  const closeMiniMapBtn = document.getElementById('closeMiniMap');
  
  // 关闭按钮事件
  if (closeMiniMapBtn) {
    closeMiniMapBtn.addEventListener('click', hideFloatingMiniMap);
  }
  
  // 滚动监听
  window.addEventListener('scroll', handleScroll);
  
  // 窗口大小变化监听
  window.addEventListener('resize', handleResize);
  
  // 初始化拖拽调整大小功能（仅PC端）
  if (!isMobileDevice()) {
    initMiniMapResize();
  }
}

// 处理滚动事件
function handleScroll() {
  if (!mainMapContainer) return;
  
  const rect = mainMapContainer.getBoundingClientRect();
  const isMainMapVisible = rect.bottom > 0 && rect.top < window.innerHeight;
  
  if (!isMainMapVisible && !isFloatingMapVisible && map) {
    showFloatingMiniMap();
  } else if (isMainMapVisible && isFloatingMapVisible) {
    hideFloatingMiniMap();
  }
}

// 显示浮动小地图
function showFloatingMiniMap() {
  const floatingMiniMap = document.getElementById('floatingMiniMap');
  const miniMapContainer = document.getElementById('miniMap');
  
  if (!floatingMiniMap || !miniMapContainer || !map) return;
  
  floatingMiniMap.style.display = 'block';
  isFloatingMapVisible = true;
  
  // 延迟创建小地图，确保容器已显示
  setTimeout(() => {
    createMiniMap(miniMapContainer);
  }, 100);
}

// 隐藏浮动小地图
function hideFloatingMiniMap() {
  const floatingMiniMap = document.getElementById('floatingMiniMap');
  
  if (!floatingMiniMap) return;
  
  floatingMiniMap.style.display = 'none';
  isFloatingMapVisible = false;
  
  // 清理小地图
  if (miniMap) {
    try {
      if (mapProvider === 'openstreetmap') {
        miniMap.remove();
      } else if (mapProvider === 'baidu') {
        // 百度地图没有destroy方法，直接清空容器
        const container = document.getElementById('miniMapContainer');
        if (container) {
          container.innerHTML = '';
        }
      }
    } catch (error) {
      console.warn('清理小地图时出错:', error);
    }
    miniMap = null;
  }
}

// 创建小地图
function createMiniMap(container) {
  if (miniMap) return;
  
  try {
    if (mapProvider === 'openstreetmap') {
      createOSMMiniMap(container);
    } else if (mapProvider === 'baidu') {
      createBaiduMiniMap(container);
    }
  } catch (error) {
    console.error('创建小地图失败:', error);
  }
}

// 创建OpenStreetMap小地图
function createOSMMiniMap(container) {
  if (!window.L || !map) return;
  
  const center = map.getCenter();
  const zoom = Math.max(map.getZoom() - 2, 1);
  
  miniMap = L.map(container, {
    center: [center.lat, center.lng],
    zoom: zoom,
    zoomControl: false,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false
  });
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(miniMap);
  
  // 同步主地图的标记
  syncMarkersToMiniMap();
  
  // 监听主地图变化
  map.on('moveend zoomend', () => {
    if (miniMap && isFloatingMapVisible) {
      const newCenter = map.getCenter();
      const newZoom = Math.max(map.getZoom() - 2, 1);
      miniMap.setView([newCenter.lat, newCenter.lng], newZoom);
    }
  });
}

// 创建百度地图小地图
function createBaiduMiniMap(container) {
  if (!window.BMap || !map) return;
  
  const center = map.getCenter();
  const zoom = Math.max(map.getZoom() - 2, 3);
  
  miniMap = new BMap.Map(container, {
    enableMapClick: false
  });
  
  miniMap.centerAndZoom(center, zoom);
  miniMap.disableScrollWheelZoom();
  miniMap.disableDoubleClickZoom();
  
  // 同步主地图的标记
  syncMarkersToMiniMap();
  
  // 监听主地图变化
  map.addEventListener('moveend', () => {
    if (miniMap && isFloatingMapVisible) {
      const newCenter = map.getCenter();
      const newZoom = Math.max(map.getZoom() - 2, 3);
      miniMap.centerAndZoom(newCenter, newZoom);
    }
  });
}

// 同步标记到小地图
function syncMarkersToMiniMap() {
  if (!miniMap || !attractionMarkers || attractionMarkers.length === 0) return;
  
  // 清除之前的标记和连线
  if (mapProvider === 'openstreetmap') {
    miniMap.eachLayer(layer => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        miniMap.removeLayer(layer);
      }
    });
  } else if (mapProvider === 'baidu') {
    miniMap.clearOverlays();
  }
  
  // 收集路径坐标用于绘制连线
  const pathCoordinates = [];
  
  attractionMarkers.forEach(markerInfo => {
    // 从coordinates数组中获取坐标
    const [lat, lng] = markerInfo.coordinates;
    const attraction = markerInfo.attraction;
    
    // 添加到路径坐标数组
    pathCoordinates.push([lat, lng]);
    
    if (mapProvider === 'openstreetmap') {
      // 创建简化的小地图标记
      const miniMarkerIcon = L.divIcon({
        className: 'mini-map-marker',
        html: `
          <div style="
            background: #007bff;
            color: white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 8px;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          ">${attraction.markerLabel || '•'}</div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
      });
      
      const miniMarker = L.marker([lat, lng], { icon: miniMarkerIcon })
        .bindPopup(`<strong>${attraction.name}</strong><br>第${attraction.dayNumber}天 · 景点${attraction.markerLabel}`)
        .addTo(miniMap);
        
    } else if (mapProvider === 'baidu') {
      const point = new BMap.Point(lng, lat);
      
      // 创建带编号的标记图标
      const markerLabel = attraction.markerLabel || '•';
      const svgContent = `<svg width="24" height="24" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="#007bff" stroke="white" stroke-width="2"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="8" font-weight="bold">${markerLabel}</text>
      </svg>`;
      const icon = new BMap.Icon(
        `data:image/svg+xml;base64,${btoa(svgContent)}`,
        new BMap.Size(24, 24),
        { anchor: new BMap.Size(12, 12) }
      );
      
      const miniMarker = new BMap.Marker(point, { icon });
      miniMap.addOverlay(miniMarker);
      
      const infoWindow = new BMap.InfoWindow(`<strong>${attraction.name}</strong><br>第${attraction.dayNumber}天 · 景点${markerLabel}`, {
        width: 150,
        height: 50,
        title: false
      });
      miniMarker.addEventListener('click', () => {
        miniMap.openInfoWindow(infoWindow, point);
      });
    }
  });
  
  // 绘制连接线
  if (pathCoordinates.length > 1) {
    if (mapProvider === 'openstreetmap') {
      const routeLine = L.polyline(pathCoordinates, {
        color: '#007bff',
        weight: 2,
        opacity: 0.7,
        smoothFactor: 1
      });
      routeLine.addTo(miniMap);
    } else if (mapProvider === 'baidu') {
      const baiduPoints = pathCoordinates.map(coord => new BMap.Point(coord[1], coord[0]));
      const polyline = new BMap.Polyline(baiduPoints, {
        strokeColor: '#007bff',
        strokeWeight: 2,
        strokeOpacity: 0.7
      });
      miniMap.addOverlay(polyline);
    }
  }
}

// 处理窗口大小变化
function handleResize() {
  if (miniMap && isFloatingMapVisible) {
    setTimeout(() => {
      if (mapProvider === 'openstreetmap') {
        miniMap.invalidateSize();
      } else if (mapProvider === 'baidu') {
        miniMap.reset();
      }
    }, 100);
  }
}

// 检测是否为移动设备
function isMobileDevice() {
  return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 初始化小地图拖拽调整大小功能
function initMiniMapResize() {
  const floatingMiniMap = document.getElementById('floatingMiniMap');
  if (!floatingMiniMap) {
    console.warn('浮动小地图元素未找到');
    return;
  }
  
  const resizeHandles = floatingMiniMap.querySelectorAll('.resize-handle');
  if (resizeHandles.length === 0) {
    console.warn('拖拽手柄元素未找到');
    return;
  }
  
  console.log('初始化小地图拖拽功能，找到', resizeHandles.length, '个拖拽手柄');
  
  let isResizing = false;
  let currentHandle = null;
  let startX, startY, startWidth, startHeight, startLeft;
  
  resizeHandles.forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      isResizing = true;
      currentHandle = handle;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = floatingMiniMap.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;
      startLeft = rect.left;
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // 防止选择文本
      document.body.style.userSelect = 'none';
      floatingMiniMap.style.transition = 'none';
    });
  });
  
  function handleMouseMove(e) {
    if (!isResizing || !currentHandle) return;
    
    const direction = currentHandle.dataset.direction;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    let newWidth = startWidth;
    let newHeight = startHeight;
    
    // 根据拖拽方向调整大小
    if (direction.includes('w')) {
      newWidth = Math.max(200, startWidth - deltaX); // 最小宽度200px
      // 左侧拖拽需要调整位置
      const newLeft = Math.min(startLeft + deltaX, startLeft + startWidth - 200);
      floatingMiniMap.style.left = newLeft + 'px';
    }
    if (direction.includes('e')) {
      newWidth = Math.max(200, startWidth + deltaX); // 最小宽度200px
    }
    if (direction.includes('s')) {
      newHeight = Math.max(150, startHeight + deltaY); // 最小高度150px
    }
    
    // 最大尺寸限制
    newWidth = Math.min(newWidth, window.innerWidth - 40);
    newHeight = Math.min(newHeight, window.innerHeight - 40);
    
    floatingMiniMap.style.width = newWidth + 'px';
    floatingMiniMap.style.height = newHeight + 'px';
    
    // 重新调整地图大小
    if (miniMap) {
      setTimeout(() => {
        if (mapProvider === 'openstreetmap' && miniMap.invalidateSize) {
          miniMap.invalidateSize();
        } else if (mapProvider === 'baidu' && miniMap.reset) {
          miniMap.reset();
        }
      }, 100);
    }
  }
  
  function handleMouseUp() {
    if (!isResizing) return;
    
    isResizing = false;
    currentHandle = null;
    
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    // 恢复样式
    document.body.style.userSelect = '';
    floatingMiniMap.style.transition = '';
  }
}

// 在页面加载完成后初始化浮动小地图
document.addEventListener('DOMContentLoaded', () => {
  // 延迟初始化，确保地图已加载
  setTimeout(() => {
    initFloatingMiniMap();
    // 只在PC端初始化拖拽调整大小功能
    if (!isMobileDevice()) {
      initMiniMapResize();
    }
  }, 1000);
});

// 检测文字溢出并添加滚动效果
function addScrollEffectToOverflowText() {
  const textScrollElements = document.querySelectorAll('.text-scroll');
  
  textScrollElements.forEach(element => {
    // 先移除之前的滚动效果
    element.classList.remove('auto-scroll');
    
    // 如果已经有包装元素，先恢复原始文本
    const existingContent = element.querySelector('.scroll-content');
    if (existingContent) {
      element.innerHTML = existingContent.textContent;
    }
    
    // 强制重新计算布局
    setTimeout(() => {
      // 检查文字是否溢出
      if (element.scrollWidth > element.clientWidth) {
        console.log('Text overflow detected for:', element.textContent.substring(0, 50) + '...', 'scrollWidth:', element.scrollWidth, 'clientWidth:', element.clientWidth);
        
        // 创建包装元素
        const originalText = element.textContent;
        element.innerHTML = `<span class="scroll-content">${originalText}</span>`;
        element.classList.add('auto-scroll');
      } else {
        console.log('No text overflow for:', element.textContent.substring(0, 50) + '...');
      }
    }, 100);
  });
}

// ==================== 路线交叉检测算法 ====================

/**
 * 计算向量的叉积
 * @param {Object} p1 点1 {lat, lng}
 * @param {Object} p2 点2 {lat, lng}
 * @param {Object} p3 点3 {lat, lng}
 * @returns {number} 叉积值
 */
function crossProduct(p1, p2, p3) {
  return (p2.lng - p1.lng) * (p3.lat - p1.lat) - (p2.lat - p1.lat) * (p3.lng - p1.lng);
}

/**
 * 检查点是否在线段上
 * @param {Object} point 点 {lat, lng}
 * @param {Object} lineStart 线段起点 {lat, lng}
 * @param {Object} lineEnd 线段终点 {lat, lng}
 * @returns {boolean} 是否在线段上
 */
function isPointOnSegment(point, lineStart, lineEnd) {
  const minLat = Math.min(lineStart.lat, lineEnd.lat);
  const maxLat = Math.max(lineStart.lat, lineEnd.lat);
  const minLng = Math.min(lineStart.lng, lineEnd.lng);
  const maxLng = Math.max(lineStart.lng, lineEnd.lng);
  
  return point.lat >= minLat && point.lat <= maxLat && 
         point.lng >= minLng && point.lng <= maxLng;
}

/**
 * 检查两条线段是否相交
 * @param {Object} line1Start 线段1起点 {lat, lng}
 * @param {Object} line1End 线段1终点 {lat, lng}
 * @param {Object} line2Start 线段2起点 {lat, lng}
 * @param {Object} line2End 线段2终点 {lat, lng}
 * @returns {boolean} 是否相交
 */
function doLinesIntersect(line1Start, line1End, line2Start, line2End) {
  // 计算四个叉积
  const d1 = crossProduct(line2Start, line2End, line1Start);
  const d2 = crossProduct(line2Start, line2End, line1End);
  const d3 = crossProduct(line1Start, line1End, line2Start);
  const d4 = crossProduct(line1Start, line1End, line2End);
  
  // 一般情况：两条线段相交
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  
  // 特殊情况：点在线段上
  if (d1 === 0 && isPointOnSegment(line1Start, line2Start, line2End)) return true;
  if (d2 === 0 && isPointOnSegment(line1End, line2Start, line2End)) return true;
  if (d3 === 0 && isPointOnSegment(line2Start, line1Start, line1End)) return true;
  if (d4 === 0 && isPointOnSegment(line2End, line1Start, line1End)) return true;
  
  return false;
}

// ==================== 导出和打印功能 ====================

/**
 * 生成行程的HTML内容用于导出和打印
 */
function generateItineraryHTML() {
  if (!currentPlan || !days || days.length === 0) {
    return '<p>暂无行程数据</p>';
  }

  let html = `
    <div>
      <div class="plan-header">
        <h1>${currentPlan.title}</h1>
        ${currentPlan.description ? `<p class="plan-description">${currentPlan.description}</p>` : ''}
        <div class="statistics">
          总天数: ${days.length}天 | 文件数: ${files.length}个 | 生成时间: ${new Date().toLocaleDateString('zh-CN')}
        </div>
      </div>
  `;

  // 按天数排序
  const sortedDays = [...days].sort((a, b) => a.dayIndex - b.dayIndex);

  sortedDays.forEach(day => {
    html += `
      <div class="day-section">
        <h2>第${day.dayIndex}天 - ${day.city}</h2>
        <h3>${formatDate(day.date)}</h3>
    `;

    if (day.attractionsList && day.attractionsList.length > 0) {
      day.attractionsList.forEach((attraction, index) => {
        html += `
          <div class="attraction-item">
            <div class="attraction-name">${index + 1}. ${attraction.name}</div>
            <div class="attraction-details">
              ${attraction.address ? `地址: ${attraction.address}<br>` : ''}
              ${attraction.visitTime ? `时间: ${attraction.visitTime}<br>` : ''}
              ${attraction.notes ? `备注: ${attraction.notes}` : ''}
            </div>
          </div>
        `;
      });
    } else {
      html += '<p style="color: #9ca3af; margin-left: 15px;">暂无景点安排</p>';
    }

    html += `</div>`;
  });

  html += `</div>`;

  return html;
}

/**
 * 导出行程为PDF
 */
async function exportToPDF() {
  try {
    // 动态加载html2canvas和jsPDF库
    if (typeof window.html2canvas === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    }
    if (typeof window.jsPDF === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }

    // 创建临时的HTML内容用于生成PDF
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = `
      position: absolute;
      left: -9999px;
      top: 0;
      width: 794px;
      background: white;
      padding: 40px;
      font-family: 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
    `;
    
    tempDiv.innerHTML = generateItineraryHTML();
    document.body.appendChild(tempDiv);

    // 使用html2canvas生成图片
    const canvas = await window.html2canvas(tempDiv, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    });

    // 移除临时元素
    document.body.removeChild(tempDiv);

    // 创建PDF
    const { jsPDF } = window.jspdf;
    const imgData = canvas.toDataURL('image/png');
    
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210; // A4宽度
    const pageHeight = 295; // A4高度
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    // 添加第一页
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // 如果内容超过一页，添加更多页面
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // 下载文件
    const fileName = `${currentPlan.title || '旅行计划'}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.pdf`;
    pdf.save(fileName);
    
    closeModal('exportModal');
    showNotification('PDF导出成功！', 'success');

  } catch (error) {
    console.error('PDF导出失败:', error);
    showNotification('PDF导出失败，请重试', 'error');
  }
}

/**
 * 导出行程为Word文档
 */
async function exportToWord() {
  try {
    // 动态加载docx库
    if (typeof window.docx === 'undefined') {
      await loadScript('https://unpkg.com/docx@7.8.2/build/index.js');
    }

    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;

    const children = [];

    // 标题
    children.push(
      new Paragraph({
        children: [new TextRun({ text: currentPlan.title || '旅行计划', bold: true, size: 32 })],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      })
    );

    if (currentPlan.description) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: currentPlan.description, size: 24 })],
          alignment: AlignmentType.CENTER,
        })
      );
    }

    // 统计信息
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `总天数: ${days.length}天    文件数: ${files.length}个`, size: 20 })],
        alignment: AlignmentType.CENTER,
      })
    );

    children.push(new Paragraph({ text: "" })); // 空行

    // 行程内容
    const sortedDays = [...days].sort((a, b) => a.dayIndex - b.dayIndex);

    sortedDays.forEach(day => {
      // 天数标题
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `第${day.dayIndex}天 - ${day.city}`, bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_1,
        })
      );

      children.push(
        new Paragraph({
          children: [new TextRun({ text: formatDate(day.date), size: 20 })],
        })
      );

      // 景点列表
      if (day.attractionsList && day.attractionsList.length > 0) {
        day.attractionsList.forEach((attraction, index) => {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `${index + 1}. ${attraction.name}`, bold: true, size: 22 })],
            })
          );

          if (attraction.address) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: `地址: ${attraction.address}`, size: 20 })],
              })
            );
          }

          if (attraction.visitTime) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: `时间: ${attraction.visitTime}`, size: 20 })],
              })
            );
          }

          if (attraction.notes) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: `备注: ${attraction.notes}`, size: 20 })],
              })
            );
          }

          children.push(new Paragraph({ text: "" })); // 空行
        });
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: '暂无景点安排', size: 20 })],
          })
        );
      }

      children.push(new Paragraph({ text: "" })); // 空行
    });

    const doc = new Document({
      sections: [{
        properties: {},
        children: children,
      }],
    });

    const blob = await Packer.toBlob(doc);
    const fileName = `${currentPlan.title || '旅行计划'}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.docx`;
    
    // 下载文件
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    
    showNotification('Word文档导出成功！', 'success');
  } catch (error) {
    console.error('Word导出失败:', error);
    showNotification('Word导出失败，请稍后重试', 'error');
  }
}

/**
 * 显示导出选项
 */
function showExportOptions() {
  openModal('exportModal');
}

/**
 * 打印行程
 */
function printItinerary() {
  const printContent = generateItineraryHTML();
  const printWindow = window.open('', '_blank');
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${currentPlan.title || '旅行计划'} - 打印</title>
      <meta charset="UTF-8">
      <style>
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
        body {
          font-family: 'Microsoft YaHei', Arial, sans-serif;
          line-height: 1.3;
          color: #333;
          font-size: 12px;
        }
        @page {
          margin: 15mm;
          size: A4;
        }
        h1 {
          font-size: 18px;
          margin: 0 0 8px 0;
          color: #2563eb;
        }
        h2 {
          font-size: 14px;
          margin: 8px 0 4px 0;
          color: #1f2937;
        }
        h3 {
          font-size: 13px;
          margin: 6px 0 3px 0;
          color: #374151;
        }
        p {
          margin: 2px 0;
          font-size: 11px;
        }
        .day-section {
          margin-bottom: 12px;
          page-break-inside: avoid;
        }
        .attraction-item {
          margin: 3px 0 6px 15px;
          padding: 2px 0;
        }
        .attraction-name {
          font-weight: bold;
          font-size: 12px;
          margin-bottom: 1px;
        }
        .attraction-details {
          font-size: 10px;
          color: #6b7280;
          margin-left: 8px;
        }
        .plan-description {
          font-size: 11px;
          margin: 4px 0 8px 0;
          color: #4b5563;
        }
        .statistics {
          font-size: 10px;
          color: #6b7280;
          margin: 6px 0 12px 0;
        }
        ul, ol {
          margin: 4px 0;
          padding-left: 20px;
        }
        li {
          margin: 1px 0;
          font-size: 11px;
        }
      </style>
    </head>
    <body>
      ${printContent}
      <div class="no-print" style="text-align: center; margin-top: 20px;">
        <button onclick="window.print()" style="padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 5px; cursor: pointer;">打印</button>
        <button onclick="window.close()" style="padding: 10px 20px; background: #6b7280; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">关闭</button>
      </div>
    </body>
    </html>
  `);
  
  printWindow.document.close();
  
  // 等待内容加载完成后自动打印
  printWindow.onload = function() {
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };
}

/**
 * 动态加载脚本
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// 更新路线交叉警告显示
async function updateRouteCrossingWarnings() {
  try {
    console.log('开始更新路线交叉警告...');
    
    // 重新加载天数数据以获取最新的景点信息
    await loadDays();
    
    // 重新渲染天数显示，这会触发路线交叉检测
    renderDays();
    
    console.log('路线交叉警告更新完成');
  } catch (error) {
    console.error('更新路线交叉警告失败:', error);
  }
}

/**
 * 检查一天的景点路线是否存在交叉
 * @param {Array} attractions 景点列表，每个景点包含坐标信息
 * @returns {boolean} 是否存在路线交叉
 */
function checkRouteCrossing(attractions) {
  // 基本检查：景点列表为空或无效
  if (!attractions || attractions.length === 0) {
    return false;
  }
  
  const coordinates = [];
  
  // 提取有效坐标
  for (const attraction of attractions) {
    let lat, lng;
    
    if (attraction.coordinates && attraction.coordinates.length === 2) {
      // 直接使用坐标
      [lat, lng] = attraction.coordinates;
    } else if (attraction.address && isCoordinateFormat(attraction.address)) {
      // 从地址中解析坐标
      const coords = attraction.address.split(',').map(coord => parseFloat(coord.trim()));
      if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
        [lat, lng] = coords;
      }
    }
    
    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
      coordinates.push({ lat, lng, name: attraction.name });
    }
  }
  
  // 少于4个有效坐标点不可能形成交叉（需要至少2条不相邻的线段）
  if (coordinates.length < 4) {
    return false;
  }
  
  // 检查所有线段对是否相交（不包括相邻线段和共享端点的线段）
  for (let i = 0; i < coordinates.length - 1; i++) {
    for (let j = i + 2; j < coordinates.length - 1; j++) {
      const line1Start = coordinates[i];
      const line1End = coordinates[i + 1];
      const line2Start = coordinates[j];
      const line2End = coordinates[j + 1];
      
      // 检查是否有共享端点（这种情况不算交叉）
      const hasSharedEndpoint = (
        (line1Start.lat === line2Start.lat && line1Start.lng === line2Start.lng) ||
        (line1Start.lat === line2End.lat && line1Start.lng === line2End.lng) ||
        (line1End.lat === line2Start.lat && line1End.lng === line2Start.lng) ||
        (line1End.lat === line2End.lat && line1End.lng === line2End.lng)
      );
      
      // 如果有共享端点，跳过检查
      if (hasSharedEndpoint) {
        continue;
      }
      
      // 检查线段是否真正相交（不包括端点接触）
      if (doLinesIntersectStrict(line1Start, line1End, line2Start, line2End)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 严格检查两条线段是否相交（不包括端点接触的情况）
 * @param {Object} line1Start 线段1起点 {lat, lng}
 * @param {Object} line1End 线段1终点 {lat, lng}
 * @param {Object} line2Start 线段2起点 {lat, lng}
 * @param {Object} line2End 线段2终点 {lat, lng}
 * @returns {boolean} 是否相交
 */
function doLinesIntersectStrict(line1Start, line1End, line2Start, line2End) {
  const d1 = crossProduct(line2Start, line2End, line1Start);
  const d2 = crossProduct(line2Start, line2End, line1End);
  const d3 = crossProduct(line1Start, line1End, line2Start);
  const d4 = crossProduct(line1Start, line1End, line2End);
  
  // 严格相交：两条线段必须在对方的两侧
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  
  return false;
}

// ==================== 机酒计划功能 ====================

const BOOKING_PLATFORMS = ['携程', '美团', '去哪儿', '同程', '旅行社', '官方APP', 'Trip', 'Booking', 'Airbnb', 'Agoda', 'Klook', 'Google'];
let bookingPlans = [];
// 待上传的图片状态：{ file: File|null, removed: boolean }
let pendingHotelImage = { file: null, removed: false };
let pendingFlightImage = { file: null, removed: false };

function initBookingPlatformOptions() {
  const hotelSelect = document.getElementById('hotelPlatformInput');
  const flightSelect = document.getElementById('flightPlatformInput');
  [hotelSelect, flightSelect].forEach(select => {
    if (!select) return;
    // 保留首个占位项
    const placeholder = select.querySelector('option');
    select.innerHTML = '';
    if (placeholder) select.appendChild(placeholder);
    BOOKING_PLATFORMS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      select.appendChild(opt);
    });
  });
}

function bookingApi(path, method = 'GET', body = null, isForm = false) {
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  };
  if (body) {
    if (isForm) {
      opts.body = body; // FormData
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  return fetch(`/travenion/api/bookings${path}`, opts);
}

function formatMoney(num) {
  const n = Number(num) || 0;
  return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hotelSubtotal(hotel) {
  return (Number(hotel.nights) || 0) * (Number(hotel.price) || 0);
}

function bookingPlanTotal(bp) {
  const hotelSum = (bp.hotels || []).reduce((s, h) => s + hotelSubtotal(h), 0);
  const flightSum = (bp.flights || []).reduce((s, f) => s + (Number(f.price) || 0), 0);
  return hotelSum + flightSum;
}

// 加载机酒计划
async function loadBookingPlans() {
  try {
    const res = await bookingApi(`/plan/${planId}`);
    if (!res.ok) throw new Error('加载机酒计划失败');
    bookingPlans = await res.json();
    renderBookingPlans();
  } catch (e) {
    console.error('加载机酒计划失败:', e);
    showNotification('加载机酒计划失败', 'error');
  }
}

function renderBookingPlans() {
  const container = document.getElementById('bookingPlansList');
  const empty = document.getElementById('emptyBookingPlans');
  if (!container) return;

  if (!bookingPlans || bookingPlans.length === 0) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  container.innerHTML = bookingPlans.map((bp, idx) => {
    const total = bookingPlanTotal(bp);
    return `
    <div class="booking-plan-card" style="background: white; border-radius: 14px; padding: 20px; margin-bottom: 18px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); border: 1px solid #eef2f7;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 700;">${idx + 1}</div>
          <div>
            <h3 style="margin: 0; color: #1f2937;">${escapeHtml(bp.name)}</h3>
            ${bp.notes ? `<p style="margin: 2px 0 0 0; color: #6b7280; font-size: 13px;">${escapeHtml(bp.notes)}</p>` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <div style="background: #ecfdf5; color: #047857; padding: 8px 14px; border-radius: 10px; font-weight: 700; font-size: 15px;">总计 ${formatMoney(total)}</div>
          <button class="btn btn-outline" onclick="openBookingPlanModal(${bp.id})" style="padding: 6px 12px; font-size: 13px;">编辑</button>
          <button class="btn btn-danger" onclick="deleteBookingPlan(${bp.id})" style="padding: 6px 12px; font-size: 13px;">删除</button>
        </div>
      </div>

      ${renderHotelsSection(bp)}
      ${renderFlightsSection(bp)}
    </div>`;
  }).join('');

  // 异步加载所有订单截图缩略图
  loadAllBookingThumbnails();
}

function renderHotelsSection(bp) {
  const hotels = bp.hotels || [];
  const hotelSum = hotels.reduce((s, h) => s + hotelSubtotal(h), 0);
  let html = `
    <div style="margin-top: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <h4 style="margin: 0; color: #374151; font-size: 15px;">🏨 酒店 ${hotels.length ? `<span style="color:#6b7280; font-weight:400; font-size:13px;">小计 ${formatMoney(hotelSum)}</span>` : ''}</h4>
        <button class="btn btn-primary" onclick="openBookingHotelModal(${bp.id})" style="padding: 5px 12px; font-size: 13px;">+ 添加酒店</button>
      </div>`;
  if (hotels.length === 0) {
    html += `<div style="padding: 14px; background: #f8fafc; border-radius: 8px; text-align: center; color: #9ca3af; font-size: 13px;">暂无酒店记录</div>`;
  } else {
    html += `
      <div style="overflow-x: auto;">
      <table class="booking-table">
        <thead>
          <tr>
            <th>城市</th><th>酒店名称</th><th>地点</th><th>平台</th><th>间夜</th><th>每晚</th><th>小计</th><th>订单</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${hotels.map(h => `
            <tr>
              <td>${escapeHtml(h.city || '')}</td>
              <td><span style="font-weight:600;">${escapeHtml(h.hotelName || '')}</span></td>
              <td>${escapeHtml(h.location || '')}</td>
              <td>${h.platform ? `<span class="booking-tag">${escapeHtml(h.platform)}</span>` : ''}</td>
              <td>${h.nights || 0}</td>
              <td>${formatMoney(h.price)}</td>
              <td style="font-weight:600; color:#059669;">${formatMoney(hotelSubtotal(h))}</td>
              <td>${renderOrderCell(planId, bp.id, 'hotels', h.id, h.orderImage, h.orderLink)}</td>
              <td>
                <button class="btn btn-outline" onclick="openBookingHotelModal(${bp.id}, ${h.id})" style="padding: 3px 8px; font-size: 12px;">编辑</button>
                <button class="btn btn-danger" onclick="deleteBookingHotel(${bp.id}, ${h.id})" style="padding: 3px 8px; font-size: 12px;">删除</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>`;
  }
  html += `</div>`;
  return html;
}

function renderFlightsSection(bp) {
  const flights = bp.flights || [];
  const flightSum = flights.reduce((s, f) => s + (Number(f.price) || 0), 0);
  let html = `
    <div style="margin-top: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <h4 style="margin: 0; color: #374151; font-size: 15px;">✈️ 机票 ${flights.length ? `<span style="color:#6b7280; font-weight:400; font-size:13px;">小计 ${formatMoney(flightSum)}</span>` : ''}</h4>
        <button class="btn btn-primary" onclick="openBookingFlightModal(${bp.id})" style="padding: 5px 12px; font-size: 13px;">+ 添加机票</button>
      </div>`;
  if (flights.length === 0) {
    html += `<div style="padding: 14px; background: #f8fafc; border-radius: 8px; text-align: center; color: #9ca3af; font-size: 13px;">暂无机票记录</div>`;
  } else {
    html += `
      <div style="overflow-x: auto;">
      <table class="booking-table">
        <thead>
          <tr>
            <th>航班号</th><th>航线</th><th>中转</th><th>平台</th><th>日期</th><th>价格</th><th>订单</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${flights.map(f => `
            <tr>
              <td><span style="font-weight:600;">${escapeHtml(f.flightNumber || '')}</span></td>
              <td>${escapeHtml(f.departure || '')} <span style="color:#9ca3af;">→</span> ${escapeHtml(f.destination || '')}</td>
              <td>${f.isTransit ? `<span class="booking-tag" style="background:#fef3c7;color:#b45309;">${escapeHtml(f.transitCity || '中转')}${f.transitDuration ? ' / ' + escapeHtml(f.transitDuration) : ''}</span>` : '<span style="color:#9ca3af;">直飞</span>'}</td>
              <td>${f.platform ? `<span class="booking-tag">${escapeHtml(f.platform)}</span>` : ''}</td>
              <td>${f.date ? formatDate(f.date) : ''}</td>
              <td style="font-weight:600; color:#059669;">${formatMoney(f.price)}</td>
              <td>${renderOrderCell(planId, bp.id, 'flights', f.id, f.orderImage, f.orderLink)}</td>
              <td>
                <button class="btn btn-outline" onclick="openBookingFlightModal(${bp.id}, ${f.id})" style="padding: 3px 8px; font-size: 12px;">编辑</button>
                <button class="btn btn-danger" onclick="deleteBookingFlight(${bp.id}, ${f.id})" style="padding: 3px 8px; font-size: 12px;">删除</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>`;
  }
  html += `</div>`;
  return html;
}

// 渲染订单单元格（截图缩略图 + 链接）
function renderOrderCell(pId, bpId, type, recordId, orderImage, orderLink) {
  let cell = '<div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">';
  if (orderImage) {
    cell += `<div class="booking-thumb" data-image-plan="${pId}" data-image-bp="${bpId}" data-image-type="${type}" data-image-id="${recordId}" title="点击查看订单截图" style="width:42px;height:42px;border-radius:6px;background:#e5e7eb;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;">🖼️</div>`;
  } else {
    cell += `<span style="color:#d1d5db;font-size:12px;">无截图</span>`;
  }
  if (orderLink) {
    cell += `<a href="${escapeHtml(orderLink)}" target="_blank" rel="noopener" style="font-size:12px;color:#2563eb;">订单链接 <i class="fas fa-external-link-alt"></i></a>`;
  }
  cell += '</div>';
  return cell;
}

// 异步加载缩略图
async function loadAllBookingThumbnails() {
  const thumbs = document.querySelectorAll('.booking-thumb');
  thumbs.forEach(async el => {
    try {
      const pId = el.dataset.imagePlan;
      const bpId = el.dataset.imageBp;
      const type = el.dataset.imageType;
      const id = el.dataset.imageId;
      const url = `/travenion/api/bookings/plan/${pId}/${bpId}/${type}/${id}/image`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      el.style.background = `url(${objUrl}) center/cover`;
      el.innerHTML = '';
      el.onclick = () => openBookingImagePreview(url);
    } catch (e) { /* ignore */ }
  });
}

function openBookingImagePreview(authUrl) {
  const modal = document.createElement('div');
  modal.className = 'modal show';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 90vw;">
      <div class="modal-header">
        <h3 style="margin:0;">订单截图预览</h3>
        <button type="button" onclick="this.closest('.modal').remove()">&times;</button>
      </div>
      <div class="modal-body" style="text-align:center;max-height:75vh;overflow:auto;">
        <div id="bigImgLoading" style="padding:40px;color:#9ca3af;">加载中...</div>
        <img id="bigImgEl" style="display:none;max-width:100%;border-radius:8px;" />
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  fetch(authUrl, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
    .then(r => r.blob())
    .then(blob => {
      const objUrl = URL.createObjectURL(blob);
      const img = modal.querySelector('#bigImgEl');
      img.src = objUrl;
      img.style.display = 'inline';
      modal.querySelector('#bigImgLoading').style.display = 'none';
    })
    .catch(() => {
      modal.querySelector('#bigImgLoading').textContent = '加载失败';
    });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- 候选计划模态框 ----------
function openBookingPlanModal(bpId = null) {
  const modal = document.getElementById('bookingPlanModal');
  const titleEl = document.getElementById('bookingPlanModalTitle');
  document.getElementById('editBookingPlanId').value = '';
  document.getElementById('bookingPlanName').value = '';
  document.getElementById('bookingPlanNotes').value = '';
  if (bpId) {
    const bp = bookingPlans.find(b => b.id === bpId);
    if (bp) {
      titleEl.textContent = '编辑候选计划';
      document.getElementById('editBookingPlanId').value = bp.id;
      document.getElementById('bookingPlanName').value = bp.name || '';
      document.getElementById('bookingPlanNotes').value = bp.notes || '';
    }
  } else {
    titleEl.textContent = '新建候选计划';
    // 自动命名 方案A/B/C
    const n = bookingPlans.length + 1;
    const letter = String.fromCharCode(64 + n);
    document.getElementById('bookingPlanName').value = `方案${letter}`;
  }
  modal.classList.add('show');
}

function closeBookingPlanModal() {
  document.getElementById('bookingPlanModal').classList.remove('show');
}

async function saveBookingPlan() {
  const id = document.getElementById('editBookingPlanId').value;
  const name = document.getElementById('bookingPlanName').value.trim();
  const notes = document.getElementById('bookingPlanNotes').value.trim();
  if (!name) { showNotification('请填写计划名称', 'error'); return; }
  try {
    const res = id
      ? await bookingApi(`/plan/${planId}/${id}`, 'PUT', { name, notes })
      : await bookingApi(`/plan/${planId}`, 'POST', { name, notes });
    if (!res.ok) throw new Error('保存失败');
    closeBookingPlanModal();
    await loadBookingPlans();
    showNotification(id ? '已更新候选计划' : '已创建候选计划', 'success');
  } catch (e) {
    console.error(e);
    showNotification('保存失败', 'error');
  }
}

async function deleteBookingPlan(bpId) {
  if (!confirm('确定删除该候选计划及其所有酒店、机票记录？')) return;
  try {
    const res = await bookingApi(`/plan/${planId}/${bpId}`, 'DELETE');
    if (!res.ok) throw new Error('删除失败');
    await loadBookingPlans();
    showNotification('已删除候选计划', 'success');
  } catch (e) {
    console.error(e);
    showNotification('删除失败', 'error');
  }
}

// ---------- 酒店记录模态框 ----------
function openBookingHotelModal(bpId, hotelId = null) {
  const modal = document.getElementById('bookingHotelModal');
  const titleEl = document.getElementById('bookingHotelModalTitle');
  pendingHotelImage = { file: null, removed: false };
  document.getElementById('editHotelId').value = '';
  document.getElementById('hotelPlanId').value = bpId;
  document.getElementById('hotelNameInput').value = '';
  document.getElementById('hotelCityInput').value = '';
  document.getElementById('hotelLocationInput').value = '';
  document.getElementById('hotelPlatformInput').value = '';
  document.getElementById('hotelNightsInput').value = 1;
  document.getElementById('hotelPriceInput').value = 0;
  document.getElementById('hotelOrderLinkInput').value = '';
  document.getElementById('hotelOrderImageInput').value = '';
  document.getElementById('hotelImagePreview').innerHTML = '';

  if (hotelId) {
    const bp = bookingPlans.find(b => b.id === bpId);
    const h = bp && (bp.hotels || []).find(x => x.id === hotelId);
    if (h) {
      titleEl.textContent = '编辑酒店';
      document.getElementById('editHotelId').value = h.id;
      document.getElementById('hotelNameInput').value = h.hotelName || '';
      document.getElementById('hotelCityInput').value = h.city || '';
      document.getElementById('hotelLocationInput').value = h.location || '';
      document.getElementById('hotelPlatformInput').value = h.platform || '';
      document.getElementById('hotelNightsInput').value = h.nights || 1;
      document.getElementById('hotelPriceInput').value = h.price || 0;
      document.getElementById('hotelOrderLinkInput').value = h.orderLink || '';
      if (h.orderImage) {
        const preview = document.getElementById('hotelImagePreview');
        preview.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;">
            <img class="existing-hotel-img" data-plan="${planId}" data-bp="${bpId}" data-id="${h.id}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;" />
            <button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:12px;" onclick="removeExistingHotelImage()">移除截图</button>
          </div>`;
        loadExistingBookingImage('.existing-hotel-img');
      }
    }
  } else {
    titleEl.textContent = '添加酒店';
  }
  modal.classList.add('show');
}

function closeBookingHotelModal() {
  document.getElementById('bookingHotelModal').classList.remove('show');
}

function removeExistingHotelImage() {
  pendingHotelImage.removed = true;
  pendingHotelImage.file = null;
  document.getElementById('hotelImagePreview').innerHTML = '<span style="color:#9ca3af;font-size:12px;">已标记移除，保存后生效</span>';
  document.getElementById('hotelOrderImageInput').value = '';
}

async function saveBookingHotel() {
  const bpId = document.getElementById('hotelPlanId').value;
  const hotelId = document.getElementById('editHotelId').value;
  const data = {
    hotelName: document.getElementById('hotelNameInput').value.trim(),
    city: document.getElementById('hotelCityInput').value.trim(),
    location: document.getElementById('hotelLocationInput').value.trim(),
    platform: document.getElementById('hotelPlatformInput').value,
    nights: Number(document.getElementById('hotelNightsInput').value) || 1,
    price: Number(document.getElementById('hotelPriceInput').value) || 0,
    orderLink: document.getElementById('hotelOrderLinkInput').value.trim()
  };
  if (!data.hotelName) { showNotification('请填写酒店名称', 'error'); return; }

  const fileInput = document.getElementById('hotelOrderImageInput');
  if (fileInput.files && fileInput.files[0]) {
    pendingHotelImage.file = fileInput.files[0];
  }

  try {
    let recordId = hotelId;
    let res;
    if (hotelId) {
      res = await bookingApi(`/plan/${planId}/${bpId}/hotels/${hotelId}`, 'PUT', data);
      if (!res.ok) throw new Error('保存失败');
    } else {
      res = await bookingApi(`/plan/${planId}/${bpId}/hotels`, 'POST', data);
      if (!res.ok) throw new Error('保存失败');
      const created = await res.json();
      recordId = created.id;
    }

    // 处理图片
    if (pendingHotelImage.file && recordId) {
      const fd = new FormData();
      fd.append('image', pendingHotelImage.file);
      const upRes = await bookingApi(`/plan/${planId}/${bpId}/hotels/${recordId}/image`, 'POST', fd, true);
      if (!upRes.ok) throw new Error('截图上传失败');
    } else if (pendingHotelImage.removed && recordId && !pendingHotelImage.file) {
      await bookingApi(`/plan/${planId}/${bpId}/hotels/${recordId}/image`, 'DELETE');
    }

    closeBookingHotelModal();
    await loadBookingPlans();
    showNotification(hotelId ? '已更新酒店' : '已添加酒店', 'success');
  } catch (e) {
    console.error(e);
    showNotification(e.message || '保存失败', 'error');
  }
}

async function deleteBookingHotel(bpId, hotelId) {
  if (!confirm('确定删除该酒店记录？')) return;
  try {
    const res = await bookingApi(`/plan/${planId}/${bpId}/hotels/${hotelId}`, 'DELETE');
    if (!res.ok) throw new Error('删除失败');
    await loadBookingPlans();
    showNotification('已删除酒店', 'success');
  } catch (e) {
    console.error(e);
    showNotification('删除失败', 'error');
  }
}

// ---------- 机票记录模态框 ----------
function toggleTransitFields() {
  const checked = document.getElementById('flightIsTransitInput').checked;
  document.getElementById('transitFields').style.display = checked ? 'flex' : 'none';
}

function openBookingFlightModal(bpId, flightId = null) {
  const modal = document.getElementById('bookingFlightModal');
  const titleEl = document.getElementById('bookingFlightModalTitle');
  pendingFlightImage = { file: null, removed: false };
  document.getElementById('editFlightId').value = '';
  document.getElementById('flightPlanId').value = bpId;
  document.getElementById('flightNumberInput').value = '';
  document.getElementById('flightDateInput').value = '';
  document.getElementById('flightDepartureInput').value = '';
  document.getElementById('flightDestinationInput').value = '';
  document.getElementById('flightIsTransitInput').checked = false;
  document.getElementById('flightTransitCityInput').value = '';
  document.getElementById('flightTransitDurationInput').value = '';
  document.getElementById('flightPlatformInput').value = '';
  document.getElementById('flightPriceInput').value = 0;
  document.getElementById('flightOrderLinkInput').value = '';
  document.getElementById('flightOrderImageInput').value = '';
  document.getElementById('flightImagePreview').innerHTML = '';
  toggleTransitFields();

  if (flightId) {
    const bp = bookingPlans.find(b => b.id === bpId);
    const f = bp && (bp.flights || []).find(x => x.id === flightId);
    if (f) {
      titleEl.textContent = '编辑机票';
      document.getElementById('editFlightId').value = f.id;
      document.getElementById('flightNumberInput').value = f.flightNumber || '';
      document.getElementById('flightDateInput').value = f.date || '';
      document.getElementById('flightDepartureInput').value = f.departure || '';
      document.getElementById('flightDestinationInput').value = f.destination || '';
      document.getElementById('flightIsTransitInput').checked = !!f.isTransit;
      document.getElementById('flightTransitCityInput').value = f.transitCity || '';
      document.getElementById('flightTransitDurationInput').value = f.transitDuration || '';
      document.getElementById('flightPlatformInput').value = f.platform || '';
      document.getElementById('flightPriceInput').value = f.price || 0;
      document.getElementById('flightOrderLinkInput').value = f.orderLink || '';
      toggleTransitFields();
      if (f.orderImage) {
        const preview = document.getElementById('flightImagePreview');
        preview.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;">
            <img class="existing-flight-img" data-plan="${planId}" data-bp="${bpId}" data-id="${f.id}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;" />
            <button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:12px;" onclick="removeExistingFlightImage()">移除截图</button>
          </div>`;
        loadExistingBookingImage('.existing-flight-img');
      }
    }
  } else {
    titleEl.textContent = '添加机票';
  }
  modal.classList.add('show');
}

function closeBookingFlightModal() {
  document.getElementById('bookingFlightModal').classList.remove('show');
}

function removeExistingFlightImage() {
  pendingFlightImage.removed = true;
  pendingFlightImage.file = null;
  document.getElementById('flightImagePreview').innerHTML = '<span style="color:#9ca3af;font-size:12px;">已标记移除，保存后生效</span>';
  document.getElementById('flightOrderImageInput').value = '';
}

async function saveBookingFlight() {
  const bpId = document.getElementById('flightPlanId').value;
  const flightId = document.getElementById('editFlightId').value;
  const data = {
    flightNumber: document.getElementById('flightNumberInput').value.trim(),
    departure: document.getElementById('flightDepartureInput').value.trim(),
    destination: document.getElementById('flightDestinationInput').value.trim(),
    isTransit: document.getElementById('flightIsTransitInput').checked,
    transitCity: document.getElementById('flightTransitCityInput').value.trim(),
    transitDuration: document.getElementById('flightTransitDurationInput').value.trim(),
    platform: document.getElementById('flightPlatformInput').value,
    date: document.getElementById('flightDateInput').value,
    price: Number(document.getElementById('flightPriceInput').value) || 0,
    orderLink: document.getElementById('flightOrderLinkInput').value.trim()
  };
  if (!data.flightNumber) { showNotification('请填写航班号', 'error'); return; }

  const fileInput = document.getElementById('flightOrderImageInput');
  if (fileInput.files && fileInput.files[0]) {
    pendingFlightImage.file = fileInput.files[0];
  }

  try {
    let recordId = flightId;
    let res;
    if (flightId) {
      res = await bookingApi(`/plan/${planId}/${bpId}/flights/${flightId}`, 'PUT', data);
      if (!res.ok) throw new Error('保存失败');
    } else {
      res = await bookingApi(`/plan/${planId}/${bpId}/flights`, 'POST', data);
      if (!res.ok) throw new Error('保存失败');
      const created = await res.json();
      recordId = created.id;
    }

    if (pendingFlightImage.file && recordId) {
      const fd = new FormData();
      fd.append('image', pendingFlightImage.file);
      const upRes = await bookingApi(`/plan/${planId}/${bpId}/flights/${recordId}/image`, 'POST', fd, true);
      if (!upRes.ok) throw new Error('截图上传失败');
    } else if (pendingFlightImage.removed && recordId && !pendingFlightImage.file) {
      await bookingApi(`/plan/${planId}/${bpId}/flights/${recordId}/image`, 'DELETE');
    }

    closeBookingFlightModal();
    await loadBookingPlans();
    showNotification(flightId ? '已更新机票' : '已添加机票', 'success');
  } catch (e) {
    console.error(e);
    showNotification(e.message || '保存失败', 'error');
  }
}

async function deleteBookingFlight(bpId, flightId) {
  if (!confirm('确定删除该机票记录？')) return;
  try {
    const res = await bookingApi(`/plan/${planId}/${bpId}/flights/${flightId}`, 'DELETE');
    if (!res.ok) throw new Error('删除失败');
    await loadBookingPlans();
    showNotification('已删除机票', 'success');
  } catch (e) {
    console.error(e);
    showNotification('删除失败', 'error');
  }
}

// 加载编辑模态框中的已有截图
async function loadExistingBookingImage(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  try {
    const { plan, bp, id } = el.dataset;
    const type = selector.includes('hotel') ? 'hotels' : 'flights';
    const url = `/travenion/api/bookings/plan/${plan}/${bp}/${type}/${id}/image`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    el.src = URL.createObjectURL(blob);
  } catch (e) { /* ignore */ }
}

// ---------- PDF 导出 ----------
async function exportBookingsToPDF() {
  if (!bookingPlans || bookingPlans.length === 0) {
    showNotification('暂无机酒计划可导出', 'warning');
    return;
  }
  try {
    if (typeof window.html2canvas === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    }
    if (typeof window.jsPDF === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }

    // 预加载所有订单截图为 data URL
    const imageData = {}; // key: `${type}_${id}` -> dataURL
    const tasks = [];
    for (const bp of bookingPlans) {
      for (const h of (bp.hotels || [])) {
        if (h.orderImage) {
          tasks.push(fetchBookingImageAsDataURL(planId, bp.id, 'hotels', h.id).then(d => { imageData[`hotels_${h.id}`] = d; }));
        }
      }
      for (const f of (bp.flights || [])) {
        if (f.orderImage) {
          tasks.push(fetchBookingImageAsDataURL(planId, bp.id, 'flights', f.id).then(d => { imageData[`flights_${f.id}`] = d; }));
        }
      }
    }
    await Promise.all(tasks);

    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = `position:absolute;left:-9999px;top:0;width:794px;background:white;padding:40px;font-family:'Microsoft YaHei','PingFang SC',sans-serif;font-size:14px;line-height:1.6;color:#333;`;
    tempDiv.innerHTML = generateBookingsPDFHTML(imageData);
    document.body.appendChild(tempDiv);

    const canvas = await window.html2canvas(tempDiv, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' });
    document.body.removeChild(tempDiv);

    const { jsPDF } = window.jspdf;
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210;
    const pageHeight = 295;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    const fileName = `${currentPlan.title || '旅行计划'}_机酒计划_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.pdf`;
    pdf.save(fileName);
    showNotification('机酒计划PDF导出成功！', 'success');
  } catch (e) {
    console.error('机酒计划PDF导出失败:', e);
    showNotification('机酒计划PDF导出失败，请重试', 'error');
  }
}

async function fetchBookingImageAsDataURL(pId, bpId, type, id) {
  try {
    const url = `/travenion/api/bookings/plan/${pId}/${bpId}/${type}/${id}/image`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) { return null; }
}

function generateBookingsPDFHTML(imageData) {
  const esc = escapeHtml;
  let html = `
    <div>
      <div style="text-align:center;margin-bottom:20px;border-bottom:2px solid #667eea;padding-bottom:14px;">
        <h1 style="margin:0;color:#1f2937;">${esc(currentPlan.title || '旅行计划')} - 机酒计划</h1>
        ${currentPlan.description ? `<p style="margin:6px 0 0;color:#6b7280;">${esc(currentPlan.description)}</p>` : ''}
        <p style="margin:6px 0 0;color:#9ca3af;font-size:12px;">生成时间：${new Date().toLocaleString('zh-CN')}</p>
      </div>`;

  bookingPlans.forEach((bp, idx) => {
    const total = bookingPlanTotal(bp);
    html += `
      <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
          <div><span style="font-weight:700;font-size:18px;">候选方案 ${idx + 1}：${esc(bp.name)}</span>
          ${bp.notes ? `<div style="font-size:12px;opacity:0.9;margin-top:2px;">${esc(bp.notes)}</div>` : ''}</div>
          <div style="background:rgba(255,255,255,0.2);padding:6px 14px;border-radius:8px;font-weight:700;">总计 ${formatMoney(total)}</div>
        </div>

        <!-- 酒店 -->
        <div style="padding:14px 16px;">
          <h3 style="margin:0 0 10px;color:#374151;font-size:16px;">🏨 酒店明细</h3>`;
    const hotels = bp.hotels || [];
    if (hotels.length === 0) {
      html += `<p style="color:#9ca3af;margin:0 0 8px;">暂无酒店记录</p>`;
    } else {
      html += `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px;">
        <thead><tr style="background:#f8fafc;">
          <th style="border:1px solid #e5e7eb;padding:6px;text-align:left;">城市</th>
          <th style="border:1px solid #e5e7eb;padding:6px;text-align:left;">酒店名称</th>
          <th style="border:1px solid #e5e7eb;padding:6px;text-align:left;">地点</th>
          <th style="border:1px solid #e5e7eb;padding:6px;">平台</th>
          <th style="border:1px solid #e5e7eb;padding:6px;">间夜</th>
          <th style="border:1px solid #e5e7eb;padding:6px;">每晚</th>
          <th style="border:1px solid #e5e7eb;padding:6px;">小计</th>
        </tr></thead><tbody>`;
      hotels.forEach(h => {
        html += `<tr>
          <td style="border:1px solid #e5e7eb;padding:6px;">${esc(h.city || '')}</td>
          <td style="border:1px solid #e5e7eb;padding:6px;font-weight:600;">${esc(h.hotelName || '')}</td>
          <td style="border:1px solid #e5e7eb;padding:6px;">${esc(h.location || '')}</td>
          <td style="border:1px solid #e5e7eb;padding:6px;text-align:center;">${esc(h.platform || '')}</td>
          <td style="border:1px solid #e5e7eb;padding:6px;text-align:center;">${h.nights || 0}</td>
          <td style="border:1px solid #e5e7eb;padding:6px;text-align:right;">${formatMoney(h.price)}</td>
          <td style="border:1px solid #e5e7eb;padding:6px;text-align:right;font-weight:600;color:#059669;">${formatMoney(hotelSubtotal(h))}</td>
        </tr>`;
        const img = imageData[`hotels_${h.id}`];
        if (img || h.orderLink) {
          html += `<tr><td colspan="7" style="border:1px solid #e5e7eb;padding:6px;background:#fafafa;">
            ${img ? `<img src="${img}" style="max-width:200px;max-height:200px;border-radius:6px;border:1px solid #e5e7eb;" />` : ''}
            ${h.orderLink ? `<div style="margin-top:4px;font-size:11px;color:#2563eb;">订单链接：${esc(h.orderLink)}</div>` : ''}
          </td></tr>`;
        }
      });
      const hotelSum = hotels.reduce((s, h) => s + hotelSubtotal(h), 0);
      html += `<tr><td colspan="6" style="border:1px solid #e5e7eb;padding:6px;text-align:right;font-weight:600;">酒店小计</td>
        <td style="border:1px solid #e5e7eb;padding:6px;text-align:right;font-weight:700;color:#059669;">${formatMoney(hotelSum)}</td></tr>`;
      html += `</tbody></table>`;
    }

    // 机票
    html += `<h3 style="margin:14px 0 10px;color:#374151;font-size:16px;">✈️ 机票明细</h3>`;
    const flights = bp.flights || [];
    if (flights.length === 0) {
      html += `<p style="color:#9ca3af;margin:0;">暂无机票记录</p>`;
    } else {
      html += `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px;">
        <thead><tr style="background:#f8fafc;">
          <th style="border:1px solid #e5e7eb;padding:6px;text-align:left;">航班号</th>
          <th style="border:1px solid #e5e7eb;padding:6px;text-align:left;">航线</th>
          <th style="border:1px solid #e5e7eb;padding:6px;text-align:left;">中转</th>
          <th style="border:1px solid #e5e7eb;padding:6px;text-align:left;">平台</th>
          <th style="border:1px solid #e5e7eb;padding:6px;">日期</th>
          <th style="border:1px solid #e5e7eb;padding:6px;">价格</th>
        </tr></thead><tbody>`;
      flights.forEach(f => {
        html += `<tr>
          <td style="border:1px solid #e5e7eb;padding:6px;font-weight:600;">${esc(f.flightNumber || '')}</td>
          <td style="border:1px solid #e5e7eb;padding:6px;">${esc(f.departure || '')} → ${esc(f.destination || '')}</td>
          <td style="border:1px solid #e5e7eb;padding:6px;">${f.isTransit ? esc((f.transitCity || '中转') + (f.transitDuration ? ' / ' + f.transitDuration : '')) : '直飞'}</td>
          <td style="border:1px solid #e5e7eb;padding:6px;">${esc(f.platform || '')}</td>
          <td style="border:1px solid #e5e7eb;padding:6px;">${f.date ? formatDate(f.date) : ''}</td>
          <td style="border:1px solid #e5e7eb;padding:6px;text-align:right;font-weight:600;color:#059669;">${formatMoney(f.price)}</td>
        </tr>`;
        const img = imageData[`flights_${f.id}`];
        if (img || f.orderLink) {
          html += `<tr><td colspan="6" style="border:1px solid #e5e7eb;padding:6px;background:#fafafa;">
            ${img ? `<img src="${img}" style="max-width:200px;max-height:200px;border-radius:6px;border:1px solid #e5e7eb;" />` : ''}
            ${f.orderLink ? `<div style="margin-top:4px;font-size:11px;color:#2563eb;">订单链接：${esc(f.orderLink)}</div>` : ''}
          </td></tr>`;
        }
      });
      const flightSum = flights.reduce((s, f) => s + (Number(f.price) || 0), 0);
      html += `<tr><td colspan="5" style="border:1px solid #e5e7eb;padding:6px;text-align:right;font-weight:600;">机票小计</td>
        <td style="border:1px solid #e5e7eb;padding:6px;text-align:right;font-weight:700;color:#059669;">${formatMoney(flightSum)}</td></tr>`;
      html += `</tbody></table>`;
    }
    html += `</div></div>`;
  });

  html += `</div>`;
  return html;
}
