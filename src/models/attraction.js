module.exports = (sequelize, DataTypes) => {
  const Attraction = sequelize.define('Attraction', {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: '景点名称'
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '景点地址'
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
      comment: '纬度'
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
      comment: '经度'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '景点描述'
    },
    visitOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: '在当天的游览顺序'
    },
    estimatedDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '预计游览时长（分钟）'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '备注信息'
    }
  }, {
    tableName: 'attractions',
    timestamps: true,
    indexes: [
      {
        fields: ['planDayId', 'visitOrder']
      },
      {
        fields: ['latitude', 'longitude']
      }
    ]
  });
  
  return Attraction;
};