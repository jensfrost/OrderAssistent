// api/models/index.js
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// ─────────────────────────────────────
//   Import av modeller
// ─────────────────────────────────────
const ArtReg    = require('./artReg')(sequelize, DataTypes);
const BatReg    = require('./batReg')(sequelize, DataTypes);
const BatchLine = require('./batchLine')(sequelize, DataTypes);
const LevReg    = require('./levReg')(sequelize, DataTypes);
const RecReg    = require('./recReg')(sequelize, DataTypes);
const AnvReg    = require('./anvReg')(sequelize, DataTypes);
const RawReg    = require('./rawReg')(sequelize, DataTypes);
const EnhReg    = require('./enhReg')(sequelize, DataTypes);
const UserReg   = require('./userReg')(sequelize, DataTypes);

// ✨ Incoming-cache modeller
const IncomingNoteHead = require('./incomingNoteHead')(sequelize, DataTypes);
const IncomingNoteRow  = require('./incomingNoteRow')(sequelize, DataTypes);

// ─────────────────────────────────────
//   Associationer
// ─────────────────────────────────────

// LEVREG 1:M ARTREG
LevReg.hasMany(ArtReg, {
  foreignKey: 'ARLEVE',
  sourceKey: 'LRLEVN',
});
ArtReg.belongsTo(LevReg, {
  foreignKey: 'ARLEVE',
  targetKey: 'LRLEVN',
});

// ARTREG 1:1 RECREG
ArtReg.hasOne(RecReg, {
  foreignKey: 'ARARTN',
  sourceKey: 'ARARTN',
});
RecReg.belongsTo(ArtReg, {
  foreignKey: 'ARARTN',
  targetKey: 'ARARTN',
});

// RECREG 1:M BATREG
RecReg.hasMany(BatReg, {
  foreignKey: 'BRARTS',
  sourceKey: 'ARARTN',
});
BatReg.belongsTo(RecReg, {
  foreignKey: 'BRARTS',
  targetKey: 'ARARTN',
});

// ARTREG 1:M BATREG
ArtReg.hasMany(BatReg, {
  foreignKey: 'BRARTS',
  sourceKey: 'ARARTN',
});
BatReg.belongsTo(ArtReg, {
  foreignKey: 'BRARTS',
  targetKey: 'ARARTN',
});

// BATREG 1:M BatchLine
BatReg.hasMany(BatchLine, {
  foreignKey: 'BATCH_ID',
  sourceKey: 'BRBATCH',
});
BatchLine.belongsTo(BatReg, {
  foreignKey: 'BATCH_ID',
  targetKey: 'BRBATCH',
});

// ENHREG 1:M RAWREG via unit/code
EnhReg.hasMany(RawReg, {
  foreignKey: 'RRENHET',
  sourceKey: 'code',
});
RawReg.belongsTo(EnhReg, {
  foreignKey: 'RRENHET',
  targetKey: 'code',
  as: 'rawUnit',
});

// ENHREG 1:M RECREG via unit/code
EnhReg.hasMany(RecReg, {
  foreignKey: 'RRENHET',
  sourceKey: 'code',
});
RecReg.belongsTo(EnhReg, {
  foreignKey: 'RRENHET',
  targetKey: 'code',
  as: 'recipeUnit',
});

// ✨ Incoming-cache: head ↔ rows
IncomingNoteHead.hasMany(IncomingNoteRow, {
  foreignKey: 'regnr',   // fältet i IncomingNoteRows-tabellen
  sourceKey: 'regnr',    // fältet i IncomingNoteHeads-tabellen
  as: 'rows',
});

IncomingNoteRow.belongsTo(IncomingNoteHead, {
  foreignKey: 'regnr',
  targetKey: 'regnr',
  as: 'head',
});

// ─────────────────────────────────────
//   Export
// ─────────────────────────────────────
module.exports = {
  sequelize,
  Sequelize,

  ArtReg,
  BatReg,
  BatchLine,
  LevReg,
  RecReg,
  AnvReg,
  RawReg,
  EnhReg,
  UserReg,

  // cache-modeller
  IncomingNoteHead,
  IncomingNoteRow,
};
