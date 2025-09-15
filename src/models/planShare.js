module.exports = (sequelize, DataTypes) => {
  const PlanShare = sequelize.define('PlanShare', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    planId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'TravelPlans',
        key: 'id'
      }
    },
    sharedWithUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    sharedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    permission: {
      type: DataTypes.ENUM('view', 'edit'),
      defaultValue: 'edit'
    },
    sharedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    timestamps: true
  });
  return PlanShare;
};
