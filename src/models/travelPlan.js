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
    },
    shareToken: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '公开分享令牌，为null表示未公开分享'
    }
  });
  return TravelPlan;
};
