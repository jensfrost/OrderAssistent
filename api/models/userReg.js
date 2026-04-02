// models/user.js
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {                // ANANVN (PK, int)
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'ANANVN',
    },
    email: {             // ANMAIL
      type: DataTypes.STRING(200),
      allowNull: false,
      unique: false,     // sätt true om du har/önskar unikt index i DB
      field: 'ANMAIL',
    },
    passwordHash: {      // ANPASS
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'ANPASS',
    },
    role: {              // ANROLE
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'user',
      field: 'ANROLE',
    },
    createdAt: {         // ANRGDT
      type: DataTypes.DATE,
      field: 'ANRGDT',
    },
    updatedAt: {         // ANLMDT
      type: DataTypes.DATE,
      field: 'ANLMDT',
    },
  }, {
    tableName: 'ANVREG',
    freezeTableName: true,
    timestamps: true,            // använd kolumnerna som Sequelize timestamps
    createdAt: 'ANRGDT',
    updatedAt: 'ANLMDT',
  });

  // Dölj lösenord i alla JSON-svar
  User.prototype.toJSON = function () {
    const v = { ...this.get() };
    delete v.passwordHash;
    return v;
  };

  return User;
};
