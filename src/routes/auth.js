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

module.exports = router;
