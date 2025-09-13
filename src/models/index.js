const { Sequelize, DataTypes } = require('sequelize');
const config = require('../config');

const sequelize = new Sequelize(config.db.database, config.db.user, config.db.password, {
  host: config.db.host,
  port: config.db.port,
  dialect: 'mysql',
  logging: false
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.User = require('./user')(sequelize, DataTypes);
db.TravelPlan = require('./travelPlan')(sequelize, DataTypes);
db.PlanDay = require('./planDay')(sequelize, DataTypes);
db.PlanFile = require('./planFile')(sequelize, DataTypes);
db.PlanShare = require('./planShare')(sequelize, DataTypes);

// associations

db.User.hasMany(db.TravelPlan, { foreignKey: 'userId' });
db.TravelPlan.belongsTo(db.User, { foreignKey: 'userId' });

db.TravelPlan.hasMany(db.PlanDay, { foreignKey: 'planId', as: 'days' });
db.PlanDay.belongsTo(db.TravelPlan, { foreignKey: 'planId' });

db.TravelPlan.hasMany(db.PlanFile, { foreignKey: 'planId', as: 'files' });
db.PlanFile.belongsTo(db.TravelPlan, { foreignKey: 'planId' });

db.TravelPlan.belongsToMany(db.User, { through: db.PlanShare, as: 'sharedWith', foreignKey: 'planId', otherKey: 'userId' });
db.User.belongsToMany(db.TravelPlan, { through: db.PlanShare, as: 'sharedPlans', foreignKey: 'userId', otherKey: 'planId' });

module.exports = db;
