// 从URL获取分享令牌
let shareToken = window.location.pathname.split('/').pop();
let map, mapProvider = 'openstreetmap';
let currentPlan = null;
let days = [];

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

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const iconMap = {
    'pdf': '📄', 'doc': '📝', 'docx': '📝', 'txt': '📄',
    'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'bmp': '🖼️',
    'mp4': '🎬', 'avi': '🎬', 'mov': '🎬', 'wmv': '🎬',
    'mp3': '🎵', 'wav': '🎵', 'flac': '🎵',
    'zip': '📦', 'rar': '📦', '7z': '📦',
    'xls': '📊', 'xlsx': '📊', 'csv': '📊',
    'ppt': '📊', 'pptx': '📊'
  };
  return iconMap[ext] || '📄';
}

function detectCountry(address) {
  if (!address) return null;
  const countryPatterns = {
    '中国': /中国|北京|上海|广州|深圳|杭州|南京|成都|重庆|西安|武汉|天津|青岛|大连|厦门|苏州|无锡|宁波|长沙|郑州|济南|哈尔滨|沈阳|长春|石家庄|太原|呼和浩特|兰州|西宁|银川|乌鲁木齐|拉萨|昆明|贵阳|南宁|海口|福州|南昌|合肥/,
    '美国': /美国|纽约|洛杉矶|芝加哥|休斯顿|费城|凤凰城|圣安东尼奥|圣地亚哥|达拉斯|圣何塞|奥斯汀|杰克逊维尔|旧金山|印第安纳波利斯|哥伦布|夏洛特|西雅图|丹佛|华盛顿|波士顿|底特律|纳什维尔|孟菲斯|波特兰|俄克拉荷马城|拉斯维加斯|路易斯维尔|巴尔的摩|密尔沃基|阿尔伯克基|图森|弗雷斯诺|萨克拉门托|长滩|堪萨斯城|梅萨|弗吉尼亚海滩|亚特兰大|科罗拉多斯普林斯|奥马哈|罗利|迈阿密|奥克兰|明尼阿波利斯|塔尔萨|克利夫兰|威奇托|新奥尔良/,
    '日本': /日本|东京|大阪|横滨|名古屋|札幌|神户|京都|福冈|川崎|埼玉|广岛|仙台|北九州|千叶|世田谷|堺|新潟|浜松|熊本|相模原|冈山|八王子|鹿儿岛|船桥|宇都宫|松山|西宫|大分|高松|金泽|富山|和歌山|奈良|宫崎|前桥|长野|市川|高崎|岐阜|藤泽|枚方|柏|丰田|高槻|横须贺|岩手|秋田|山形|福岛|茨城|栃木|群马|埼玉|千叶|神奈川|新潟|富山|石川|福井|山梨|长野|岐阜|静冈|爱知|三重|滋贺|京都|大阪|兵库|奈良|和歌山|鸟取|岛根|冈山|广岛|山口|德岛|香川|爱媛|高知|福冈|佐贺|长崎|熊本|大分|宫崎|鹿儿岛|冲绳/
  };
  
  for (const [country, pattern] of Object.entries(countryPatterns)) {
    if (pattern.test(address)) {
      return country;
    }
  }
  return null;
}

function canPreviewFile(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'pdf'].includes(ext);
}

// 加载分享的计划数据
async function loadSharedPlan() {
  try {
    const response = await fetch(`/travenion/api/plans/shared/${shareToken}`);
    if (!response.ok) {
      throw new Error('计划不存在或已停止分享');
    }
    
    const data = await response.json();
    currentPlan = data;
    
    // 显示计划信息
    displayPlan(data);
    
    // 加载行程
    await loadDays();
    
    // 加载地图
    await loadMap();
    
  } catch (error) {
    console.error('加载分享计划失败:', error);
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
  }
}

// 显示计划信息
function displayPlan(plan) {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('planContent').style.display = 'block';
  
  document.getElementById('planTitle').textContent = plan.title;
  document.getElementById('planDescription').textContent = plan.description || '暂无描述';
  
  // 更新统计信息
  updateStatistics();
  
  // 初始化地图控制按钮
  initMapControls();
}

