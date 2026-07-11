const express = require('express');
const { Attraction, PlanDay, TravelPlan, PlanShare, sequelize } = require('../models');
const auth = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();

router.use(auth);

// 地理编码搜索接口
router.get('/geocode', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.json([]);
    }

    // 坐标直解
    const coordMatch = q.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return res.json([{
          name: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          display_name: `经纬度坐标: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          lat, lng,
          source: 'coordinate'
        }]);
      }
    }

    // 并行调用多个地理编码服务，任一可用即可返回结果
    const tasks = [];

    // Nominatim (OpenStreetMap) - 海外地址效果好，部分地区可能不可达
    tasks.push(
      axios.get('https://nominatim.openstreetmap.org/search', {
        params: { format: 'json', q, limit: 5, addressdetails: 1 },
        headers: { 'User-Agent': 'Travenion/1.0 (travel planning application)' },
        timeout: 5000
      }).then(resp => {
        const items = [];
        if (resp.data) {
          for (const item of resp.data) {
            items.push({
              name: item.name || (item.display_name || '').split(',')[0],
              display_name: item.display_name,
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon),
              type: item.type,
              source: 'nominatim'
            });
          }
        }
        return items;
      }).catch(err => {
        console.warn('Nominatim搜索失败:', err.message);
        return [];
      })
    );

    // Photon (Komoot) - 基于 OSM 数据，国内可达性好
    tasks.push(
      axios.get('https://photon.komoot.io/api/', {
        params: { q, limit: 5 },
        timeout: 5000
      }).then(resp => {
        const items = [];
        if (resp.data && resp.data.features) {
          for (const feature of resp.data.features) {
            const props = feature.properties || {};
            const coords = feature.geometry && feature.geometry.coordinates;
            if (coords && coords.length >= 2) {
              const parts = [props.name, props.city, props.state, props.country].filter(Boolean);
              items.push({
                name: props.name || props.city || '未知地点',
                display_name: parts.join(', '),
                lat: coords[1],
                lng: coords[0],
                type: props.osm_value || props.osm_key,
                source: 'photon'
              });
            }
          }
        }
        return items;
      }).catch(err => {
        console.warn('Photon搜索失败:', err.message);
        return [];
      })
    );

    // 百度地图 - 国内地址效果最佳（需配置 AK）
    if (process.env.BAIDU_MAP_AK && process.env.BAIDU_MAP_AK !== 'your_baidu_map_ak') {
      tasks.push(
        axios.get('https://api.map.baidu.com/place/v2/search', {
          params: { query: q, output: 'json', ak: process.env.BAIDU_MAP_AK, page_size: 5 },
          timeout: 5000
        }).then(resp => {
          const items = [];
          if (resp.data && resp.data.results) {
            for (const item of resp.data.results) {
              items.push({
                name: item.name,
                display_name: item.address || item.name,
                lat: item.location.lat,
                lng: item.location.lng,
                type: 'baidu_place',
                source: 'baidu'
              });
            }
          }
          return items;
        }).catch(err => {
          console.warn('百度地图搜索失败:', err.message);
          return [];
        })
      );
    }

    const allResults = await Promise.all(tasks);
    res.json(allResults.flat());
  } catch (error) {
    console.error('地理编码搜索失败:', error);
    res.status(500).json({ message: '地理编码搜索失败', error: error.message });
  }
});

// 自动地理编码辅助函数（用于景点保存时补全坐标）
async function autoGeocode(searchQuery) {
  if (!searchQuery) return null;

  // 坐标格式直解
  const coordMatch = searchQuery.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng };
    }
  }

  // 并行尝试多个服务，取第一个有效结果
  const sources = [];

  if (process.env.BAIDU_MAP_AK && process.env.BAIDU_MAP_AK !== 'your_baidu_map_ak') {
    sources.push(
      axios.get('https://api.map.baidu.com/geocoding/v3/', {
        params: { address: searchQuery, output: 'json', ak: process.env.BAIDU_MAP_AK },
        timeout: 5000
      }).then(resp => {
        if (resp.data.status === 0 && resp.data.result) {
          return { latitude: resp.data.result.location.lat, longitude: resp.data.result.location.lng };
        }
        return null;
      }).catch(() => null)
    );
  }

  sources.push(
    axios.get('https://nominatim.openstreetmap.org/search', {
      params: { format: 'json', q: searchQuery, limit: 1 },
      headers: { 'User-Agent': 'Travenion/1.0 (travel planning application)' },
      timeout: 5000
    }).then(resp => {
      if (resp.data && resp.data.length > 0) {
        return { latitude: parseFloat(resp.data[0].lat), longitude: parseFloat(resp.data[0].lon) };
      }
      return null;
    }).catch(() => null)
  );

  sources.push(
    axios.get('https://photon.komoot.io/api/', {
      params: { q: searchQuery, limit: 1 },
      timeout: 5000
    }).then(resp => {
      if (resp.data && resp.data.features && resp.data.features.length > 0) {
        const coords = resp.data.features[0].geometry.coordinates;
        if (coords && coords.length >= 2) {
          return { latitude: coords[1], longitude: coords[0] };
        }
      }
      return null;
    }).catch(() => null)
  );

  const results = await Promise.all(sources);
  for (const r of results) {
    if (r && r.latitude != null && r.longitude != null) {
      return r;
    }
  }
  return null;
}

// 获取某天的所有景点
router.get('/day/:dayId', async (req, res) => {
  try {
    // 首先检查是否是计划所有者
    let day = await PlanDay.findOne({
      where: { id: req.params.dayId },
      include: [{
        model: TravelPlan,
        where: { userId: req.user.id }
      }]
    });
    
    // 如果不是所有者，检查是否有分享权限
    if (!day) {
      day = await PlanDay.findOne({
        where: { id: req.params.dayId },
        include: [{
          model: TravelPlan,
          include: [{
            model: PlanShare,
            as: 'shares',
            where: { sharedWithUserId: req.user.id }
          }]
        }]
      });
    }
    
    if (!day) {
      return res.status(404).json({ message: '未找到行程日' });
    }
    
    const attractions = await Attraction.findAll({
      where: { planDayId: req.params.dayId },
      order: [['visitOrder', 'ASC']]
    });
    
    res.json(attractions);
  } catch (error) {
    console.error('获取景点失败:', error);
    res.status(500).json({ message: '获取景点失败', error: error.message });
  }
});

// 添加景点
router.post('/day/:dayId', async (req, res) => {
  try {
    const { name, address, description, estimatedDuration, notes } = req.body;
    
    // 首先检查是否是计划所有者
    let day = await PlanDay.findOne({
      where: { id: req.params.dayId },
      include: [{
        model: TravelPlan,
        where: { userId: req.user.id }
      }]
    });
    
    // 如果不是所有者，检查是否有分享权限
    if (!day) {
      day = await PlanDay.findOne({
        where: { id: req.params.dayId },
        include: [{
          model: TravelPlan,
          include: [{
            model: PlanShare,
            as: 'shares',
            where: { sharedWithUserId: req.user.id }
          }]
        }]
      });
    }
    
    if (!day) {
      return res.status(404).json({ message: '未找到行程日' });
    }
    
    // 获取下一个访问顺序
    const maxOrder = await Attraction.max('visitOrder', {
      where: { planDayId: req.params.dayId }
    }) || 0;
    
    let latitude = req.body.latitude || null;
    let longitude = req.body.longitude || null;

    if (!latitude || !longitude) {
      const coords = await autoGeocode(address || name);
      if (coords) {
        latitude = coords.latitude;
        longitude = coords.longitude;
      }
    }
    
    const attraction = await Attraction.create({
      name,
      address,
      latitude,
      longitude,
      description,
      visitOrder: maxOrder + 1,
      estimatedDuration,
      notes,
      planDayId: req.params.dayId
    });
    
    res.status(201).json(attraction);
  } catch (error) {
    console.error('添加景点失败:', error);
    res.status(500).json({ message: '添加景点失败', error: error.message });
  }
});

// 更新景点
router.put('/:id', async (req, res) => {
  try {
    const { name, address, description, estimatedDuration, notes, latitude, longitude } = req.body;
    
    // 首先检查是否是计划所有者
    let attraction = await Attraction.findOne({
      where: { id: req.params.id },
      include: [{
        model: PlanDay,
        include: [{
          model: TravelPlan,
          where: { userId: req.user.id }
        }]
      }]
    });
    
    // 如果不是所有者，检查是否有分享权限
    if (!attraction) {
      attraction = await Attraction.findOne({
        where: { id: req.params.id },
        include: [{
          model: PlanDay,
          include: [{
            model: TravelPlan,
            include: [{
              model: PlanShare,
              as: 'shares',
              where: { sharedWithUserId: req.user.id }
            }]
          }]
        }]
      });
    }
    
    if (!attraction) {
      return res.status(404).json({ message: '未找到景点' });
    }
    
    let newLatitude = latitude || null;
    let newLongitude = longitude || null;

    if (!newLatitude || !newLongitude) {
      const coords = await autoGeocode(address || name);
      if (coords) {
        newLatitude = coords.latitude;
        newLongitude = coords.longitude;
      }
    }
    
    await attraction.update({
      name,
      address,
      latitude: newLatitude,
      longitude: newLongitude,
      description,
      estimatedDuration,
      notes
    });
    
    res.json(attraction);
  } catch (error) {
    console.error('更新景点失败:', error);
    res.status(500).json({ message: '更新景点失败', error: error.message });
  }
});

// 删除景点
router.delete('/:id', async (req, res) => {
  try {
    // 首先检查是否是计划所有者
    let attraction = await Attraction.findOne({
      where: { id: req.params.id },
      include: [{
        model: PlanDay,
        include: [{
          model: TravelPlan,
          where: { userId: req.user.id }
        }]
      }]
    });
    
    // 如果不是所有者，检查是否有分享权限
    if (!attraction) {
      attraction = await Attraction.findOne({
        where: { id: req.params.id },
        include: [{
          model: PlanDay,
          include: [{
            model: TravelPlan,
            include: [{
              model: PlanShare,
              as: 'shares',
              where: { sharedWithUserId: req.user.id }
            }]
          }]
        }]
      });
    }
    
    if (!attraction) {
      return res.status(404).json({ message: '未找到景点' });
    }
    
    const planDayId = attraction.planDayId;
    const deletedOrder = attraction.visitOrder;
    
    await attraction.destroy();
    
    // 重新排序剩余景点
    await Attraction.update(
      { visitOrder: sequelize.literal('visitOrder - 1') },
        {
          where: {
            planDayId: planDayId,
            visitOrder: { [sequelize.Sequelize.Op.gt]: deletedOrder }
          }
        }
    );
    
    res.status(204).end();
  } catch (error) {
    console.error('删除景点失败:', error);
    res.status(500).json({ message: '删除景点失败', error: error.message });
  }
});

// 更新景点访问顺序
router.put('/:id/order', async (req, res) => {
  try {
    const { newOrder } = req.body;
    
    // 验证用户权限
    const attraction = await Attraction.findOne({
      where: { id: req.params.id },
      include: [{
        model: PlanDay,
        include: [{
          model: TravelPlan,
          where: { userId: req.user.id }
        }]
      }]
    });
    
    if (!attraction) {
      return res.status(404).json({ message: '未找到景点' });
    }
    
    const oldOrder = attraction.visitOrder;
    const planDayId = attraction.planDayId;
    
    if (oldOrder === newOrder) {
      return res.json(attraction);
    }
    
    // 更新其他景点的顺序
    if (oldOrder < newOrder) {
      // 向后移动
      await Attraction.update(
        { visitOrder: sequelize.literal('visitOrder - 1') },
        {
          where: {
            planDayId: planDayId,
            visitOrder: {
              [sequelize.Sequelize.Op.gt]: oldOrder,
              [sequelize.Sequelize.Op.lte]: newOrder
            }
          }
        }
      );
    } else {
      // 向前移动
      await Attraction.update(
        { visitOrder: sequelize.literal('visitOrder + 1') },
        {
          where: {
            planDayId: planDayId,
            visitOrder: {
              [sequelize.Sequelize.Op.gte]: newOrder,
              [sequelize.Sequelize.Op.lt]: oldOrder
            }
          }
        }
      );
    }
    
    // 更新当前景点的顺序
    await attraction.update({ visitOrder: newOrder });
    
    res.json(attraction);
  } catch (error) {
    console.error('更新景点顺序失败:', error);
    res.status(500).json({ message: '更新景点顺序失败', error: error.message });
  }
});

module.exports = router;