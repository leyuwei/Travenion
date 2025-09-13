let planId = new URLSearchParams(location.search).get('id');
let map, mapProvider = 'google';
let currentPlan = null;
let days = [];
let files = [];
let currentDayAttractions = []; // 当前编辑的行程日的景点列表

// 从配置文件获取默认地图提供商
if (typeof window.MAP_CONFIG !== 'undefined' && window.MAP_CONFIG.DEFAULT_MAP_PROVIDER) {
  mapProvider = window.MAP_CONFIG.DEFAULT_MAP_PROVIDER;
}

// 地图API加载状态
let googleMapsLoaded = false;
let baiduMapsLoaded = false;

// 动态加载Google Maps API
function loadGoogleMapsAPI() {
  return new Promise((resolve, reject) => {
    if (googleMapsLoaded || (typeof google !== 'undefined' && google.maps)) {
      googleMapsLoaded = true;
      resolve();
      return;
    }
    
    if (!window.MAP_CONFIG || window.MAP_CONFIG.GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY') {
      reject(new Error('Google Maps API密钥未配置'));
      return;
    }
    
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${window.MAP_CONFIG.GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      googleMapsLoaded = true;
      resolve();
    };
    
    script.onerror = () => {
      reject(new Error('Google Maps API加载失败'));
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
  modal.className = 'modal';
  modal.style.display = 'flex';
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
  modal.className = 'modal';
  modal.style.display = 'flex';
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
    
    await Promise.all([
      loadDays(),
      loadFiles(),
      loadMap()
    ]);
    
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
  
  // 显示加载状态
  mapElement.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #6b7280; text-align: center; padding: 20px;"><div style="font-size: 1.2em; margin-bottom: 10px;">🗺️ 正在加载地图...</div><div style="font-size: 0.9em;">请稍候</div></div>';
  
  try {
    if (mapProvider === 'google') {
      // 动态加载Google Maps API
      await loadGoogleMapsAPI();
      
      map = new google.maps.Map(mapElement, {
        zoom: 10,
        center: { lat: 35.6762, lng: 139.6503 },
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'on' }]
          }
        ]
      });
      
      // 添加地点标记
      addMapMarkers();
      
    } else {
      // 动态加载百度地图API
      await loadBaiduMapsAPI();
      
      map = new BMap.Map(mapElement);
      map.centerAndZoom(new BMap.Point(116.404, 39.915), 11);
      map.addControl(new BMap.MapTypeControl());
      map.addControl(new BMap.ScaleControl());
      map.addControl(new BMap.OverviewMapControl());
      map.addControl(new BMap.NavigationControl());
      
      // 添加地点标记
      addMapMarkers();
    }
    
  } catch (error) {
    console.error('地图加载失败:', error);
    
    let errorMessage = '';
    if (error.message.includes('密钥未配置')) {
      errorMessage = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #f59e0b; text-align: center; padding: 20px;">
          <div style="font-size: 1.2em; margin-bottom: 10px;">🔑 ${mapProvider === 'google' ? 'Google Maps' : '百度地图'} API 未配置</div>
          <div style="font-size: 0.9em; margin-bottom: 15px;">请在 js/config.js 文件中配置有效的API密钥</div>
          <div style="font-size: 0.8em; color: #9ca3af; background: #f9fafb; padding: 10px; border-radius: 6px; max-width: 300px;">
            配置文件位置：public/js/config.js<br>
            需要配置：${mapProvider === 'google' ? 'GOOGLE_MAPS_API_KEY' : 'BAIDU_MAP_API_KEY'}
          </div>
        </div>
      `;
    } else {
      errorMessage = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #ef4444; text-align: center; padding: 20px;">
          <div style="font-size: 1.2em; margin-bottom: 10px;">⚠️ ${mapProvider === 'google' ? 'Google Maps' : '百度地图'} 加载失败</div>
          <div style="font-size: 0.9em; margin-bottom: 10px;">请检查API密钥配置或网络连接</div>
          <div style="font-size: 0.8em; color: #9ca3af;">${error.message}</div>
        </div>
      `;
    }
    
    mapElement.innerHTML = errorMessage;
  }
}
// 地图标记和路线
let markers = [];
let polylines = [];
let directionsService = null;
let directionsRenderer = null;

