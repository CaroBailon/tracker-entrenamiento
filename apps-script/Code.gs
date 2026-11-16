/**
 * Tracker de entrenamiento en casa · Carolina Bailon Trujillo
 *
 * Este script vive dentro de la planilla de Google Sheets y cumple dos funciones:
 *   1. setup(): crea las tablas y carga el catálogo de ejercicios y las rutinas.
 *   2. Una API web (doGet / doPost) que usa la app del celular para leer el catálogo
 *      y guardar sesiones, series y agua.
 *
 * Seguridad: toda llamada debe traer la clave guardada en Propiedades del script (TOKEN).
 * La clave no está en el código ni en la app: se carga una sola vez en el celular.
 */

// ---------------------------------------------------------------------------
// Estructura de las tablas: una pestaña por tabla, la primera fila es el encabezado.
// ---------------------------------------------------------------------------
const TABLAS = {
  Ejercicios: ['ejercicio_id', 'nombre', 'nombre_app', 'grupo_muscular', 'tipo_medida', 'unilateral', 'equipo', 'activo'],
  Rutinas: ['rutina_id', 'rutina', 'tipo', 'orden', 'ejercicio_id', 'series_objetivo', 'reps_objetivo', 'minutos_objetivo'],
  Sesiones: ['sesion_id', 'fecha', 'rutina_id', 'duracion_min', 'energia_1a5', 'esfuerzo_1a10', 'sueno_horas', 'notas', 'registrado_en'],
  Series: ['serie_id', 'sesion_id', 'fecha', 'ejercicio_id', 'serie_n', 'lado', 'reps', 'peso_kg', 'minutos', 'distancia_km', 'volumen_kg', 'rm_estimado_kg'],
  Agua: ['registro_id', 'fecha', 'hora', 'ml'],
  Config: ['clave', 'valor', 'descripcion'],
};

// tipo_medida: peso_reps (kg y repeticiones) · reps (peso corporal) · tiempo (minutos)
// unilateral: SI = se registra cada lado por separado (D / I), para ver si un lado rinde menos.
const EJERCICIOS = [
  ['hip_thrust_1p', 'Hip thrust a una pierna', 'Dumbbell single leg hip thrust', 'Glúteos', 'peso_reps', 'SI', 'Mancuerna', 'SI'],
  ['estocada_atras', 'Estocada hacia atrás', 'Reverse lunge', 'Cuádriceps', 'peso_reps', 'SI', 'Mancuernas', 'SI'],
  ['estocada_lateral', 'Estocada lateral alternada', 'Alternating lateral lunge', 'Glúteos', 'peso_reps', 'NO', 'Mancuernas', 'SI'],
  ['subida_banco', 'Subida al banco', 'Dumbbell step up', 'Cuádriceps', 'peso_reps', 'SI', 'Mancuernas y banco', 'SI'],
  ['curl_femoral_pelota', 'Curl femoral con pelota', 'Stability ball hamstring curl', 'Isquiotibiales', 'reps', 'NO', 'Pelota', 'SI'],
  ['elevacion_talones', 'Elevación de talones', 'Dumbbell calf raise', 'Pantorrillas', 'peso_reps', 'NO', 'Mancuernas', 'SI'],
  ['remo_abierto_alto', 'Remo inclinado abierto y alto', 'Bent over wide and high row', 'Espalda', 'peso_reps', 'NO', 'Mancuernas', 'SI'],
  ['elevaciones_laterales', 'Elevaciones laterales', 'Dumbbell lateral raise', 'Hombros', 'peso_reps', 'NO', 'Mancuernas', 'SI'],
  ['remo_adentro_afuera', 'Remo adentro y afuera', 'In and out dumbbell row', 'Espalda', 'peso_reps', 'NO', 'Mancuernas', 'SI'],
  ['press_hombros', 'Press de hombros sentada', 'Seated dumbbell shoulder press', 'Hombros', 'peso_reps', 'NO', 'Mancuernas y banco', 'SI'],
  ['press_pecho', 'Press de pecho', 'Dumbbell chest press', 'Pecho', 'peso_reps', 'NO', 'Mancuernas y banco', 'SI'],
  ['vuelos_posteriores', 'Vuelos posteriores', 'Bent over reverse fly', 'Hombros', 'peso_reps', 'NO', 'Mancuernas', 'SI'],
  ['good_morning', 'Good morning', 'Dumbbell good morning', 'Isquiotibiales', 'peso_reps', 'NO', 'Mancuerna', 'SI'],
  ['sentadilla_split', 'Sentadilla split', 'Dumbbell split squat', 'Cuádriceps', 'peso_reps', 'SI', 'Mancuernas', 'SI'],
  ['peso_muerto_rumano', 'Peso muerto rumano (glúteo)', 'Glute dominant RDL', 'Glúteos', 'peso_reps', 'NO', 'Mancuernas', 'SI'],
  ['sentadilla_goblet', 'Sentadilla goblet con talones elevados', 'Heel elevated goblet squat', 'Cuádriceps', 'peso_reps', 'NO', 'Mancuerna', 'SI'],
  ['estocada_caminando', 'Estocada caminando pies juntos', 'Close stance walking lunge', 'Cuádriceps', 'peso_reps', 'NO', 'Mancuernas', 'SI'],
  ['bici_estatica', 'Bici estática', 'Stationary bike', 'Cardio', 'tiempo', 'NO', 'Bici', 'SI'],
  ['core', 'Abdominales y core', 'Abs / core', 'Core', 'tiempo', 'NO', 'Ninguno', 'SI'],
];

