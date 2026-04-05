import type { InventoryCategory } from '@/types';

export type BulkImportDraft = {
  name: string;
  category: InventoryCategory;
  description: string;
  stock_quantity: number;
  min_stock_level: number;
  cost_price: number;
  selling_price: number;
  supplier: string;
  expiry_date?: string | null;
  _sourceRow: number;
};

const CATEGORY_SET = new Set<InventoryCategory>(['medicine', 'food', 'supplement', 'equipment', 'other']);

function normalizeCategory(v: string | undefined, fallback: InventoryCategory): InventoryCategory {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (CATEGORY_SET.has(s as InventoryCategory)) return s as InventoryCategory;
  return fallback;
}

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Known spreadsheet headers → field */
const HEADER_ALIASES: Record<string, keyof Omit<BulkImportDraft, '_sourceRow'>> = {
  name: 'name',
  item: 'name',
  product: 'name',
  'item name': 'name',
  'product name': 'name',
  description: 'description',
  desc: 'description',
  notes: 'description',
  category: 'category',
  type: 'category',
  stock: 'stock_quantity',
  quantity: 'stock_quantity',
  qty: 'stock_quantity',
  'stock quantity': 'stock_quantity',
  'stock qty': 'stock_quantity',
  min: 'min_stock_level',
  'min stock': 'min_stock_level',
  reorder: 'min_stock_level',
  minimum: 'min_stock_level',
  'min stock level': 'min_stock_level',
  'min qty': 'min_stock_level',
  cost: 'cost_price',
  'cost price': 'cost_price',
  buy: 'cost_price',
  'buy price': 'cost_price',
  selling: 'selling_price',
  'selling price': 'selling_price',
  retail: 'selling_price',
  sell: 'selling_price',
  price: 'selling_price',
  mrp: 'selling_price',
  supplier: 'supplier',
  vendor: 'supplier',
  expiry: 'expiry_date',
  'expiry date': 'expiry_date',
};

export function mapHeaderToField(h: string): keyof Omit<BulkImportDraft, '_sourceRow'> | null {
  const n = normHeader(h);
  return HEADER_ALIASES[n] ?? null;
}

function isLikelyHeaderRow(cells: string[]): boolean {
  const fields = new Set(
    cells.map((c) => mapHeaderToField(String(c))).filter(Boolean) as string[]
  );
  return fields.size >= 2;
}

function parseNumber(v: unknown, defaultVal: number): number {
  if (v == null || v === '') return defaultVal;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : defaultVal;
}

