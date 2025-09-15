module.exports = (sequelize, DataTypes) => {
  const PlanFile = sequelize.define('PlanFile', {
    filename: {
      type: DataTypes.STRING,
      allowNull: false
    },
    originalName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    path: {
      type: DataTypes.STRING,
      allowNull: false
    },
    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    uploadedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  });
  return PlanFile;
};
