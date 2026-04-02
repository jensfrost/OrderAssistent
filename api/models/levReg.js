module.exports = (sequelize, DataTypes) => {
  return sequelize.define('LevReg', {
    LRLEVN: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false
    },
    LRNAMN: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    LRKONT: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    LRSTAT: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    LRRGDT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Created date'
    },
    LRLMDT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last modified date'
    }
  }, {
    tableName: 'LEVREG',
    timestamps: false
  });
};
