// api/models/incomingNoteRow.js
module.exports = (sequelize, DataTypes) => {
  const IncomingNoteRow = sequelize.define(
    'IncomingNoteRow',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
        field: 'Id',
      },

      regnr: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'Regnr',
      },

      rowIndex: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'RowIndex',
      },

      articleNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'ArticleNumber',
      },

      description: {
        type: DataTypes.STRING(510),
        allowNull: true,
        field: 'Description',
      },

      quantity: {
        type: DataTypes.DECIMAL(18, 3),
        allowNull: true,
        field: 'Quantity',
      },

      unit: {
        type: DataTypes.STRING(40),
        allowNull: true,
        field: 'Unit',
      },

      bestBefore: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'BestBefore',
      },

      purchasePrice: {
        type: DataTypes.DECIMAL(18, 4),
        allowNull: true,
        field: 'PurchasePrice',
      },

      currencyCode: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: 'CurrencyCode',
      },

      rawJson: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'RawJson',
      },

      lastSyncedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'LastSyncedAt',
        defaultValue: DataTypes.NOW,
      },

      supplierArticleNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'SupplierArticleNumber',
      },

      quantity2: {
        type: DataTypes.DECIMAL(18, 3),
        allowNull: true,
        field: 'Quantity2',
      },

      quantity3: {
        type: DataTypes.DECIMAL(18, 3),
        allowNull: true,
        field: 'Quantity3',
      },

      amountCurrentCurrency: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
        field: 'AmountCurrentCurrency',
      },

      amountDomesticCurrency: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
        field: 'AmountDomesticCurrency',
      },

      profitCentre: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'ProfitCentre',
      },

      rowText: {
        type: DataTypes.STRING(510),
        allowNull: true,
        field: 'RowText',
      },

      print2: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'Print2',
      },

      fromType: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: 'FromType',
      },

      fromDocument: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'FromDocument',
      },

      fromDocRow: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'FromDocRow',
      },

      connectionType: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: 'ConnectionType',
      },

      connectionDocument: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'ConnectionDocument',
      },

      connectionDocRow: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'ConnectionDocRow',
      },

      sourceTimestamp: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'SourceTimestamp',
      },

      bestnr: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'Bestnr',
      },

      print: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'Print',
      },
    },
    {
      tableName: 'IncomingNoteRows',
      schema: 'dbo',
      timestamps: false,
    }
  );

  return IncomingNoteRow;
};
