module.exports = (sequelize, DataTypes) => {
  const PlanShare = sequelize.define('PlanShare', {
    // join table
  }, { timestamps: false });
  return PlanShare;
};
