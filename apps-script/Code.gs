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

/**
 * GET ?token=...&accion=inicio    → catálogo, rutinas, configuración, agua de hoy y últimas marcas.
 * GET ?token=...&accion=historial → sesiones de los últimos 90 días con sus series.
 */
function doGet(e) {
  try {
    validarToken_(e.parameter.token);
    const accion = e.parameter.accion || 'inicio';
    const zona = valorConfig_('zona_horaria');
    if (accion === 'historial') return json_(historial_(zona, Number(e.parameter.dias) || 90));
    if (accion !== 'inicio') throw new Error('Acción desconocida');
    const hoy = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
    return json_({
      ok: true,
      hoy: hoy,
      ejercicios: leerTabla_('Ejercicios').filter(function (x) { return x.activo === 'SI'; }),
      rutinas: leerTabla_('Rutinas'),
      config: leerTabla_('Config').reduce(function (o, f) {
        // Sheets convierte las fechas en Date: se devuelven como yyyy-mm-dd
        o[f.clave] = Object.prototype.toString.call(f.valor) === '[object Date]' ? fechaTexto_(f.valor, zona) : f.valor;
        return o;
      }, {}),
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
 *   { token, accion: 'agua', ml, fecha? }                  → suma agua (sin fecha = hoy)
 *   { token, accion: 'deshacer_agua', fecha? }             → borra el último registro de agua de ese día
 *   { token, accion: 'objetivo', rutina_id, ejercicio_id, series_objetivo, reps_objetivo, minutos_objetivo }
 *   { token, accion: 'editar_sesion', sesion_id, sesion: {...}, series: [...] } → reemplaza una sesión ya cargada
 *   { token, accion: 'cambiar_fecha', sesion_id, fecha }   → corrige la fecha de una sesión y de sus series
 *   { token, accion: 'borrar_sesion', sesion_id }          → borra una sesión cargada por error y sus series
 *   { token, accion: 'config', clave, valor }              → guarda un ajuste (por ahora: inicio_programa)
 */
function doPost(e) {
  const candado = LockService.getScriptLock();
  try {
    const cuerpo = JSON.parse(e.postData.contents);
    validarToken_(cuerpo.token);
    candado.waitLock(10000); // dos envíos al mismo tiempo no se pisan los ids
    const zona = valorConfig_('zona_horaria');
    if (cuerpo.accion === 'agua') return json_(guardarAgua_(cuerpo, zona));
    if (cuerpo.accion === 'deshacer_agua') return json_(deshacerAgua_(cuerpo, zona));
    if (cuerpo.accion === 'sesion') return json_(guardarSesion_(cuerpo, zona));
    if (cuerpo.accion === 'editar_sesion') {
      if (cuerpo.sesion_id == null) throw new Error('Falta el número de sesión');
      return json_(guardarSesion_(cuerpo, zona, cuerpo.sesion_id));
    }
    if (cuerpo.accion === 'objetivo') return json_(guardarObjetivo_(cuerpo));
    if (cuerpo.accion === 'cambiar_fecha') return json_(cambiarFecha_(cuerpo, zona));
    if (cuerpo.accion === 'borrar_sesion') return json_(borrarSesion_(cuerpo));
    if (cuerpo.accion === 'config') return json_(guardarConfig_(cuerpo));
    throw new Error('Acción desconocida');
  } catch (err) {
    return json_({ ok: false, error: err.message });
  } finally {
    candado.releaseLock();
  }
}

// Suma agua. Sin fecha = hoy. Con fecha pasada sirve para cargar un día que se olvidó registrar.
function guardarAgua_(cuerpo, zona) {
  const ml = Number(cuerpo.ml);
  if (!(ml > 0 && ml <= 5000)) throw new Error('Cantidad de agua inválida');
  const ahora = new Date();
  const hoy = Utilities.formatDate(ahora, zona, 'yyyy-MM-dd');
  const fecha = cuerpo.fecha || hoy;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha inválida');
  if (fecha > hoy) throw new Error('La fecha no puede ser futura');
  // La hora solo se conoce si se registra en el momento; en un día pasado queda vacía
  const hora = fecha === hoy ? Utilities.formatDate(ahora, zona, 'HH:mm') : '';
  hoja_('Agua').appendRow([siguienteId_('Agua'), fecha, hora, ml]);
  return { ok: true, agua_hoy_ml: aguaDelDia_(hoy, zona), agua_dia_ml: aguaDelDia_(fecha, zona) };
}

// Borra el último registro de agua de un día (por ejemplo, un vaso tocado de más)
function deshacerAgua_(cuerpo, zona) {
  const hoy = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
  const fecha = cuerpo.fecha || hoy;
  const h = hoja_('Agua');
  const valores = h.getDataRange().getValues();
  for (let i = valores.length - 1; i >= 1; i--) {
    if (fechaTexto_(valores[i][1], zona) !== fecha) continue;
    h.deleteRows(i + 1, 1);
    return { ok: true, ml_borrados: Number(valores[i][3]), agua_hoy_ml: aguaDelDia_(hoy, zona), agua_dia_ml: aguaDelDia_(fecha, zona) };
  }
  throw new Error('No hay agua registrada ese día');
}

function aguaDelDia_(fecha, zona) {
  return leerTabla_('Agua')
    .filter(function (a) { return fechaTexto_(a.fecha, zona) === fecha; })
    .reduce(function (s, a) { return s + Number(a.ml || 0); }, 0);
}

// Guarda una sesión nueva o, si llega sesionIdExistente, reemplaza una ya cargada (editar)
function guardarSesion_(cuerpo, zona, sesionIdExistente) {
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

  const datosSesion = [fecha, s.rutina_id || '', vacioANull_(s.duracion_min) ?? '',
    vacioANull_(s.energia_1a5) ?? '', vacioANull_(s.esfuerzo_1a10) ?? '', vacioANull_(s.sueno_horas) ?? '',
    String(s.notas || '').slice(0, 500)];
  let sesionId;
  if (sesionIdExistente == null) {
    sesionId = siguienteId_('Sesiones');
    hoja_('Sesiones').appendRow([sesionId].concat(datosSesion, [Utilities.formatDate(new Date(), zona, "yyyy-MM-dd'T'HH:mm:ss")]));
  } else {
    // Editar: se pisa la fila de la sesión (se mantiene su id y cuándo se registró) y se reemplazan todas sus series
    sesionId = Number(sesionIdExistente);
    const h = hoja_('Sesiones');
    const valores = h.getDataRange().getValues();
    const i = valores.findIndex(function (f, j) { return j > 0 && Number(f[0]) === sesionId; });
    if (i < 1) throw new Error('No encontré esa sesión');
    h.getRange(i + 1, 1, 1, valores[i].length).setValues([[sesionId].concat(datosSesion, [valores[i][8]])]);
    borrarFilasDeSesion_('Series', sesionId);
  }

  if (filas.length) {
    let id = siguienteId_('Series');
    filas.forEach(function (f) { f[0] = id++; f[1] = sesionId; });
    const h = hoja_('Series');
    h.getRange(h.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
  }
  return { ok: true, sesion_id: sesionId, series_guardadas: filas.length };
}

// Historial: cada sesión con sus series, de la más reciente a la más vieja
function historial_(zona, dias) {
  const desde = Utilities.formatDate(new Date(Date.now() - dias * 864e5), zona, 'yyyy-MM-dd');
  const porSesion = {};
  leerTabla_('Series').forEach(function (x) {
    (porSesion[x.sesion_id] = porSesion[x.sesion_id] || []).push({
      ejercicio_id: x.ejercicio_id, serie_n: x.serie_n, lado: x.lado,
      reps: x.reps, peso_kg: x.peso_kg, minutos: x.minutos, distancia_km: x.distancia_km,
    });
  });
  const sesiones = leerTabla_('Sesiones')
    .map(function (s) {
      return {
        sesion_id: s.sesion_id, fecha: fechaTexto_(s.fecha, zona), rutina_id: s.rutina_id,
        duracion_min: s.duracion_min, energia_1a5: s.energia_1a5, esfuerzo_1a10: s.esfuerzo_1a10,
        sueno_horas: s.sueno_horas, notas: s.notas, series: porSesion[s.sesion_id] || [],
      };
    })
    .filter(function (s) { return s.fecha >= desde; })
    .sort(function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.sesion_id - a.sesion_id; });
  // Agua por día en el mismo período, para mostrarla junto a las sesiones
  const agua = {};
  leerTabla_('Agua').forEach(function (a) {
    const f = fechaTexto_(a.fecha, zona);
    if (f >= desde) agua[f] = (agua[f] || 0) + Number(a.ml || 0);
  });
  return { ok: true, sesiones: sesiones, agua: agua };
}

// Para empezar de cero: borra sesiones, series y agua. NO toca ejercicios, rutinas ni configuración.
// Ejecutar a mano desde el editor (elegir "borrarRegistros" y ▶ Ejecutar).
function borrarRegistros() {
  ['Sesiones', 'Series', 'Agua'].forEach(function (nombre) {
    const h = hoja_(nombre);
    if (h.getLastRow() > 1) h.deleteRows(2, h.getLastRow() - 1);
  });
  Logger.log('Listo: se borraron las sesiones, las series y el agua.');
}

// Ajustes que se pueden cambiar desde la app. inicio_programa = lunes de la semana 1 del programa,
// para numerar las semanas ("Semana 7") en la app y en Power BI.
const CONFIG_EDITABLE = { inicio_programa: 'Lunes de la semana 1 del programa (para numerar las semanas)' };

function guardarConfig_(c) {
  if (!CONFIG_EDITABLE[c.clave]) throw new Error('Ajuste no editable: ' + c.clave);
  if (c.clave === 'inicio_programa' && !/^\d{4}-\d{2}-\d{2}$/.test(c.valor || '')) throw new Error('Fecha inválida');
  const h = hoja_('Config');
  const valores = h.getDataRange().getValues();
  for (let i = 1; i < valores.length; i++) {
    if (valores[i][0] !== c.clave) continue;
    valores[i][1] = c.valor;
    h.getRange(i + 1, 1, 1, valores[i].length).setValues([valores[i]]);
    return { ok: true };
  }
  h.appendRow([c.clave, c.valor, CONFIG_EDITABLE[c.clave]]);
  return { ok: true };
}

// Corrige la fecha de una sesión (en Sesiones y en todas sus Series, para que nunca queden distintas)
function cambiarFecha_(c, zona) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha || '')) throw new Error('Fecha inválida');
  if (c.fecha > Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd')) throw new Error('La fecha no puede ser futura');
  let encontrada = false;
  ['Sesiones', 'Series'].forEach(function (nombre) {
    const h = hoja_(nombre);
    const valores = h.getDataRange().getValues();
    const iId = valores[0].indexOf('sesion_id'), iFecha = valores[0].indexOf('fecha');
    for (let i = 1; i < valores.length; i++) {
      if (Number(valores[i][iId]) !== Number(c.sesion_id)) continue;
      valores[i][iFecha] = c.fecha;
      h.getRange(i + 1, 1, 1, valores[i].length).setValues([valores[i]]);
      if (nombre === 'Sesiones') encontrada = true;
    }
  });
  if (!encontrada) throw new Error('No encontré esa sesión');
  return { ok: true };
}

function borrarFilasDeSesion_(nombre, sesionId) {
  const h = hoja_(nombre);
  const valores = h.getDataRange().getValues();
  const iId = valores[0].indexOf('sesion_id');
  let borradas = 0;
  for (let i = valores.length - 1; i >= 1; i--) { // de abajo hacia arriba, para que borrar no corra las filas
    if (Number(valores[i][iId]) !== Number(sesionId)) continue;
    h.deleteRows(i + 1, 1);
    borradas++;
  }
  return borradas;
}

// Borra una sesión y sus series. Se recorre de abajo hacia arriba para que borrar una fila no corra las demás.
function borrarSesion_(c) {
  let encontrada = false;
  ['Series', 'Sesiones'].forEach(function (nombre) {
    const h = hoja_(nombre);
    const valores = h.getDataRange().getValues();
    const iId = valores[0].indexOf('sesion_id');
    for (let i = valores.length - 1; i >= 1; i--) {
      if (Number(valores[i][iId]) !== Number(c.sesion_id)) continue;
      h.deleteRows(i + 1, 1);
      if (nombre === 'Sesiones') encontrada = true;
    }
  });
  if (!encontrada) throw new Error('No encontré esa sesión');
  return { ok: true };
}

// Cambia el objetivo de un ejercicio dentro de una rutina (por ejemplo, pasar de 3 × 9 a 3 × 10 en la semana 7)
function guardarObjetivo_(c) {
  rango_(c.series_objetivo, 1, 10, 'series objetivo');
  rango_(c.reps_objetivo, 1, 100, 'reps objetivo');
  rango_(c.minutos_objetivo, 1, 300, 'minutos objetivo');
  const h = hoja_('Rutinas');
  const valores = h.getDataRange().getValues();
  const col = {};
  valores[0].forEach(function (nombre, i) { col[nombre] = i; });
  for (let i = 1; i < valores.length; i++) {
    const fila = valores[i];
    if (fila[col.rutina_id] !== c.rutina_id || fila[col.ejercicio_id] !== c.ejercicio_id) continue;
    ['series_objetivo', 'reps_objetivo', 'minutos_objetivo'].forEach(function (k) {
      if (vacioANull_(c[k]) != null) fila[col[k]] = Number(c[k]);
    });
    h.getRange(i + 1, 1, 1, fila.length).setValues([fila]);
    return { ok: true };
  }
  throw new Error('No encontré ese ejercicio en la rutina');
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
