// Genera un archivo de Excel (.xlsx) de una sola hoja, sin dependencias externas.
//
// Un .xlsx es un ZIP con unos pocos XML (formato Office Open XML). Aquí se arma ese ZIP sin
// compresión (método STORE), que Excel, LibreOffice y Google Sheets abren sin problema. Se evita así
// agregar una librería grande al backend solo para exportar listados.
//
// Seguridad: todas las celdas se escriben como texto en línea (inlineStr) o como número; nunca como
// fórmula. Un valor que empiece con "=" queda como texto y no se ejecuta al abrir el archivo.

// CRC-32 (el que exige el formato ZIP).
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = TABLA_CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fecha y hora en formato MS-DOS (las que guarda cada entrada del ZIP).
function fechaDos(d) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, fecha };
}

/** ZIP sin compresión. archivos: [{ nombre, contenido: Buffer }]. */
function zip(archivos, ahora = new Date()) {
  const { hora, fecha } = fechaDos(ahora);
  const locales = [];
  const centrales = [];
  let desplazamiento = 0;

  for (const { nombre, contenido } of archivos) {
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const crc = crc32(contenido);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(0, 8); // STORE
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(fecha, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(contenido.length, 18);
    local.writeUInt32LE(contenido.length, 22);
    local.writeUInt16LE(nombreBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locales.push(local, nombreBuf, contenido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(fecha, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(contenido.length, 20);
    central.writeUInt32LE(contenido.length, 24);
    central.writeUInt16LE(nombreBuf.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    centrales.push(central, nombreBuf);

    desplazamiento += local.length + nombreBuf.length + contenido.length;
  }

  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

// Caracteres de control que XML 1.0 no admite: se quitan.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function escaparXml(valor) {
  return String(valor)
    .replace(CONTROL, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columna(indice) {
  let n = indice + 1;
  let letras = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    letras = String.fromCharCode(65 + r) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

// estilo 1 = negrita (encabezados y título).
function celda(valor, ref, estilo) {
  const s = estilo ? ` s="${estilo}"` : '';
  if (valor === null || valor === undefined || valor === '') return '';
  if (typeof valor === 'number' && Number.isFinite(valor)) return `<c r="${ref}"${s}><v>${valor}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${escaparXml(valor).slice(0, 32000)}</t></is></c>`;
}

/**
 * Libro de una hoja.
 * @param {{ hoja: string, filas: Array<Array<string|number|null>>, negritas?: number[], anchos?: number[] }} d
 *   negritas: índices (desde 0) de las filas en negrita. anchos: ancho de cada columna (caracteres).
 * @returns {Buffer}
 */
function libroXlsx({ hoja, filas, negritas = [], anchos = [] }) {
  const nombreHoja = escaparXml(String(hoja || 'Hoja1').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const enNegrita = new Set(negritas);
  const cols = anchos.length
    ? `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Number(w) || 12}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const datos = filas
    .map((fila, i) => `<row r="${i + 1}">${fila.map((v, j) => celda(v, `${columna(j)}${i + 1}`, enNegrita.has(i) ? 1 : 0)).join('')}</row>`)
    .join('');

  const xml = (s) => Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`, 'utf8');
  return zip([
    {
      nombre: '[Content_Types].xml',
      contenido: xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '</Types>')
    },
    {
      nombre: '_rels/.rels',
      contenido: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>')
    },
    {
      nombre: 'xl/workbook.xml',
      contenido: xml('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + `<sheets><sheet name="${nombreHoja}" sheetId="1" r:id="rId1"/></sheets></workbook>`)
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        + '</Relationships>')
    },
    {
      nombre: 'xl/styles.xml',
      contenido: xml('<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        + '</styleSheet>')
    },
    {
      nombre: 'xl/worksheets/sheet1.xml',
      contenido: xml(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${datos}</sheetData></worksheet>`)
    }
  ]);
}

module.exports = { libroXlsx, crc32, zip };
