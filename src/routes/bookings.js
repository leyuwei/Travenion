const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { TravelPlan, BookingPlan, BookingHotel, BookingFlight, PlanShare } = require('../models');
const auth = require('../middleware/auth');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.use(auth);

// 预定平台白名单
const PLATFORMS = ['携程', '美团', '去哪儿', '同程', '旅行社', '官方APP', 'Trip', 'Booking', 'Airbnb', 'Agoda', 'Klook', 'Google'];

// 辅助：获取当前用户可访问的旅行计划（所有者或被分享者）
async function getAccessiblePlan(planId, userId) {
  let plan = await TravelPlan.findOne({ where: { id: planId, userId } });
  if (!plan) {
    const share = await PlanShare.findOne({ where: { planId, sharedWithUserId: userId } });
    if (share) {
      plan = await TravelPlan.findOne({ where: { id: planId } });
    }
  }
  return plan;
}

// 辅助：获取当前用户拥有的旅行计划（仅所有者可写）
async function getOwnedPlan(planId, userId) {
  return await TravelPlan.findOne({ where: { id: planId, userId } });
}

// 辅助：删除订单截图物理文件
function removeImageFile(filename) {
  if (!filename) return;
  const filePath = path.join('uploads', filename);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
  }
}

// ============ 候选计划 ============

// 获取旅行计划下的所有机酒候选计划
router.get('/plan/:planId', async (req, res) => {
  try {
    const plan = await getAccessiblePlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const bookingPlans = await BookingPlan.findAll({
      where: { planId: plan.id },
      include: [
        { model: BookingHotel, as: 'hotels', separate: true, order: [['createdAt', 'ASC']] },
        { model: BookingFlight, as: 'flights', separate: true, order: [['createdAt', 'ASC']] }
      ],
      order: [['createdAt', 'ASC']]
    });
    res.json(bookingPlans);
  } catch (error) {
    console.error('获取机酒计划失败:', error);
    res.status(500).json({ message: '获取机酒计划失败', error: error.message });
  }
});

// 创建候选计划
router.post('/plan/:planId', async (req, res) => {
  try {
    const plan = await getOwnedPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const { name, notes } = req.body;
    const bp = await BookingPlan.create({
      name: (name && name.trim()) || '新候选计划',
      notes: notes || null,
      planId: plan.id
    });
    res.status(201).json(bp);
  } catch (error) {
    console.error('创建机酒计划失败:', error);
    res.status(500).json({ message: '创建机酒计划失败', error: error.message });
  }
});

// 更新候选计划
router.put('/plan/:planId/:bpId', async (req, res) => {
  try {
    const plan = await getOwnedPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const bp = await BookingPlan.findOne({ where: { id: req.params.bpId, planId: plan.id } });
    if (!bp) return res.status(404).json({ message: '未找到候选计划' });

    const { name, notes } = req.body;
    await bp.update({
      name: name !== undefined ? name : bp.name,
      notes: notes !== undefined ? notes : bp.notes
    });
    res.json(bp);
  } catch (error) {
    console.error('更新机酒计划失败:', error);
    res.status(500).json({ message: '更新机酒计划失败', error: error.message });
  }
});

// 删除候选计划（级联删除酒店和机票）
router.delete('/plan/:planId/:bpId', async (req, res) => {
  try {
    const plan = await getOwnedPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const bp = await BookingPlan.findOne({
      where: { id: req.params.bpId, planId: plan.id },
      include: [{ model: BookingHotel, as: 'hotels' }, { model: BookingFlight, as: 'flights' }]
    });
    if (!bp) return res.status(404).json({ message: '未找到候选计划' });

    // 清理订单截图
    (bp.hotels || []).forEach(h => removeImageFile(h.orderImage));
    (bp.flights || []).forEach(f => removeImageFile(f.orderImage));

    await bp.destroy();
    res.status(204).end();
  } catch (error) {
    console.error('删除机酒计划失败:', error);
    res.status(500).json({ message: '删除机酒计划失败', error: error.message });
  }
});

// ============ 酒店记录 ============

// 添加酒店
router.post('/plan/:planId/:bpId/hotels', async (req, res) => {
  try {
    const plan = await getOwnedPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const bp = await BookingPlan.findOne({ where: { id: req.params.bpId, planId: plan.id } });
    if (!bp) return res.status(404).json({ message: '未找到候选计划' });

    const { city, hotelName, location, platform, nights, price, orderLink } = req.body;
    if (!hotelName) return res.status(400).json({ message: '酒店名称为必填项' });
    if (platform && !PLATFORMS.includes(platform)) {
      return res.status(400).json({ message: '无效的预定平台' });
    }

    const hotel = await BookingHotel.create({
      city: city || null,
      hotelName,
      location: location || null,
      platform: platform || null,
      nights: nights || 1,
      price: price || 0,
      orderImage: null,
      orderLink: orderLink || null,
      bookingPlanId: bp.id
    });
    res.status(201).json(hotel);
  } catch (error) {
    console.error('添加酒店失败:', error);
    res.status(500).json({ message: '添加酒店失败', error: error.message });
  }
});

