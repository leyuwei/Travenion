module.exports = (sequelize, DataTypes) => {
  const PlanDay = sequelize.define('PlanDay', {
    date: {
      type: DataTypes.DATEONLY,
      // 日期在前端不是必填项，允许为空避免因缺失导致创建失败
      allowNull: true
    },
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
}
