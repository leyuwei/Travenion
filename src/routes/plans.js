const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { TravelPlan, PlanDay, PlanFile, User, PlanShare } = require('../models');
const auth = require('../middleware/auth');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });









// 以下路由需要认证
router.use(auth);

// 获取所有用户列表（用于分享）- 必须在 /:id 路由之前
router.get('/users', async (req, res) => {
  try {
    const users = await User.findAll({
      where: {
        id: { [require('sequelize').Op.ne]: req.user.id } // 排除当前用户
      },
      attributes: ['id', 'username', 'email']
    });
    res.json(users);
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ message: '获取用户列表失败' });
  }
});

// 获取分享给我的计划 - 必须在 /:id 路由之前
router.get('/shared-with-me', async (req, res) => {
  try {
    const shares = await PlanShare.findAll({
      where: { sharedWithUserId: req.user.id },
      include: [
        {
          model: TravelPlan,
          as: 'plan',
          include: ['days', 'files']
        },
        {
          model: User,
          as: 'sharedByUser',
          attributes: ['id', 'username', 'email']
        }
      ]
    });
    
    res.json(shares);
  } catch (error) {
    console.error('获取分享计划失败:', error);
    res.status(500).json({ message: '获取分享计划失败' });
  }
});



router.get('/', async (req, res) => {
  const plans = await TravelPlan.findAll({
    where: { userId: req.user.id },
    include: ['days', 'files']
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
  try {
    // 首先检查是否是计划所有者
    let plan = await TravelPlan.findOne({
      where: { id: req.params.id, userId: req.user.id },
      include: ['days', 'files']
    });
    
    // 如果不是所有者，检查是否有分享权限
    if (!plan) {
      const share = await PlanShare.findOne({
        where: {
          planId: req.params.id,
          sharedWithUserId: req.user.id
        }
      });
      
      if (share) {
        plan = await TravelPlan.findOne({
          where: { id: req.params.id },
          include: ['days', 'files']
        });
      }
    }
    
    if (!plan) return res.status(404).json({ message: '未找到' });
    res.json(plan);
  } catch (error) {
    console.error('获取计划失败:', error);
    res.status(500).json({ message: '获取计划失败' });
  }
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



// 获取计划的分享信息
router.get('/:id/shares', async (req, res) => {
  try {
    const plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!plan) return res.status(404).json({ message: '未找到' });
    
    const shares = await PlanShare.findAll({
      where: { planId: req.params.id },
      include: [
        { model: User, as: 'sharedWithUser', attributes: ['id', 'username', 'email'] },
        { model: User, as: 'sharedByUser', attributes: ['id', 'username'] }
      ]
    });
    
    res.json(shares);
  } catch (error) {
    console.error('获取分享信息失败:', error);
    res.status(500).json({ message: '获取分享信息失败' });
  }
});

// 分享计划给用户
router.post('/:id/share', async (req, res) => {
  try {
    const plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!plan) return res.status(404).json({ message: '未找到' });
    
    const { username, userId, permission = 'view' } = req.body;
    
    let targetUser;
    if (username) {
      targetUser = await User.findOne({ where: { username } });
      if (!targetUser) {
        return res.status(404).json({ message: '目标用户不存在' });
      }
    } else if (userId) {
      targetUser = await User.findByPk(userId);
      if (!targetUser) {
        return res.status(404).json({ message: '目标用户不存在' });
      }
    } else {
      return res.status(400).json({ message: '用户名或用户ID不能为空' });
    }
    
    // 检查是否已经分享过
    const existingShare = await PlanShare.findOne({
      where: {
        planId: req.params.id,
        sharedWithUserId: targetUser.id
      }
    });
    
    if (existingShare) {
      return res.status(400).json({ message: '已经分享给该用户' });
    }
    
    // 创建分享记录
    const share = await PlanShare.create({
      planId: req.params.id,
      sharedWithUserId: targetUser.id,
      sharedByUserId: req.user.id,
      permission
    });
    
    res.json({ message: '分享成功', share });
  } catch (error) {
    console.error('分享失败:', error);
    res.status(500).json({ message: '分享失败' });
  }
});

// 取消分享
router.delete('/:id/shares', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ message: '用户名不能为空' });
    }

    const plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!plan) return res.status(404).json({ message: '未找到' });
    
    // 通过用户名查找用户
    const targetUser = await User.findOne({ where: { username } });
    if (!targetUser) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    const share = await PlanShare.findOne({
      where: {
        planId: req.params.id,
        sharedWithUserId: targetUser.id
      }
    });
    
    if (!share) {
      return res.status(404).json({ message: '分享记录不存在' });
    }
    
    await share.destroy();
    res.json({ message: '取消分享成功' });
  } catch (error) {
    console.error('取消分享失败:', error);
    res.status(500).json({ message: '取消分享失败' });
  }
});



