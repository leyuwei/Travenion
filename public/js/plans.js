const token = localStorage.getItem('token');
if (!token) location.href = 'index.html';

async function loadPlans() {
  const res = await fetch('api/plans', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const plans = await res.json();
  const list = document.getElementById('planList');
  list.innerHTML = '';
  plans.forEach(p => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `<span>${p.title}</span><a class="btn btn-sm btn-outline-primary" href="plan.html?id=${p.id}">打开</a>`;
    list.appendChild(li);
  });
}

loadPlans();

document.getElementById('newPlanForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const res = await fetch('api/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      title: form.title.value,
      description: form.description.value,
      defaultMap: form.defaultMap.value
    })
  });
  if (res.ok) {
    form.reset();
    loadPlans();
  } else {
    const data = await res.json();
    alert(data.message || '创建失败');
  }
});

document.getElementById('logout').addEventListener('click', () => {
  localStorage.removeItem('token');
  location.href = 'index.html';
});
