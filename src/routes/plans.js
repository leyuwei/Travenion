const express = require('express');
const multer = require('multer');
const { TravelPlan, PlanDay, PlanFile, User } = require('../models');
const auth = require('../middleware/auth');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.use(auth);

router.get('/', async (req, res) => {
  const plans = await TravelPlan.findAll({
    where: { userId: req.user.id },
    include: ['days', 'files', { model: User, as: 'sharedWith', attributes: ['id', 'username'], through: { attributes: [] } }]
  });
  res.json(plans);
});

router.post('/', async (req, res) => {
  const { title, description, defaultMap } = req.body;
  try {
    const plan = await TravelPlan.create({ title, description, defaultMap, userId: req.user.id });
    res.status(201).json(plan);
  } catch (e) {
    res.status(500).json({ message: '创建失败', error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const plan = await TravelPlan.findOne({
    where: { id: req.params.id, userId: req.user.id },
    include: ['days', 'files', { model: User, as: 'sharedWith', attributes: ['id', 'username'], through: { attributes: [] } }]
  });
  if (!plan) return res.status(404).json({ message: '未找到' });
  res.json(plan);
});

router.put('/:id', async (req, res) => {
  const { title, description, defaultMap } = req.body;
  const plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!plan) return res.status(404).json({ message: '未找到' });
  await plan.update({ title, description, defaultMap });
  res.json(plan);
});

router.delete('/:id', async (req, res) => {
  const plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!plan) return res.status(404).json({ message: '未找到' });
  await plan.destroy();
  res.status(204).end();
});

router.post('/:id/share', async (req, res) => {
  const plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!plan) return res.status(404).json({ message: '未找到' });
  const user = await User.findByPk(req.body.userId);
  if (!user) return res.status(404).json({ message: '用户不存在' });
  await plan.addSharedWith(user);
  res.json({ message: '分享成功' });
});

router.get('/:id/days', async (req, res) => {
  const plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!plan) return res.status(404).json({ message: '未找到' });
  const days = await PlanDay.findAll({ where: { planId: plan.id }, order: [['dayIndex', 'ASC']] });
  res.json(days);
});

router.post('/:id/days', async (req, res) => {
  try {
    const plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!plan) return res.status(404).json({ message: '未找到计划' });
    
    // 验证必填字段
    const { dayIndex, city, date } = req.body;
    if (!dayIndex || !city || !date) {
      return res.status(400).json({ message: '第几天、城市和日期为必填项' });
    }
    
    const day = await PlanDay.create({ ...req.body, planId: plan.id });
    res.status(201).json(day);
  } catch (e) {
    console.error('创建行程日失败:', e);
    res.status(500).json({ message: '创建行程日失败', error: e.message });
  }
});

router.put('/:id/days/:dayId', async (req, res) => {
  try {
    const day = await PlanDay.findByPk(req.params.dayId);
    if (!day) return res.status(404).json({ message: '未找到' });
    await day.update(req.body);
    res.json(day);
  } catch (e) {
    res.status(500).json({ message: '更新行程日失败', error: e.message });
  }
});

router.delete('/:id/days/:dayId', async (req, res) => {
  const day = await PlanDay.findByPk(req.params.dayId);
  if (!day) return res.status(404).json({ message: '未找到' });
  await day.destroy();
  res.status(204).end();
});

router.get('/:id/files', async (req, res) => {
  const plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!plan) return res.status(404).json({ message: '未找到' });
  const files = await PlanFile.findAll({ where: { planId: plan.id }, order: [['createdAt', 'DESC']] });
  res.json(files);
});

// 下载文件
router.get('/:id/files/:fileId', async (req, res) => {
  try {
    const plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!plan) return res.status(404).json({ message: '未找到计划' });
    const file = await PlanFile.findOne({ where: { id: req.params.fileId, planId: plan.id } });
    if (!file) return res.status(404).json({ message: '文件未找到' });
    
    // 设置正确的Content-Disposition头
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.download(file.path, file.filename);
  } catch (e) {
    console.error('下载文件失败:', e);
    res.status(500).json({ message: '下载文件失败', error: e.message });
  }
});

router.post('/:id/files', upload.single('file'), async (req, res) => {
  const plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!plan) return res.status(404).json({ message: '未找到' });
  const file = await PlanFile.create({ filename: req.file.originalname, path: req.file.path, planId: plan.id });
  res.status(201).json(file);
});

module.exports = router;
