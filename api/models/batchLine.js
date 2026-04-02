// models/BatchLine.js
module.exports = (sequelize, DataTypes) => {
  const BatchLine = sequelize.define('BatchLine', {
    ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'ID',
    },
    BATCH_ID: {
      // FK back to batch header (BatReg.BRBATCH)
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'BATCH_ID',
    },
    ING_ARTIKEL: {
      // raw-material article
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'ING_ARTIKEL',
    },
    ALLOC_VIKT: {
      // actual weight used
      type: DataTypes.DECIMAL(10, 3),
      allowNull: false,
      field: 'ALLOC_VIKT',
    },
    RAW_DEL_ID: {
      // raw-delivery FK (RawReg.RWID)
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'RAW_DEL_ID',
    },
    CreatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'CreatedAt',
    },
    LastChanged: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'LastChanged',
    },
  }, {
    tableName: 'BATCH_LINES',
    timestamps: true,
    createdAt: 'CreatedAt',
    updatedAt: 'LastChanged',
    hasTrigger: true,
  });

  // Associations
  BatchLine.associate = models => {
    // belongs to batch header
    BatchLine.belongsTo(models.BatReg, {
      foreignKey: 'BATCH_ID',
      targetKey: 'BRBATCH',
      as: 'header',
    });

    // belongs to raw delivery
    BatchLine.belongsTo(models.RawReg, {
      foreignKey: 'RAW_DEL_ID',
      targetKey: 'RWID',
      as: 'rawDelivery',
    });
  };

  return BatchLine;
};