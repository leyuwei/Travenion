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
  notification.innerHTML = `
    <span>${message}</span>
    <button onclick="this.parentElement.remove()">&times;</button>
  `;
  container.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
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
    previewContent.innerHTML = `
      <img src="${fileUrl}" alt="${file.filename}" 
           style="max-width: 100%; max-height: 60vh; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    `;
  } else if (ext === 'pdf') {
    // PDF预览
    previewContent.innerHTML = `
      <iframe src="${fileUrl}" 
              style="width: 100%; height: 60vh; border: none; border-radius: 8px;" 
              title="PDF预览">
        <p>您的浏览器不支持PDF预览。<a href="${fileUrl}" target="_blank">点击这里下载文件</a></p>
      </iframe>
    `;
  } else if (['txt', 'md', 'html', 'htm'].includes(ext)) {
    // 文本文件预览
    fetch(fileUrl)
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
              <div style="display: flex; align-items: center; padding: 8px; margin-bottom: 6px; background: #f8fafc; border-radius: 6px; border-left: 3px solid #3b82f6;">
                <span style="background: #3b82f6; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 10px; flex-shrink: 0;">${index + 1}</span>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 500; color: #1f2937; margin-bottom: 2px;">${attraction.name}</div>
                  ${attraction.description ? `<div style="color: #6b7280; font-size: 13px; margin-bottom: 2px;">${attraction.description}</div>` : ''}
                  ${attraction.address ? `<div style="color: #9ca3af; font-size: 12px;"><i class="fas fa-map-marker-alt"></i> ${attraction.address}</div>` : ''}
                </div>
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

// 添加地图标记（仅景点）
async function addMapMarkers() {
  if (!map || days.length === 0) return;

  clearMapMarkers();

  if (mapProvider === 'openstreetmap' && typeof L !== 'undefined') {
    const bounds = L.latLngBounds();
    const sortedDays = [...days].sort((a, b) => a.day_index - b.day_index);

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

      const path = [];
      for (let i = 0; i < dayAttractions.length; i++) {
        const attraction = dayAttractions[i];

        if ((!attraction.latitude || !attraction.longitude) && attraction.address) {
          try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(attraction.address + ', ' + day.city)}`);
            const data = await resp.json();
            if (data[0]) {
              attraction.latitude = parseFloat(data[0].lat);
              attraction.longitude = parseFloat(data[0].lon);
            }
          } catch (e) {
            console.error('地理编码失败:', e);
          }
        }

        if (attraction.latitude && attraction.longitude) {
          const marker = L.marker([attraction.latitude, attraction.longitude]).addTo(map);
          marker.bindPopup(`
            <div style="padding: 10px; max-width: 250px;">
              <h5 style="margin: 0 0 8px 0; color: #1f2937;">${attraction.name}</h5>
              ${attraction.address ? `<div style="margin-bottom: 6px; font-size: 13px;">📍 ${attraction.address}</div>` : ''}
              ${attraction.description ? `<div style="font-size: 13px;">📝 ${attraction.description}</div>` : ''}
            </div>`);

          markers.push(marker);
          path.push([attraction.latitude, attraction.longitude]);
          bounds.extend([attraction.latitude, attraction.longitude]);
        }
      }

      if (path.length > 1) {
        const polyline = L.polyline(path, { color: '#f59e0b', weight: 2 }).addTo(map);
        polylines.push(polyline);
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds);
    }

  } else if (mapProvider === 'baidu' && typeof BMap !== 'undefined') {
    const geocoder = new BMap.Geocoder();
    const sortedDays = [...days].sort((a, b) => a.day_index - b.day_index);
    const viewportPoints = [];

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

      const pathPoints = [];
      for (let i = 0; i < dayAttractions.length; i++) {
        const attraction = dayAttractions[i];

        const point = await new Promise(resolve => {
          if (attraction.latitude && attraction.longitude) {
            resolve(new BMap.Point(attraction.longitude, attraction.latitude));
          } else if (attraction.address) {
            const region = detectCountry(attraction.address) || day.city;
            geocoder.getPoint(attraction.address, pt => resolve(pt), region);
          } else {
            resolve(null);
          }
        });

        if (point) {
          const marker = new BMap.Marker(point);
          const label = new BMap.Label((i + 1).toString(), { offset: new BMap.Size(0, -20) });
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
              ${attraction.address ? `<p><strong>地址:</strong> ${attraction.address}</p>` : ''}
              ${attraction.description ? `<p><strong>描述:</strong> ${attraction.description}</p>` : ''}
            </div>`);

          marker.addEventListener('click', () => {
            map.openInfoWindow(infoWindow, point);
          });

          markers.push({ marker, point, attraction, infoWindow });
          pathPoints.push(point);
          viewportPoints.push(point);
        }
      }

      if (pathPoints.length > 1) {
        const polyline = new BMap.Polyline(pathPoints, {
          strokeColor: '#f59e0b',
          strokeWeight: 3,
          strokeOpacity: 0.8
        });
        map.addOverlay(polyline);
        polylines.push(polyline);
      }
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

// 显示路线
async function showRoute() {
  if (days.length < 2) {
    showNotification('需要至少2个城市才能显示路线', 'info');
    return;
  }

  const sortedDays = [...days].sort((a, b) => a.day_index - b.day_index);

  if (mapProvider === 'openstreetmap') {
    const coords = [];
    for (const day of sortedDays) {
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(day.city)}`);
        const data = await resp.json();
        if (data[0]) {
          coords.push([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
        }
      } catch (e) {
        console.error('路线地理编码失败:', e);
      }
    }

    if (coords.length > 1) {
      if (routePolyline) {
        map.removeLayer(routePolyline);
      }
      routePolyline = L.polyline(coords, { color: '#3b82f6', weight: 4 }).addTo(map);
      map.fitBounds(L.latLngBounds(coords));
      showNotification('路线规划完成', 'success');
    } else {
      showNotification('路线规划失败', 'error');
    }

  } else if (mapProvider === 'baidu' && typeof BMap !== 'undefined') {
    if (!baiduDrivingRoute) {
      baiduDrivingRoute = new BMap.DrivingRoute(map, {
        renderOptions: { map: map, autoViewport: true }
      });
    } else {
      baiduDrivingRoute.clearResults();
    }

    baiduDrivingRoute.setSearchCompleteCallback(() => {
      if (baiduDrivingRoute.getStatus() === BMAP_STATUS_SUCCESS) {
        showNotification('路线规划完成', 'success');
      } else {
        showNotification('路线规划失败', 'error');
      }
    });

    const waypoints = sortedDays.slice(1, -1).map(d => d.city);
    baiduDrivingRoute.search(sortedDays[0].city, sortedDays[sortedDays.length - 1].city, { waypoints });
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
      <button type="button" class="btn btn-sm btn-primary" onclick="shareWithUser('${user.username}')">
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
              <span style="font-weight: 500; color: #1f2937;">${share.User.username}</span>
              <small style="color: #6b7280; margin-left: 8px;">${share.User.email}</small>
              <span style="color: #059669; margin-left: 8px; font-size: 12px;">${share.permission}</span>
            </div>
            <button class="btn btn-sm btn-outline-danger" onclick="removeShare('${share.User.username}')">
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
  loadMap();
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
  
  // 路线控制
  const showRouteBtn = document.getElementById('showRouteBtn');
  const clearRouteBtn = document.getElementById('clearRouteBtn');
  
  if (showRouteBtn) {
    showRouteBtn.addEventListener('click', () => {
      showRoute();
    });
  }
  
  if (clearRouteBtn) {
    clearRouteBtn.addEventListener('click', () => {
      clearRoute();
    });
  }
  
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
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <span style="background: #007bff; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 8px;">${index + 1}</span>
          <strong style="color: #333;">${attraction.name}</strong>
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
      </div>
    `;
    
    container.appendChild(attractionItem);
  });
}

// 景点编辑相关变量
let currentEditingAttraction = null;
let isEditingAttraction = false;

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
