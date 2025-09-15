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
    }
    if (planDescription) {
      planDescription.textContent = currentPlan.description || '暂无描述';
    }
    
    // 设置默认地图提供商
    if (currentPlan.defaultMap) {
      mapProvider = currentPlan.defaultMap;
    }
    
    // 更新地图按钮状态
    initMapButtons();
    
    await loadDays();
    await loadFiles();
    await loadMap();
    
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
            <h3 style="margin: 0; color: #1f2937;">${day.city} ${todayBadge}</h3>
            <p style="margin: 0; color: #6b7280; font-size: 14px;">第${day.dayIndex}天 ${day.date ? formatDate(day.date) : ''}</p>
          </div>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-info paste-btn" onclick="pasteAttraction(${day.id})" style="padding: 8px 12px; font-size: 14px; ${copiedAttraction ? 'background: #17a2b8; color: white; border: 1px solid #17a2b8;' : 'background: #e9ecef; color: #6c757d; border: 1px solid #dee2e6; cursor: not-allowed;'}" title="${copiedAttraction ? `粘贴景点: ${copiedAttraction.name}` : '剪贴板为空'}">
            <i class="fas fa-paste"></i> 粘贴${copiedAttraction ? ` (${copiedAttraction.name})` : ''}
          </button>
          <button class="btn btn-outline" onclick="editDay(${day.id})" style="padding: 8px 12px; font-size: 14px;">编辑</button>
          <button class="btn btn-danger" onclick="deleteDay(${day.id})" style="padding: 8px 12px; font-size: 14px;">删除</button>
        </div>
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
                  <div style="font-weight: 500; color: #1f2937; margin-bottom: 2px;">${attraction.name} <span style="color: #3b82f6; font-size: 12px;">📍 点击查看</span></div>
                  ${attraction.description ? `<div style="color: #6b7280; font-size: 13px; margin-bottom: 2px;">${attraction.description}</div>` : ''}
                  ${attraction.address ? `<div style="color: #9ca3af; font-size: 12px;"><i class="fas fa-map-marker-alt"></i> ${attraction.address}</div>` : ''}
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
  
  container.innerHTML = files.map(file => `
    <div class="file-card" style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;">
      <div style="text-align: center; margin-bottom: 15px;">
        <div style="font-size: 2.5rem; margin-bottom: 10px;">${getFileIcon(file.filename)}</div>
        <h4 style="margin: 0; font-size: 16px; color: #1f2937; word-break: break-word;" title="${file.filename}">${file.filename}</h4>
        <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 12px;">
          上传于 ${formatDate(file.created_at)}
        </p>
        ${file.description ? `<div style="margin-top: 8px; padding: 8px; background: #f8fafc; border-radius: 6px; font-size: 12px; color: #6b7280;">${file.description}</div>` : ''}
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        ${canPreviewFile(file.filename) ? `
          <button class="btn btn-outline" onclick="previewFile(${file.id})" style="flex: 1; min-width: 60px; font-size: 12px;" title="预览">预览</button>
        ` : ''}
        <button class="btn btn-outline" onclick="downloadFile(${file.id})" style="flex: 1; min-width: 60px; font-size: 12px;" title="下载">下载</button>
        <button class="btn btn-secondary" onclick="editFileDescription(${file.id})" style="flex: 1; min-width: 60px; font-size: 12px;" title="编辑描述">描述</button>
        <button class="btn btn-danger" onclick="deleteFile(${file.id})" style="flex: 1; min-width: 60px; font-size: 12px;" title="删除">删除</button>
      </div>
    </div>
  `).join('');
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
    let globalIndex = 1;
    
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
      
      // 为每个景点添加全局信息
      dayAttractions.forEach(attraction => {
        allAttractions.push({
          ...attraction,
          dayIndex: day.dayIndex,
          dayCity: day.city,
          globalOrder: globalIndex++
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
              
              // 增加延迟以避免API限制
              if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 800));
              }
              
              const searchQuery = `${attraction.address}, ${attraction.dayCity}`;
              const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&addressdetails=1`,
                {
                  headers: {
                    'User-Agent': 'Travenion/1.0 (travel planning application)'
                  },
                  timeout: 10000
                }
              );
              
              if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0 && data[0].lat && data[0].lon) {
                  lat = parseFloat(data[0].lat);
                  lng = parseFloat(data[0].lon);
                  console.log(`地理编码成功: ${attraction.name} -> ${lat}, ${lng}`);
                } else {
                  console.warn(`地理编码无结果: ${attraction.name}`);
                  geocodingFailed = true;
                }
              } else {
                console.warn(`地理编码请求失败: ${attraction.name}, 状态: ${response.status}`);
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
              width: 32px;
              height: 32px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 14px;
              border: 3px solid white;
              box-shadow: 0 3px 6px rgba(0,0,0,0.4);
              cursor: pointer;
            ">${attraction.globalOrder}</div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -16]
        });
        
        // 创建并添加标记
        const marker = L.marker([lat, lng], { icon: markerIcon });
        
        // 创建弹出窗口内容
        const popupContent = `
          <div style="min-width: 220px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="background: linear-gradient(135deg, #007bff, #0056b3); color: white; margin: -9px -9px 12px -9px; padding: 12px; border-radius: 4px 4px 0 0;">
              <h4 style="margin: 0; font-size: 16px; font-weight: 600;">${attraction.name}</h4>
              <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">第${attraction.dayIndex}天 · 景点${attraction.globalOrder}</div>
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
        
        console.log(`添加标记: ${attraction.name} (${attraction.globalOrder})`);
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
      const routeLine = L.polyline(pathCoordinates, {
        color: '#007bff',
        weight: 4,
        opacity: 0.8,
        smoothFactor: 1,
        dashArray: null
      });
      
      routeLine.addTo(map);
      polylines.push(routeLine);
      
      console.log(`创建路线连线，包含 ${pathCoordinates.length} 个点`);
    }
    
    // 调整地图视野
    if (bounds.isValid() && pathCoordinates.length > 0) {
      map.fitBounds(bounds.pad(0.1));
    }
    
    console.log(`OpenStreetMap处理完成: ${validAttractions.length}/${allAttractions.length} 个景点成功显示`);

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
      
      // 为每个景点添加天数信息用于全局排序
      dayAttractions.forEach(attraction => {
        attraction.dayIndex = day.dayIndex;
        attraction.dayCity = day.city;
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
    let markerIndex = 1;
    
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
        const label = new BMap.Label(markerIndex.toString(), { offset: new BMap.Size(0, -20) });
        label.setStyle({
          color: '#ffffff',
          backgroundColor: '#f59e0b',
          border: '2px solid #ffffff',
          borderRadius: '50%',
          padding: '3px 6px',
          fontWeight: 'bold',
          textAlign: 'center',
          fontSize: '12px'
        });
        marker.setLabel(label);
        map.addOverlay(marker);

        const infoWindow = new BMap.InfoWindow(`
          <div style="padding: 10px;">
            <h5 style="margin: 0 0 8px 0;">${attraction.name}</h5>
            <p style="margin: 4px 0; color: #666; font-size: 13px;">第${attraction.dayIndex}天 - 景点${markerIndex}</p>
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
        markerIndex++;
      }
    }

    // 创建全局连线
    if (globalPathPoints.length > 1) {
      const polyline = new BMap.Polyline(globalPathPoints, {
        strokeColor: '#f59e0b',
        strokeWeight: 3,
        strokeOpacity: 0.8
      });
      map.addOverlay(polyline);
      polylines.push(polyline);
    }

    if (viewportPoints.length > 0) {
      map.setViewport(viewportPoints);
    }
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
      body: JSON.stringify({ username, permission: 'view' })
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
      const filenameMatch = contentDisposition.match(/filename="(.+)"/i);
      if (filenameMatch) {
        filename = filenameMatch[1];
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

  // 清除所有状态
  osmBtn.classList.remove('btn-outline-primary', 'btn-primary');
  baiduBtn.classList.remove('btn-outline-primary', 'btn-primary');

  // 根据当前地图提供商设置按钮状态
  if (mapProvider === 'openstreetmap') {
    osmBtn.classList.add('btn-primary');
    baiduBtn.classList.add('btn-outline-primary');
  } else {
    baiduBtn.classList.add('btn-primary');
    osmBtn.classList.add('btn-outline-primary');
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

// 添加景点项
function addAttractionItem() {
  currentEditingAttraction = null;
  isEditingAttraction = false;
  document.getElementById('attractionModalTitle').textContent = '添加景点';
  document.getElementById('attractionSaveText').textContent = '保存';
  document.getElementById('attractionName').value = '';
  document.getElementById('attractionAddress').value = '';
  document.getElementById('attractionDescription').value = '';
  openModal('attractionModal');
}

// 关闭景点模态框
function closeAttractionModal() {
  closeModal('attractionModal');
  currentEditingAttraction = null;
  isEditingAttraction = false;
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
  
  if (isEditingAttraction && currentEditingAttraction !== null) {
    // 编辑现有景点
    currentDayAttractions[currentEditingAttraction] = {
      ...currentDayAttractions[currentEditingAttraction],
      name: name,
      address: address,
      description: description
    };
  } else {
    // 添加新景点
    const newAttraction = {
      name: name,
      description: description,
      address: address,
      latitude: null,
      longitude: null,
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
  document.getElementById('attractionModalTitle').textContent = '编辑景点';
  document.getElementById('attractionSaveText').textContent = '更新';
  document.getElementById('attractionName').value = attraction.name || '';
  document.getElementById('attractionAddress').value = attraction.address || '';
  document.getElementById('attractionDescription').value = attraction.description || '';
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
  
  let navigationUrl;
  
  if (isMobile) {
    if (isIOS) {
      // iOS设备：优先尝试Apple Maps，如果失败则使用Google Maps
      navigationUrl = `maps://maps.apple.com/?q=${encodeURIComponent(query)}&dirflg=d`;
      
      // 尝试打开Apple Maps，如果失败则使用Google Maps
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = navigationUrl;
      document.body.appendChild(iframe);
      
      // 延迟后移除iframe并尝试Google Maps作为备选
      setTimeout(() => {
        document.body.removeChild(iframe);
        // 如果Apple Maps没有响应，尝试Google Maps
        const googleMapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&navigate=yes`;
        window.open(googleMapsUrl, '_blank');
      }, 1000);
      
      return;
    } else if (isAndroid) {
      // Android设备：使用Google Maps的intent URL
      navigationUrl = `google.navigation:q=${encodeURIComponent(query)}`;
      
      // 尝试打开Google Maps应用
      window.location.href = navigationUrl;
      
      // 如果应用没有安装，延迟后打开网页版
      setTimeout(() => {
        const webUrl = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&navigate=yes`;
        window.open(webUrl, '_blank');
      }, 1500);
      
      return;
    }
  }
  
  // PC端或其他设备：直接打开Google Maps网页版
  navigationUrl = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&navigate=yes`;
  window.open(navigationUrl, '_blank');
  
  // 显示成功提示
  showNotification(`正在为您导航到: ${attractionName}`, 'success');
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
      await fetch(`/travenion/api/attractions/day/${dayId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(attraction)
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
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 10px;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          ">${attraction.globalOrder || '•'}</div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
      });
      
      const miniMarker = L.marker([lat, lng], { icon: miniMarkerIcon })
        .bindPopup(`<strong>${attraction.name}</strong><br>第${attraction.dayIndex}天`)
        .addTo(miniMap);
        
    } else if (mapProvider === 'baidu') {
      const point = new BMap.Point(lng, lat);
      
      // 创建简单的圆形标记图标，避免中文字符编码问题
      const svgContent = `<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" fill="#007bff" stroke="white" stroke-width="2"/><circle cx="10" cy="10" r="3" fill="white"/></svg>`;
      const icon = new BMap.Icon(
        `data:image/svg+xml;base64,${btoa(svgContent)}`,
        new BMap.Size(20, 20),
        { anchor: new BMap.Size(10, 10) }
      );
      
      const miniMarker = new BMap.Marker(point, { icon });
      miniMap.addOverlay(miniMarker);
      
      const infoWindow = new BMap.InfoWindow(attraction.name, {
        width: 120,
        height: 30,
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

// 在页面加载完成后初始化浮动小地图
document.addEventListener('DOMContentLoaded', () => {
  // 延迟初始化，确保地图已加载
  setTimeout(initFloatingMiniMap, 1000);
});
