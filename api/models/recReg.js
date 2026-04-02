/** RECREG – recept/ingredienser per färdigvara */
module.exports = (sequelize, DataTypes) => {
  const RecReg = sequelize.define('RecReg', {
    articleNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'ARARTN',
      primaryKey: true,
      validate: {
        notEmpty: { msg: 'ARARTN (articleNumber) får inte vara tomt' },
        len: { args: [1, 50], msg: 'ARARTN max 50 tecken' },
      },
    },
    seq: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
      field: 'RRSEQN',
      primaryKey: true,
      validate: {
        isInt: { msg: 'RRSEQN måste vara ett heltal' },
        min: { args: [0], msg: 'RRSEQN måste vara ≥ 0' },
      },
    },
    amountPer: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'RRINAR',
      validate: {
        isFloat: { msg: 'RRINAR måste vara numerisk' },
        min: { args: [0], msg: 'RRINAR måste vara ≥ 0' },
      },
    },
    rawArticle: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'RRARTS',
      validate: {
        notEmpty: { msg: 'RRARTS (rawArticle) får inte vara tomt' },
        len: { args: [1, 50], msg: 'RRARTS max 50 tecken' },
      },
    },

    // === Ny kolumn: à-pris per rad (styckpris) ===
    rrSumma: {
      type: DataTypes.FLOAT,
      allowNull: true,           // kan vara null om pris saknas
      defaultValue: null,
      field: 'RRSUMMA',
      validate: {
        isFloat: { msg: 'RRSUMMA måste vara numerisk' },
        min: { args: [0], msg: 'RRSUMMA måste vara ≥ 0' },
      },
      comment: 'À-pris (styckpris) för raden från Visma',
    },

    rrCreatedAt: { type: DataTypes.DATE, allowNull: true, field: 'RRRGDT' },
    rrChangedAt: { type: DataTypes.DATE, allowNull: true, field: 'RRLMDT' },
  }, {
    tableName: 'RECREG',
    timestamps: false,
    defaultScope: {},
    scopes: {
      ordered: { order: [['seq', 'ASC']] },
      forArticle(arartn) { return { where: { articleNumber: arartn }, order: [['seq', 'ASC']] }; },
      forRaw(rrarts) { return { where: { rawArticle: rrarts }, order: [['articleNumber', 'ASC'], ['seq', 'ASC']] }; },
    },
    indexes: [{ fields: ['ARARTN'] }, { fields: ['RRARTS'] }],
  });

  RecReg.removeAttribute('id');

  RecReg.beforeValidate(row => {
    if (row.articleNumber && typeof row.articleNumber === 'string') row.articleNumber = row.articleNumber.trim();
    if (row.rawArticle && typeof row.rawArticle === 'string') row.rawArticle = row.rawArticle.trim();
    if (row.amountPer == null) row.amountPer = 0;
    // rrSumma kan lämnas null; ingen default-tvingning här
  });

  return RecReg;
};
