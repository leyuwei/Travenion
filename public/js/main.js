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
  
  // 自动移除通知
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
}

// 设置加载状态
function setLoadingState(form, isLoading) {
  const button = form.querySelector('button[type="submit"]');
  const text = button.querySelector('.login-text, .register-text');
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

// 表单验证
function validateForm(form) {
  const inputs = form.querySelectorAll('input[required]');
  let isValid = true;
  
  inputs.forEach(input => {
    if (!input.value.trim()) {
      input.style.borderColor = '#dc2626';
      isValid = false;
    } else {
      input.style.borderColor = '#e2e8f0';
    }
  });
  
  return isValid;
}

// 登录表单处理
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  
  if (!validateForm(form)) {
    showNotification('请填写所有必填字段', 'danger');
    return;
  }
  
  setLoadingState(form, true);
  
  try {
    const res = await fetch('api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: form.username.value.trim(), 
        password: form.password.value 
      })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      localStorage.setItem('token', data.token);
      showNotification('登录成功，正在跳转...', 'success');
      setTimeout(() => {
        location.href = 'plans.html';
      }, 1000);
    } else {
      showNotification(data.message || '登录失败，请检查用户名和密码', 'danger');
    }
  } catch (error) {
    showNotification('网络错误，请稍后重试', 'danger');
  } finally {
    setLoadingState(form, false);
  }
});

// 注册表单处理
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  
  if (!validateForm(form)) {
    showNotification('请填写所有必填字段', 'danger');
    return;
  }
  
  // 密码强度验证
  const password = form.password.value;
  if (password.length < 6) {
    showNotification('密码长度至少为6位', 'warning');
    return;
  }
  
  setLoadingState(form, true);
  
  try {
    const res = await fetch('api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: form.username.value.trim(), 
        email: form.email.value.trim(), 
        password: form.password.value 
      })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      showNotification('注册成功！请使用新账户登录', 'success');
      form.reset();
    } else {
      showNotification(data.message || '注册失败，请稍后重试', 'danger');
    }
  } catch (error) {
    showNotification('网络错误，请稍后重试', 'danger');
  } finally {
    setLoadingState(form, false);
  }
});

// 输入框焦点效果
document.querySelectorAll('.form-control').forEach(input => {
  input.addEventListener('focus', () => {
    input.style.borderColor = '#2563eb';
    input.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
  });
  
  input.addEventListener('blur', () => {
    input.style.borderColor = '#e2e8f0';
    input.style.boxShadow = 'none';
  });
});

// 页面加载动画
document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.fade-in');
  cards.forEach((card, index) => {
    setTimeout(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, index * 200);
  });
});
