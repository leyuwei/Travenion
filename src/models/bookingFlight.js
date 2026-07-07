module.exports = (sequelize, DataTypes) => {
  const BookingFlight = sequelize.define('BookingFlight', {
    flightNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: '航班号'
    },
    departure: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: '出发地机场'
    },
    destination: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: '目的地机场'
    },
    isTransit: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否中转'
    },
    transitCity: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '中转城市'
    },
    transitDuration: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '中转时长'
    },
    platform: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '预定平台'
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: '日期'
    },
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      comment: '价格'
    },
    orderImage: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '订单截图文件名'
    },
    orderLink: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '订单链接'
    }
  }, {
    tableName: 'booking_flights',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  });
  return BookingFlight;
};
