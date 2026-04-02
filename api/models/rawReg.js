// models/rawReg.js
const { Op } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  const RawReg = sequelize.define(
    'RawReg',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        field: 'RWID',
      },

      material: {
        type: DataTypes.STRING(50),
        allowNull: false,
        field: 'RWARTN',
        validate: {
          notEmpty: { msg: 'material får inte vara tomt' },
          len: { args: [1, 50], msg: 'material max 50 tecken' },
        },
      },

      date: {
        type: DataTypes.DATE, // RWDATUM (DATETIME2)
        allowNull: false,
        field: 'RWDATUM',
        validate: {
          notEmpty: { msg: 'date krävs' },
          isDate: { msg: 'date måste vara ett datum' },
        },
      },

      quantity: {
        // Om DB-kolumnen är DECIMAL(18,3) är DECIMAL bättre än FLOAT,
        // men lämnar FLOAT som du hade för kompatibilitet.
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        field: 'RWKVANTITET',
        validate: {
          min: { args: [0], msg: 'quantity måste vara ≥ 0' },
          isFloat: { msg: 'quantity måste vara numerisk' },
        },
      },

      unit: {
        type: DataTypes.STRING(8),
        allowNull: false,
        field: 'RWENHET',
        validate: {
          notEmpty: { msg: 'unit krävs' },
          len: { args: [1, 8], msg: 'unit max 8 tecken' },
        },
        set(value) {
          if (typeof value === 'string') {
            this.setDataValue('unit', value.trim().toLowerCase());
          } else {
            this.setDataValue('unit', value);
          }
        },
      },

      supplier: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'RWLEVER',
      },

      notes: {
        type: DataTypes.STRING(200),
        allowNull: true,
        field: 'RWNAMN',
      },

      bestBeforeDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'RWBBDT',
      },

      rwlmdt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'RWLMDT',
      },

      // Visma löpnummer
      vismaDocumentNumber: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'RWVISMALOPNR',
        set(value) {
          if (value == null) return this.setDataValue('vismaDocumentNumber', null);
          this.setDataValue('vismaDocumentNumber', String(value).trim());
        },
        validate: {
          len: { args: [0, 50], msg: 'vismaDocumentNumber max 50 tecken' },
        },
      },

      // Inköpspris per enhet
      purchasePrice: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
        field: 'RWINPRIS',
        get() {
          const v = this.getDataValue('purchasePrice');
          return v == null ? null : Number(v);
        },
      },

      currencyCode: {
        type: DataTypes.STRING(3),
        field: 'RWCURR',
        allowNull: false,
        defaultValue: 'SEK',
        set(value) {
          if (value == null || value === '') {
            this.setDataValue('currencyCode', 'SEK');
            return;
          }
          const s = String(value).trim().toUpperCase().slice(0, 3);
          this.setDataValue('currencyCode', s || 'SEK');
        },
        validate: {
          len: { args: [3, 3], msg: 'currencyCode måste vara exakt 3 tecken' },
        },
      },

      // ✅ NYTT: Batchnummer (RWBATCHNR)
      // OBS: För bästa resultat, sätt DB-default till '' och/eller ISNULL i SELECT.
      batchNr: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: '',
        field: 'RWBATCHNR',
        set(value) {
          // Normalisera så vi aldrig lagrar NULL/"null"/"undefined"
          if (value == null) return this.setDataValue('batchNr', '');
          const s = String(value).trim();
          if (!s) return this.setDataValue('batchNr', '');
          const low = s.toLowerCase();
          if (low === 'null' || low === 'undefined') return this.setDataValue('batchNr', '');
          this.setDataValue('batchNr', s);
        },
        validate: {
          len: { args: [0, 50], msg: 'batchNr max 50 tecken' },
        },
      },
    },
    {
      tableName: 'RAWREG',
      schema: 'dbo',
      timestamps: false,
      hasTrigger: true,
      scopes: {
        byMaterial(mat) {
          return { where: { material: mat } };
        },
        bySupplier(sup) {
          return { where: { supplier: sup } };
        },
        onOrAfter(d) {
          return { where: { date: { [Op.gte]: d } } };
        },
      },
    }
  );

  // Normalisering
  RawReg.beforeValidate((row) => {
    if (row.unit && typeof row.unit === 'string') {
      row.unit = row.unit.trim().toLowerCase();
    }

    if (row.quantity == null) row.quantity = 0;

    if (row.vismaDocumentNumber != null) {
      row.vismaDocumentNumber = String(row.vismaDocumentNumber).trim();
    }

    if (row.currencyCode && typeof row.currencyCode === 'string') {
      row.currencyCode = row.currencyCode.trim().toUpperCase().slice(0, 3) || 'SEK';
    } else if (!row.currencyCode) {
      row.currencyCode = 'SEK';
    }

    // batchNr: aldrig null
    if (row.batchNr == null) row.batchNr = '';
    if (typeof row.batchNr === 'string') {
      const s = row.batchNr.trim();
      if (!s) row.batchNr = '';
      else {
        const low = s.toLowerCase();
        row.batchNr = (low === 'null' || low === 'undefined') ? '' : s;
      }
    }
  });

  return RawReg;
};