// 添加地图标记（仅景点）
async function addMapMarkers() {
  if (!map || days.length === 0) return;

  clearMapMarkers();

  if (mapProvider === 'google' && typeof google !== 'undefined') {
    if (!directionsService) {
      directionsService = new google.maps.DirectionsService();
      directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#3b82f6',
          strokeWeight: 4,
          strokeOpacity: 0.8
        }
      });
      directionsRenderer.setMap(map);
    }

    const geocoder = new google.maps.Geocoder();
    const bounds = new google.maps.LatLngBounds();
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
          await new Promise(resolve => {
            geocoder.geocode({ address: `${attraction.address}, ${day.city}, China` }, (results, status) => {
              if (status === 'OK' && results[0]) {
                attraction.latitude = results[0].geometry.location.lat();
                attraction.longitude = results[0].geometry.location.lng();
              }
              resolve();
            });
          });
        }

        if (attraction.latitude && attraction.longitude) {
          const position = new google.maps.LatLng(attraction.latitude, attraction.longitude);
          const marker = new google.maps.Marker({
            position,
            map,
            title: attraction.name,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: '#f59e0b',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2
            },
            label: {
              text: (i + 1).toString(),
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '12px'
            }
          });

          const infoWindow = new google.maps.InfoWindow({
            content: `
              <div style="padding: 10px; max-width: 250px;">
                <h5 style="margin: 0 0 8px 0; color: #1f2937;">${attraction.name}</h5>
                ${attraction.address ? `<div style="margin-bottom: 6px;"><span style="color: #6b7280; font-size: 13px;">📍 地址:</span><span style="margin-left: 5px; font-size: 13px;">${attraction.address}</span></div>` : ''}
                ${attraction.description ? `<div><span style="color: #6b7280; font-size: 13px;">📝 描述:</span><div style="margin-top: 4px; font-size: 13px; color: #374151;">${attraction.description}</div></div>` : ''}
              </div>`
          });

          marker.addListener('click', () => {
            markers.forEach(m => m.infoWindow && m.infoWindow.close());
            infoWindow.open(map, marker);
          });

          markers.push({ marker, infoWindow, position, attraction });
          path.push(position);
          bounds.extend(position);
        }
      }

      if (path.length > 1) {
        const polyline = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: '#f59e0b',
          strokeOpacity: 1.0,
          strokeWeight: 2
        });
        polyline.setMap(map);
        polylines.push(polyline);
      }
    }

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds);
      google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        if (map.getZoom() > 15) map.setZoom(15);
      });
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
            geocoder.getPoint(attraction.address, pt => resolve(pt), day.city);
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
    if (mapProvider === 'google') {
      item.marker.setMap(null);
      item.infoWindow && item.infoWindow.close();
    } else if (mapProvider === 'baidu') {
      map.removeOverlay(item.marker);
    }
  });
  markers = [];

  polylines.forEach(polyline => {
    if (mapProvider === 'google') {
      polyline.setMap(null);
    } else if (mapProvider === 'baidu') {
      map.removeOverlay(polyline);
    }
  });
  polylines = [];

  if (directionsRenderer) {
    directionsRenderer.setDirections({ routes: [] });
  }
}

