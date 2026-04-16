/**
 * dump-db.cjs
 * ─────────────────────────────────────────────────────────────────
 * Connects to the LIVE PostgreSQL database and introspects the REAL
 * schema from pg_catalog / information_schema.
 * Does NOT trust any static SQL file.
 *
 * Output: seed_data.sql — fully idempotent script that:
 *   1. Enables uuid-ossp extension
 *   2. Creates ALL tables (real columns/types/PKs/UNIQUEs/FKs) IF NOT EXISTS
 *   3. Adds any missing columns via ALTER IF NOT EXISTS (old-schema safety)
 *   4. Creates ALL indexes IF NOT EXISTS
 *   5. INSERTs every live row with ON CONFLICT DO NOTHING
 *
 * Usage:
 *   node dump-db.cjs
 *   psql -U postgres -d newdatainsights -f src/config/seed_data.sql
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const pool = new Pool({
  host:     'localhost',
  port:     5432,
  database: 'newdatainsights',
  user:     'postgres',
  password: 'Garv@0035',
});

// ─── Helpers ──────────────────────────────────────────────────────

function escapeVal(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number')  return String(val);
  if (val instanceof Date)      return `'${val.toISOString()}'`;
  if (typeof val === 'object')  return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

/** Parse a PostgreSQL array literal like {a,b,c} or a JS array */
function parsePgArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    return val
      .replace(/^\{|\}$/g, '')   // strip { }
      .split(',')
      .map(s => s.trim().replace(/^"|"$/g, '')); // strip optional quotes
  }
  return [];
}

// ─── Table ordering (FK-safe topological sort) ───────────────────

