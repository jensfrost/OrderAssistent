// models/enhreg.js
/** ENHREG (enheter)
 *  ENHCODE   NVARCHAR(8)   PK (t.ex. 'kg','g','st','l','ml')
 *  ENHNAMN   NVARCHAR(50)  Visningsnamn
 *  IS_ACTIVE BIT           Aktiv flagga
 */
module.exports = (sequelize, DataTypes) => {
  const EnhReg = sequelize.define(
    'EnhReg',
    {
      code: {
        type: DataTypes.STRING(8),
        allowNull: false,
        primaryKey: true,
        field: 'ENHCODE',
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        field: 'ENHNAMN',
      },
      isActive: {
        type: DataTypes.BOOLEAN, // mappar till BIT i SQL Server
        allowNull: false,
        defaultValue: true,
        field: 'IS_ACTIVE',
      },
    },
    {
      tableName: 'ENHREG',
      timestamps: false,
    }
  );

  // Håll koderna konsekvent i lower-case
  EnhReg.beforeValidate((row) => {
    if (row.code) row.code = String(row.code).trim().toLowerCase();
  });

  // Hjälpmetoder
  EnhReg.getActive = () =>
    EnhReg.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']],
      attributes: [
        ['ENHCODE', 'ENHCODE'],
        ['ENHNAMN', 'ENHNAMN'],
        ['IS_ACTIVE', 'IS_ACTIVE'],
      ],
      raw: true,
    });

  return EnhReg;
};
