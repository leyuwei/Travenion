document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const res = await fetch('api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: form.username.value, password: form.password.value })
  });
  const data = await res.json();
  if (res.ok) {
    localStorage.setItem('token', data.token);
    location.href = 'plans.html';
  } else {
    alert(data.message || '登录失败');
  }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const res = await fetch('api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: form.username.value, password: form.password.value })
  });
  const data = await res.json();
  if (res.ok) {
    alert('注册成功，请登录');
  } else {
    alert(data.message || '注册失败');
  }
});
