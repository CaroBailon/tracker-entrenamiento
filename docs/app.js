/**
 * App del tracker de entrenamiento · Carolina Bailon Trujillo
 *
 * Página estática: habla con la API de Apps Script (Code.gs) y guarda todo en Google Sheets.
 * Decisiones principales:
 *   - La URL y la clave se cargan una vez y quedan solo en este celular (localStorage), no en el código.
 *   - La sesión en curso se guarda en el celular a cada cambio: si se bloquea la pantalla o se cierra
 *     el navegador, no se pierde nada.
 *   - Sin conexión, los registros quedan en una cola y se envían cuando vuelve internet.
 */
(function () {
  'use strict';

  const ZONA = 'America/Argentina/Buenos_Aires';
  const K = { conf: 'tracker_conf', datos: 'tracker_datos', borrador: 'tracker_borrador', cola: 'tracker_pendientes', hoy: 'tracker_hoy', historial: 'tracker_historial' };

  // ---------------------------------------------------------------------------
  // Almacenamiento local (con try/catch: en modo privado puede fallar)
  // ---------------------------------------------------------------------------
  const leer = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio o bloqueado */ } };
  const borrar = (k) => { try { localStorage.removeItem(k); } catch (e) { /* nada */ } };

  let conf = leer(K.conf, null);
  let datos = leer(K.datos, null);

  const $ = (id) => document.getElementById(id);
  const hoyTexto = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA }); // yyyy-mm-dd
  const horaTexto = (ms) => new Date(ms).toLocaleTimeString('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
  const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  class ErrorServidor extends Error {} // la API respondió que no (dato inválido, clave mala): no tiene sentido reintentar

  async function apiInicio(c = conf) {
    const r = await fetch(c.url + '?accion=inicio&token=' + encodeURIComponent(c.token));
    const j = await r.json();
    if (!j.ok) throw new ErrorServidor(j.error);
    return j;
  }

  // text/plain evita el "preflight" de CORS, que Apps Script no responde
  async function apiPost(cuerpo) {
    const r = await fetch(conf.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({}, cuerpo, { token: conf.token })),
    });
    const j = await r.json();
    if (!j.ok) throw new ErrorServidor(j.error);
    return j;
  }

  // Envía o, si no hay conexión, deja en la cola. Devuelve la respuesta o null si quedó pendiente.
  async function enviar(cuerpo) {
    try {
      return await apiPost(cuerpo);
    } catch (err) {
      if (err instanceof ErrorServidor) throw err;
      const cola = leer(K.cola, []);
      cola.push(cuerpo);
      guardar(K.cola, cola);
      return null;
    }
  }

  async function vaciarCola() {
    let cola = leer(K.cola, []);
    while (cola.length) {
      try {
        await apiPost(cola[0]);
      } catch (err) {
        if (!(err instanceof ErrorServidor)) return false; // sigue sin conexión: se reintenta más tarde
        aviso('Un registro pendiente fue rechazado: ' + err.message);
      }
      cola = leer(K.cola, []).slice(1);
      guardar(K.cola, cola);
    }
    return true;
  }

  async function actualizarDatos() {
    $('estado-sync').textContent = 'Actualizando…';
    try {
      await vaciarCola();
      datos = await apiInicio();
      guardar(K.datos, datos);
      $('estado-sync').textContent = 'Actualizado ' + horaTexto(Date.now());
    } catch (err) {
      $('estado-sync').textContent = err instanceof ErrorServidor ? 'Error: ' + err.message : 'Sin conexión: mostrando lo último guardado';
    }
    if (!$('pantalla-inicio').hidden) pintarInicio();
  }

  // ---------------------------------------------------------------------------
  // Navegación
  // ---------------------------------------------------------------------------
  function mostrar(id) {
    document.querySelectorAll('.pantalla').forEach((p) => { p.hidden = p.id !== id; });
    window.scrollTo(0, 0);
  }

  let timerToast;
  function aviso(texto) {
    const t = $('toast');
    t.textContent = texto;
    t.hidden = false;
    clearTimeout(timerToast);
    timerToast = setTimeout(() => { t.hidden = true; }, 3500);
  }

  // ---------------------------------------------------------------------------
  // Catálogo
  // ---------------------------------------------------------------------------
  const ejercicio = (id) => datos.ejercicios.find((e) => e.ejercicio_id === id);

  function rutinas() {
    const grupos = {};
    datos.rutinas.forEach((r) => {
      if (!grupos[r.rutina_id]) grupos[r.rutina_id] = { id: r.rutina_id, nombre: r.rutina, tipo: r.tipo, items: [] };
      grupos[r.rutina_id].items.push(r);
    });
    Object.values(grupos).forEach((g) => g.items.sort((a, b) => a.orden - b.orden));
    return Object.values(grupos);
  }
  const rutina = (id) => rutinas().find((r) => r.id === id);

  // Registro local de lo hecho hoy (para marcar ✓ en el inicio y recordar las horas de sueño)
  function hechoHoy() {
    const h = leer(K.hoy, null);
    return h && h.fecha === hoyTexto() ? h : { fecha: hoyTexto(), rutinas: [], sueno: null };
  }

  // ---------------------------------------------------------------------------
  // Pantalla de inicio
  // ---------------------------------------------------------------------------
  function pintarInicio() {
    $('fecha-hoy').textContent = new Date().toLocaleDateString('es-AR', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' });
    pintarAgua();

    const hecho = hechoHoy();
    const etiquetaTipo = { fuerza: 'Fuerza', cardio: 'Cardio', core: 'Core' };
    $('lista-rutinas').innerHTML = rutinas().map((r) => {
      const primero = r.items[0];
      const detalle = r.tipo === 'fuerza'
        ? r.items.length + ' ejercicios · ' + primero.series_objetivo + ' series'
        : primero.minutos_objetivo + ' min';
      const ok = hecho.rutinas.includes(r.id);
      return '<button class="rutina' + (ok ? ' hecha' : '') + '" data-rutina="' + r.id + '" type="button">' +
        '<span class="rutina-tipo">' + (etiquetaTipo[r.tipo] || r.tipo) + '</span>' +
        '<span class="rutina-nombre">' + esc(r.nombre) + '</span>' +
        '<span class="sub">' + detalle + (ok ? ' · ✓ hecha hoy' : '') + '</span></button>';
    }).join('');

    const cola = leer(K.cola, []);
    $('aviso-pendientes').hidden = !cola.length;
    $('aviso-pendientes').innerHTML = cola.length
      ? cola.length + (cola.length === 1 ? ' registro sin enviar.' : ' registros sin enviar.') + ' <button class="btn btn-link" id="btn-reintentar" type="button">Enviar ahora</button>'
      : '';

    const b = leer(K.borrador, null);
    $('aviso-borrador').hidden = !b;
    if (b) {
      const r = rutina(b.rutina_id);
      $('aviso-borrador').innerHTML = 'Tenés una sesión sin terminar: <b>' + esc(r ? r.nombre : b.rutina_id) + '</b>. ' +
        '<button class="btn btn-link" id="btn-continuar" type="button">Continuar</button>';
    }
  }

  function pintarAgua() {
    const c = datos.config;
    const vaso = Number(c.vaso_ml) || 250, meta = Number(c.meta_agua_ml) || 2000;
    // Si los datos guardados son de otro día, el agua de hoy arranca en 0
    const ml = datos.hoy === hoyTexto() ? Number(datos.agua_hoy_ml) || 0 : 0;
    const vasos = Math.round((ml / vaso) * 10) / 10;
    const pct = Math.min(100, Math.round((ml / meta) * 100));
    $('agua-vasos').textContent = String(vasos).replace('.', ',');
    $('agua-meta-vasos').textContent = Math.round(meta / vaso);
    $('agua-ml').textContent = ml >= meta ? '¡Meta cumplida! ' + ml + ' ml' : ml + ' de ' + meta + ' ml · te faltan ' + (meta - ml) + ' ml';
    $('agua-relleno').style.width = pct + '%';
    $('agua-barra').setAttribute('aria-valuenow', pct);
    $('btn-vaso').innerHTML = '+1 vaso <small>' + vaso + ' ml</small>';
    $('btn-botella').innerHTML = '+1 botella <small>' + (Number(c.botella_ml) || 500) + ' ml</small>';
  }

  async function sumarAgua(ml) {
    // Se suma en pantalla al instante y después se confirma con el total que devuelve la planilla
    if (datos.hoy !== hoyTexto()) { datos.hoy = hoyTexto(); datos.agua_hoy_ml = 0; }
    datos.agua_hoy_ml = (Number(datos.agua_hoy_ml) || 0) + ml;
    guardar(K.datos, datos);
    pintarAgua();
    try {
      const r = await enviar({ accion: 'agua', ml: ml });
      if (r) { datos.agua_hoy_ml = r.agua_hoy_ml; guardar(K.datos, datos); pintarAgua(); aviso('+' + ml + ' ml 💧'); }
      else { aviso('Sin conexión: el agua se envía después'); pintarInicio(); }
    } catch (err) {
      datos.agua_hoy_ml -= ml; guardar(K.datos, datos); pintarAgua();
      aviso('No se guardó: ' + err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Pantalla de sesión
  // ---------------------------------------------------------------------------
  let b = null; // borrador de la sesión en curso
  let editando = null; // ejercicio cuyo objetivo se está editando

  function empezar(rutinaId) {
    const actual = leer(K.borrador, null);
    if (actual && actual.rutina_id !== rutinaId && !confirm('Tenés otra sesión sin terminar. ¿Descartarla y empezar esta?')) return;
    b = actual && actual.rutina_id === rutinaId ? actual : {
      rutina_id: rutinaId, inicio: Date.now(), fecha: hoyTexto(), valores: {}, extras: {}, manual: {},
      energia: null, esfuerzo: null, sueno: hechoHoy().sueno, duracion: null, notas: '',
    };
    guardar(K.borrador, b);
    pintarSesion();
    mostrar('pantalla-sesion');
  }

  const clave = (ej, n, lado) => ej + '|' + n + '|' + lado;

  function ultima(ejId, lado) {
    const u = datos.ultimas || {};
    return u[ejId + (lado ? '_' + lado : '')];
  }

  function textoUltima(ej, u) {
    if (!u) return '';
    if (ej.tipo_medida === 'tiempo') return u.minutos + ' min';
    if (ej.tipo_medida === 'reps') return u.reps + ' reps';
    return u.peso_kg + ' kg × ' + u.reps;
  }

  function pintarSesion() {
    const r = rutina(b.rutina_id);
    $('sesion-titulo').textContent = r.nombre;
    if (!b.fecha) b.fecha = new Date(b.inicio).toLocaleDateString('en-CA', { timeZone: ZONA });
    $('in-fecha').value = b.fecha;
    $('in-fecha').max = hoyTexto();
    $('sesion-inicio').textContent = b.fecha === hoyTexto() ? 'Empezaste a las ' + horaTexto(b.inicio) : 'Cargando una sesión pasada';

    $('sesion-ejercicios').innerHTML = r.items.map((item) => {
      const ej = ejercicio(item.ejercicio_id);
      if (!ej) return '';
      const lados = ej.unilateral === 'SI' ? ['D', 'I'] : [''];
      const nSeries = (Number(item.series_objetivo) || 1) + (b.extras[ej.ejercicio_id] || 0);
      const objetivo = ej.tipo_medida === 'tiempo'
        ? item.minutos_objetivo + ' min'
        : item.series_objetivo + ' × ' + item.reps_objetivo + (ej.unilateral === 'SI' ? ' por lado' : '');
      const ref = lados.map((l) => {
        const t = textoUltima(ej, ultima(ej.ejercicio_id, l));
        return t ? (l ? (l === 'D' ? 'der ' : 'izq ') : '') + t : '';
      }).filter(Boolean).join(' · ');

      let filas = '';
      for (let n = 1; n <= nSeries; n++) {
        lados.forEach((l) => { filas += filaSerie(ej, item, n, l); });
      }
      const editor = editando === ej.ejercicio_id
        ? '<div class="editor-objetivo">' + (ej.tipo_medida === 'tiempo'
            ? '<label>Minutos <input id="obj-min" type="number" inputmode="numeric" min="1" max="300" value="' + item.minutos_objetivo + '"></label>'
            : '<label>Series <input id="obj-series" type="number" inputmode="numeric" min="1" max="10" value="' + item.series_objetivo + '"></label>' +
              '<label>Reps <input id="obj-reps" type="number" inputmode="numeric" min="1" max="100" value="' + item.reps_objetivo + '"></label>') +
          '<button class="btn btn-chico" type="button" data-obj-guardar="' + ej.ejercicio_id + '">Guardar</button>' +
          '<button class="btn btn-link" type="button" data-obj-cancelar="1">Cancelar</button></div>'
        : '<p class="sub">' + esc(ej.grupo_muscular) + ' · objetivo ' + objetivo +
          ' <button class="btn btn-link btn-inline" type="button" data-obj-editar="' + ej.ejercicio_id + '" aria-label="Editar objetivo de ' + esc(ej.nombre) + '">✏️ editar</button></p>';
      return '<section class="tarjeta ejercicio" data-ej="' + ej.ejercicio_id + '">' +
        '<h2>' + esc(ej.nombre) + '</h2>' + editor +
        (ref ? '<p class="ref">La vez pasada: ' + ref + '</p>' : '') +
        '<div class="series"><div class="serie serie-titulos"><span class="serie-nombre"></span>' + columnas(ej) + '</div>' + filas + '</div>' +
        (ej.tipo_medida !== 'tiempo' ? '<button class="btn btn-link" type="button" data-extra="' + ej.ejercicio_id + '">+ agregar serie</button>' : '') +
        '</section>';
    }).join('');

    pintarSelector('sel-energia', 5, 'energia');
    pintarSelector('sel-esfuerzo', 10, 'esfuerzo');
    $('in-sueno').value = b.sueno ?? '';
    $('in-duracion').value = b.duracion ?? '';
    $('in-duracion').placeholder = String(minutosDesdeInicio());
    $('in-notas').value = b.notas || '';
    $('sesion-error').textContent = '';
  }

  function filaSerie(ej, item, n, lado) {
    const k = clave(ej.ejercicio_id, n, lado);
    const v = b.valores[k] || {};
    const u = ultima(ej.ejercicio_id, lado) || {};
    const etiqueta = 'Serie ' + n + (lado ? (lado === 'D' ? ' · der' : ' · izq') : '');
    const campo = (nombre, valor, extra) =>
      '<input data-k="' + k + '" data-campo="' + nombre + '" aria-label="' + etiqueta + ', ' + nombre.replace('_kg', '').replace('_', ' ') + '" value="' + (valor ?? '') + '" ' + extra + '>';
    let inputs = '';
    if (ej.tipo_medida === 'peso_reps') {
      // El peso se completa con el de la vez pasada (casi nunca cambia); las reps quedan vacías para no registrar series no hechas
      const peso = v.peso_kg !== undefined ? v.peso_kg : (u.peso_kg ?? '');
      inputs = campo('peso_kg', peso, 'type="number" inputmode="decimal" min="0" max="200" step="0.5"') +
               campo('reps', v.reps, 'type="number" inputmode="numeric" min="0" max="200" placeholder="' + item.reps_objetivo + '"');
    } else if (ej.tipo_medida === 'reps') {
      inputs = campo('reps', v.reps, 'type="number" inputmode="numeric" min="0" max="200" placeholder="' + item.reps_objetivo + '"');
    } else {
      const min = v.minutos !== undefined ? v.minutos : item.minutos_objetivo;
      inputs = campo('minutos', min, 'type="number" inputmode="numeric" min="0" max="300"') +
        (ej.ejercicio_id === 'bici_estatica'
          ? campo('distancia_km', v.distancia_km, 'type="number" inputmode="decimal" min="0" step="0.1" placeholder="opcional"')
          : '');
    }
    return '<div class="serie"><span class="serie-nombre">' + etiqueta + '</span>' + inputs + '</div>';
  }

  function columnas(ej) {
    const c = ej.tipo_medida === 'peso_reps' ? ['kg', 'reps'] : ej.tipo_medida === 'reps' ? ['reps']
      : ej.ejercicio_id === 'bici_estatica' ? ['min', 'km'] : ['min'];
    return c.map((x) => '<span>' + x + '</span>').join('');
  }

  function pintarSelector(id, max, campo) {
    let html = '';
    for (let i = 1; i <= max; i++) {
      const activo = b[campo] === i;
      html += '<button type="button" role="radio" aria-checked="' + activo + '" class="opcion' + (activo ? ' activa' : '') +
        '" data-sel="' + campo + '" data-valor="' + i + '">' + i + '</button>';
    }
    $(id).innerHTML = html;
  }

  const minutosDesdeInicio = () => Math.max(1, Math.round((Date.now() - b.inicio) / 60000));

  // Arma las series a enviar con el formato que espera Code.gs. Solo van las que tienen datos.
  function seriesParaEnviar() {
    const r = rutina(b.rutina_id);
    const out = [];
    r.items.forEach((item) => {
      const ej = ejercicio(item.ejercicio_id);
      if (!ej) return;
      const lados = ej.unilateral === 'SI' ? ['D', 'I'] : [''];
      const nSeries = (Number(item.series_objetivo) || 1) + (b.extras[ej.ejercicio_id] || 0);
      for (let n = 1; n <= nSeries; n++) {
        lados.forEach((l) => {
          const v = Object.assign({}, b.valores[clave(ej.ejercicio_id, n, l)] || {});
          if (ej.tipo_medida === 'peso_reps' && v.peso_kg === undefined) v.peso_kg = (ultima(ej.ejercicio_id, l) || {}).peso_kg;
          if (ej.tipo_medida === 'tiempo' && v.minutos === undefined) v.minutos = item.minutos_objetivo;
          const tieneDato = ej.tipo_medida === 'tiempo' ? num(v.minutos) > 0 : num(v.reps) != null;
          if (!tieneDato) return;
          out.push({
            ejercicio_id: ej.ejercicio_id, serie_n: n, lado: l,
            reps: ej.tipo_medida === 'tiempo' ? '' : num(v.reps),
            peso_kg: ej.tipo_medida === 'peso_reps' ? num(v.peso_kg) : '',
            minutos: ej.tipo_medida === 'tiempo' ? num(v.minutos) : '',
            distancia_km: num(v.distancia_km) ?? '',
          });
        });
      }
    });
    return out;
  }

  async function guardarObjetivo(ejId) {
    const item = datos.rutinas.find((r) => r.rutina_id === b.rutina_id && r.ejercicio_id === ejId);
    const cambio = $('obj-min')
      ? { minutos_objetivo: num($('obj-min').value) }
      : { series_objetivo: num($('obj-series').value), reps_objetivo: num($('obj-reps').value) };
    const valido = Object.entries(cambio).every(([k, v]) => v != null && v >= 1 && v <= (k === 'series_objetivo' ? 10 : k === 'reps_objetivo' ? 100 : 300));
    if (!valido) { aviso('Revisá el objetivo: series de 1 a 10 y reps de 1 a 100'); return; }
    const antes = Object.assign({}, item);
    Object.assign(item, cambio);           // se ve al instante
    guardar(K.datos, datos);
    editando = null;
    pintarSesion();
    try {
      const r = await enviar(Object.assign({ accion: 'objetivo', rutina_id: b.rutina_id, ejercicio_id: ejId }, cambio));
      aviso(r ? 'Objetivo actualizado ✓' : 'Sin conexión: el objetivo se guarda después');
    } catch (e) {
      Object.assign(item, antes); guardar(K.datos, datos); pintarSesion();
      aviso('No se guardó el objetivo: ' + e.message);
    }
  }

  async function guardarSesion() {
    const series = seriesParaEnviar();
    const err = $('sesion-error');
    if (!series.length) { err.textContent = 'Cargá al menos una serie (las reps o los minutos).'; return; }
    if (!b.fecha || b.fecha > hoyTexto()) { err.textContent = 'Revisá la fecha: no puede ser futura.'; return; }
    if (!b.energia || !b.esfuerzo) { err.textContent = 'Marcá tu energía y tu esfuerzo: son los datos de "cómo me siento".'; return; }
    const r = rutina(b.rutina_id);
    const esHoy = b.fecha === hoyTexto();
    // En una sesión pasada el cronómetro no sirve: la duración queda vacía si no se carga a mano
    const duracionAuto = r.tipo !== 'fuerza' ? series.reduce((s, x) => s + (x.minutos || 0), 0) : esHoy ? minutosDesdeInicio() : '';
    const cuerpo = {
      accion: 'sesion',
      sesion: {
        fecha: b.fecha, // el día del entrenamiento, aunque se envíe después
        rutina_id: b.rutina_id,
        duracion_min: num(b.duracion) ?? duracionAuto,
        energia_1a5: b.energia,
        esfuerzo_1a10: b.esfuerzo,
        sueno_horas: num(b.sueno) ?? '',
        notas: b.notas || '',
      },
      series: series,
    };
    const boton = $('btn-guardar');
    boton.disabled = true; boton.textContent = 'Guardando…';
    try {
      const resp = await enviar(cuerpo);
      if (esHoy) {
        const h = hechoHoy();
        if (!h.rutinas.includes(b.rutina_id)) h.rutinas.push(b.rutina_id);
        if (num(b.sueno) != null) h.sueno = num(b.sueno);
        guardar(K.hoy, h);
      }
      borrar(K.borrador); b = null;
      aviso(resp ? 'Sesión guardada ✓ (' + resp.series_guardadas + ' series)' : 'Sin conexión: la sesión quedó en el celular y se envía después');
      mostrar('pantalla-inicio');
      pintarInicio();
      if (resp) actualizarDatos(); // trae las nuevas "últimas marcas"
    } catch (e) {
      err.textContent = 'La planilla no la aceptó: ' + e.message;
    } finally {
      boton.disabled = false; boton.textContent = 'Guardar sesión';
    }
  }

  // ---------------------------------------------------------------------------
  // Pantalla de historial
  // ---------------------------------------------------------------------------
  async function abrirHistorial() {
    mostrar('pantalla-historial');
    const cache = leer(K.historial, null);
    if (cache) pintarHistorial(cache.sesiones);
    $('hist-estado').textContent = 'Actualizando…';
    try {
      await vaciarCola(); // así aparece también lo que se cargó sin conexión
      const r = await fetch(conf.url + '?accion=historial&dias=90&token=' + encodeURIComponent(conf.token));
      const j = await r.json();
      if (!j.ok) throw new ErrorServidor(j.error);
      guardar(K.historial, j);
      pintarHistorial(j.sesiones);
      $('hist-estado').textContent = '';
    } catch (err) {
      $('hist-estado').textContent = err instanceof ErrorServidor ? 'Error: ' + err.message : 'Sin conexión: mostrando lo último guardado';
    }
  }

  // Correcciones: necesitan conexión (no van a la cola), porque modifican datos que ya están en la planilla
  async function corregirSesion(cuerpo, mensajeOk) {
    try {
      await apiPost(cuerpo);
      aviso(mensajeOk);
      borrar(K.hoy); // las marcas de "hecha hoy" pueden haber cambiado
      await abrirHistorial();
      actualizarDatos();              // la "vez pasada" puede cambiar
    } catch (err) {
      aviso(err instanceof ErrorServidor ? 'No se pudo: ' + err.message : 'Sin conexión: probá de nuevo cuando tengas internet');
    }
  }

  // Lunes de la semana de una fecha yyyy-mm-dd
  function lunes(f) {
    const d = new Date(f + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }

  function pintarHistorial(sesiones) {
    if (!sesiones.length) { $('hist-lista').innerHTML = '<p class="sub">Todavía no hay sesiones cargadas.</p>'; return; }
    const nombreRutina = (id) => { const r = rutina(id); return r ? r.nombre : id; };
    const fechaLarga = (f) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
    const corta = (f) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'numeric' });
    const n = (v) => String(v).replace('.', ',');

    // Agrupa por semana (de lunes a domingo)
    const semanas = [];
    sesiones.forEach((s) => {
      const l = lunes(s.fecha);
      let sem = semanas[semanas.length - 1];
      if (!sem || sem.lunes !== l) semanas.push(sem = { lunes: l, sesiones: [] });
      sem.sesiones.push(s);
    });

    $('hist-lista').innerHTML = semanas.map((sem) => {
      const dias = new Set(sem.sesiones.map((s) => s.fecha)).size;
      const fin = new Date(sem.lunes + 'T12:00:00Z'); fin.setUTCDate(fin.getUTCDate() + 6);
      const titulo = sem.lunes === lunes(hoyTexto()) ? 'Esta semana' : 'Semana del ' + corta(sem.lunes) + ' al ' + corta(fin.toISOString().slice(0, 10));
      return '<h2 class="hist-semana">' + titulo + ' <span class="sub">· ' + dias + (dias === 1 ? ' día' : ' días') + ' · ' + sem.sesiones.length + (sem.sesiones.length === 1 ? ' sesión' : ' sesiones') + '</span></h2>' +
        sem.sesiones.map((s) => {
          // Series agrupadas por ejercicio, en el orden en que se hicieron
          const porEj = [];
          s.series.forEach((x) => {
            let g = porEj.find((e) => e.id === x.ejercicio_id);
            if (!g) porEj.push(g = { id: x.ejercicio_id, series: [] });
            g.series.push(x);
          });
          const lineas = porEj.map((g) => {
            const ej = ejercicio(g.id) || { nombre: g.id, tipo_medida: 'peso_reps' };
            const texto = (lista) => {
              if (ej.tipo_medida === 'tiempo') return lista.map((x) => x.minutos + ' min' + (x.distancia_km ? ' · ' + n(x.distancia_km) + ' km' : '')).join(', ');
              if (ej.tipo_medida === 'reps') return lista.map((x) => x.reps).join(', ') + ' reps';
              // "8 kg × 10, 10, 9" (si cambia el peso entre series, se muestra cada uno)
              const pesos = new Set(lista.map((x) => x.peso_kg));
              return pesos.size === 1
                ? n(lista[0].peso_kg) + ' kg × ' + lista.map((x) => x.reps).join(', ')
                : lista.map((x) => n(x.peso_kg) + '×' + x.reps).join(', ');
            };
            const lados = ['D', 'I'].map((l) => g.series.filter((x) => x.lado === l));
            const detalle = lados[0].length || lados[1].length
              ? lados.map((lista, i) => lista.length ? (i ? 'izq ' : 'der ') + texto(lista) : '').filter(Boolean).join(' · ')
              : texto(g.series);
            return '<li><b>' + esc(ej.nombre) + '</b><br><span class="sub">' + detalle + '</span></li>';
          }).join('');
          const datosSesion = [
            s.duracion_min ? s.duracion_min + ' min' : '',
            s.energia_1a5 ? 'energía ' + s.energia_1a5 + '/5' : '',
            s.esfuerzo_1a10 ? 'esfuerzo ' + s.esfuerzo_1a10 + '/10' : '',
            s.sueno_horas ? n(s.sueno_horas) + ' h de sueño' : '',
          ].filter(Boolean).join(' · ');
          return '<details class="tarjeta hist-sesion"><summary><span class="hist-fecha">' + fechaLarga(s.fecha) + '</span>' +
            '<span class="rutina-nombre">' + esc(nombreRutina(s.rutina_id)) + '</span>' +
            '<span class="sub">' + datosSesion + '</span></summary>' +
            '<ul class="hist-series">' + lineas + '</ul>' +
            (s.notas ? '<p class="sub">📝 ' + esc(s.notas) + '</p>' : '') +
            '<div class="hist-acciones"><label>Fecha <input type="date" max="' + hoyTexto() + '" value="' + s.fecha + '" id="fecha-' + s.sesion_id + '"></label>' +
            '<button class="btn btn-chico" type="button" data-cambiar-fecha="' + s.sesion_id + '">Cambiar fecha</button>' +
            '<button class="btn btn-link btn-peligro" type="button" data-borrar-sesion="' + s.sesion_id + '">🗑 Borrar sesión</button></div>' +
            '</details>';
        }).join('');
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------------
  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  $('form-config').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const c = { url: $('cfg-url').value.trim(), token: $('cfg-token').value.trim() };
    const estado = $('cfg-estado');
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(c.url)) { estado.textContent = 'La URL tiene que empezar con https://script.google.com/ y terminar en /exec'; return; }
    estado.textContent = 'Probando conexión…';
    try {
      datos = await apiInicio(c);
      conf = c;
      guardar(K.conf, conf); guardar(K.datos, datos);
      estado.textContent = '';
      aviso('¡Conectado! ' + datos.ejercicios.length + ' ejercicios cargados');
      mostrar('pantalla-inicio'); pintarInicio();
      $('estado-sync').textContent = 'Actualizado ' + horaTexto(Date.now());
    } catch (err) {
      estado.textContent = err instanceof ErrorServidor ? 'La planilla respondió: ' + err.message : 'No se pudo conectar. Revisá la URL y que la implementación tenga acceso "Cualquier usuario".';
    }
  });

  $('cfg-volver').addEventListener('click', () => { mostrar('pantalla-inicio'); pintarInicio(); });
  $('btn-config').addEventListener('click', () => {
    $('cfg-url').value = conf ? conf.url : '';
    $('cfg-token').value = conf ? conf.token : '';
    $('cfg-volver').hidden = !datos;
    $('cfg-estado').textContent = '';
    mostrar('pantalla-config');
  });

  $('btn-vaso').addEventListener('click', () => sumarAgua(Number(datos.config.vaso_ml) || 250));
  $('btn-botella').addEventListener('click', () => sumarAgua(Number(datos.config.botella_ml) || 500));

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.rutina) empezar(t.dataset.rutina);
    else if (t.id === 'btn-continuar') { b = leer(K.borrador, null); if (b && rutina(b.rutina_id)) { pintarSesion(); mostrar('pantalla-sesion'); } }
    else if (t.id === 'btn-reintentar') actualizarDatos();
    else if (t.dataset.extra) { b.extras[t.dataset.extra] = (b.extras[t.dataset.extra] || 0) + 1; guardar(K.borrador, b); pintarSesion(); }
    else if (t.dataset.cambiarFecha) {
      const id = t.dataset.cambiarFecha, fecha = $('fecha-' + id).value;
      if (!fecha || fecha > hoyTexto()) { aviso('Elegí una fecha válida (no futura)'); return; }
      corregirSesion({ accion: 'cambiar_fecha', sesion_id: Number(id), fecha: fecha }, 'Fecha corregida ✓');
    }
    else if (t.dataset.borrarSesion) {
      if (!confirm('¿Borrar esta sesión y todas sus series? No se puede deshacer.')) return;
      corregirSesion({ accion: 'borrar_sesion', sesion_id: Number(t.dataset.borrarSesion) }, 'Sesión borrada');
    }
    else if (t.dataset.objEditar) { editando = t.dataset.objEditar; pintarSesion(); const x = $('obj-reps') || $('obj-min'); if (x) x.focus(); }
    else if (t.dataset.objCancelar) { editando = null; pintarSesion(); }
    else if (t.dataset.objGuardar) guardarObjetivo(t.dataset.objGuardar);
    else if (t.dataset.sel) { b[t.dataset.sel] = Number(t.dataset.valor); guardar(K.borrador, b); pintarSelector('sel-' + t.dataset.sel, t.dataset.sel === 'energia' ? 5 : 10, t.dataset.sel); }
  });

  // Cada cambio en una serie se guarda en el borrador al instante
  $('sesion-ejercicios').addEventListener('input', (ev) => {
    const i = ev.target;
    if (!i.dataset.k) return;
    const campo = i.dataset.campo;
    b.valores[i.dataset.k] = Object.assign(b.valores[i.dataset.k] || {}, { [campo]: i.value });
    b.manual = b.manual || {};
    b.manual[i.dataset.k + '|' + campo] = true;
    // Lo escrito se copia a las series siguientes que todavía no se tocaron a mano.
    // En un ejercicio a una pierna, lo del lado derecho se copia a los dos lados; si el izquierdo rinde distinto,
    // se corrige y desde ahí se copia solo a las series izquierdas.
    // Borrar no se copia: sirve para sacar una serie que no se hizo sin tocar las demás
    if ((campo === 'peso_kg' || campo === 'reps') && i.value !== '') {
      const lado = i.dataset.k.split('|')[2];
      const todos = Array.from(i.closest('.ejercicio').querySelectorAll('input[data-campo="' + campo + '"]'));
      todos.slice(todos.indexOf(i) + 1).forEach((otro) => {
        const k = otro.dataset.k;
        if (b.manual[k + '|' + campo]) return;
        if (lado === 'I' && k.split('|')[2] !== 'I') return;
        otro.value = i.value;
        b.valores[k] = Object.assign(b.valores[k] || {}, { [campo]: i.value });
      });
    }
    guardar(K.borrador, b);
  });
  $('in-fecha').addEventListener('change', (ev) => { b.fecha = ev.target.value; guardar(K.borrador, b); pintarSesion(); });
  [['in-sueno', 'sueno'], ['in-duracion', 'duracion'], ['in-notas', 'notas']].forEach(([id, campo]) => {
    $(id).addEventListener('input', (ev) => { b[campo] = ev.target.value; guardar(K.borrador, b); });
  });

  $('btn-guardar').addEventListener('click', guardarSesion);
  $('btn-historial').addEventListener('click', abrirHistorial);
  $('hist-volver').addEventListener('click', () => { mostrar('pantalla-inicio'); pintarInicio(); });
  $('cfg-borrar-local').addEventListener('click', () => {
    if (!confirm('¿Borrar lo guardado en este celular (sesión sin terminar, pendientes, historial y marcas de hoy)? La URL y la clave se mantienen. Lo que ya está en la planilla no se toca.')) return;
    [K.borrador, K.cola, K.hoy, K.historial].forEach(borrar);
    b = null;
    aviso('Listo: el celular quedó limpio');
    actualizarDatos().then(() => { mostrar('pantalla-inicio'); pintarInicio(); });
  });
  $('btn-salir-sesion').addEventListener('click', () => { mostrar('pantalla-inicio'); pintarInicio(); }); // el borrador queda guardado
  $('btn-descartar').addEventListener('click', () => {
    if (!confirm('¿Descartar esta sesión? Se borra lo que cargaste.')) return;
    borrar(K.borrador); b = null;
    mostrar('pantalla-inicio'); pintarInicio();
  });

  // Al volver a la app (por ejemplo, después de una alarma), se refrescan el agua y los pendientes
  document.addEventListener('visibilitychange', () => { if (!document.hidden && conf && !$('pantalla-inicio').hidden) actualizarDatos(); });
  window.addEventListener('online', () => { if (conf) actualizarDatos(); });

  // ---------------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------------
  if (!conf || !datos) {
    $('cfg-volver').hidden = true;
    mostrar('pantalla-config');
  } else {
    mostrar('pantalla-inicio');
    pintarInicio();      // primero lo guardado (abre al instante, aun sin internet)
    actualizarDatos();   // después lo refresca desde la planilla
  }
})();
