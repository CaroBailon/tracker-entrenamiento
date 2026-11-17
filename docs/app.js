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
      try { await cargarHistorial(); } catch (e) { /* la semana se ve con lo guardado */ }
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

  // Cada tipo de rutina con su ícono, nombre y clase de color (se repite en todas las pantallas)
  const TIPOS = { fuerza: { icono: '🏋️', nombre: 'Fuerza' }, cardio: { icono: '🚴', nombre: 'Cardio' }, core: { icono: '🧘', nombre: 'Core' } };
  const tipoDe = (rutinaId) => { const r = rutina(rutinaId); return r ? r.tipo : 'fuerza'; };

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
    const nSem = semanaPrograma(hoyTexto());
    $('semana-hoy').textContent = nSem ? 'Semana ' + nSem : '';
    pintarSemana();
    pintarAgua();

    // Rutinas: hecha hoy (registro local o historial) y cuándo fue la última vez
    const hist = leer(K.historial, null);
    const sesiones = hist ? hist.sesiones : [];
    const hecho = hechoHoy();
    $('lista-rutinas').innerHTML = rutinas().map((r) => {
      const primero = r.items[0];
      const detalle = r.tipo === 'fuerza' ? r.items.length + ' ejercicios · ' + primero.series_objetivo + ' series' : primero.minutos_objetivo + ' min';
      const ok = hecho.rutinas.includes(r.id) || sesiones.some((x) => x.rutina_id === r.id && x.fecha === hoyTexto());
      const ultima = sesiones.filter((x) => x.rutina_id === r.id).map((x) => x.fecha).sort().pop();
      const estado = ok ? '✓ Hecha hoy' : ultima ? 'Última: ' + diaSemanaCorto(ultima) : 'Sin registros';
      const t = TIPOS[r.tipo] || TIPOS.fuerza;
      return '<button class="rutina tipo-' + r.tipo + (ok ? ' hecha' : '') + '" data-rutina="' + r.id + '" type="button">' +
        '<span class="rutina-icono" aria-hidden="true">' + t.icono + '</span>' +
        '<span class="rutina-nombre">' + esc(r.nombre) + '</span>' +
        '<span class="sub">' + detalle + '</span>' +
        '<span class="rutina-estado">' + estado + '</span></button>';
    }).join('');

    const cola = leer(K.cola, []);
    $('aviso-pendientes').hidden = !cola.length;
    $('aviso-pendientes').innerHTML = cola.length
      ? cola.length + (cola.length === 1 ? ' registro sin enviar.' : ' registros sin enviar.') + ' <button class="btn btn-link" id="btn-reintentar" type="button">Enviar ahora</button>'
      : '';

    const bb = leer(K.borrador, null);
    $('aviso-borrador').hidden = !bb;
    if (bb) {
      const r = rutina(bb.rutina_id);
      $('aviso-borrador').innerHTML = (bb.editar ? 'Estás editando la sesión <b>' : 'Tenés una sesión sin terminar: <b>') + esc(r ? r.nombre : bb.rutina_id) + '</b>' +
        (bb.editar ? ' del ' + fechaCorta(bb.fecha) : '') + '. <button class="btn btn-link" id="btn-continuar" type="button">Continuar</button>';
    }
  }

  // "lun 16/11"
  const diaSemanaCorto = (f) => ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(f + 'T12:00:00Z').getUTCDay()] + ' ' + Number(f.slice(8)) + '/' + Number(f.slice(5, 7));

  // Constancia: un círculo por día de la semana actual, lleno si ese día hubo alguna sesión
  function pintarSemana() {
    const hist = leer(K.historial, null);
    const hoy = hoyTexto(), l = lunes(hoy);
    const fechas = new Set((hist ? hist.sesiones : []).map((x) => x.fecha));
    hechoHoy().rutinas.length && fechas.add(hoy);
    const letras = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    let hechos = 0;
    $('semana-dias').innerHTML = letras.map((letra, i) => {
      const f = new Date(Date.parse(l + 'T12:00:00Z') + i * 864e5).toISOString().slice(0, 10);
      const hecho = fechas.has(f);
      if (hecho) hechos++;
      const clase = 'dia' + (hecho ? ' hecho' : '') + (f === hoy ? ' hoy' : '') + (f > hoy ? ' futuro' : '');
      return '<div class="' + clase + '"><span class="dia-punto">' + (hecho ? '✓' : Number(f.slice(8))) + '</span>' + letra + '</div>';
    }).join('');
    const meta = Number(datos.config.meta_dias_semana) || 6;
    $('semana-cuenta').innerHTML = '<b>' + hechos + '</b> de ' + meta + ' días';
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
    // Un vasito por cada vaso de la meta; el último puede quedar a medio llenar
    const metaVasos = Math.round(meta / vaso);
    let html = '';
    for (let i = 0; i < metaVasos; i++) {
      const lleno = Math.max(0, Math.min(1, ml / vaso - i));
      html += '<span class="vasito"><i style="height:' + Math.round(lleno * 100) + '%"></i></span>';
    }
    $('agua-vasitos').innerHTML = html;
    $('agua-vasitos').setAttribute('aria-label', vasos + ' de ' + metaVasos + ' vasos (' + pct + '%)');
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
      const r = await enviar({ accion: 'agua', ml: ml, fecha: hoyTexto() }); // con fecha: si queda en la cola, se guarda en el día correcto
      if (r) { datos.agua_hoy_ml = r.agua_hoy_ml; guardar(K.datos, datos); pintarAgua(); aviso('+' + ml + ' ml 💧'); }
      else { aviso('Sin conexión: el agua se envía después'); pintarInicio(); }
    } catch (err) {
      datos.agua_hoy_ml -= ml; guardar(K.datos, datos); pintarAgua();
      aviso('No se guardó: ' + err.message);
    }
  }

  const vasoMl = () => Number(datos.config.vaso_ml) || 250;

  // Deshacer el último registro de agua de un día. Necesita conexión: borra algo que ya está en la planilla.
  async function deshacerAgua(fecha) {
    if (!confirm('¿Borrar el último registro de agua de ' + elDia(fecha, false) + '?')) return;
    try {
      const r = await apiPost({ accion: 'deshacer_agua', fecha: fecha });
      datos.hoy = hoyTexto(); datos.agua_hoy_ml = r.agua_hoy_ml; guardar(K.datos, datos); pintarAgua();
      borrar(K.historial);
      aviso('Borrado (' + r.ml_borrados + ' ml). ' + elDia(fecha, true) + ' queda en ' + textoVasos(r.agua_dia_ml));
    } catch (err) {
      aviso(err instanceof ErrorServidor ? err.message : 'Sin conexión: probá de nuevo con internet');
    }
  }

  const fechaCorta = (f) => (f === hoyTexto() ? 'hoy' : new Date(f + 'T12:00:00Z').toLocaleDateString('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'numeric' }));
  // "hoy" / "el 3/11", con mayúscula al comienzo de una oración si hace falta
  const elDia = (f, mayus) => (f === hoyTexto() ? (mayus ? 'Hoy' : 'hoy') : (mayus ? 'El ' : 'el ') + fechaCorta(f));
  const textoVasos = (ml) => { const v = Math.round((ml / vasoMl()) * 10) / 10; return String(v).replace('.', ',') + (v === 1 ? ' vaso' : ' vasos'); };

  // ---------------------------------------------------------------------------
  // Pantalla de sesión
  // ---------------------------------------------------------------------------
  let b = null; // borrador de la sesión en curso
  let editando = null; // ejercicio cuyo objetivo se está editando

  function empezar(rutinaId) {
    const actual = leer(K.borrador, null);
    const seguir = actual && actual.rutina_id === rutinaId && !actual.editar;
    if (actual && !seguir && !confirm(actual.editar ? 'Estás editando otra sesión. ¿Descartar esos cambios?' : 'Tenés otra sesión sin terminar. ¿Descartarla y empezar esta?')) return;
    b = seguir ? actual : {
      rutina_id: rutinaId, inicio: Date.now(), fecha: hoyTexto(), valores: {}, extras: {}, manual: {},
      energia: null, esfuerzo: null, sueno: hechoHoy().sueno, duracion: null, notas: '',
    };
    guardar(K.borrador, b);
    pintarSesion();
    mostrar('pantalla-sesion');
  }

  const clave = (ej, n, lado) => ej + '|' + n + '|' + lado;

  // Abre una sesión ya guardada en la pantalla de sesión, con todos sus datos, para corregirla
  function editarSesion(sesionId) {
    const hist = leer(K.historial, null);
    const s = hist && hist.sesiones.find((x) => Number(x.sesion_id) === Number(sesionId));
    if (!s || !rutina(s.rutina_id)) { aviso('No encontré esa sesión: actualizá el historial'); return; }
    const actual = leer(K.borrador, null);
    if (actual && !(actual.editar === s.sesion_id) && !confirm('Tenés otra sesión sin terminar. ¿Descartarla y editar esta?')) return;
    const vacio = (v) => (v === null || v === undefined ? '' : v);
    b = {
      rutina_id: s.rutina_id, editar: s.sesion_id, inicio: Date.now(), fecha: s.fecha,
      valores: {}, extras: {}, manual: {},
      energia: Number(s.energia_1a5) || null, esfuerzo: Number(s.esfuerzo_1a10) || null,
      sueno: vacio(s.sueno_horas), duracion: vacio(s.duracion_min), notas: s.notas || '',
    };
    const maxSerie = {};
    s.series.forEach((x) => {
      const k = clave(x.ejercicio_id, x.serie_n, x.lado || '');
      b.valores[k] = { reps: vacio(x.reps), peso_kg: vacio(x.peso_kg), minutos: vacio(x.minutos), distancia_km: vacio(x.distancia_km) };
      // Lo guardado cuenta como escrito a mano: cambiar una serie no pisa las otras
      ['reps', 'peso_kg', 'minutos'].forEach((c) => { b.manual[k + '|' + c] = true; });
      maxSerie[x.ejercicio_id] = Math.max(maxSerie[x.ejercicio_id] || 0, Number(x.serie_n));
    });
    // Si esa vez hizo más series que el objetivo, se muestran todas
    rutina(s.rutina_id).items.forEach((item) => {
      const extra = (maxSerie[item.ejercicio_id] || 0) - (Number(item.series_objetivo) || 1);
      if (extra > 0) b.extras[item.ejercicio_id] = extra;
    });
    guardar(K.borrador, b);
    pintarSesion();
    mostrar('pantalla-sesion');
  }

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
    $('pantalla-sesion').className = 'pantalla con-barra tipo-' + r.tipo;
    $('sesion-tipo').textContent = (TIPOS[r.tipo] || TIPOS.fuerza).icono + ' ' + (TIPOS[r.tipo] || TIPOS.fuerza).nombre;
    $('sesion-titulo').textContent = r.nombre;
    $('sesion-editando').hidden = !b.editar;
    $('sesion-editando').textContent = b.editar ? '✏️ Estás editando una sesión ya guardada. Al guardar, los cambios reemplazan lo anterior.' : '';
    $('btn-guardar').textContent = b.editar ? 'Guardar cambios' : 'Guardar sesión';
    $('btn-descartar').textContent = b.editar ? 'Cancelar edición' : 'Descartar sesión';
    if (!b.fecha) b.fecha = new Date(b.inicio).toLocaleDateString('en-CA', { timeZone: ZONA });
    $('in-fecha').value = b.fecha;
    $('in-fecha').max = hoyTexto();
    $('sesion-inicio').textContent = b.editar ? '' : b.fecha === hoyTexto() ? 'Empezaste a las ' + horaTexto(b.inicio) : 'Cargando una sesión pasada';

    const totalEj = r.items.length;
    $('sesion-ejercicios').innerHTML = r.items.map((item, idx) => {
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
        '<h2>' + (totalEj > 1 ? '<span class="num-ej">' + (idx + 1) + '/' + totalEj + '</span>' : '') + esc(ej.nombre) + '</h2>' + editor +
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
    const duracionAuto = r.tipo !== 'fuerza' ? series.reduce((s, x) => s + (x.minutos || 0), 0) : esHoy && !b.editar ? minutosDesdeInicio() : '';
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
    const textoBoton = boton.textContent;
    boton.disabled = true; boton.textContent = 'Guardando…';
    if (b.editar) {
      // Editar necesita conexión: reemplaza algo que ya está en la planilla
      try {
        await apiPost(Object.assign(cuerpo, { accion: 'editar_sesion', sesion_id: b.editar }));
        borrar(K.borrador); b = null;
        aviso('Cambios guardados ✓');
        await abrirHistorial();
        actualizarDatos(); // la "vez pasada" puede cambiar
      } catch (e) {
        err.textContent = e instanceof ErrorServidor ? 'La planilla no lo aceptó: ' + e.message : 'Sin conexión: para editar necesitás internet. Lo que cambiaste queda guardado acá.';
      } finally {
        boton.disabled = false; boton.textContent = textoBoton;
      }
      return;
    }
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
      boton.disabled = false; boton.textContent = textoBoton;
    }
  }

  // ---------------------------------------------------------------------------
  // Pantalla de historial
  // ---------------------------------------------------------------------------
  async function cargarHistorial() {
    await vaciarCola(); // así aparece también lo que se cargó sin conexión
    const r = await fetch(conf.url + '?accion=historial&dias=90&token=' + encodeURIComponent(conf.token));
    const j = await r.json();
    if (!j.ok) throw new ErrorServidor(j.error);
    guardar(K.historial, j);
    return j;
  }

  async function abrirHistorial() {
    mostrar('pantalla-historial');
    const cache = leer(K.historial, null);
    if (cache) pintarHistorial(cache.sesiones, cache.agua);
    $('hist-estado').textContent = 'Actualizando…';
    try {
      const j = await cargarHistorial();
      pintarHistorial(j.sesiones, j.agua);
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

  // Número de semana del programa (1, 2, 3…) según el lunes de la semana 1 guardado en la planilla
  function semanaPrograma(fecha) {
    const inicio = datos && datos.config && datos.config.inicio_programa;
    if (!inicio) return null;
    const n = Math.floor((Date.parse(lunes(fecha) + 'T12:00:00Z') - Date.parse(lunes(inicio) + 'T12:00:00Z')) / (7 * 864e5)) + 1;
    return n >= 1 ? n : null;
  }

  // Medida para comparar un ejercicio con la vez anterior: volumen (kg × reps), reps totales o minutos
  function medidaEjercicio(ej, series) {
    if (ej.tipo_medida === 'tiempo') return series.reduce((t, x) => t + (Number(x.minutos) || 0), 0);
    if (ej.tipo_medida === 'reps') return series.reduce((t, x) => t + (Number(x.reps) || 0), 0);
    return series.reduce((t, x) => t + (Number(x.reps) || 0) * (Number(x.peso_kg) || 0), 0);
  }

  function pintarHistorial(sesiones, agua) {
    agua = agua || {};
    if (!sesiones.length) { $('hist-lista').innerHTML = '<p class="sub">Todavía no hay sesiones cargadas.</p>'; return; }
    const nombreRutina = (id) => { const r = rutina(id); return r ? r.nombre : id; };
    const fechaLarga = (f) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
    const corta = (f) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'numeric' });
    const n = (v) => String(v).replace('.', ',');

    // Progreso: para cada ejercicio de cada sesión, comparación con la vez anterior que se hizo
    const cronologico = sesiones.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.sesion_id - b.sesion_id));
    const anterior = {}, progreso = {};
    cronologico.forEach((s) => {
      const porEj = {};
      s.series.forEach((x) => { (porEj[x.ejercicio_id] = porEj[x.ejercicio_id] || []).push(x); });
      Object.keys(porEj).forEach((id) => {
        const ej = ejercicio(id);
        if (!ej) return;
        const m = medidaEjercicio(ej, porEj[id]);
        if (anterior[id] != null && anterior[id] > 0) progreso[s.sesion_id + '|' + id] = (m - anterior[id]) / anterior[id];
        anterior[id] = m;
      });
    });
    const insignia = (p) => {
      if (p == null) return '';
      if (Math.abs(p) < 0.005) return '<span class="prog prog-igual" title="Igual que la vez anterior">=</span>';
      const pct = Math.round(Math.abs(p) * 100);
      return p > 0 ? '<span class="prog prog-sube" title="Mejor que la vez anterior">↑ ' + pct + '%</span>'
                   : '<span class="prog prog-baja" title="Menos que la vez anterior">↓ ' + pct + '%</span>';
    };

    // Semanas de la más nueva a la más vieja; dentro de cada semana, los días en orden (lunes primero)
    const semanas = [];
    cronologico.slice().reverse().forEach((s) => {
      const l = lunes(s.fecha);
      let sem = semanas.find((x) => x.lunes === l);
      if (!sem) semanas.push(sem = { lunes: l, sesiones: [] });
      sem.sesiones.push(s);
    });

    $('hist-lista').innerHTML = semanas.map((sem) => {
      sem.sesiones.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.sesion_id - b.sesion_id));
      const dias = new Set(sem.sesiones.map((s) => s.fecha)).size;
      const fin = new Date(sem.lunes + 'T12:00:00Z'); fin.setUTCDate(fin.getUTCDate() + 6);
      const nSem = semanaPrograma(sem.lunes);
      const rango = corta(sem.lunes) + ' al ' + corta(fin.toISOString().slice(0, 10));
      const actual = sem.lunes === lunes(hoyTexto());
      const titulo = nSem ? 'Semana ' + nSem : (actual ? 'Esta semana' : 'Semana del ' + rango);
      const subtitulo = nSem ? (actual ? 'esta semana' : rango) : '';
      // Agua: promedio de los días de esa semana que tienen agua registrada
      const diasAgua = Object.keys(agua).filter((f) => lunes(f) === sem.lunes);
      const promAgua = diasAgua.length ? diasAgua.reduce((t, f) => t + agua[f], 0) / diasAgua.length : 0;
      const chipsSemana = '<span class="chip">' + dias + (dias === 1 ? ' día' : ' días') + ' · ' + sem.sesiones.length + (sem.sesiones.length === 1 ? ' sesión' : ' sesiones') + '</span>' +
        (diasAgua.length ? '<span class="chip agua" title="' + diasAgua.length + (diasAgua.length === 1 ? ' día registrado' : ' días registrados') + '">💧 ' + textoVasos(promAgua) + '/día</span>' : '');

      return '<section class="semana-bloque"><header class="semana-cab"><div><h2>' + titulo + '</h2>' +
        (subtitulo ? '<span class="sub">' + subtitulo + '</span>' : '') + '</div><div class="semana-stats">' + chipsSemana + '</div></header>' +
        sem.sesiones.map((s) => {
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
              const pesos = new Set(lista.map((x) => x.peso_kg));
              return pesos.size === 1
                ? n(lista[0].peso_kg) + ' kg × ' + lista.map((x) => x.reps).join(', ')
                : lista.map((x) => n(x.peso_kg) + '×' + x.reps).join(', ');
            };
            const lados = ['D', 'I'].map((l) => g.series.filter((x) => x.lado === l));
            const detalle = lados[0].length || lados[1].length
              ? lados.map((lista, i) => lista.length ? (i ? 'izq ' : 'der ') + texto(lista) : '').filter(Boolean).join(' · ')
              : texto(g.series);
            return '<li><div><b>' + esc(ej.nombre) + '</b><span class="sub">' + detalle + '</span></div>' + insignia(progreso[s.sesion_id + '|' + g.id]) + '</li>';
          }).join('');
          const chips = [
            s.duracion_min ? '⏱ ' + s.duracion_min + ' min' : '',
            s.energia_1a5 ? '⚡ ' + s.energia_1a5 + '/5' : '',
            s.esfuerzo_1a10 ? '💪 ' + s.esfuerzo_1a10 + '/10' : '',
            s.sueno_horas ? '😴 ' + n(s.sueno_horas) + ' h' : '',
          ].filter(Boolean).map((c) => '<span class="chip">' + c + '</span>').join('') +
            (agua[s.fecha] ? '<span class="chip agua">💧 ' + textoVasos(agua[s.fecha]) + '</span>' : '');
          return '<details class="tarjeta hist-sesion tipo-' + tipoDe(s.rutina_id) + '"><summary>' +
            '<span class="hist-fila"><span class="hist-fecha">' + fechaLarga(s.fecha) + '</span><span class="hist-flecha" aria-hidden="true">⌄</span></span>' +
            '<span class="hist-nombre">' + (TIPOS[tipoDe(s.rutina_id)] || TIPOS.fuerza).icono + ' ' + esc(nombreRutina(s.rutina_id)) + '</span>' +
            '<span class="chips">' + chips + '</span></summary>' +
            '<ul class="hist-series">' + lineas + '</ul>' +
            (s.notas ? '<p class="sub hist-notas">📝 ' + esc(s.notas) + '</p>' : '') +
            '<div class="hist-acciones">' +
            '<button class="btn btn-chico" type="button" data-editar-sesion="' + s.sesion_id + '">✏️ Editar</button>' +
            '<button class="btn btn-link btn-peligro" type="button" data-borrar-sesion="' + s.sesion_id + '">🗑 Borrar</button></div>' +
            '</details>';
        }).join('') + '</section>';
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

  $('form-semana').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const n = num($('cfg-semana').value);
    if (!(n >= 1 && n <= 200 && Number.isInteger(n))) { aviso('Poné un número de semana (1, 2, 3…)'); return; }
    // Semana 1 = el lunes de esta semana menos (n - 1) semanas
    const d = new Date(lunes(hoyTexto()) + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - (n - 1) * 7);
    const inicio = d.toISOString().slice(0, 10);
    try {
      await apiPost({ accion: 'config', clave: 'inicio_programa', valor: inicio });
      datos.config.inicio_programa = inicio; guardar(K.datos, datos);
      borrar(K.historial);
      aviso('Listo: esta es la semana ' + n);
      mostrar('pantalla-inicio'); pintarInicio();
    } catch (err) {
      aviso(err instanceof ErrorServidor ? 'No se pudo: ' + err.message : 'Sin conexión: probá de nuevo con internet');
    }
  });

  $('cfg-volver').addEventListener('click', () => { mostrar('pantalla-inicio'); pintarInicio(); });
  $('btn-config').addEventListener('click', () => {
    $('cfg-url').value = conf ? conf.url : '';
    $('cfg-token').value = conf ? conf.token : '';
    $('cfg-volver').hidden = !datos;
    $('cfg-estado').textContent = '';
    $('form-semana').hidden = !datos;
    $('cfg-semana').value = datos ? (semanaPrograma(hoyTexto()) || '') : '';
    mostrar('pantalla-config');
  });

  $('btn-deshacer-agua').addEventListener('click', () => deshacerAgua(hoyTexto()));
  $('btn-agua-otro').addEventListener('click', () => {
    const f = $('form-agua-otro');
    f.hidden = !f.hidden;
    if (!f.hidden) {
      const ayer = new Date(Date.parse(hoyTexto() + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
      $('agua-fecha').max = hoyTexto();
      if (!$('agua-fecha').value) $('agua-fecha').value = ayer;
      $('agua-vasos-otro').focus();
    }
  });
  $('agua-vasos-otro').addEventListener('input', (ev) => {
    const n = num(ev.target.value);
    $('agua-otro-ml').textContent = n > 0 ? '= ' + Math.round(n * vasoMl()) + ' ml' : '';
  });
  $('form-agua-otro').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fecha = $('agua-fecha').value, vasos = num($('agua-vasos-otro').value);
    if (!fecha || fecha > hoyTexto()) { aviso('Elegí una fecha que no sea futura'); return; }
    if (!(vasos > 0 && vasos <= 20)) { aviso('Poné cuántos vasos (de 0,5 a 20)'); return; }
    try {
      const r = await enviar({ accion: 'agua', ml: Math.round(vasos * vasoMl()), fecha: fecha });
      borrar(K.historial);
      if (r) {
        datos.hoy = hoyTexto(); datos.agua_hoy_ml = r.agua_hoy_ml; guardar(K.datos, datos); pintarAgua();
        aviso('Guardado: ' + elDia(fecha, false) + ' suma ' + textoVasos(r.agua_dia_ml) + ' 💧');
      } else { aviso('Sin conexión: se envía después'); pintarInicio(); }
      $('agua-vasos-otro').value = ''; $('agua-otro-ml').textContent = '';
      $('form-agua-otro').hidden = true;
    } catch (err) { aviso('No se guardó: ' + err.message); }
  });
  $('btn-deshacer-otro').addEventListener('click', () => { if ($('agua-fecha').value) deshacerAgua($('agua-fecha').value); });

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
    else if (t.dataset.editarSesion) editarSesion(t.dataset.editarSesion);
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
    const editando = b && b.editar;
    if (!confirm(editando ? '¿Cancelar la edición? La sesión guardada queda como estaba.' : '¿Descartar esta sesión? Se borra lo que cargaste.')) return;
    borrar(K.borrador); b = null;
    if (editando) abrirHistorial(); else { mostrar('pantalla-inicio'); pintarInicio(); }
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