// 显示路线
function showRoute() {
  if (mapProvider !== 'google' || !directionsService || days.length < 2) {
    showNotification('需要至少2个城市才能显示路线，且当前仅支持Google地图', 'info');
    return;
  }
  
  const sortedDays = [...days].sort((a, b) => a.day_index - b.day_index);
  const waypoints = [];
  
  // 构建路线点
  if (sortedDays.length > 2) {
    for (let i = 1; i < sortedDays.length - 1; i++) {
      waypoints.push({
        location: sortedDays[i].city + ', China',
        stopover: true
      });
    }
  }
  
  const request = {
    origin: sortedDays[0].city + ', China',
    destination: sortedDays[sortedDays.length - 1].city + ', China',
    waypoints: waypoints,
    travelMode: google.maps.TravelMode.DRIVING,
    optimizeWaypoints: false
  };
  
  directionsService.route(request, (result, status) => {
    if (status === 'OK') {
      directionsRenderer.setDirections(result);
      showNotification('路线规划完成', 'success');
      
      // 显示路线信息
      const route = result.routes[0];
      const totalDistance = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
      const totalDuration = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);
      
      showNotification(
        `总距离: ${(totalDistance / 1000).toFixed(1)}公里，预计时间: ${Math.round(totalDuration / 3600)}小时${Math.round((totalDuration % 3600) / 60)}分钟`,
        'info'
      );
    } else {
      showNotification('路线规划失败: ' + status, 'error');
    }
  });
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
  modal.style.display = 'flex';
}

function closeFileModal() {
  document.getElementById('fileModal').style.display = 'none';
}

// 分享计划
function sharePlan() {
  const plan = window.currentPlan;
  if (!plan) {
    showNotification('计划信息加载失败', 'error');
    return;
  }
  
  // 加载当前分享设置
  loadShareSettings();
  openModal('sharePlanModal');
}

// 加载分享设置
async function loadShareSettings() {
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/share`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (response.ok) {
      const shareData = await response.json();
      document.getElementById('enableSharing').checked = shareData.is_public;
      
      if (shareData.is_public) {
        document.getElementById('shareOptions').style.display = 'block';
        document.getElementById('shareUrl').value = `${window.location.origin}/shared/${shareData.share_token}`;
        
        // 设置权限
        const permissionRadios = document.querySelectorAll('input[name="sharePermission"]');
        permissionRadios.forEach(radio => {
          if (radio.value === shareData.permission) {
            radio.checked = true;
          }
        });
        
        // 加载已邀请用户
        loadInvitedUsers(shareData.invited_users || []);
      }
    }
  } catch (error) {
    console.error('加载分享设置失败:', error);
  }
}

// 加载已邀请用户列表
function loadInvitedUsers(users) {
  const container = document.getElementById('invitedUsers');
  container.innerHTML = '';
  
  users.forEach(user => {
    const userDiv = document.createElement('div');
    userDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; border: 1px solid #e5e7eb; border-radius: 4px; margin-bottom: 8px; background: #f9fafb;';
    userDiv.innerHTML = `
      <div>
        <span style="font-weight: 500;">${user.email}</span>
        <small style="color: #6b7280; margin-left: 8px;">${user.permission}</small>
      </div>
      <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeInvitedUser('${user.email}')">
        <i class="fas fa-times"></i>
      </button>
    `;
    container.appendChild(userDiv);
  });
}

// 切换分享选项显示
function toggleShareOptions() {
  const enableSharing = document.getElementById('enableSharing');
  const shareOptions = document.getElementById('shareOptions');
  
  if (enableSharing.checked) {
    shareOptions.style.display = 'block';
    // 生成分享链接
    generateShareUrl();
  } else {
    shareOptions.style.display = 'none';
  }
}

// 生成分享链接
async function generateShareUrl() {
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/share/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      document.getElementById('shareUrl').value = `${window.location.origin}/shared/${data.share_token}`;
    }
  } catch (error) {
    console.error('生成分享链接失败:', error);
  }
}

// 复制分享链接
function copyShareUrl() {
  const shareUrl = document.getElementById('shareUrl');
  shareUrl.select();
  document.execCommand('copy');
  showNotification('分享链接已复制到剪贴板', 'success');
}

// 邀请用户
async function inviteUser() {
  const email = document.getElementById('inviteEmail').value.trim();
  if (!email) {
    showNotification('请输入邮箱地址', 'error');
    return;
  }
  
  if (!isValidEmail(email)) {
    showNotification('请输入有效的邮箱地址', 'error');
    return;
  }
  
  const permission = document.querySelector('input[name="sharePermission"]:checked').value;
  
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/share/invite`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, permission })
    });
    
    if (response.ok) {
      showNotification('邀请发送成功', 'success');
      document.getElementById('inviteEmail').value = '';
      // 重新加载邀请用户列表
      loadShareSettings();
    } else {
      const error = await response.json();
      showNotification(error.message || '邀请发送失败', 'error');
    }
  } catch (error) {
    console.error('邀请用户失败:', error);
    showNotification('邀请发送失败', 'error');
  }
}

