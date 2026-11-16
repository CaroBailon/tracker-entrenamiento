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
  const K = { conf: 'tracker_conf', datos: 'tracker_datos', borrador: 'tracker_borrador', cola: 'tracker_pendientes', hoy: 'tracker_hoy' };

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

  function empezar(rutinaId) {
    const actual = leer(K.borrador, null);
    if (actual && actual.rutina_id !== rutinaId && !confirm('Tenés otra sesión sin terminar. ¿Descartarla y empezar esta?')) return;
    b = actual && actual.rutina_id === rutinaId ? actual : {
      rutina_id: rutinaId, inicio: Date.now(), valores: {}, extras: {},
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
    $('sesion-inicio').textContent = 'Empezaste a las ' + horaTexto(b.inicio);

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
      return '<section class="tarjeta ejercicio">' +
        '<h2>' + esc(ej.nombre) + '</h2>' +
        '<p class="sub">' + esc(ej.grupo_muscular) + ' · objetivo ' + objetivo + '</p>' +
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

  async function guardarSesion() {
    const series = seriesParaEnviar();
    const err = $('sesion-error');
    if (!series.length) { err.textContent = 'Cargá al menos una serie (las reps o los minutos).'; return; }
    if (!b.energia || !b.esfuerzo) { err.textContent = 'Marcá tu energía y tu esfuerzo: son los datos de "cómo me siento".'; return; }
    const r = rutina(b.rutina_id);
    const duracionAuto = r.tipo === 'fuerza' ? minutosDesdeInicio() : series.reduce((s, x) => s + (x.minutos || 0), 0);
    const cuerpo = {
      accion: 'sesion',
      sesion: {
        fecha: new Date(b.inicio).toLocaleDateString('en-CA', { timeZone: ZONA }), // el día en que empezó, aunque se envíe después
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
      const h = hechoHoy();
      if (!h.rutinas.includes(b.rutina_id)) h.rutinas.push(b.rutina_id);
      if (num(b.sueno) != null) h.sueno = num(b.sueno);
      guardar(K.hoy, h);
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
    else if (t.dataset.sel) { b[t.dataset.sel] = Number(t.dataset.valor); guardar(K.borrador, b); pintarSelector('sel-' + t.dataset.sel, t.dataset.sel === 'energia' ? 5 : 10, t.dataset.sel); }
  });

  // Cada cambio en una serie se guarda en el borrador al instante
  $('sesion-ejercicios').addEventListener('input', (ev) => {
    const i = ev.target;
    if (!i.dataset.k) return;
    b.valores[i.dataset.k] = Object.assign(b.valores[i.dataset.k] || {}, { [i.dataset.campo]: i.value });
    guardar(K.borrador, b);
  });
  [['in-sueno', 'sueno'], ['in-duracion', 'duracion'], ['in-notas', 'notas']].forEach(([id, campo]) => {
    $(id).addEventListener('input', (ev) => { b[campo] = ev.target.value; guardar(K.borrador, b); });
  });

  $('btn-guardar').addEventListener('click', guardarSesion);
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