async function getTablesInOrder(client) {
  const tablesRes = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const all = tablesRes.rows.map(r => r.table_name);

  const depRes = await client.query(`
    SELECT DISTINCT
      tc.table_name  AS child,
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

  const deps = {};
  all.forEach(t => { deps[t] = []; });
  depRes.rows.forEach(({ child, parent }) => {
    if (deps[child] && all.includes(parent)) deps[child].push(parent);
  });

  const sorted = [];
  const visited = new Set();

  function visit(t) {
    if (visited.has(t)) return;
    visited.add(t);
    (deps[t] || []).forEach(visit);
    sorted.push(t);
  }
  all.forEach(visit);
  return sorted;
}

// ─── Schema introspection ─────────────────────────────────────────

async function getColumns(client, table) {
  const res = await client.query(`
    SELECT column_name, data_type, udt_name,
           character_maximum_length, numeric_precision, numeric_scale,
           is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  return res.rows;
}

function pgType(col) {
  const t = col.data_type.toUpperCase();
  if (t === 'CHARACTER VARYING') return col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'TEXT';
  if (t === 'CHARACTER')         return `CHAR(${col.character_maximum_length || 1})`;
  if (t === 'NUMERIC' || t === 'DECIMAL') {
    return (col.numeric_precision && col.numeric_scale)
      ? `NUMERIC(${col.numeric_precision},${col.numeric_scale})`
      : 'NUMERIC';
  }
  if (t === 'TIMESTAMP WITHOUT TIME ZONE') return 'TIMESTAMP';
  if (t === 'TIMESTAMP WITH TIME ZONE')    return 'TIMESTAMPTZ';
  if (t === 'USER-DEFINED') return col.udt_name.toUpperCase(); // uuid, inet, citext, jsonb …
  if (t === 'ARRAY')        return col.udt_name.replace(/^_/, '').toUpperCase() + '[]';
  return t;
}

async function getPrimaryKeys(client, table) {
  const res = await client.query(`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
  `, [table]);
  return res.rows.map(r => r.column_name);
}

async function getUniqueConstraints(client, table) {
  // Use STRING_AGG to avoid array parsing issues across pg driver versions
  const res = await client.query(`
    SELECT tc.constraint_name,
           STRING_AGG(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS columns_str
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'UNIQUE'
    GROUP BY tc.constraint_name
  `, [table]);
  return res.rows.map(r => ({ constraint_name: r.constraint_name, columns: r.columns_str.split(',') }));
}

async function getForeignKeys(client, table) {
  const res = await client.query(`
    SELECT tc.constraint_name,
           STRING_AGG(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS fk_cols,
           ccu.table_name  AS foreign_table,
           STRING_AGG(ccu.column_name, ',' ORDER BY kcu.ordinal_position) AS foreign_cols,
           rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'
    GROUP BY tc.constraint_name, ccu.table_name, rc.delete_rule
  `, [table]);
  return res.rows;
}

async function getIndexes(client, table) {
  // Use pg_get_indexdef for the full definition, skip PKs and UC-backed indexes
  const res = await client.query(`
    SELECT
      i.relname AS index_name,
      ix.indisunique AS is_unique,
      pg_get_indexdef(ix.indexrelid) AS index_def
    FROM pg_class t
    JOIN pg_index ix   ON ix.indrelid   = t.oid
    JOIN pg_class i    ON i.oid          = ix.indexrelid
    JOIN pg_namespace n ON n.oid         = t.relnamespace
    WHERE t.relname    = $1
      AND n.nspname    = 'public'
      AND NOT ix.indisprimary
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        WHERE tc.constraint_name = i.relname
          AND tc.table_schema = 'public'
          AND tc.constraint_type IN ('UNIQUE','FOREIGN KEY')
      )
    ORDER BY i.relname
  `, [table]);
  return res.rows;
}

// ─── DDL builders ─────────────────────────────────────────────────

async function buildCreateTable(client, table) {
  const columns = await getColumns(client, table);
  const pks     = await getPrimaryKeys(client, table);
  const uniques = await getUniqueConstraints(client, table);
  const fks     = await getForeignKeys(client, table);

  const lines = [];

  for (const col of columns) {
    let line = `    ${col.column_name} ${pgType(col)}`;
    if (col.is_nullable === 'NO') line += ' NOT NULL';
    if (col.column_default !== null && !col.column_default.startsWith('nextval(')) {
      line += ` DEFAULT ${col.column_default}`;
    }
    lines.push(line);
  }

  if (pks.length > 0) lines.push(`    PRIMARY KEY (${pks.join(', ')})`);

  for (const uq of uniques) {
    lines.push(`    UNIQUE (${uq.columns.join(', ')})`);
  }

  for (const fk of fks) {
    const onDelete = fk.delete_rule && fk.delete_rule !== 'NO ACTION'
      ? ` ON DELETE ${fk.delete_rule}` : '';
    lines.push(
      `    CONSTRAINT ${fk.constraint_name} FOREIGN KEY (${fk.fk_cols}) ` +
      `REFERENCES ${fk.foreign_table}(${fk.foreign_cols})${onDelete}`
    );
  }

  return `CREATE TABLE IF NOT EXISTS ${table} (\n${lines.join(',\n')}\n);\n`;
}

async function buildAlterColumns(client, table) {
  const columns = await getColumns(client, table);
  return columns.map(col => {
    const type = pgType(col);
    const def  = (col.column_default && !col.column_default.startsWith('nextval('))
      ? ` DEFAULT ${col.column_default}` : '';
    return `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col.column_name} ${type}${def};`;
  }).join('\n');
}

// ─── Data dump ────────────────────────────────────────────────────

async function dumpData(client, table) {
  const pks     = await getPrimaryKeys(client, table);
  const uniques = await getUniqueConstraints(client, table);

  const res  = await client.query(`SELECT * FROM ${table}`);
  const rows = res.rows;
  if (rows.length === 0) return `-- ${table}: (empty)\n`;

  const cols = Object.keys(rows[0]);
  let sql = `-- ${table} (${rows.length} rows)\n`;

  let conflict = '';
  if (pks.length > 0)            conflict = `(${pks.join(', ')})`;
  else if (uniques.length > 0)   conflict = `(${uniques[0].columns.join(', ')})`;

  for (const row of rows) {
    const colStr = '(' + cols.join(', ') + ')';
    const valStr = '(' + cols.map(c => escapeVal(row[c])).join(', ') + ')';
    const insert = `INSERT INTO ${table} ${colStr} VALUES ${valStr}`;
    sql += conflict
      ? `${insert} ON CONFLICT ${conflict} DO NOTHING;\n`
      : `${insert};\n`;
  }
  return sql + '\n';
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  try {
    console.log('✅ Connected to PostgreSQL. Introspecting live schema...\n');

    const tables = await getTablesInOrder(client);
    console.log(`Found ${tables.length} tables (FK-safe order):\n  ${tables.join('\n  ')}\n`);

    let out = '';

    // ── Header ──
    out += [
      '-- ================================================================',
      '-- seed_data.sql  —  AUTO-GENERATED from live PostgreSQL database',
      `-- Generated : ${new Date().toISOString()}`,
      '-- Database  : newdatainsights',
      `-- Tables    : ${tables.join(', ')}`,
      '--',
      '-- IDEMPOTENT: safe to run on databases that already have data.',
      '-- Uses IF NOT EXISTS + ON CONFLICT DO NOTHING throughout.',
      '-- ================================================================',
      '', ''
    ].join('\n');

    out += `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n`;

    // ── CREATE TABLE IF NOT EXISTS ──
    out += `-- ================================================================\n`;
    out += `-- TABLE DEFINITIONS  (built live from pg_catalog)\n`;
    out += `-- ================================================================\n\n`;
    for (const t of tables) {
      console.log(`  DDL  → ${t}`);
      out += await buildCreateTable(client, t);
      out += '\n';
    }

    // ── ALTER TABLE ADD COLUMN IF NOT EXISTS (old-schema safety) ──
    out += `-- ================================================================\n`;
    out += `-- COLUMN MIGRATIONS  (safe for older schema installs)\n`;
    out += `-- ================================================================\n\n`;
    for (const t of tables) {
      const alters = await buildAlterColumns(client, t);
      if (alters.trim()) {
        out += `-- Ensure all columns exist: ${t}\n${alters}\n\n`;
      }
    }

    // ── INDEXES ──
    out += `-- ================================================================\n`;
    out += `-- INDEXES (IF NOT EXISTS)\n`;
    out += `-- ================================================================\n\n`;
    for (const t of tables) {
      const indexes = await getIndexes(client, t);
      for (const idx of indexes) {
        // Replace "CREATE INDEX" / "CREATE UNIQUE INDEX" with IF NOT EXISTS variant
        const def = idx.index_def
          .replace(/^CREATE UNIQUE INDEX /, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
          .replace(/^CREATE INDEX /, 'CREATE INDEX IF NOT EXISTS ');
        out += `${def};\n`;
      }
    }
    out += '\n';

    // ── DATA ──
    out += `-- ================================================================\n`;
    out += `-- DATA ROWS  (INSERT … ON CONFLICT DO NOTHING)\n`;
    out += `-- ================================================================\n\n`;
    out += `BEGIN;\n\n`;
    for (const t of tables) {
      console.log(`  Data → ${t}`);
      out += await dumpData(client, t);
    }
    out += `COMMIT;\n`;

    // ── Write ──
    const outPath = path.join(__dirname, 'src', 'config', 'seed_data.sql');
    fs.writeFileSync(outPath, out, 'utf8');

    const lineCount = out.split('\n').length;
    console.log(`\n✅ Written → ${outPath}`);
    console.log(`   ${(out.length / 1024).toFixed(1)} KB  |  ${lineCount} lines  |  ${tables.length} tables`);

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
