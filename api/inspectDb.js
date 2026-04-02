// inspectDb.js
const { Sequelize } = require('sequelize');
const sequelize = require('./config/database');   // your existing Sequelize instance

async function introspect() {
  const rows = await sequelize.query(
    `SELECT
       TABLE_SCHEMA,
       TABLE_NAME,
       COLUMN_NAME,
       DATA_TYPE,
       IS_NULLABLE,
       CHARACTER_MAXIMUM_LENGTH
     FROM INFORMATION_SCHEMA.COLUMNS
     ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION;`,
    { type: Sequelize.QueryTypes.SELECT }
  );

  let currentTable = '';
  for (const col of rows) {
    if (col.TABLE_NAME !== currentTable) {
      currentTable = col.TABLE_NAME;
      console.log(`\n🗄️  ${col.TABLE_SCHEMA}.${col.TABLE_NAME}`);
    }
    console.log(`  • ${col.COLUMN_NAME} (${col.DATA_TYPE}${col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : ''}) ${col.IS_NULLABLE==='YES'?'NULL':'NOT NULL'}`);
  }

  await sequelize.close();
}
introspect().catch(err => { console.error(err); process.exit(1); });