// 移除已邀请用户
async function removeInvitedUser(email) {
  if (!confirm(`确定要移除用户 ${email} 的访问权限吗？`)) {
    return;
  }
  
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/share/invite`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });
    
    if (response.ok) {
      showNotification('用户访问权限已移除', 'success');
      // 重新加载邀请用户列表
      loadShareSettings();
    } else {
      showNotification('移除失败', 'error');
    }
  } catch (error) {
    console.error('移除用户失败:', error);
    showNotification('移除失败', 'error');
  }
}

// 保存分享设置
async function saveShareSettings() {
  const isPublic = document.getElementById('enableSharing').checked;
  const permission = document.querySelector('input[name="sharePermission"]:checked').value;
  
  try {
    const response = await fetch(`/travenion/api/plans/${planId}/share`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        is_public: isPublic,
        permission: permission
      })
    });
    
    if (response.ok) {
      showNotification('分享设置已保存', 'success');
      closeModal('sharePlanModal');
    } else {
      showNotification('保存失败', 'error');
    }
  } catch (error) {
    console.error('保存分享设置失败:', error);
    showNotification('保存失败', 'error');
  }
}

// 验证邮箱格式
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function openShareModal() {
  const modal = document.getElementById('shareModal');
  loadSharedUsers();
  modal.style.display = 'flex';
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
  document.getElementById('shareModal').style.display = 'none';
}

function openEditPlanModal() {
  const modal = document.getElementById('editPlanModal');
  const form = document.getElementById('editPlanForm');
  
  if (currentPlan) {
    form.title.value = currentPlan.title;
    form.description.value = currentPlan.description || '';
    form.defaultMap.value = currentPlan.defaultMap || 'google';
  }
  
  modal.style.display = 'flex';
}

function closeEditPlanModal() {
  document.getElementById('editPlanModal').style.display = 'none';
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
        container.innerHTML = '暂无分享';
      } else {
        container.innerHTML = shares.map(share => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <span>${share.username}</span>
            <button class="btn btn-danger" onclick="removeShare('${share.username}')" style="padding: 4px 8px; font-size: 12px;">移除</button>
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
    loadSharedUsers();
    
  } catch (error) {
    console.error('移除分享失败:', error);
    showNotification('移除分享失败', 'error');
  }
}

// 初始化地图按钮状态
function initMapButtons() {
  const googleBtn = document.getElementById('googleMapBtn');
  const baiduBtn = document.getElementById('baiduMapBtn');
  
  if (!googleBtn || !baiduBtn) return;
  
  // 清除所有状态
  googleBtn.classList.remove('btn-outline-primary', 'btn-primary');
  baiduBtn.classList.remove('btn-outline-primary', 'btn-primary');
  
  // 根据当前地图提供商设置按钮状态
  if (mapProvider === 'google') {
    googleBtn.classList.add('btn-primary');
    baiduBtn.classList.add('btn-outline-primary');
  } else {
    baiduBtn.classList.add('btn-primary');
    googleBtn.classList.add('btn-outline-primary');
  }
}

// 切换地图提供商
function switchMapProvider(provider) {
  if (provider === mapProvider) return;
  
  mapProvider = provider;
  
  // 更新按钮状态
  initMapButtons();
  
  // 重新加载地图
  loadMap();
}

// 清除路线
function clearRoute() {
  if (directionsRenderer) {
    directionsRenderer.setDirections({ routes: [] });
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
  const googleMapBtn = document.getElementById('googleMapBtn');
  const baiduMapBtn = document.getElementById('baiduMapBtn');
  
  if (googleMapBtn) {
    googleMapBtn.addEventListener('click', () => {
      switchMapProvider('google');
    });
  }
  
  if (baiduMapBtn) {
    baiduMapBtn.addEventListener('click', () => {
      switchMapProvider('baidu');
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
        modal.style.display = 'none';
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
