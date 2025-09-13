'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('attractions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: '景点名称'
      },
      address: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: '景点地址'
      },
      latitude: {
        type: Sequelize.DECIMAL(10, 8),
        allowNull: true,
        comment: '纬度'
      },
      longitude: {
        type: Sequelize.DECIMAL(11, 8),
        allowNull: true,
        comment: '经度'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '景点描述'
      },
      visitOrder: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '在当天的游览顺序'
      },
      estimatedDuration: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '预计游览时长（分钟）'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '备注信息'
      },
      planDayId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'plan_days',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // 添加索引
    await queryInterface.addIndex('attractions', ['planDayId', 'visitOrder']);
    await queryInterface.addIndex('attractions', ['latitude', 'longitude']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('attractions');
  }
};