// rutina_id, rutina, tipo, orden, ejercicio_id, series, reps, minutos
const RUTINAS = [
  ['piernas_1', 'Piernas y glúteos 1', 'fuerza', 1, 'hip_thrust_1p', 3, 9, ''],
  ['piernas_1', 'Piernas y glúteos 1', 'fuerza', 2, 'estocada_atras', 3, 9, ''],
  ['piernas_1', 'Piernas y glúteos 1', 'fuerza', 3, 'estocada_lateral', 3, 14, ''],
  ['piernas_1', 'Piernas y glúteos 1', 'fuerza', 4, 'subida_banco', 3, 11, ''],
  ['piernas_1', 'Piernas y glúteos 1', 'fuerza', 5, 'curl_femoral_pelota', 3, 13, ''],
  ['piernas_1', 'Piernas y glúteos 1', 'fuerza', 6, 'elevacion_talones', 3, 11, ''],
  ['superior', 'Tren superior', 'fuerza', 1, 'remo_abierto_alto', 3, 11, ''],
  ['superior', 'Tren superior', 'fuerza', 2, 'elevaciones_laterales', 3, 9, ''],
  ['superior', 'Tren superior', 'fuerza', 3, 'remo_adentro_afuera', 3, 11, ''],
  ['superior', 'Tren superior', 'fuerza', 4, 'press_hombros', 3, 11, ''],
  ['superior', 'Tren superior', 'fuerza', 5, 'press_pecho', 3, 11, ''],
  ['superior', 'Tren superior', 'fuerza', 6, 'vuelos_posteriores', 3, 13, ''],
  ['piernas_2', 'Piernas y glúteos 2', 'fuerza', 1, 'good_morning', 3, 13, ''],
  ['piernas_2', 'Piernas y glúteos 2', 'fuerza', 2, 'sentadilla_split', 3, 11, ''],
  ['piernas_2', 'Piernas y glúteos 2', 'fuerza', 3, 'peso_muerto_rumano', 3, 11, ''],
  ['piernas_2', 'Piernas y glúteos 2', 'fuerza', 4, 'sentadilla_goblet', 3, 9, ''],
  ['piernas_2', 'Piernas y glúteos 2', 'fuerza', 5, 'estocada_caminando', 3, 14, ''],
  ['piernas_2', 'Piernas y glúteos 2', 'fuerza', 6, 'elevacion_talones', 3, 13, ''],
  ['bici', 'Bici estática', 'cardio', 1, 'bici_estatica', 1, '', 45],
  ['core', 'Abdominales y core', 'core', 1, 'core', 1, '', 15],
];

const CONFIG = [
  ['meta_agua_ml', 2000, 'Meta diaria de agua, en mililitros'],
  ['vaso_ml', 250, 'Lo que suma el botón "+1 vaso"'],
  ['botella_ml', 500, 'Lo que suma el botón "+1 botella"'],
  ['zona_horaria', 'America/Argentina/Buenos_Aires', 'Para registrar fecha y hora locales'],
];

