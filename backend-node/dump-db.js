/**
 * dump-db.js
 * ─────────────────────────────────────────────────────────────────
 * Connects to the live PostgreSQL database and introspects the REAL
 * schema entirely from pg_catalog / information_schema.
 * Does NOT trust any static SQL file.
 *
 * Output: seed_data.sql — a fully idempotent script that:
 *   1. Creates tables (with all real columns/types) IF NOT EXISTS
 *   2. Adds any columns that may be missing on older installs
 *   3. Adds real FK constraints IF NOT EXISTS
 *   4. Creates indexes IF NOT EXISTS
 *   5. INSERTs all live data using ON CONFLICT DO NOTHING
 *
 * Usage:
 *   node dump-db.js
 *   psql -U postgres -d newdatainsights -f src/config/seed_data.sql
 * ─────────────────────────────────────────────────────────────────
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'newdatainsights',
  user: 'postgres',
  password: 'Garv@0035',
});

// ─── Escaping ────────────────────────────────────────────────────
function escapeVal(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  // For objects/arrays (e.g. jsonb), serialize to JSON string
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

function colList(cols) {
  return '(' + cols.join(', ') + ')';
}

function valList(row, cols) {
  return '(' + cols.map(c => escapeVal(row[c])).join(', ') + ')';
}

// ─── Schema introspection ─────────────────────────────────────────

/** Returns all user tables in dependency order (FK-safe) */
async function getTablesInOrder(client) {
  // Get all tables
  const tablesRes = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const allTables = tablesRes.rows.map(r => r.table_name);

  // Get FK dependencies
  const depRes = await client.query(`
    SELECT DISTINCT
      tc.table_name AS child,
      ccu.table_name AS parent
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name != ccu.table_name
  `);

  // Build dependency graph and topological sort
  const deps = {}; // child -> [parents]
  allTables.forEach(t => { deps[t] = []; });
  depRes.rows.forEach(({ child, parent }) => {
    if (deps[child]) deps[child].push(parent);
  });

  const sorted = [];
  const visited = new Set();
  const inProgress = new Set();

  function visit(table) {
    if (visited.has(table)) return;
    if (inProgress.has(table)) return; // cycle guard
    inProgress.add(table);
    (deps[table] || []).forEach(visit);
    inProgress.delete(table);
    visited.add(table);
    sorted.push(table);
  }
  allTables.forEach(visit);
  return sorted;
}

/** Returns columns for a table with full type info */
async function getColumns(client, tableName) {
  const res = await client.query(`
    SELECT
      c.column_name,
      c.data_type,
      c.udt_name,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      c.is_nullable,
      c.column_default,
      c.ordinal_position
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = $1
    ORDER BY c.ordinal_position
  `, [tableName]);
  return res.rows;
}

/** Map info_schema data_type to a usable PostgreSQL type string */
function pgType(col) {
  const t = col.data_type.toUpperCase();
  if (t === 'CHARACTER VARYING') {
    return col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'TEXT';
  }
  if (t === 'CHARACTER') return `CHAR(${col.character_maximum_length || 1})`;
  if (t === 'NUMERIC' || t === 'DECIMAL') {
    if (col.numeric_precision && col.numeric_scale) return `NUMERIC(${col.numeric_precision},${col.numeric_scale})`;
    return 'NUMERIC';
  }
  if (t === 'TIMESTAMP WITHOUT TIME ZONE') return 'TIMESTAMP';
  if (t === 'TIMESTAMP WITH TIME ZONE') return 'TIMESTAMPTZ';
  if (t === 'USER-DEFINED') {
    // e.g. uuid, citext, inet, jsonb
    return col.udt_name.toUpperCase();
  }
  if (t === 'ARRAY') return col.udt_name.replace(/^_/, '').toUpperCase() + '[]';
  return t; // INT, TEXT, BOOLEAN, BIGINT, etc.
}

