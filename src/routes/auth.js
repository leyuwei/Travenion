const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const config = require('../config');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: '缺少参数' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password_hash: hash });
    res.status(201).json({ id: user.id, username: user.username, email: user.email });
  } catch (e) {
    res.status(500).json({ message: '注册失败', error: e.message });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ where: { username } });
  if (!user) return res.status(401).json({ message: '用户名或密码错误' });
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ message: '用户名或密码错误' });
  const token = jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: '7d' });
  res.json({ token });
});

// 获取当前用户信息
const auth = require('../middleware/auth');
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'username', 'email', 'nickname', 'avatar', 'created_at']
    });
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      nickname: user.nickname,
      avatar: user.avatar,
      createdAt: user.created_at
    });
  } catch (error) {
    res.status(500).json({ message: '获取用户信息失败', error: error.message });
  }
});

// 更新用户信息
router.put('/me', auth, async (req, res) => {
  try {
    const { nickname, email, avatar } = req.body;
    const userId = req.user.id;
    
    // 构建更新对象
    const updateData = {};
    if (nickname !== undefined) updateData.nickname = nickname;
    if (email !== undefined) updateData.email = email;
    if (avatar !== undefined) updateData.avatar = avatar;
    
    // 如果更新邮箱，检查邮箱是否已被使用
    if (email) {
      const existingUser = await User.findOne({ 
        where: { email, id: { [require('sequelize').Op.ne]: userId } }
      });
      if (existingUser) {
        return res.status(409).json({ message: '邮箱已被使用' });
      }
    }
    
    // 更新用户信息
    await User.update(updateData, { where: { id: userId } });
    
    // 返回更新后的用户信息
    const updatedUser = await User.findByPk(userId, {
      attributes: ['id', 'username', 'email', 'nickname', 'avatar', 'created_at']
    });
    
    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      nickname: updatedUser.nickname,
      avatar: updatedUser.avatar,
      createdAt: updatedUser.created_at
    });
  } catch (error) {
    res.status(500).json({ message: '更新用户信息失败', error: error.message });
  }
});

// 修改密码
router.put('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: '当前密码和新密码不能为空' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: '新密码长度不能少于6位' });
    }
    
    // 获取用户当前密码
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    // 验证当前密码
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ message: '当前密码错误' });
    }
    
    // 加密新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    // 更新密码
    await User.update(
      { password_hash: newPasswordHash },
      { where: { id: userId } }
    );
    
    res.json({ message: '密码修改成功' });
  } catch (error) {
    res.status(500).json({ message: '修改密码失败', error: error.message });
  }
});

module.exports = router;
