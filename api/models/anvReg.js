// models/AnvReg.js
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('AnvReg', {
    ANANVN: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true /* om identity */ },
    ANMAIL: { type: DataTypes.STRING(200), allowNull: false },
    ANPASS: { type: DataTypes.STRING(200), allowNull: false },
    ANROLE: { type: DataTypes.STRING(50),  allowNull: true },  // <-- LÄGG TILL
    ANRGDT: { type: DataTypes.DATE,        allowNull: true },  // (valfritt, om du vill visa tiderna du har i DB)
    ANLMDT: { type: DataTypes.DATE,        allowNull: true },  // (valfritt)
  }, {
    tableName: 'ANVREG',
    timestamps: false,
  });
};
