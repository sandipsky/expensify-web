import { XLSX_TYPE, columnName, excelDate, xlsx } from './xlsx';
import { crc32, zip } from './zip';

/** The stored entries of a ZIP made by `zip()`, read back from its local headers. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = decoder.decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const start = at + 30 + nameLength;
    files.set(name, decoder.decode(bytes.subarray(start, start + size)));
    at = start + size;
  }
  return files;
}

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('stores entries with a central directory that points back at them', () => {
    const bytes = zip([
      { name: 'a.txt', data: new TextEncoder().encode('hello') },
      { name: 'dir/b.txt', data: new TextEncoder().encode('world!') },
    ]);
    expect([...unzip(bytes)]).toEqual([
      ['a.txt', 'hello'],
      ['dir/b.txt', 'world!'],
    ]);
    const view = new DataView(bytes.buffer);
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralOffset = view.getUint32(end + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
  });
});

describe('xlsx (DAT-05)', () => {
  it('names columns and counts dates as Excel does', () => {
    expect([0, 25, 26, 51, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AZ', 'ZZ', 'AAA']);
    expect(excelDate('1900-03-01')).toBe(61);
    expect(excelDate('2026-09-25')).toBe(46290);
  });

  it('writes a workbook with typed cells, a bold frozen header and filters', async () => {
    const blob = xlsx([
      {
        name: 'Transactions',
        widths: [12, 30],
        rows: [
          ['Date', 'Payee', 'Time', 'Amount'],
          [
            { date: '2026-09-25' },
            'Tom & Jerry <Cafe>',
            { time: '13:30' },
            { value: 12.5, decimals: 2 },
          ],
          [{ date: '2026-09-26' }, '=cmd', null, 7],
        ],
      },
    ]);
    expect(blob.type).toBe(XLSX_TYPE);
    const files = unzip(new Uint8Array(await blob.arrayBuffer()));
    expect([...files.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]);

    const sheet = files.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain(
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
    );
    expect(sheet).toContain('<autoFilter ref="A1:D3"/>');
    expect(sheet).toContain('<col min="2" max="2" width="30" customWidth="1"/>');
    expect(sheet).toContain(
      '<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Date</t></is></c>',
    );
    expect(sheet).toContain('<c r="A2" s="2"><v>46290</v></c>');
    expect(sheet).toContain('Tom &amp; Jerry &lt;Cafe&gt;');
    expect(sheet).toContain('<c r="C2" s="3"><v>0.5625</v></c>');
    expect(sheet).toContain('<c r="D2" s="4"><v>12.5</v></c>');
    // Text is never a formula in a workbook, so it stays as typed.
    expect(sheet).toContain('<t xml:space="preserve">=cmd</t>');
    expect(sheet).not.toContain('r="C3"');

    expect(files.get('xl/styles.xml')).toContain('formatCode="#,##0.00"');
    expect(files.get('xl/workbook.xml')).toContain(
      '<sheet name="Transactions" sheetId="1" r:id="rId1"/>',
    );
    expect(files.get('xl/workbook.xml')).toContain("'Transactions'!$A$1:$D$3");
  });
});
