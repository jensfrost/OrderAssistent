// models/artReg.js
module.exports = (sequelize, DataTypes) => {
  const ArtReg = sequelize.define('ArtReg', {
    ARARTN: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false
    },
    ARARTS: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    ARNAMN: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    ARLEVE: {
      type: DataTypes.STRING(50),
      allowNull: true,
      references: { model: 'LEVREG', key: 'LRLEVN' }
    },
    // ARSTATNR ↔ JS ARSTAT
    ARSTATNR: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'ARSTATNR'
    },
    // ARTYPNR ↔ JS ARTYPE
    ARTYPNR: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'ARTYPNR'
    },
    ARRGDT: {
      type: DataTypes.DATE,
      allowNull: true
    },
    ARLMDT: {
      type: DataTypes.DATE,
      allowNull: true
    },
    ARENHET: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
  }, {
    tableName:  'ARTREG',
    timestamps: true,
    createdAt:  'ARRGDT',  // managed by Sequelize on insert
    updatedAt:  'ARLMDT'   // managed by Sequelize on every update
  });

  return ArtReg;
};