router.get('/:id/days', async (req, res) => {
  try {
    // 首先检查是否是计划所有者
    let plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
    
    // 如果不是所有者，检查是否有分享权限
    if (!plan) {
      const share = await PlanShare.findOne({
        where: {
          planId: req.params.id,
          sharedWithUserId: req.user.id
        }
      });
      
      if (share) {
        plan = await TravelPlan.findOne({ where: { id: req.params.id } });
      }
    }
    
    if (!plan) return res.status(404).json({ message: '未找到' });
    const days = await PlanDay.findAll({ where: { planId: plan.id }, order: [['dayIndex', 'ASC']] });
    res.json(days);
  } catch (error) {
    console.error('获取计划天数失败:', error);
    res.status(500).json({ message: '获取计划天数失败' });
  }
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
  try {
    // 首先检查是否是计划所有者
    let plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
    
    // 如果不是所有者，检查是否有分享权限
    if (!plan) {
      const share = await PlanShare.findOne({
        where: {
          planId: req.params.id,
          sharedWithUserId: req.user.id
        }
      });
      
      if (share) {
        plan = await TravelPlan.findOne({ where: { id: req.params.id } });
      }
    }
    
    if (!plan) return res.status(404).json({ message: '未找到' });
    const files = await PlanFile.findAll({ where: { planId: plan.id }, order: [['createdAt', 'DESC']] });
    res.json(files);
  } catch (error) {
    console.error('获取计划文件失败:', error);
    res.status(500).json({ message: '获取计划文件失败' });
  }
});

// 下载文件
router.get('/:id/files/:fileId', async (req, res) => {
  try {
    // 首先检查是否是计划所有者
    let plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
    
    // 如果不是所有者，检查是否有分享权限
    if (!plan) {
      const share = await PlanShare.findOne({
        where: {
          planId: req.params.id,
          sharedWithUserId: req.user.id
        }
      });
      
      if (share) {
        plan = await TravelPlan.findOne({ where: { id: req.params.id } });
      }
    }
    
    if (!plan) return res.status(404).json({ message: '未找到计划' });
    
    const file = await PlanFile.findOne({ where: { id: req.params.fileId, planId: plan.id } });
    if (!file) return res.status(404).json({ message: '文件未找到' });
    
    // 处理中文文件名编码，确保下载时文件名正确显示
    const encodedFilename = encodeURIComponent(file.filename);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    res.download(file.path, file.filename);
  } catch (e) {
    console.error('下载文件失败:', e);
    res.status(500).json({ message: '下载文件失败', error: e.message });
  }
});

// 更新文件描述
router.put('/:id/files/:fileId', async (req, res) => {
  try {
    // 首先检查是否是计划所有者
    let plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
    
    // 如果不是所有者，检查是否有分享权限
    if (!plan) {
      const share = await PlanShare.findOne({
        where: {
          planId: req.params.id,
          sharedWithUserId: req.user.id
        }
      });
      
      if (share) {
        plan = await TravelPlan.findOne({ where: { id: req.params.id } });
      }
    }
    
    if (!plan) return res.status(404).json({ message: '未找到计划' });
    
    const file = await PlanFile.findOne({ 
      where: { id: req.params.fileId, planId: plan.id } 
    });
    
    if (!file) return res.status(404).json({ message: '文件未找到' });
    
    await file.update(req.body);
    res.json(file);
  } catch (error) {
    console.error('更新文件描述失败:', error);
    res.status(500).json({ message: '更新文件描述失败', error: error.message });
  }
});

// 删除文件
router.delete('/:id/files/:fileId', async (req, res) => {
  try {
    // 首先检查是否是计划所有者
    let plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
    
    // 如果不是所有者，检查是否有分享权限
    if (!plan) {
      const share = await PlanShare.findOne({
        where: {
          planId: req.params.id,
          sharedWithUserId: req.user.id
        }
      });
      
      if (share) {
        plan = await TravelPlan.findOne({ where: { id: req.params.id } });
      }
    }
    
    if (!plan) return res.status(404).json({ message: '未找到计划' });
    
    const file = await PlanFile.findOne({ 
      where: { id: req.params.fileId, planId: plan.id } 
    });
    
    if (!file) return res.status(404).json({ message: '文件未找到' });
    
    // 删除物理文件
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    
    // 删除数据库记录
    await file.destroy();
    
    res.status(204).end();
  } catch (error) {
    console.error('删除文件失败:', error);
    res.status(500).json({ message: '删除文件失败', error: error.message });
  }
});

router.post('/:id/files', upload.single('file'), async (req, res) => {
  try {
    const plan = await TravelPlan.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!plan) return res.status(404).json({ message: '未找到' });
    
    // 处理中文文件名编码
    const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    
    const file = await PlanFile.create({ 
      filename: originalname, 
      path: req.file.path, 
      planId: plan.id 
    });
    res.status(201).json(file);
  } catch (error) {
    console.error('上传文件失败:', error);
    res.status(500).json({ message: '上传文件失败', error: error.message });
  }
});

module.exports = router;
