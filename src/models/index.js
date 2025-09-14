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
db.Attraction = require('./attraction')(sequelize, DataTypes);

// associations

db.User.hasMany(db.TravelPlan, { foreignKey: 'userId' });
db.TravelPlan.belongsTo(db.User, { foreignKey: 'userId' });

db.TravelPlan.hasMany(db.PlanDay, { foreignKey: 'planId', as: 'days' });
db.PlanDay.belongsTo(db.TravelPlan, { foreignKey: 'planId' });

db.TravelPlan.hasMany(db.PlanFile, { foreignKey: 'planId', as: 'files' });
db.PlanFile.belongsTo(db.TravelPlan, { foreignKey: 'planId' });

db.PlanDay.hasMany(db.Attraction, { foreignKey: 'planDayId', as: 'attractionList' });
db.Attraction.belongsTo(db.PlanDay, { foreignKey: 'planDayId' });

// PlanShare关联关系
db.PlanShare.belongsTo(db.TravelPlan, { foreignKey: 'planId', as: 'plan' });
db.PlanShare.belongsTo(db.User, { foreignKey: 'sharedWithUserId', as: 'sharedWithUser' });
db.PlanShare.belongsTo(db.User, { foreignKey: 'sharedByUserId', as: 'sharedByUser' });

db.TravelPlan.hasMany(db.PlanShare, { foreignKey: 'planId', as: 'shares' });
db.User.hasMany(db.PlanShare, { foreignKey: 'sharedWithUserId', as: 'receivedShares' });
db.User.hasMany(db.PlanShare, { foreignKey: 'sharedByUserId', as: 'sentShares' });

module.exports = db;
