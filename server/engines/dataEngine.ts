import * as yaml from 'js-yaml';
import * as toml from 'smol-toml';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import ini from 'ini';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export function parseStructuredData(input: string, sourceExt: string): unknown {
  const ext = sourceExt.toLowerCase();
  const trimmed = input.replace(/^\uFEFF/, '').trim();

  switch (ext) {
    case 'json':
      return JSON.parse(trimmed);
    case 'ndjson':
      return trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    case 'yaml':
    case 'yml':
      return yaml.load(trimmed);
    case 'toml':
      return toml.parse(trimmed);
    case 'xml': {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
      return parser.parse(trimmed);
    }
    case 'ini':
    case 'properties':
      return ini.parse(trimmed);
    case 'csv':
    case 'tsv': {
      const parsed = Papa.parse<Record<string, string>>(trimmed, {
        header: true,
        skipEmptyLines: true,
        delimiter: ext === 'tsv' ? '\t' : undefined,
        dynamicTyping: true,
      });
      return parsed.data;
    }
    case 'sql': {
      // Parse simple INSERT INTO table (cols) VALUES (...);
      const rows: Record<string, string | number | boolean | null>[] = [];
      const insertRegex = /INSERT\s+INTO\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)\s*VALUES\s*\(([^;]+)\)/gi;
      let match: RegExpExecArray | null;
      while ((match = insertRegex.exec(trimmed)) !== null) {
        const cols = match[2].split(',').map((c) => c.trim().replace(/^[`"']|[`"']$/g, ''));
        const vals = match[3].split(',').map((v) => {
          const tv = v.trim();
          if (tv.toUpperCase() === 'NULL') return null;
          if (tv.toUpperCase() === 'TRUE') return true;
          if (tv.toUpperCase() === 'FALSE') return false;
          if (/^-?\d+(\.\d+)?$/.test(tv)) return Number(tv);
          return tv.replace(/^['"]|['"]$/g, '').replace(/''/g, "'");
        });
        const row: Record<string, string | number | boolean | null> = {};
        cols.forEach((col, i) => {
          row[col] = vals[i] ?? null;
        });
        rows.push(row);
      }
      if (rows.length === 0) {
        throw new Error('Could not parse SQL INSERT statements into tabular records.');
      }
      return rows;
    }
    default:
      throw new Error(`Unsupported structured data input format: ${ext}`);
  }
}

function ensureArrayOfObjects(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map((item) =>
      item && typeof item === 'object' ? (item as Record<string, unknown>) : { value: item }
    );
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const firstArrayKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
    if (firstArrayKey) {
      return ensureArrayOfObjects(obj[firstArrayKey]);
    }
    return [obj];
  }
  return [{ value: data }];
}

function sqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return `'${str.replace(/'/g, "''")}'`;
}

export function serializeStructuredData(
  data: unknown,
  targetExt: string,
  options: { pretty?: boolean; minify?: boolean; tableName?: string } = {}
): Buffer | string {
  const ext = targetExt.toLowerCase();
  const pretty = options.pretty !== false && !options.minify;

  switch (ext) {
    case 'json':
      return pretty ? JSON.stringify(data, null, 2) + '\n' : JSON.stringify(data);

    case 'ndjson': {
      const rows = ensureArrayOfObjects(data);
      return rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
    }

    case 'yaml':
    case 'yml':
      return yaml.dump(data, { indent: 2, lineWidth: 120 });

    case 'toml': {
      const obj = Array.isArray(data)
        ? { records: data }
        : data && typeof data === 'object'
        ? (data as Record<string, unknown>)
        : { value: data };
      return toml.stringify(obj as Record<string, toml.TomlPrimitive>);
    }

    case 'xml': {
      const builder = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        format: pretty,
        indentBy: '  ',
      });
      const wrapped =
        data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 1
          ? data
          : { root: Array.isArray(data) ? { item: data } : data };
      return `<?xml version="1.0" encoding="UTF-8"?>\n` + builder.build(wrapped);
    }

    case 'csv':
    case 'tsv': {
      const rows = ensureArrayOfObjects(data);
      const flat = rows.map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          out[k] = v && typeof v === 'object' ? JSON.stringify(v) : v;
        }
        return out;
      });
      return Papa.unparse(flat, { delimiter: ext === 'tsv' ? '\t' : ',' }) + '\n';
    }

    case 'ini':
    case 'properties': {
      const obj =
        data && typeof data === 'object' && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : { items: data };
      if (ext === 'properties') {
        const flatten = (o: Record<string, unknown>, prefix = ''): string[] => {
          const lines: string[] = [];
          for (const [k, v] of Object.entries(o)) {
            const key = prefix ? `${prefix}.${k}` : k;
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              lines.push(...flatten(v as Record<string, unknown>, key));
            } else {
              lines.push(`${key}=${Array.isArray(v) ? JSON.stringify(v) : String(v ?? '')}`);
            }
          }
          return lines;
        };
        return flatten(obj).join('\n') + '\n';
      }
      return ini.stringify(obj);
    }

    case 'sql': {
      const rows = ensureArrayOfObjects(data);
      const table = (options.tableName || 'converted_records').replace(/[^a-zA-Z0-9_]/g, '_');
      if (rows.length === 0) return `-- Empty dataset for ${table}\n`;
      const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      return (
        rows
          .map((row) => {
            const colList = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
            const valList = cols.map((c) => sqlLiteral(row[c])).join(', ');
            return `INSERT INTO "${table}" (${colList}) VALUES (${valList});`;
          })
          .join('\n') + '\n'
      );
    }

    case 'xlsx': {
      const rows = ensureArrayOfObjects(data);
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    default:
      throw new Error(`Unsupported structured data target format: ${ext}`);
  }
}

export function convertDataContent(
  input: string,
  sourceExt: string,
  targetExt: string,
  options: { pretty?: boolean; minify?: boolean; tableName?: string } = {}
): { output: Buffer | string; recordCount: number } {
  const parsed = parseStructuredData(input, sourceExt);
  const recordCount = Array.isArray(parsed)
    ? parsed.length
    : parsed && typeof parsed === 'object'
    ? Object.keys(parsed as object).length
    : 1;
  const output = serializeStructuredData(parsed, targetExt, options);
  return { output, recordCount };
}
