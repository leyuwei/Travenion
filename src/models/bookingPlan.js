module.exports = (sequelize, DataTypes) => {
  const BookingPlan = sequelize.define('BookingPlan', {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: '候选计划名称，如 方案A'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '计划备注'
    }
  }, {
    tableName: 'booking_plans',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  });
  return BookingPlan;
};