// 更新酒店
router.put('/plan/:planId/:bpId/hotels/:hotelId', async (req, res) => {
  try {
    const plan = await getOwnedPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const hotel = await BookingHotel.findOne({
      where: { id: req.params.hotelId },
      include: [{ model: BookingPlan, where: { id: req.params.bpId, planId: plan.id } }]
    });
    if (!hotel) return res.status(404).json({ message: '未找到酒店记录' });

    const { city, hotelName, location, platform, nights, price, orderLink } = req.body;
    if (platform && !PLATFORMS.includes(platform)) {
      return res.status(400).json({ message: '无效的预定平台' });
    }

    await hotel.update({
      city: city !== undefined ? city : hotel.city,
      hotelName: hotelName !== undefined ? hotelName : hotel.hotelName,
      location: location !== undefined ? location : hotel.location,
      platform: platform !== undefined ? platform : hotel.platform,
      nights: nights !== undefined ? nights : hotel.nights,
      price: price !== undefined ? price : hotel.price,
      orderLink: orderLink !== undefined ? orderLink : hotel.orderLink
    });
    res.json(hotel);
  } catch (error) {
    console.error('更新酒店失败:', error);
    res.status(500).json({ message: '更新酒店失败', error: error.message });
  }
});

// 删除酒店
router.delete('/plan/:planId/:bpId/hotels/:hotelId', async (req, res) => {
  try {
    const plan = await getOwnedPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const hotel = await BookingHotel.findOne({
      where: { id: req.params.hotelId },
      include: [{ model: BookingPlan, where: { id: req.params.bpId, planId: plan.id } }]
    });
    if (!hotel) return res.status(404).json({ message: '未找到酒店记录' });

    removeImageFile(hotel.orderImage);
    await hotel.destroy();
    res.status(204).end();
  } catch (error) {
    console.error('删除酒店失败:', error);
    res.status(500).json({ message: '删除酒店失败', error: error.message });
  }
});

// 上传酒店订单截图
router.post('/plan/:planId/:bpId/hotels/:hotelId/image', upload.single('image'), async (req, res) => {
  try {
    const plan = await getOwnedPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const hotel = await BookingHotel.findOne({
      where: { id: req.params.hotelId },
      include: [{ model: BookingPlan, where: { id: req.params.bpId, planId: plan.id } }]
    });
    if (!hotel) return res.status(404).json({ message: '未找到酒店记录' });

    // 删除旧截图
    removeImageFile(hotel.orderImage);
    await hotel.update({ orderImage: req.file.filename });
    res.json({ message: '上传成功', orderImage: req.file.filename });
  } catch (error) {
    console.error('上传酒店订单截图失败:', error);
    res.status(500).json({ message: '上传订单截图失败', error: error.message });
  }
});

// 删除酒店订单截图
router.delete('/plan/:planId/:bpId/hotels/:hotelId/image', async (req, res) => {
  try {
    const plan = await getOwnedPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const hotel = await BookingHotel.findOne({
      where: { id: req.params.hotelId },
      include: [{ model: BookingPlan, where: { id: req.params.bpId, planId: plan.id } }]
    });
    if (!hotel) return res.status(404).json({ message: '未找到酒店记录' });

    removeImageFile(hotel.orderImage);
    await hotel.update({ orderImage: null });
    res.json({ message: '已删除截图' });
  } catch (error) {
    console.error('删除酒店订单截图失败:', error);
    res.status(500).json({ message: '删除订单截图失败', error: error.message });
  }
});

// 获取酒店订单截图
router.get('/plan/:planId/:bpId/hotels/:hotelId/image', async (req, res) => {
  try {
    const plan = await getAccessiblePlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const hotel = await BookingHotel.findOne({
      where: { id: req.params.hotelId },
      include: [{ model: BookingPlan, where: { id: req.params.bpId, planId: plan.id } }]
    });
    if (!hotel || !hotel.orderImage) return res.status(404).json({ message: '截图未找到' });

    const filePath = path.join('uploads', hotel.orderImage);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: '文件不存在' });
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('获取酒店订单截图失败:', error);
    res.status(500).json({ message: '获取订单截图失败', error: error.message });
  }
});

// ============ 机票记录 ============

// 添加机票
router.post('/plan/:planId/:bpId/flights', async (req, res) => {
  try {
    const plan = await getOwnedPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const bp = await BookingPlan.findOne({ where: { id: req.params.bpId, planId: plan.id } });
    if (!bp) return res.status(404).json({ message: '未找到候选计划' });

    const { flightNumber, departure, destination, isTransit, transitCity, transitDuration, platform, date, price, orderLink } = req.body;
    if (!flightNumber) return res.status(400).json({ message: '航班号为必填项' });
    if (platform && !PLATFORMS.includes(platform)) {
      return res.status(400).json({ message: '无效的预定平台' });
    }

    const flight = await BookingFlight.create({
      flightNumber,
      departure: departure || null,
      destination: destination || null,
      isTransit: !!isTransit,
      transitCity: transitCity || null,
      transitDuration: transitDuration || null,
      platform: platform || null,
      date: date || null,
      price: price || 0,
      orderImage: null,
      orderLink: orderLink || null,
      bookingPlanId: bp.id
    });
    res.status(201).json(flight);
  } catch (error) {
    console.error('添加机票失败:', error);
    res.status(500).json({ message: '添加机票失败', error: error.message });
  }
});

