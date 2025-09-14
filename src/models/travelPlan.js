module.exports = (sequelize, DataTypes) => {
  const TravelPlan = sequelize.define('TravelPlan', {
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    defaultMap: {
      type: DataTypes.ENUM('openstreetmap', 'baidu'),
      defaultValue: 'openstreetmap'
    }
  });
  return TravelPlan;
};
