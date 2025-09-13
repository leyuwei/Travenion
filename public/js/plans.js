const token = localStorage.getItem('token');
if (!token) location.href = 'index.html';

let currentUser = null;
let allPlans = [];

// 通知系统
function showNotification(message, type = 'success') {
  const container = document.getElementById('notification-container');
  const notification = document.createElement('div');
  notification.className = `alert alert-${type} fade-in`;
  notification.style.cssText = 'margin-bottom: 10px; min-width: 300px;';
  notification.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span>${message}</span>
      <button class="close" onclick="this.parentElement.parentElement.remove()">&times;</button>
    </div>
  `;
  container.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
}

// 设置加载状态
function setLoadingState(button, isLoading) {
  const text = button.querySelector('.create-text');
  const loading = button.querySelector('.loading');
  
  if (isLoading) {
    button.disabled = true;
    text.style.display = 'none';
    loading.style.display = 'inline-block';
  } else {
    button.disabled = false;
    text.style.display = 'inline-block';
    loading.style.display = 'none';
  }
}

// 格式化日期
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// 获取用户信息
async function loadUserInfo() {
  try {
    const res = await fetch('api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.ok) {
      currentUser = await res.json();
      document.getElementById('userWelcome').textContent = `欢迎回来，${currentUser.username}！`;
    }
  } catch (error) {
    console.error('获取用户信息失败:', error);
  }
}

// 加载旅行计划
async function loadPlans() {
  try {
    const res = await fetch('api/plans', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    if (!res.ok) {
      throw new Error('获取计划列表失败');
    }
    
    allPlans = await res.json();
    renderPlans();
    updateStats();
  } catch (error) {
    showNotification('加载计划列表失败，请刷新页面重试', 'danger');
  }
}

// 渲染计划列表
function renderPlans() {
  const planGrid = document.getElementById('planGrid');
  const emptyState = document.getElementById('emptyState');
  
  if (allPlans.length === 0) {
    emptyState.style.display = 'block';
    planGrid.style.display = 'none';
    return;
  }
  
  emptyState.style.display = 'none';
  planGrid.style.display = 'grid';
  planGrid.innerHTML = '';
  
  allPlans.forEach(plan => {
    const planCard = document.createElement('div');
    planCard.className = 'card fade-in';
    planCard.style.cursor = 'pointer';
    
    const dayCount = plan.days ? plan.days.length : 0;
    const fileCount = plan.files ? plan.files.length : 0;
    const sharedCount = plan.sharedWith ? plan.sharedWith.length : 0;
    
    planCard.innerHTML = `
      <div class="card-header">
        <h3 class="card-title" style="margin-bottom: 5px;">${plan.title}</h3>
        <p style="color: #6b7280; margin: 0; font-size: 14px;">${plan.description || '暂无描述'}</p>
      </div>
      <div style="padding: 20px 25px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
          <div style="text-align: center; padding: 10px; background: #f8fafc; border-radius: 8px;">
            <div style="font-size: 1.5rem; color: #2563eb;">📅</div>
            <div style="font-size: 14px; color: #6b7280;">行程天数</div>
            <div style="font-weight: 600;">${dayCount} 天</div>
          </div>
          <div style="text-align: center; padding: 10px; background: #f8fafc; border-radius: 8px;">
            <div style="font-size: 1.5rem; color: #059669;">📁</div>
            <div style="font-size: 14px; color: #6b7280;">文件数量</div>
            <div style="font-weight: 600;">${fileCount} 个</div>
          </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <div style="display: flex; gap: 10px;">
            <span class="badge badge-secondary">${plan.defaultMap === 'google' ? 'Google地图' : '百度地图'}</span>
            ${sharedCount > 0 ? `<span class="badge">已分享给${sharedCount}人</span>` : ''}
          </div>
          <span style="font-size: 12px; color: #9ca3af;">创建于 ${formatDate(plan.createdAt)}</span>
        </div>
        
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-primary" style="flex: 1;" onclick="openPlan(${plan.id})">
            查看详情
          </button>
          <button class="btn btn-outline" onclick="event.stopPropagation(); deletePlan(${plan.id}, '${plan.title}')">
            删除
          </button>
        </div>
      </div>
    `;
    
    planGrid.appendChild(planCard);
  });
}

// 更新统计信息
function updateStats() {
  document.getElementById('totalPlans').textContent = allPlans.length;
  
  if (allPlans.length > 0) {
    const lastPlan = allPlans.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
    document.getElementById('lastActivity').textContent = `最近更新了「${lastPlan.title}」`;
  }
}

// 打开计划详情
function openPlan(planId) {
  location.href = `plan.html?id=${planId}`;
}

// 删除计划
async function deletePlan(planId, planTitle) {
  if (!confirm(`确定要删除计划「${planTitle}」吗？此操作不可撤销。`)) {
    return;
  }
  
  try {
    const res = await fetch(`api/plans/${planId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    if (res.ok) {
      showNotification(`计划「${planTitle}」已删除`, 'success');
      loadPlans();
    } else {
      throw new Error('删除失败');
    }
  } catch (error) {
    showNotification('删除计划失败，请稍后重试', 'danger');
  }
}

// 模态框控制
function openModal() {
  document.getElementById('newPlanModal').style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('newPlanModal').style.display = 'none';
  document.body.style.overflow = 'auto';
  document.getElementById('newPlanForm').reset();
}

// 初始化
async function init() {
  await loadUserInfo();
  await loadPlans();
  
  // 添加页面加载动画
  const elements = document.querySelectorAll('.fade-in');
  elements.forEach((el, index) => {
    setTimeout(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, index * 100);
  });
}

init();

// 事件监听器
document.getElementById('newPlanBtn').addEventListener('click', openModal);

document.getElementById('newPlanForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const submitBtn = document.querySelector('button[form="newPlanForm"]');
  
  setLoadingState(submitBtn, true);
  
  try {
    const res = await fetch('api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        title: form.title.value.trim(),
        description: form.description.value.trim(),
        defaultMap: form.defaultMap.value
      })
    });
    
    if (res.ok) {
      const newPlan = await res.json();
      showNotification(`计划「${newPlan.title}」创建成功！`, 'success');
      closeModal();
      loadPlans();
    } else {
      const data = await res.json();
      throw new Error(data.message || '创建失败');
    }
  } catch (error) {
    showNotification(error.message || '创建计划失败，请稍后重试', 'danger');
  } finally {
    setLoadingState(submitBtn, false);
  }
});

document.getElementById('logout').addEventListener('click', () => {
  if (confirm('确定要退出登录吗？')) {
    localStorage.removeItem('token');
    showNotification('已退出登录', 'success');
    setTimeout(() => {
      location.href = 'index.html';
    }, 1000);
  }
});

// 点击模态框外部关闭
document.getElementById('newPlanModal').addEventListener('click', (e) => {
  if (e.target.id === 'newPlanModal') {
    closeModal();
  }
});

// ESC键关闭模态框
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
  }
});