// ---------------------------------------------------------------------------
// 1. setup(): ejecutar UNA vez desde el editor (botón ▶ Ejecutar).
// ---------------------------------------------------------------------------
function setup() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABLAS).forEach(function (nombre) {
    let hoja = libro.getSheetByName(nombre);
    if (!hoja) hoja = libro.insertSheet(nombre);
    if (hoja.getLastRow() === 0) {
      hoja.appendRow(TABLAS[nombre]);
      hoja.setFrozenRows(1);
      hoja.getRange(1, 1, 1, TABLAS[nombre].length).setFontWeight('bold');
    }
  });
  cargarSiVacia_(libro.getSheetByName('Ejercicios'), EJERCICIOS);
  cargarSiVacia_(libro.getSheetByName('Rutinas'), RUTINAS);
  cargarSiVacia_(libro.getSheetByName('Config'), CONFIG);

  // La hoja vacía que trae toda planilla nueva ya no hace falta
  const sobrante = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (sobrante && libro.getSheets().length > 1) libro.deleteSheet(sobrante);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) {
    props.setProperty('TOKEN', Utilities.getUuid());
  }
  Logger.log('Listo. Tu clave para la app es: ' + props.getProperty('TOKEN'));
}

function cargarSiVacia_(hoja, filas) {
  if (hoja.getLastRow() > 1) return; // nunca pisa datos que ya existen
  hoja.getRange(2, 1, filas.length, filas[0].length).setValues(filas);
}

// ---------------------------------------------------------------------------
// 2. API web
// ---------------------------------------------------------------------------

