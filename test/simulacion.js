// Simulación mínima de los servicios de Google para probar Code.gs con Node
const fs = require('fs'); const vm = require('vm');
const hojas = {}; const props = {};
const aFecha = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? new Date(v + 'T00:00:00-03:00') : v; // Sheets convierte fechas
function crearHoja(nombre) {
  const datos = [];
  const h = {
    nombre, datos,
    getLastRow: () => datos.length,
    deleteRows: (desde, n) => datos.splice(desde - 1, n),
    appendRow: (f) => datos.push(f.map(aFecha)),
    setFrozenRows: () => {}, 
    getRange: (r, c, nr, nc) => ({
      setFontWeight: () => {},
      setValues: (vals) => { vals.forEach((f, i) => { datos[r - 1 + i] = f.map(aFecha); }); },
      getValues: () => datos.slice(r - 1, r - 1 + nr).map((f) => f.slice(c - 1, c - 1 + nc)),
    }),
    getDataRange: () => ({ getValues: () => datos.map((f) => f.slice()) }),
  };
  return h;
}
hojas['Hoja 1'] = crearHoja('Hoja 1');
const libro = {
  getSheetByName: (n) => hojas[n] || null,
  insertSheet: (n) => (hojas[n] = crearHoja(n)),
  getSheets: () => Object.values(hojas),
  deleteSheet: (h) => delete hojas[h.nombre],
};
const pad = (n) => String(n).padStart(2, '0');
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => libro },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => (props[k] = v) }) },
  Utilities: {
    getUuid: () => 'clave-de-prueba-123',
    formatDate: (d, zona, fmt) => {
      const x = new Date(d.getTime() - 3 * 3600e3); // Buenos Aires = UTC-3
      const map = { yyyy: x.getUTCFullYear(), MM: pad(x.getUTCMonth() + 1), dd: pad(x.getUTCDate()), HH: pad(x.getUTCHours()), mm: pad(x.getUTCMinutes()), ss: pad(x.getUTCSeconds()) };
      return fmt.replace("'T'", 'T').replace(/yyyy|MM|dd|HH|mm|ss/g, (k) => map[k]);
    },
  },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
  Logger: { log: (m) => console.log('  [Logger]', m) },
  console,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8'), ctx);
module.exports = { ctx, hojas, props };
