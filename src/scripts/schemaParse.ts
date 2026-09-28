/**
 * Pure parser for database/init/01-schema.sql: which tables and columns the code expects.
 * No DB imports, so it can be unit-tested on its own (test/schema/schemaParse.test.ts).
 * checkSchema.ts compares this against a live database's information_schema.
 */

// Lines inside CREATE TABLE ( ... ) that declare constraints rather than columns.
const CONSTRAINT_PREFIX = /^(PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CONSTRAINT|CHECK|EXCLUDE)\b/i;
// Accepts plain and pg_dump-style quoted names: users, public.users, "public"."users".
const CREATE_TABLE = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?(\w+)"?\s*\(/i;

export type ExpectedSchema = Map<string, Set<string>>;

export function parseExpectedColumns(sql: string): ExpectedSchema {
  const tables: ExpectedSchema = new Map();
  let current: Set<string> | null = null;

  for (const raw of sql.split(/\r?\n/)) {
    const line = raw.replace(/--.*$/, '').trim();
    if (!line) continue;

    if (!current) {
      const m = CREATE_TABLE.exec(line);
      if (m) {
        current = new Set();
        tables.set(m[1].toLowerCase(), current);
      }
      continue;
    }

    // End of the CREATE TABLE block
    if (line.startsWith(')')) {
      current = null;
      continue;
    }
    if (CONSTRAINT_PREFIX.test(line)) continue;

    const col = /^"?(\w+)"?\s/.exec(line);
    if (col) current.add(col[1].toLowerCase());
  }

  return tables;
}

export interface SchemaDiff {
  missingTables: string[];
  /** "table.column" for columns the schema file declares but the database lacks. */
  missingColumns: string[];
  /** "table.column" that exist in the database but not in the schema file (warning only). */
  extraColumns: string[];
}

export function diffSchema(expected: ExpectedSchema, actual: ExpectedSchema): SchemaDiff {
  const diff: SchemaDiff = { missingTables: [], missingColumns: [], extraColumns: [] };
  for (const [table, cols] of expected) {
    const have = actual.get(table);
    if (!have) {
      diff.missingTables.push(table);
      continue;
    }
    for (const c of cols) if (!have.has(c)) diff.missingColumns.push(`${table}.${c}`);
    for (const c of have) if (!cols.has(c)) diff.extraColumns.push(`${table}.${c}`);
  }
  return diff;
}
