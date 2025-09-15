const express = require('express');
const { Attraction, PlanDay, TravelPlan, PlanShare, sequelize } = require('../models');
const auth = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();

router.use(auth);

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
    
    // 地理编码获取坐标
    let latitude = null;
    let longitude = null;
    
    if (address) {
      try {
        // 使用百度地图API进行地理编码
        const geocodeResponse = await axios.get('https://api.map.baidu.com/geocoding/v3/', {
          params: {
            address: address,
            output: 'json',
            ak: process.env.BAIDU_MAP_AK || 'your_baidu_map_ak'
          }
        });
        
        if (geocodeResponse.data.status === 0 && geocodeResponse.data.result) {
          latitude = geocodeResponse.data.result.location.lat;
          longitude = geocodeResponse.data.result.location.lng;
        }
      } catch (geocodeError) {
        console.warn('地理编码失败:', geocodeError.message);
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
    
    // 如果地址改变了，重新进行地理编码
    let newLatitude = latitude;
    let newLongitude = longitude;
    
    if (address && address !== attraction.address) {
      try {
        const geocodeResponse = await axios.get('https://api.map.baidu.com/geocoding/v3/', {
          params: {
            address: address,
            output: 'json',
            ak: process.env.BAIDU_MAP_AK || 'your_baidu_map_ak'
          }
        });
        
        if (geocodeResponse.data.status === 0 && geocodeResponse.data.result) {
          newLatitude = geocodeResponse.data.result.location.lat;
          newLongitude = geocodeResponse.data.result.location.lng;
        }
      } catch (geocodeError) {
        console.warn('地理编码失败:', geocodeError.message);
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