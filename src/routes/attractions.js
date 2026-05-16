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
    
    const results = [];
    
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
    
    try {
      const nomResponse = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          format: 'json',
          q: q,
          limit: 5,
          addressdetails: 1,
          extratags: 1
        },
        headers: {
          'User-Agent': 'Travenion/1.0 (travel planning application)'
        }
      });
      
      if (nomResponse.data) {
        for (const item of nomResponse.data) {
          results.push({
            name: item.name || item.display_name.split(',')[0],
            display_name: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            type: item.type,
            source: 'nominatim'
          });
        }
      }
    } catch (nomError) {
      console.warn('Nominatim搜索失败:', nomError.message);
    }
    
    if (results.length === 0 && process.env.BAIDU_MAP_AK && process.env.BAIDU_MAP_AK !== 'your_baidu_map_ak') {
      try {
        const baiduResponse = await axios.get('https://api.map.baidu.com/place/v2/search', {
          params: {
            query: q,
            output: 'json',
            ak: process.env.BAIDU_MAP_AK,
            page_size: 5
          }
        });
        
        if (baiduResponse.data.results) {
          for (const item of baiduResponse.data.results) {
            results.push({
              name: item.name,
              display_name: item.address || item.name,
              lat: item.location.lat,
              lng: item.location.lng,
              type: 'baidu_place',
              source: 'baidu'
            });
          }
        }
      } catch (baiduError) {
        console.warn('百度地图搜索失败:', baiduError.message);
      }
    }
    
    res.json(results);
  } catch (error) {
    console.error('地理编码搜索失败:', error);
    res.status(500).json({ message: '地理编码搜索失败', error: error.message });
  }
});

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
      if (address) {
        const coordMatch = address.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
        if (coordMatch) {
          const parsedLat = parseFloat(coordMatch[1]);
          const parsedLng = parseFloat(coordMatch[2]);
          if (parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180) {
            latitude = parsedLat;
            longitude = parsedLng;
          }
        }
      }
    }
    
    if (!latitude || !longitude) {
      const searchQuery = address || name;
      if (searchQuery) {
        try {
          if (process.env.BAIDU_MAP_AK && process.env.BAIDU_MAP_AK !== 'your_baidu_map_ak') {
            const geocodeResponse = await axios.get('https://api.map.baidu.com/geocoding/v3/', {
              params: {
                address: searchQuery,
                output: 'json',
                ak: process.env.BAIDU_MAP_AK
              }
            });
            
            if (geocodeResponse.data.status === 0 && geocodeResponse.data.result) {
              latitude = geocodeResponse.data.result.location.lat;
              longitude = geocodeResponse.data.result.location.lng;
            }
          }
        } catch (geocodeError) {
          console.warn('百度地图地理编码失败:', geocodeError.message);
        }
        
        if (!latitude || !longitude) {
          try {
            const nomResponse = await axios.get('https://nominatim.openstreetmap.org/search', {
              params: {
                format: 'json',
                q: searchQuery,
                limit: 1,
                addressdetails: 1
              },
              headers: {
                'User-Agent': 'Travenion/1.0 (travel planning application)'
              }
            });
            
            if (nomResponse.data && nomResponse.data.length > 0) {
              latitude = parseFloat(nomResponse.data[0].lat);
              longitude = parseFloat(nomResponse.data[0].lon);
            }
          } catch (nomError) {
            console.warn('Nominatim地理编码失败:', nomError.message);
          }
        }
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
      const searchQuery = address || name;
      if (searchQuery) {
        const coordMatch = searchQuery.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
        if (coordMatch) {
          const parsedLat = parseFloat(coordMatch[1]);
          const parsedLng = parseFloat(coordMatch[2]);
          if (parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180) {
            newLatitude = parsedLat;
            newLongitude = parsedLng;
          }
        }
      }
    }
    
    if (!newLatitude || !newLongitude) {
      const searchQuery = address || name;
      if (searchQuery) {
        try {
          if (process.env.BAIDU_MAP_AK && process.env.BAIDU_MAP_AK !== 'your_baidu_map_ak') {
            const geocodeResponse = await axios.get('https://api.map.baidu.com/geocoding/v3/', {
              params: {
                address: searchQuery,
                output: 'json',
                ak: process.env.BAIDU_MAP_AK
              }
            });
            
            if (geocodeResponse.data.status === 0 && geocodeResponse.data.result) {
              newLatitude = geocodeResponse.data.result.location.lat;
              newLongitude = geocodeResponse.data.result.location.lng;
            }
          }
        } catch (geocodeError) {
          console.warn('百度地图地理编码失败:', geocodeError.message);
        }
        
        if (!newLatitude || !newLongitude) {
          try {
            const nomResponse = await axios.get('https://nominatim.openstreetmap.org/search', {
              params: {
                format: 'json',
                q: searchQuery,
                limit: 1,
                addressdetails: 1
              },
              headers: {
                'User-Agent': 'Travenion/1.0 (travel planning application)'
              }
            });
            
            if (nomResponse.data && nomResponse.data.length > 0) {
              newLatitude = parseFloat(nomResponse.data[0].lat);
              newLongitude = parseFloat(nomResponse.data[0].lon);
            }
          } catch (nomError) {
            console.warn('Nominatim地理编码失败:', nomError.message);
          }
        }
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