// 加载行程数据
async function loadDays() {
  try {
    const response = await fetch(`/travenion/api/plans/shared/${shareToken}/days`);
    if (response.ok) {
      days = await response.json();
      
      // 为每个day加载景点数据
      for (const day of days) {
        try {
          const attractionsResponse = await fetch(`/travenion/api/plans/shared/${shareToken}/days/${day.id}/attractions`);
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
    }
  } catch (error) {
    console.error('加载行程失败:', error);
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
        <div style="background: #dbeafe; color: #3b82f6; padding: 4px 8px; border-radius: 6px; font-size: 12px;">
          <i class="fas fa-eye"></i> 只读
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

// 更新统计信息
function updateStatistics() {
  document.getElementById('totalDays').textContent = days.length;
}

// 地图相关变量
let markers = [];
let polylines = [];
let directionsService = null;
let directionsRenderer = null;
let baiduDrivingRoute = null;
let routePolyline = null;

// 加载地图
async function loadMap() {
  try {
    if (mapProvider === 'openstreetmap') {
      await loadOSMMapsAPI();
      initOpenStreetMap();
    } else if (mapProvider === 'baidu') {
      await loadBaiduMapsAPI();
      initBaiduMap();
    }
    
    // 添加地图标记
    await addMapMarkers();
  } catch (error) {
    console.error('地图加载失败:', error);
    showNotification('地图加载失败: ' + error.message, 'error');
  }
}

// 添加地图标记
async function addMapMarkers() {
  if (!map || days.length === 0) return;

  clearMapMarkers();

  if (mapProvider === 'openstreetmap' && typeof L !== 'undefined') {
    const bounds = L.latLngBounds();
    const sortedDays = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
    
    // 收集所有景点并按全局顺序排序
    const allAttractions = [];
    for (const day of sortedDays) {
      const dayAttractions = day.attractionsList || [];
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

    const globalPath = [];
    
    for (const attraction of allAttractions) {
      if ((!attraction.latitude || !attraction.longitude) && attraction.address) {
        try {
          const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(attraction.address + ', ' + attraction.dayCity)}`);
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
        
        // 添加带编号的自定义图标
        const customIcon = L.divIcon({
          html: `<div style="background-color: #f59e0b; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${attraction.markerLabel}</div>`,
          className: 'custom-marker',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        marker.setIcon(customIcon);
        
        marker.bindPopup(`
          <div style="padding: 10px; max-width: 250px;">
            <h5 style="margin: 0 0 8px 0; color: #1f2937;">${attraction.name}</h5>
            <div style="margin-bottom: 6px; font-size: 13px; color: #6b7280;">第${attraction.dayNumber}天 - 景点${attraction.markerLabel}</div>
            ${attraction.address ? `<div style="margin-bottom: 6px; font-size: 13px;">📍 ${attraction.address}</div>` : ''}
            ${attraction.description ? `<div style="font-size: 13px;">📝 ${attraction.description}</div>` : ''}
          </div>`);

        markers.push(marker);
        globalPath.push([attraction.latitude, attraction.longitude]);
        bounds.extend([attraction.latitude, attraction.longitude]);
      }
    }

    // 创建全局连线
    if (globalPath.length > 1) {
      const polyline = L.polyline(globalPath, { color: '#f59e0b', weight: 3, opacity: 0.8 }).addTo(map);
      polylines.push(polyline);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds);
    }

  } else if (mapProvider === 'baidu' && typeof BMap !== 'undefined') {
    const geocoder = new BMap.Geocoder();
    const sortedDays = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
    const viewportPoints = [];

    // 收集所有景点并按全局顺序排序
    const allAttractions = [];
    for (const day of sortedDays) {
      const dayAttractions = day.attractionsList || [];
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
          const region = detectCountry(attraction.address) || attraction.dayCity;
          geocoder.getPoint(attraction.address, pt => resolve(pt), region);
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
          width: '20px',
          height: '20px',
          lineHeight: '20px',
          textAlign: 'center',
          fontSize: '12px',
          fontWeight: 'bold'
        });
        marker.setLabel(label);
        
        const infoWindow = new BMap.InfoWindow(`
          <div style="padding: 10px; max-width: 250px;">
            <h5 style="margin: 0 0 8px 0; color: #1f2937;">${attraction.name}</h5>
            <div style="margin-bottom: 6px; font-size: 13px; color: #6b7280;">第${attraction.dayIndex}天 - 景点${markerIndex}</div>
            ${attraction.address ? `<div style="margin-bottom: 6px; font-size: 13px;">📍 ${attraction.address}</div>` : ''}
            ${attraction.description ? `<div style="font-size: 13px;">📝 ${attraction.description}</div>` : ''}
          </div>
        `);
        
        marker.addEventListener('click', () => {
          map.openInfoWindow(infoWindow, point);
        });
        
        map.addOverlay(marker);
        markers.push(marker);
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
  if (mapProvider === 'openstreetmap' && map && markers.length > 0) {
    markers.forEach(marker => map.removeLayer(marker));
    polylines.forEach(polyline => map.removeLayer(polyline));
  } else if (mapProvider === 'baidu' && map && markers.length > 0) {
    markers.forEach(marker => map.removeOverlay(marker));
    polylines.forEach(polyline => map.removeOverlay(polyline));
  }
  
  markers = [];
  polylines = [];
}

// 初始化地图控制按钮
function initMapControls() {
  const osmBtn = document.getElementById('osmMapBtn');
  const baiduBtn = document.getElementById('baiduMapBtn');
  
  if (osmBtn && baiduBtn) {
    // 设置当前激活的按钮
    if (mapProvider === 'openstreetmap') {
      osmBtn.classList.remove('btn-outline-primary');
      osmBtn.classList.add('btn-primary');
      baiduBtn.classList.remove('btn-primary');
      baiduBtn.classList.add('btn-outline-primary');
    } else {
      baiduBtn.classList.remove('btn-outline-primary');
      baiduBtn.classList.add('btn-primary');
      osmBtn.classList.remove('btn-primary');
      osmBtn.classList.add('btn-outline-primary');
    }
    
    // 添加事件监听器
    osmBtn.onclick = () => switchMapProvider('openstreetmap');
    baiduBtn.onclick = () => switchMapProvider('baidu');
  }
  
  // 添加其他按钮的事件监听器
  const refreshBtn = document.getElementById('refreshMapBtn');
  
  if (refreshBtn) refreshBtn.onclick = refreshMap;
}

// 切换地图提供商
function switchMapProvider(provider) {
  if (provider === mapProvider) return;
  
  mapProvider = provider;
  
  // 清除当前地图
  const mapContainer = document.getElementById('map');
  mapContainer.innerHTML = '';
  map = null;
  
  // 重新加载地图
  loadMap();
  
  // 更新按钮状态
  initMapControls();
}

// 刷新地图
function refreshMap() {
  if (map) {
    addMapMarkers();
    showNotification('地图已刷新', 'success');
  }
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

// 清除路线
function clearRoute() {
  if (mapProvider === 'openstreetmap' && routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  } else if (mapProvider === 'baidu' && baiduDrivingRoute) {
    map.removeOverlay(baiduDrivingRoute);
    baiduDrivingRoute = null;
  }
  
  showNotification('路线已清除', 'success');
}

// 初始化OpenStreetMap
function initOpenStreetMap() {
  if (typeof L === 'undefined') {
    console.error('Leaflet未加载');
    return;
  }
  
  map = L.map('map').setView([39.9042, 116.4074], 10);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);
}

// 初始化百度地图
function initBaiduMap() {
  if (typeof BMap === 'undefined') {
    console.error('百度地图API未加载');
    return;
  }
  
  map = new BMap.Map('map');
  const point = new BMap.Point(116.4074, 39.9042);
  map.centerAndZoom(point, 10);
  map.enableScrollWheelZoom(true);
  
  // 添加地图控件
  map.addControl(new BMap.NavigationControl());
  map.addControl(new BMap.ScaleControl());
  map.addControl(new BMap.OverviewMapControl());
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  loadSharedPlan();
});

// 全局暴露函数供HTML调用
window.switchMapProvider = switchMapProvider;
window.refreshMap = refreshMap;