// 更新机票
router.put('/plan/:planId/:bpId/flights/:flightId', async (req, res) => {
  try {
    const plan = await getOwnedPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const flight = await BookingFlight.findOne({
      where: { id: req.params.flightId },
      include: [{ model: BookingPlan, where: { id: req.params.bpId, planId: plan.id } }]
    });
    if (!flight) return res.status(404).json({ message: '未找到机票记录' });

    const { flightNumber, departure, destination, isTransit, transitCity, transitDuration, platform, date, price, orderLink } = req.body;
    if (platform && !PLATFORMS.includes(platform)) {
      return res.status(400).json({ message: '无效的预定平台' });
    }

    await flight.update({
      flightNumber: flightNumber !== undefined ? flightNumber : flight.flightNumber,
      departure: departure !== undefined ? departure : flight.departure,
      destination: destination !== undefined ? destination : flight.destination,
      isTransit: isTransit !== undefined ? !!isTransit : flight.isTransit,
      transitCity: transitCity !== undefined ? transitCity : flight.transitCity,
      transitDuration: transitDuration !== undefined ? transitDuration : flight.transitDuration,
      platform: platform !== undefined ? platform : flight.platform,
      date: date !== undefined ? date : flight.date,
      price: price !== undefined ? price : flight.price,
      orderLink: orderLink !== undefined ? orderLink : flight.orderLink
    });
    res.json(flight);
  } catch (error) {
    console.error('更新机票失败:', error);
    res.status(500).json({ message: '更新机票失败', error: error.message });
  }
});

// 删除机票
router.delete('/plan/:planId/:bpId/flights/:flightId', async (req, res) => {
  try {
    const plan = await getOwnedPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const flight = await BookingFlight.findOne({
      where: { id: req.params.flightId },
      include: [{ model: BookingPlan, where: { id: req.params.bpId, planId: plan.id } }]
    });
    if (!flight) return res.status(404).json({ message: '未找到机票记录' });

    removeImageFile(flight.orderImage);
    await flight.destroy();
    res.status(204).end();
  } catch (error) {
    console.error('删除机票失败:', error);
    res.status(500).json({ message: '删除机票失败', error: error.message });
  }
});

// 上传机票订单截图
router.post('/plan/:planId/:bpId/flights/:flightId/image', upload.single('image'), async (req, res) => {
  try {
    const plan = await getOwnedPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const flight = await BookingFlight.findOne({
      where: { id: req.params.flightId },
      include: [{ model: BookingPlan, where: { id: req.params.bpId, planId: plan.id } }]
    });
    if (!flight) return res.status(404).json({ message: '未找到机票记录' });

    removeImageFile(flight.orderImage);
    await flight.update({ orderImage: req.file.filename });
    res.json({ message: '上传成功', orderImage: req.file.filename });
  } catch (error) {
    console.error('上传机票订单截图失败:', error);
    res.status(500).json({ message: '上传订单截图失败', error: error.message });
  }
});

// 删除机票订单截图
router.delete('/plan/:planId/:bpId/flights/:flightId/image', async (req, res) => {
  try {
    const plan = await getOwnedPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const flight = await BookingFlight.findOne({
      where: { id: req.params.flightId },
      include: [{ model: BookingPlan, where: { id: req.params.bpId, planId: plan.id } }]
    });
    if (!flight) return res.status(404).json({ message: '未找到机票记录' });

    removeImageFile(flight.orderImage);
    await flight.update({ orderImage: null });
    res.json({ message: '已删除截图' });
  } catch (error) {
    console.error('删除机票订单截图失败:', error);
    res.status(500).json({ message: '删除订单截图失败', error: error.message });
  }
});

// 获取机票订单截图
router.get('/plan/:planId/:bpId/flights/:flightId/image', async (req, res) => {
  try {
    const plan = await getAccessiblePlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ message: '未找到计划' });

    const flight = await BookingFlight.findOne({
      where: { id: req.params.flightId },
      include: [{ model: BookingPlan, where: { id: req.params.bpId, planId: plan.id } }]
    });
    if (!flight || !flight.orderImage) return res.status(404).json({ message: '截图未找到' });

    const filePath = path.join('uploads', flight.orderImage);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: '文件不存在' });
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('获取机票订单截图失败:', error);
    res.status(500).json({ message: '获取订单截图失败', error: error.message });
  }
});

module.exports = router;
