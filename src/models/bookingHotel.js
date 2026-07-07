module.exports = (sequelize, DataTypes) => {
  const BookingHotel = sequelize.define('BookingHotel', {
    city: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '住宿城市'
    },
    hotelName: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: '酒店名称'
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '酒店地点'
    },
    platform: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '预定平台'
    },
    nights: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: '间夜数'
    },
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      comment: '每晚价格'
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
    tableName: 'booking_hotels',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  });
  return BookingHotel;
};
