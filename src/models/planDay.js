module.exports = (sequelize, DataTypes) => {
  const PlanDay = sequelize.define('PlanDay', {
    dayIndex: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    city: {
      type: DataTypes.STRING,
      allowNull: false
    },
    transportation: {
      type: DataTypes.STRING,
      allowNull: true
    },
    attractions: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  });
  return PlanDay;
};
