// 用户设置页面逻辑

// 检查认证状态
function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// 获取token
function getToken() {
    return localStorage.getItem('token');
}

// 页面加载时获取用户信息
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadUserInfo();
    setupEventListeners();
});

// 设置事件监听器
function setupEventListeners() {
    // 个人信息表单提交
    document.getElementById('profileForm').addEventListener('submit', handleProfileUpdate);
    
    // 密码修改表单提交
    document.getElementById('passwordForm').addEventListener('submit', handlePasswordChange);
}

// 加载用户信息
async function loadUserInfo() {
    try {
        const response = await fetch('/travenion/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (response.ok) {
            const user = await response.json();
            displayUserInfo(user);
            populateForm(user);
            displayUserWelcome(user);
        } else {
            showMessage('profileMessage', '获取用户信息失败', 'error');
        }
    } catch (error) {
        console.error('获取用户信息失败:', error);
        showMessage('profileMessage', '获取用户信息失败', 'error');
    }
}

// 显示用户信息
function displayUserInfo(user) {
    document.getElementById('currentUsername').textContent = user.username || '-';
    document.getElementById('currentEmail').textContent = user.email || '-';
    document.getElementById('currentNickname').textContent = user.nickname || '未设置';
    
    if (user.createdAt) {
        const date = new Date(user.createdAt);
        document.getElementById('currentCreatedAt').textContent = date.toLocaleDateString('zh-CN');
    }
}

// 填充表单
function populateForm(user) {
    document.getElementById('nickname').value = user.nickname || '';
    document.getElementById('email').value = user.email || '';
    document.getElementById('avatar').value = user.avatar || '';
}

// 处理个人信息更新
async function handleProfileUpdate(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const updateData = {};
    
    // 只包含有值的字段
    const nickname = formData.get('nickname').trim();
    const email = formData.get('email').trim();
    const avatar = formData.get('avatar').trim();
    
    if (nickname) updateData.nickname = nickname;
    if (email) updateData.email = email;
    if (avatar) updateData.avatar = avatar;
    
    // 如果没有要更新的数据
    if (Object.keys(updateData).length === 0) {
        showMessage('profileMessage', '请至少填写一个要更新的字段', 'error');
        return;
    }
    
    try {
        const response = await fetch('/travenion/api/auth/me', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(updateData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage('profileMessage', '个人信息更新成功', 'success');
            displayUserInfo(result);
        } else {
            showMessage('profileMessage', result.message || '更新失败', 'error');
        }
    } catch (error) {
        console.error('更新个人信息失败:', error);
        showMessage('profileMessage', '更新失败，请稍后重试', 'error');
    }
}

// 处理密码修改
async function handlePasswordChange(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const currentPassword = formData.get('currentPassword');
    const newPassword = formData.get('newPassword');
    const confirmPassword = formData.get('confirmPassword');
    
    // 验证新密码和确认密码是否一致
    if (newPassword !== confirmPassword) {
        showMessage('passwordMessage', '新密码和确认密码不一致', 'error');
        return;
    }
    
    // 验证密码长度
    if (newPassword.length < 6) {
        showMessage('passwordMessage', '新密码长度不能少于6位', 'error');
        return;
    }
    
    try {
        const response = await fetch('/travenion/api/auth/password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage('passwordMessage', '密码修改成功', 'success');
            // 清空表单
            document.getElementById('passwordForm').reset();
        } else {
            showMessage('passwordMessage', result.message || '密码修改失败', 'error');
        }
    } catch (error) {
        console.error('修改密码失败:', error);
        showMessage('passwordMessage', '修改失败，请稍后重试', 'error');
    }
}

// 显示消息
function showMessage(elementId, message, type) {
    const messageElement = document.getElementById(elementId);
    messageElement.textContent = message;
    messageElement.className = `message ${type}`;
    messageElement.style.display = 'block';
    
    // 3秒后自动隐藏成功消息
    if (type === 'success') {
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 3000);
    }
}

// 退出登录
function logout() {
    localStorage.removeItem('token');
    window.location.href = 'index.html';
}

// 显示用户欢迎信息
function displayUserWelcome(user) {
    const welcomeElement = document.getElementById('userWelcome');
    if (welcomeElement && user) {
        welcomeElement.textContent = `欢迎，${user.nickname || user.username}`;
    }
}

// 设置退出按钮事件
document.addEventListener('DOMContentLoaded', function() {
    const logoutBtn = document.getElementById('logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});