export function parseCsvLine(line: string, delimiter: ',' | '\t'): string[] {
  if (delimiter === '\t') return line.split('\t').map((s) => s.trim());

  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && ch === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Build a grid from pasted text (tabs from Excel or commas). */
export function parseTextToGrid(text: string): string[][] {
  const lines = splitLines(text);
  if (lines.length === 0) return [];
  const useTab = lines.some((l) => l.includes('\t'));
  const delim: ',' | '\t' = useTab ? '\t' : ',';
  return lines.map((line) => parseCsvLine(line, delim));
}

function parseRowWithHeaders(
  headers: string[],
  cells: string[],
  defaultCategory: InventoryCategory,
  rowIndex: number
): BulkImportDraft | null {
  const vals: Partial<Record<keyof Omit<BulkImportDraft, '_sourceRow'>, string>> = {};
  for (let i = 0; i < headers.length; i++) {
    const field = mapHeaderToField(String(headers[i]));
    if (!field) continue;
    const raw = cells[i] != null ? String(cells[i]).trim() : '';
    if (raw !== '') vals[field] = raw;
  }
  const name = vals.name?.trim();
  if (!name) return null;

  return {
    name,
    category: normalizeCategory(vals.category, defaultCategory),
    description: vals.description ?? '',
    stock_quantity: parseNumber(vals.stock_quantity, 0),
    min_stock_level: parseNumber(vals.min_stock_level, 10),
    cost_price: parseNumber(vals.cost_price, 0),
    selling_price: parseNumber(vals.selling_price, 0),
    supplier: vals.supplier ?? '',
    expiry_date: vals.expiry_date ? String(vals.expiry_date) : null,
    _sourceRow: rowIndex,
  };
}

function parseRowPositionBased(
  cells: string[],
  defaultCategory: InventoryCategory,
  rowIndex: number
): BulkImportDraft | null {
  const c = cells.map((x) => String(x ?? '').trim());
  while (c.length > 0 && c[c.length - 1] === '') c.pop();
  if (c.length === 0) return null;
  const name = c[0];
  if (!name) return null;

  const base = {
    name,
    category: defaultCategory,
    description: '',
    supplier: '',
    expiry_date: null as string | null,
    _sourceRow: rowIndex,
  };

  if (c.length === 1) {
    return {
      ...base,
      stock_quantity: 0,
      min_stock_level: 10,
      cost_price: 0,
      selling_price: 0,
    };
  }
  if (c.length === 2) {
    return {
      ...base,
      stock_quantity: parseNumber(c[1], 0),
      min_stock_level: 10,
      cost_price: 0,
      selling_price: 0,
    };
  }
  if (c.length === 3) {
    return {
      ...base,
      stock_quantity: parseNumber(c[1], 0),
      min_stock_level: 10,
      cost_price: 0,
      selling_price: parseNumber(c[2], 0),
    };
  }
  return {
    ...base,
    stock_quantity: parseNumber(c[1], 0),
    min_stock_level: c[4] != null && c[4] !== '' ? parseNumber(c[4], 10) : 10,
    cost_price: parseNumber(c[2], 0),
    selling_price: parseNumber(c[3], 0),
    supplier: c[5] ?? '',
    description: c[6] ?? '',
  };
}

export function parseImportedGrid(
  grid: string[][],
  defaultCategory: InventoryCategory
): { items: BulkImportDraft[]; skipped: { row: number; reason: string }[] } {
  const items: BulkImportDraft[] = [];
  const skipped: { row: number; reason: string }[] = [];

  if (grid.length === 0) return { items, skipped };

  const firstCells = grid[0].map((x) => String(x));
  let headers: string[] | null = null;
  let start = 0;
  if (grid.length > 1 && isLikelyHeaderRow(firstCells)) {
    headers = firstCells;
    start = 1;
  }

  for (let r = start; r < grid.length; r++) {
    const rowNum = r + 1;
    const cells = grid[r].map((x) => String(x ?? ''));
    if (!cells.some((x) => x.trim())) continue;

    let draft: BulkImportDraft | null = null;
    if (headers) {
      draft = parseRowWithHeaders(headers, cells, defaultCategory, rowNum);
    } else {
      draft = parseRowPositionBased(cells, defaultCategory, rowNum);
    }

    if (draft) items.push(draft);
    else skipped.push({ row: rowNum, reason: 'Missing item name' });
  }

  return { items, skipped };
}

export function parsePastedInventoryText(
  text: string,
  defaultCategory: InventoryCategory
): { items: BulkImportDraft[]; skipped: { row: number; reason: string }[] } {
  const grid = parseTextToGrid(text);
  return parseImportedGrid(grid, defaultCategory);
}

export const INVENTORY_IMPORT_TEMPLATE_CSV = `name,category,stock_quantity,min_stock_level,cost_price,selling_price,supplier,description
Example Tablet,medicine,100,20,50,75,ACME Co.,Optional notes
Dog Food 5kg,food,30,5,500,750,,`;

/** First sheet of an .xlsx / .xls file → grid of strings */
export async function parseXlsxFileToGrid(file: File): Promise<string[][]> {
  const { read, utils } = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const data = utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as (string | number)[][];
  return data
    .map((row) => (row ?? []).map((c) => (c == null ? '' : String(c).trim())))
    .filter((row) => row.some((c) => c !== ''));
}
