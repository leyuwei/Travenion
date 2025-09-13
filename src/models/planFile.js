module.exports = (sequelize, DataTypes) => {
  const PlanFile = sequelize.define('PlanFile', {
    filename: {
      type: DataTypes.STRING,
      allowNull: false
    },
    path: {
      type: DataTypes.STRING,
      allowNull: false
    }
  });
  return PlanFile;
};
