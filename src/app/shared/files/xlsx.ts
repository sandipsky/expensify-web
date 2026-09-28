import { zip } from './zip';

/**
 * A minimal Excel (.xlsx) writer for the export (DAT-05): typed cells, a bold
 * frozen header with filters, column widths. SpreadsheetML in a stored ZIP, so
 * there's no library to ship (NFR-02). Strings are inline, so no shared-strings
 * table is needed.
 */
export type XlsxCell =
  | string
  | number
  | null
  /** `YYYY-MM-DD`, stored as an Excel date and shown as 2026-09-25. */
  | { date: string }
  /** `HH:mm`, stored as a time of day. */
  | { time: string }
  /** A number shown with a fixed count of decimals and grouping, as amounts are. */
  | { value: number; decimals: number };

export interface XlsxSheet {
  /** At most 31 characters; `[]:*?/\` are dropped. */
  name: string;
  /** Column widths, in characters. */
  widths?: readonly number[];
  /** The first row is the header. */
  rows: readonly (readonly XlsxCell[])[];
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Style indexes in `cellXfs`; amount styles follow from 4, one per decimal count. */
const STYLE = { header: 1, date: 2, time: 3 } as const;
const FIRST_AMOUNT_STYLE = 4;
const DATE_FORMAT = 164;
const TIME_FORMAT = 165;
const FIRST_AMOUNT_FORMAT = 166;

export function xlsx(sheets: readonly XlsxSheet[]): Blob {
  const decimals = [
    ...new Set(
      sheets.flatMap((s) =>
        s.rows.flatMap((row) =>
          row.flatMap((cell) =>
            cell && typeof cell === 'object' && 'decimals' in cell ? [cell.decimals] : [],
          ),
        ),
      ),
    ),
  ].sort();
  const names = sheets.map((s, i) => sheetName(s.name, i));
  const encoder = new TextEncoder();
  const file = (name: string, text: string) => ({ name, data: encoder.encode(text) });

  const entries = [
    file('[Content_Types].xml', contentTypes(sheets.length)),
    file(
      '_rels/.rels',
      `${XML}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    file('xl/workbook.xml', workbook(sheets, names)),
    file('xl/_rels/workbook.xml.rels', workbookRels(sheets.length)),
    file('xl/styles.xml', styles(decimals)),
    ...sheets.map((sheet, i) =>
      file(`xl/worksheets/sheet${i + 1}.xml`, worksheet(sheet, decimals)),
    ),
  ];
  return new Blob([zip(entries)], { type: XLSX_TYPE });
}

/** Column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Days since 30 Dec 1899, Excel's day zero; whole days, so no time zone is involved. */
export function excelDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function excelTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h * 60 + m) / 1440;
}

function sheetName(name: string, index: number): string {
  return name.replace(/[[\]:*?/\\]/g, '').slice(0, 31) || `Sheet${index + 1}`;
}

function escape(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contentTypes(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return (
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    `${sheets}</Types>`
  );
}

function workbook(sheets: readonly XlsxSheet[], names: readonly string[]): string {
  const list = names
    .map((name, i) => `<sheet name="${escape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  const filters = sheets
    .map((sheet, i) => {
      const range = filterRange(sheet);
      if (!range) return '';
      const [from, to] = range.split(':').map((ref) => ref.replace(/([A-Z]+)(\d+)/, '$$$1$$$2'));
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escape(names[i].replace(/'/g, "''"))}'!${from}:${to}</definedName>`;
    })
    .join('');
  return (
    `${XML}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${list}</sheets>` +
    (filters ? `<definedNames>${filters}</definedNames>` : '') +
    '</workbook>'
  );
}

function workbookRels(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('');
  return `${XML}<Relationships xmlns="${PKG}">${sheets}<Relationship Id="rId${count + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`;
}

function amountFormat(decimals: number): string {
  return decimals > 0 ? `#,##0.${'0'.repeat(decimals)}` : '#,##0';
}

function styles(decimals: readonly number[]): string {
  const formats = [
    `<numFmt numFmtId="${DATE_FORMAT}" formatCode="yyyy-mm-dd"/>`,
    `<numFmt numFmtId="${TIME_FORMAT}" formatCode="hh:mm"/>`,
    ...decimals.map(
      (d, i) => `<numFmt numFmtId="${FIRST_AMOUNT_FORMAT + i}" formatCode="${amountFormat(d)}"/>`,
    ),
  ];
  const xf = (numFmtId: number, fontId = 0) =>
    `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="0" borderId="0" xfId="0"` +
    `${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}/>`;
  const xfs = [
    xf(0),
    xf(0, 1),
    xf(DATE_FORMAT),
    xf(TIME_FORMAT),
    ...decimals.map((_, i) => xf(FIRST_AMOUNT_FORMAT + i)),
  ];
  return (
    `${XML}<styleSheet xmlns="${NS}">` +
    `<numFmts count="${formats.length}">${formats.join('')}</numFmts>` +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  );
}

function filterRange(sheet: XlsxSheet): string | null {
  const width = Math.max(0, ...sheet.rows.map((r) => r.length));
  if (!sheet.rows.length || !width) return null;
  return `A1:${columnName(width - 1)}${sheet.rows.length}`;
}

function worksheet(sheet: XlsxSheet, decimals: readonly number[]): string {
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => cellXml(cell, `${columnName(c)}${r + 1}`, r === 0, decimals))
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';
  const range = filterRange(sheet);
  return (
    `${XML}<worksheet xmlns="${NS}" xmlns:r="${REL}">` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>` +
    (range ? `<autoFilter ref="${range}"/>` : '') +
    '</worksheet>'
  );
}

function cellXml(
  cell: XlsxCell,
  ref: string,
  header: boolean,
  decimals: readonly number[],
): string {
  if (cell === null || cell === '') return '';
  if (typeof cell === 'string') {
    const style = header ? ` s="${STYLE.header}"` : '';
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escape(cell)}</t></is></c>`;
  }
  if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
  if ('date' in cell) return `<c r="${ref}" s="${STYLE.date}"><v>${excelDate(cell.date)}</v></c>`;
  if ('time' in cell) return `<c r="${ref}" s="${STYLE.time}"><v>${excelTime(cell.time)}</v></c>`;
  const style = FIRST_AMOUNT_STYLE + decimals.indexOf(cell.decimals);
  return `<c r="${ref}" s="${style}"><v>${cell.value}</v></c>`;
}
