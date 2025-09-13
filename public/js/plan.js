const token = localStorage.getItem('token');
if (!token) location.href = 'index.html';
const params = new URLSearchParams(location.search);
const planId = params.get('id');
let planData = null;
let mapProvider = 'google';
let map, geocoder;

async function loadPlan() {
  const res = await fetch(`api/plans/${planId}`, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  planData = await res.json();
  document.getElementById('planTitle').innerText = planData.title;
  document.getElementById('mapProvider').value = planData.defaultMap || 'google';
  mapProvider = planData.defaultMap || 'google';
  renderDays();
  renderFiles();
  loadMap(mapProvider);
}

function renderDays() {
  const list = document.getElementById('dayList');
  list.innerHTML = '';
  planData.days.forEach(d => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.innerText = `第${d.dayIndex}天 ${d.city} ${d.transportation || ''} ${d.attractions || ''}`;
    list.appendChild(li);
  });
}

function renderFiles() {
  const list = document.getElementById('fileList');
  list.innerHTML = '';
  planData.files.forEach(f => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.innerText = f.filename;
    list.appendChild(li);
  });
}

async function loadMap(provider) {
  mapProvider = provider;
  document.getElementById('map').innerHTML = '';
  if (provider === 'google') {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?callback=initMap`;
    document.body.appendChild(script);
  } else {
    const script = document.createElement('script');
    script.src = `https://api.map.baidu.com/api?v=3.0&callback=initMap`;
    document.body.appendChild(script);
  }
}

function initMap() {
  if (mapProvider === 'google') {
    geocoder = new google.maps.Geocoder();
    map = new google.maps.Map(document.getElementById('map'), { zoom: 5, center: { lat: 39.9, lng: 116.4 } });
    planData.days.forEach(d => {
      geocoder.geocode({ address: d.city }, (results, status) => {
        if (status === 'OK') {
          new google.maps.Marker({ map, position: results[0].geometry.location, label: '' + d.dayIndex });
        }
      });
    });
  } else {
    map = new BMap.Map('map');
    geocoder = new BMap.Geocoder();
    map.centerAndZoom(new BMap.Point(116.4,39.9), 5);
    planData.days.forEach(d => {
      geocoder.getPoint(d.city, point => {
        if (point) {
          const marker = new BMap.Marker(point);
          marker.setLabel(new BMap.Label('' + d.dayIndex, { offset: new BMap.Size(20, -10) }));
          map.addOverlay(marker);
        }
      });
    });
  }
}

loadPlan();

document.getElementById('mapProvider').addEventListener('change', e => loadMap(e.target.value));

document.getElementById('dayForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const res = await fetch(`api/plans/${planId}/days`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      dayIndex: form.dayIndex.value,
      city: form.city.value,
      transportation: form.transportation.value,
      attractions: form.attractions.value
    })
  });
  const data = await res.json();
  if (res.ok) {
    planData.days.push(data);
    form.reset();
    renderDays();
    loadMap(mapProvider);
  } else {
    alert(data.message || '添加失败');
  }
});

document.getElementById('fileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const res = await fetch(`api/plans/${planId}/files`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token },
    body: formData
  });
  const data = await res.json();
  if (res.ok) {
    planData.files.push(data);
    e.target.reset();
    renderFiles();
  } else {
    alert(data.message || '上传失败');
  }
});
