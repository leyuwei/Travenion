const jwt = require('jsonwebtoken');
const config = require('../config');

module.exports = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: '未授权' });
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ message: '无效token' });
  }
};
