// BandGo · genera un archivo de Excel (.xlsx) sin librerías: un ZIP «stored» con el XML mínimo de una hoja.
// Encabezado en negrita, importes con formato #,##0.00, porcentajes con 0.0 % y fechas como texto ISO.
const enc = new TextEncoder();
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const xml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function zip(archivos) {
  const partes = [], central = []; let off = 0;
  for (const [nombre, texto] of archivos) {
    const n = enc.encode(nombre), d = enc.encode(texto), c = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, c, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    partes.push(new Uint8Array(h.buffer), n, d);
    const k = new DataView(new ArrayBuffer(46));
    k.setUint32(0, 0x02014b50, true); k.setUint16(4, 20, true); k.setUint16(6, 20, true); k.setUint16(8, 0x0800, true);
    k.setUint32(16, c, true); k.setUint32(20, d.length, true); k.setUint32(24, d.length, true); k.setUint16(28, n.length, true); k.setUint32(42, off, true);
    central.push(new Uint8Array(k.buffer), n);
    off += 30 + n.length + d.length;
  }
  const tam = central.reduce((a, b) => a + b.length, 0);
  const f = new DataView(new ArrayBuffer(22));
  f.setUint32(0, 0x06054b50, true); f.setUint16(8, archivos.length, true); f.setUint16(10, archivos.length, true); f.setUint32(12, tam, true); f.setUint32(16, off, true);
  const todo = [...partes, ...central, new Uint8Array(f.buffer)], out = new Uint8Array(todo.reduce((a, b) => a + b.length, 0));
  let p = 0; for (const b of todo) { out.set(b, p); p += b.length; }
  return out;
}
const col = (i) => { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

// hojas: [{ nombre, titulo, subtitulo, columnas: [{ t, tipo }], filas: [[valor…]] }]; tipo: texto · dinero · num · pct
export function crearXlsx(hojas) {
  const sheets = hojas.map((h) => {
    const filas = [];
    let r = 1;
    const fila = (celdas) => { filas.push(`<row r="${r}">${celdas.map((c, i) => c).join('')}</row>`); r++; };
    const txt = (i, v, s = 0) => `<c r="${col(i)}${r}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    const num = (i, v, s) => `<c r="${col(i)}${r}" s="${s}"><v>${Number(v)}</v></c>`;
    if (h.titulo) fila([txt(0, h.titulo, 3)]);
    if (h.subtitulo) fila([txt(0, h.subtitulo)]);
    if (h.titulo || h.subtitulo) fila([]);
    fila(h.columnas.map((c, i) => txt(i, c.t, 1)));
    for (const f of h.filas) fila(f.map((v, i) => {
      if (v == null || v === '') return '';
      const t = h.columnas[i]?.tipo;
      if (typeof v === 'number' && Number.isFinite(v)) return num(i, v, t === 'dinero' ? 2 : t === 'pct' ? 4 : t === 'total' ? 5 : 0);
      return txt(i, v, 0);
    }).filter(Boolean));
    const anchos = h.columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(48, Math.max(10, String(c.t).length + 4, ...h.filas.slice(0, 200).map((f) => String(f[i] ?? '').length + 2)))}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${anchos}</cols><sheetData>${filas.join('')}</sheetData></worksheet>`;
  });
  const nombre = (s, i) => xml(String(s || 'Hoja ' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const archivos = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${nombre(h.nombre, i)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDE9FE"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="6"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf fontId="2" applyFont="1"/><xf numFmtId="165" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>`],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, s]),
  ];
  return zip(archivos);
}