/** GET ?token=...&accion=inicio → catálogo, rutinas, configuración, agua de hoy y últimas marcas. */
function doGet(e) {
  try {
    validarToken_(e.parameter.token);
    if ((e.parameter.accion || 'inicio') !== 'inicio') throw new Error('Acción desconocida');
    const zona = valorConfig_('zona_horaria');
    const hoy = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
    return json_({
      ok: true,
      hoy: hoy,
      ejercicios: leerTabla_('Ejercicios').filter(function (x) { return x.activo === 'SI'; }),
      rutinas: leerTabla_('Rutinas'),
      config: leerTabla_('Config').reduce(function (o, f) { o[f.clave] = f.valor; return o; }, {}),
      agua_hoy_ml: leerTabla_('Agua')
        .filter(function (a) { return fechaTexto_(a.fecha, zona) === hoy; })
        .reduce(function (s, a) { return s + Number(a.ml || 0); }, 0),
      ultimas: ultimasMarcas_(zona),
    });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

/**
 * POST con cuerpo JSON (enviado como text/plain para evitar el preflight de CORS):
 *   { token, accion: 'sesion', sesion: {...}, series: [...] }
 *   { token, accion: 'agua', ml }
 */
function doPost(e) {
  const candado = LockService.getScriptLock();
  try {
    const cuerpo = JSON.parse(e.postData.contents);
    validarToken_(cuerpo.token);
    candado.waitLock(10000); // dos envíos al mismo tiempo no se pisan los ids
    const zona = valorConfig_('zona_horaria');
    if (cuerpo.accion === 'agua') return json_(guardarAgua_(cuerpo, zona));
    if (cuerpo.accion === 'sesion') return json_(guardarSesion_(cuerpo, zona));
    throw new Error('Acción desconocida');
  } catch (err) {
    return json_({ ok: false, error: err.message });
  } finally {
    candado.releaseLock();
  }
}

function guardarAgua_(cuerpo, zona) {
  const ml = Number(cuerpo.ml);
  if (!(ml > 0 && ml <= 3000)) throw new Error('Cantidad de agua inválida');
  const ahora = new Date();
  const fecha = Utilities.formatDate(ahora, zona, 'yyyy-MM-dd');
  hoja_('Agua').appendRow([siguienteId_('Agua'), fecha, Utilities.formatDate(ahora, zona, 'HH:mm'), ml]);
  const total = leerTabla_('Agua')
    .filter(function (a) { return fechaTexto_(a.fecha, zona) === fecha; })
    .reduce(function (s, a) { return s + Number(a.ml || 0); }, 0);
  return { ok: true, agua_hoy_ml: total };
}

function guardarSesion_(cuerpo, zona) {
  const s = cuerpo.sesion || {};
  const series = cuerpo.series || [];
  const ejercicios = leerTabla_('Ejercicios').reduce(function (o, x) { o[x.ejercicio_id] = x; return o; }, {});
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(s.fecha || '') ? s.fecha : Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');

  // Validación: rangos razonables, para que un error de tipeo no ensucie el análisis
  rango_(s.energia_1a5, 1, 5, 'energía');
  rango_(s.esfuerzo_1a10, 1, 10, 'esfuerzo');
  rango_(s.sueno_horas, 0, 14, 'horas de sueño');
  rango_(s.duracion_min, 1, 300, 'duración');

  const filas = series.map(function (x, i) {
    const ej = ejercicios[x.ejercicio_id];
    if (!ej) throw new Error('Ejercicio desconocido: ' + x.ejercicio_id);
    rango_(x.reps, 0, 200, 'repeticiones');
    rango_(x.peso_kg, 0, 200, 'peso');
    rango_(x.minutos, 0, 300, 'minutos');
    const reps = vacioANull_(x.reps), peso = vacioANull_(x.peso_kg);
    // Cálculos automáticos (igual que en el post): volumen y 1RM estimado con la fórmula de Epley
    const volumen = reps != null && peso != null ? reps * peso : '';
    const rm = reps != null && peso != null && reps > 0 ? Math.round(peso * (1 + reps / 30) * 10) / 10 : '';
    return [null, null, fecha, x.ejercicio_id, Number(x.serie_n) || i + 1,
            ej.unilateral === 'SI' ? (x.lado === 'I' ? 'I' : 'D') : '',
            reps == null ? '' : reps, peso == null ? '' : peso,
            vacioANull_(x.minutos) == null ? '' : Number(x.minutos),
            vacioANull_(x.distancia_km) == null ? '' : Number(x.distancia_km),
            volumen, rm];
  });

  const sesionId = siguienteId_('Sesiones');
  hoja_('Sesiones').appendRow([sesionId, fecha, s.rutina_id || '', vacioANull_(s.duracion_min) ?? '',
    vacioANull_(s.energia_1a5) ?? '', vacioANull_(s.esfuerzo_1a10) ?? '', vacioANull_(s.sueno_horas) ?? '',
    String(s.notas || '').slice(0, 500), Utilities.formatDate(new Date(), zona, "yyyy-MM-dd'T'HH:mm:ss")]);

  if (filas.length) {
    let id = siguienteId_('Series');
    filas.forEach(function (f) { f[0] = id++; f[1] = sesionId; });
    const h = hoja_('Series');
    h.getRange(h.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
  }
  return { ok: true, sesion_id: sesionId, series_guardadas: filas.length };
}

// Última vez que se hizo cada ejercicio: la app la muestra como referencia ("la vez pasada: 8 kg × 11")
function ultimasMarcas_(zona) {
  const ultimas = {};
  leerTabla_('Series').forEach(function (x) {
    const clave = x.ejercicio_id + (x.lado ? '_' + x.lado : '');
    const f = fechaTexto_(x.fecha, zona);
    const actual = ultimas[clave];
    const mejorSerie = !actual || f > actual.fecha ||
      (f === actual.fecha && Number(x.rm_estimado_kg || x.reps || x.minutos || 0) > actual.marca);
    if (mejorSerie) {
      ultimas[clave] = { fecha: f, reps: x.reps, peso_kg: x.peso_kg, minutos: x.minutos,
                         marca: Number(x.rm_estimado_kg || x.reps || x.minutos || 0) };
    }
  });
  return ultimas;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function validarToken_(token) {
  const real = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!real || token !== real) throw new Error('Clave incorrecta');
}

function hoja_(nombre) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); }

function leerTabla_(nombre) {
  const valores = hoja_(nombre).getDataRange().getValues();
  const encabezado = valores.shift();
  return valores.map(function (fila) {
    return encabezado.reduce(function (o, col, i) { o[col] = fila[i]; return o; }, {});
  });
}

function siguienteId_(nombre) {
  const h = hoja_(nombre);
  const n = h.getLastRow();
  if (n < 2) return 1;
  const ids = h.getRange(2, 1, n - 1, 1).getValues().map(function (f) { return Number(f[0]) || 0; });
  return Math.max.apply(null, ids) + 1;
}

function valorConfig_(clave) {
  const fila = leerTabla_('Config').filter(function (f) { return f.clave === clave; })[0];
  return fila ? fila.valor : 'America/Argentina/Buenos_Aires';
}

// Sheets convierte '2026-11-11' en fecha: se vuelve a texto para comparar
function fechaTexto_(v, zona) {
  const esFecha = Object.prototype.toString.call(v) === '[object Date]'; // más robusto que instanceof
  return esFecha ? Utilities.formatDate(v, zona, 'yyyy-MM-dd') : String(v);
}

function vacioANull_(v) { return v === '' || v === null || v === undefined ? null : Number(v); }

function rango_(v, min, max, nombre) {
  const n = vacioANull_(v);
  if (n == null) return;
  if (isNaN(n) || n < min || n > max) throw new Error('Valor fuera de rango en ' + nombre + ': ' + v);
}

function json_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
