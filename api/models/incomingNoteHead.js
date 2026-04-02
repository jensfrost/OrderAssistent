// api/models/incomingNoteHead.js
module.exports = (sequelize, DataTypes) => {
  const IncomingNoteHead = sequelize.define(
    'IncomingNoteHead',
    {
      regnr: {
        type: DataTypes.STRING(100),
        primaryKey: true,
        allowNull: false,
        field: 'Regnr',
      },

      docNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'DocNumber',
      },

      docDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'DocDate',
      },

      supplierNo: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'SupplierNo',
      },

      supplierName: {
        type: DataTypes.STRING(510),
        allowNull: true,
        field: 'SupplierName',
      },

      rowCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'RowCount',
      },

      status: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'Status',
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

      // Extra fält från tabellen

      nrows: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'NRows',
      },

      arrivalDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'ArrivalDate',
      },

      note1: {
        type: DataTypes.STRING(510),
        allowNull: true,
        field: 'Note1',
      },

      note2: {
        type: DataTypes.STRING(510),
        allowNull: true,
        field: 'Note2',
      },

      note3: {
        type: DataTypes.STRING(510),
        allowNull: true,
        field: 'Note3',
      },

      projectCode: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'ProjectCode',
      },

      profitCentre: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'ProfitCentre',
      },

      invoiceSent: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: 'InvoiceSent',
      },

      dnNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'DNNumber',
      },

      invDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'InvDate',
      },

      sourceTimestamp: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'SourceTimestamp',
      },

      localRemark: {
        type: DataTypes.STRING(510),
        allowNull: true,
        field: 'LocalRemark',
      },

      levnr: {
        type: DataTypes.STRING(40),
        allowNull: true,
        field: 'Levnr',
      },

      namn: {
        type: DataTypes.STRING(400),
        allowNull: true,
        field: 'Namn',
      },
    },
    {
      tableName: 'IncomingNoteHeads',
      schema: 'dbo',
      timestamps: false,
    }
  );

  return IncomingNoteHead;
};