/** Returns primary key columns for a table */
async function getPrimaryKeys(client, tableName) {
  const res = await client.query(`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = $1
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
  `, [tableName]);
  return res.rows.map(r => r.column_name);
}

/** Returns unique constraints (excluding PK) */
async function getUniqueConstraints(client, tableName) {
  const res = await client.query(`
    SELECT
      tc.constraint_name,
      ARRAY_AGG(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = $1
      AND tc.constraint_type = 'UNIQUE'
    GROUP BY tc.constraint_name
  `, [tableName]);
  return res.rows;
}

/** Returns FK constraints for a table */
async function getForeignKeys(client, tableName) {
  const res = await client.query(`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = $1
      AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY kcu.ordinal_position
  `, [tableName]);
  return res.rows;
}

/** Returns indexes for a table (excluding PK/unique constraint indexes) */
async function getIndexes(client, tableName) {
  const res = await client.query(`
    SELECT
      i.relname AS index_name,
      ix.indisunique AS is_unique,
      ARRAY(
        SELECT a.attname
        FROM unnest(ix.indkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
        WHERE k.attnum > 0
      ) AS columns
    FROM pg_class t
    JOIN pg_index ix ON ix.indrelid = t.oid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = $1
      AND n.nspname = 'public'
      AND NOT ix.indisprimary
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        WHERE tc.constraint_name = i.relname AND tc.table_schema = 'public'
          AND tc.constraint_type = 'UNIQUE'
      )
    ORDER BY i.relname
  `, [tableName]);
  return res.rows;
}

// ─── DDL builder ──────────────────────────────────────────────────
async function buildCreateTableSQL(client, tableName) {
  const columns = await getColumns(client, tableName);
  const pks = await getPrimaryKeys(client, tableName);
  const uniques = await getUniqueConstraints(client, tableName);
  const fks = await getForeignKeys(client, tableName);

  let sql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
  const colLines = [];

  for (const col of columns) {
    let line = `    ${col.column_name} ${pgType(col)}`;
    if (col.is_nullable === 'NO') line += ' NOT NULL';
    if (col.column_default !== null) {
      // Don't emit nextval defaults for serial — just keep uuid/now() etc.
      if (!col.column_default.startsWith('nextval(')) {
        line += ` DEFAULT ${col.column_default}`;
      }
    }
    colLines.push(line);
  }

  // PRIMARY KEY
  if (pks.length > 0) {
    colLines.push(`    PRIMARY KEY (${pks.join(', ')})`);
  }

  // UNIQUE constraints
  for (const uq of uniques) {
    colLines.push(`    UNIQUE (${uq.columns.join(', ')})`);
  }

  // FOREIGN KEYS
  for (const fk of fks) {
    const onDelete = fk.delete_rule !== 'NO ACTION' ? ` ON DELETE ${fk.delete_rule}` : '';
    colLines.push(
      `    CONSTRAINT ${fk.constraint_name} FOREIGN KEY (${fk.column_name}) REFERENCES ${fk.foreign_table}(${fk.foreign_column})${onDelete}`
    );
  }

  sql += colLines.join(',\n') + '\n);\n';
  return sql;
}

/** Emit ALTER TABLE ADD COLUMN IF NOT EXISTS for safety on old schemas */
async function buildAlterColumnsSQL(client, tableName) {
  const columns = await getColumns(client, tableName);
  let sql = '';
  for (const col of columns) {
    const typePart = pgType(col);
    const defaultPart = col.column_default && !col.column_default.startsWith('nextval(')
      ? ` DEFAULT ${col.column_default}`
      : '';
    sql += `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${col.column_name} ${typePart}${defaultPart};\n`;
  }
  return sql;
}

