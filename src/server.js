const express = require('express');
const path = require('path');
const db = require('./models');
const config = require('./config');

const authRoutes = require('./routes/auth');
const planRoutes = require('./routes/plans');
const attractionRoutes = require('./routes/attractions');

const app = express();
app.use(express.json());
app.use('/travenion', express.static(path.join(__dirname, '..', 'public')));
app.use('/travenion/api/auth', authRoutes);
app.use('/travenion/api/plans', planRoutes);
app.use('/travenion/api/attractions', attractionRoutes);

const start = async () => {
  try {
    await db.sequelize.sync();
    app.listen(config.app.port, () => console.log(`服务器已在端口${config.app.port}启动`));
  } catch (e) {
    console.error('无法连接数据库', e);
  }
};

start();
