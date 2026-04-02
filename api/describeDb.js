// api/describeDb.js
const path      = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

async function describeAll() {
  console.log('🔍 Starting DB description…');

  // 1) get all tables (MSSQL returns objects with tableName + schema)
  const rawTables = await sequelize.getQueryInterface().showAllTables();
  const tables = rawTables.map(t => typeof t === 'string' ? t : t.tableName);

  if (!tables.length) {
    console.log('⚠️  No tables found!');
    return;
  }

  console.log('✅ Tables found:', tables.join(', '));

  // 2) for each table, fetch its columns
  for (const tableName of tables) {
    console.log(`\n📋 Table: ${tableName}`);
    try {
      const cols = await sequelize.query(
        `
        SELECT
          COLUMN_NAME,
          DATA_TYPE,
          CASE WHEN IS_NULLABLE = 'YES' THEN 'nullable' ELSE 'not null' END AS NULLABILITY
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = :table
        ORDER BY ORDINAL_POSITION
        `,
        {
          type: QueryTypes.SELECT,
          replacements: { table: tableName }
        }
      );

      for (const col of cols) {
        console.log(`  • ${col.COLUMN_NAME} — type: ${col.DATA_TYPE}, ${col.NULLABILITY}`);
      }
    } catch (err) {
      console.error(`❌ Error describing ${tableName}:`, err.message);
    }
  }

  console.log('\n✅ Done.');
}

describeAll()
  .catch(err => {
    console.error('❌ Unexpected error:', err);
  })
  .finally(() => {
    sequelize.close();
  });