// ─── Data dumper ─────────────────────────────────────────────────
async function dumpTableData(client, tableName) {
  const pks = await getPrimaryKeys(client, tableName);
  const uniques = await getUniqueConstraints(client, tableName);

  const res = await client.query(`SELECT * FROM ${tableName}`);
  const rows = res.rows;
  if (rows.length === 0) return `-- Table: ${tableName} (no data)\n\n`;

  const cols = Object.keys(rows[0]);
  let sql = `-- Table: ${tableName} (${rows.length} rows)\n`;

  // Determine ON CONFLICT target
  let conflictTarget = '';
  if (pks.length > 0) {
    conflictTarget = `(${pks.join(', ')})`;
  } else if (uniques.length > 0) {
    conflictTarget = `(${uniques[0].columns.join(', ')})`;
  }

  for (const row of rows) {
    const insSQL = `INSERT INTO ${tableName} ${colList(cols)} VALUES ${valList(row, cols)}`;
    if (conflictTarget) {
      sql += `${insSQL} ON CONFLICT ${conflictTarget} DO NOTHING;\n`;
    } else {
      sql += `${insSQL};\n`;
    }
  }
  return sql + '\n';
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    console.log('✅ Connected to PostgreSQL — introspecting live schema...\n');

    const tables = await getTablesInOrder(client);
    console.log(`Found ${tables.length} tables (FK-safe order): ${tables.join(', ')}\n`);

    let out = '';

    // ── Header ──
    out += `-- ================================================================\n`;
    out += `-- seed_data.sql — AUTO-GENERATED from live DB\n`;
    out += `-- Generated : ${new Date().toISOString()}\n`;
    out += `-- Database  : newdatainsights\n`;
    out += `-- Tables    : ${tables.join(', ')}\n`;
    out += `--\n`;
    out += `-- SAFE TO RE-RUN: Uses ON CONFLICT DO NOTHING + IF NOT EXISTS.\n`;
    out += `-- Pre-existing rows are preserved; only new rows are added.\n`;
    out += `-- ================================================================\n\n`;

    out += `-- Enable extensions\n`;
    out += `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n`;

    // ── CREATE TABLE IF NOT EXISTS ──
    out += `-- ================================================================\n`;
    out += `-- TABLE DEFINITIONS (built from live pg_catalog)\n`;
    out += `-- ================================================================\n\n`;

    for (const table of tables) {
      console.log(`  DDL → ${table}`);
      out += await buildCreateTableSQL(client, table);
      out += '\n';
    }

    // ── ALTER TABLE ADD COLUMN IF NOT EXISTS ──
    out += `-- ================================================================\n`;
    out += `-- COLUMN MIGRATIONS (safe for older schema versions)\n`;
    out += `-- ================================================================\n\n`;

    for (const table of tables) {
      const alterSQL = await buildAlterColumnsSQL(client, table);
      if (alterSQL.trim()) {
        out += `-- Ensure all columns exist: ${table}\n`;
        out += alterSQL + '\n';
      }
    }

    // ── INDEXES ──
    out += `-- ================================================================\n`;
    out += `-- INDEXES (IF NOT EXISTS)\n`;
    out += `-- ================================================================\n\n`;

    for (const table of tables) {
      const indexes = await getIndexes(client, table);
      for (const idx of indexes) {
        const unique = idx.is_unique ? 'UNIQUE ' : '';
        out += `CREATE ${unique}INDEX IF NOT EXISTS ${idx.index_name} ON ${table}(${idx.columns.join(', ')});\n`;
      }
    }
    out += '\n';

    // ── DATA ──
    out += `-- ================================================================\n`;
    out += `-- DATA ROWS (INSERT ... ON CONFLICT DO NOTHING)\n`;
    out += `-- ================================================================\n\n`;
    out += `BEGIN;\n\n`;

    for (const table of tables) {
      console.log(`  Data → ${table}`);
      out += await dumpTableData(client, table);
    }

    out += `COMMIT;\n`;

    // ── Write file ──
    const outPath = path.join(__dirname, 'src', 'config', 'seed_data.sql');
    fs.writeFileSync(outPath, out, 'utf8');

    console.log(`\n✅ seed_data.sql written to: ${outPath}`);
    console.log(`   Size: ${(out.length / 1024).toFixed(1)} KB  |  Tables: ${tables.length}`);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
