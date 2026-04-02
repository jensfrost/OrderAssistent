// models/BatReg.js
module.exports = (sequelize, DataTypes) => {
  const BatReg = sequelize.define('BatReg', {
    BRBATCH: {                       // your batch/run number
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false,
      field: 'BRBATCH',
    },
    BRARTS: {                        // product code
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'BRARTS',
    },
    BRBBDT: {                        // best-before date
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'BRBBDT',
    },
    BRKVANT: {                       // total quantity produced
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'BRKVANT',
    },
    BRRGDT: {                        // run timestamp (trigger default GETDATE)
      type: DataTypes.DATE,
      allowNull: false,
      field: 'BRRGDT',
    },
    BRLMDT: {                        // last-modified (trigger on update)
      type: DataTypes.DATE,
      allowNull: true,
      field: 'BRLMDT',
    },
    BRARTN: {                        // if you still need raw-article on header
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'BRARTN',
    },
    BRTRVI: {                        // recipe reference qty on header
      type: DataTypes.FLOAT,
      allowNull: true,
      field: 'BRTRVI',
    },
    BRVIKT: {                        // actual weight on header
      type: DataTypes.FLOAT,
      allowNull: true,
      field: 'BRVIKT',
    },
    BRAPI1: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'BRAPI1',
    },
    BRAPI2: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'BRAPI2',
    },
  }, {
    tableName: 'BATREG',
    timestamps: false,
    hasTrigger: true,
  });

  BatReg.associate = models => {
    BatReg.Lines = BatReg.hasMany(models.BatchLine, {
      foreignKey: 'BATCH_ID',
      sourceKey: 'BRBATCH',
      as: 'lines',
    });
  };

  return BatReg;
};
