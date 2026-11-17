const { ctx, hojas } = require('./simulacion');
const assert = (c, m) => { if (!c) { console.error('FALLA:', m); process.exitCode = 1; } else console.log('OK  ', m); };
const post = (cuerpo) => ctx.doPost({ postData: { contents: JSON.stringify(cuerpo) } });
const get = (p) => ctx.doGet({ parameter: p });

ctx.setup();
assert(!hojas['Hoja 1'], 'setup borra la hoja vacía');
assert(hojas.Ejercicios.datos.length === 20, 'catálogo con 19 ejercicios + encabezado');
assert(hojas.Rutinas.datos.length === 21, 'rutinas con 20 filas + encabezado');
ctx.setup();
assert(hojas.Ejercicios.datos.length === 20, 'correr setup dos veces no duplica datos');

const T = 'clave-de-prueba-123';
assert(get({ token: 'mala' }).ok === false, 'GET con clave incorrecta se rechaza');
assert(post({ token: 'mala', accion: 'agua', ml: 250 }).ok === false, 'POST con clave incorrecta se rechaza');

let r = get({ token: T });
assert(r.ok && r.ejercicios.length === 19 && r.rutinas.length === 20, 'GET inicio devuelve catálogo y rutinas');
assert(r.config.meta_agua_ml === 2000 && r.agua_hoy_ml === 0, 'config y agua de hoy en 0');

r = post({ token: T, accion: 'agua', ml: 250 }); r = post({ token: T, accion: 'agua', ml: 500 });
assert(r.ok && r.agua_hoy_ml === 750, 'agua suma 250 + 500 = 750');
assert(post({ token: T, accion: 'agua', ml: -5 }).ok === false, 'agua negativa se rechaza');

const hoy = get({ token: T }).hoy;
r = post({ token: T, accion: 'sesion',
  sesion: { fecha: hoy, rutina_id: 'piernas_1', duracion_min: 65, energia_1a5: 4, esfuerzo_1a10: 7, sueno_horas: 7.5, notas: 'Bien' },
  series: [
    { ejercicio_id: 'hip_thrust_1p', serie_n: 1, lado: 'D', reps: 9, peso_kg: 8 },
    { ejercicio_id: 'hip_thrust_1p', serie_n: 1, lado: 'I', reps: 8, peso_kg: 8 },
    { ejercicio_id: 'curl_femoral_pelota', serie_n: 1, reps: 13 },
    { ejercicio_id: 'elevacion_talones', serie_n: 1, lado: 'D', reps: 11, peso_kg: 6 },
  ] });
assert(r.ok && r.sesion_id === 1 && r.series_guardadas === 4, 'sesión con 4 series guardada');
const s = hojas.Series.datos;
assert(s[1][10] === 72 && s[1][11] === 10.4, 'hip thrust: volumen 9×8 = 72 kg y 1RM Epley 8×(1+9/30) = 10,4 kg');
assert(s[2][5] === 'I', 'lado izquierdo registrado en ejercicio unilateral');
assert(s[4][5] === '', 'ejercicio no unilateral ignora el lado');
assert(s[3][10] === '' && s[3][6] === 13, 'curl con pelota: repeticiones sin volumen (peso corporal)');

r = post({ token: T, accion: 'sesion', sesion: { rutina_id: 'bici', duracion_min: 45, energia_1a5: 3 },
  series: [{ ejercicio_id: 'bici_estatica', minutos: 45, distancia_km: 18.5 }] });
assert(r.ok && r.sesion_id === 2 && hojas.Series.datos[5][8] === 45, 'sesión de bici: 45 minutos y 18,5 km');

assert(post({ token: T, accion: 'sesion', sesion: { energia_1a5: 9 }, series: [] }).ok === false, 'energía 9 (fuera de 1 a 5) se rechaza');
assert(post({ token: T, accion: 'sesion', sesion: {}, series: [{ ejercicio_id: 'no_existe', reps: 5 }] }).ok === false, 'ejercicio desconocido se rechaza');
assert(hojas.Sesiones.datos.length === 3, 'los envíos rechazados no dejan filas a medias');

r = get({ token: T });
assert(r.ultimas['hip_thrust_1p_D'].reps === 9 && r.ultimas['hip_thrust_1p_I'].reps === 8, 'últimas marcas separadas por lado');
assert(r.ultimas['bici_estatica'].minutos === 45 && r.agua_hoy_ml === 750, 'última bici y agua de hoy correctas');

r = post({ token: T, accion: 'objetivo', rutina_id: 'piernas_1', ejercicio_id: 'hip_thrust_1p', series_objetivo: 3, reps_objetivo: 10 });
const fila = hojas.Rutinas.datos.find((f) => f[0] === 'piernas_1' && f[4] === 'hip_thrust_1p');
assert(r.ok && fila[6] === 10 && fila[5] === 3, 'objetivo de hip thrust cambiado a 3 × 10');
assert(post({ token: T, accion: 'objetivo', rutina_id: 'piernas_1', ejercicio_id: 'hip_thrust_1p', reps_objetivo: 500 }).ok === false, 'objetivo fuera de rango se rechaza');
assert(post({ token: T, accion: 'objetivo', rutina_id: 'superior', ejercicio_id: 'hip_thrust_1p', reps_objetivo: 10 }).ok === false, 'ejercicio que no está en la rutina se rechaza');

post({ token: T, accion: 'sesion', sesion: { fecha: '2026-11-05', rutina_id: 'superior', energia_1a5: 3 }, series: [{ ejercicio_id: 'press_pecho', serie_n: 1, reps: 11, peso_kg: 6 }] });
r = get({ token: T, accion: 'historial', dias: 3650 });
assert(r.ok && r.sesiones.length === 3, 'historial devuelve las 3 sesiones');
assert(r.sesiones[2].fecha === '2026-11-05' && r.sesiones[2].series[0].peso_kg === 6, 'sesión cargada con fecha pasada, ordenada al final');
assert(r.sesiones[0].sesion_id === 2 && r.sesiones[1].series.length === 4, 'mismo día: la más nueva primero; series agrupadas por sesión');
assert(get({ token: T }).ultimas['press_pecho'].peso_kg === 6, 'una sesión vieja igual cuenta como última marca si no hay otra');
r = post({ token: T, accion: 'cambiar_fecha', sesion_id: 1, fecha: '2026-11-04' });
const ses1 = get({ token: T, accion: 'historial', dias: 3650 }).sesiones.find((x) => x.sesion_id === 1);
assert(r.ok && ses1.fecha === '2026-11-04', 'cambiar_fecha corrige la sesión');
assert(hojas.Series.datos.filter((f) => f[1] === 1).every((f) => ctx.fechaTexto_(f[2], 'x') === '2026-11-04'), 'cambiar_fecha corrige también sus series');
assert(post({ token: T, accion: 'cambiar_fecha', sesion_id: 1, fecha: '2099-01-01' }).ok === false, 'no acepta fechas futuras');
const antes = hojas.Series.datos.length;
r = post({ token: T, accion: 'borrar_sesion', sesion_id: 1 });
assert(r.ok && hojas.Series.datos.length === antes - 4 && !hojas.Sesiones.datos.some((f) => f[0] === 1), 'borrar_sesion borra la sesión y sus 4 series');
assert(hojas.Sesiones.datos.some((f) => f[0] === 2), 'borrar_sesion no toca las otras sesiones');
assert(post({ token: T, accion: 'borrar_sesion', sesion_id: 99 }).ok === false, 'sesión inexistente se rechaza');
r = post({ token: T, accion: 'config', clave: 'inicio_programa', valor: '2026-10-05' });
assert(r.ok && get({ token: T }).config.inicio_programa === '2026-10-05', 'inicio del programa guardado y devuelto como yyyy-mm-dd');
post({ token: T, accion: 'config', clave: 'inicio_programa', valor: '2026-10-12' });
assert(hojas.Config.datos.filter((f) => f[0] === 'inicio_programa').length === 1 && get({ token: T }).config.inicio_programa === '2026-10-12', 'cambiarlo de nuevo actualiza la misma fila');
assert(post({ token: T, accion: 'config', clave: 'meta_agua_ml', valor: 5 }).ok === false, 'ajustes no editables se rechazan');
r = post({ token: T, accion: 'agua', ml: 1500, fecha: '2026-11-10' });
assert(r.ok && r.agua_dia_ml === 1500 && hojas.Agua.datos[hojas.Agua.datos.length - 1][2] === '', 'agua de un día pasado: se guarda con esa fecha y sin hora');
post({ token: T, accion: 'agua', ml: 250, fecha: '2026-11-10' });
r = post({ token: T, accion: 'deshacer_agua', fecha: '2026-11-10' });
assert(r.ok && r.ml_borrados === 250 && r.agua_dia_ml === 1500, 'deshacer borra solo el último registro de ese día');
assert(post({ token: T, accion: 'agua', ml: 250, fecha: '2099-01-01' }).ok === false, 'agua con fecha futura se rechaza');
assert(post({ token: T, accion: 'deshacer_agua', fecha: '2026-01-01' }).ok === false, 'deshacer un día sin agua se rechaza');
assert(get({ token: T, accion: 'historial', dias: 3650 }).agua['2026-11-10'] === 1500, 'el historial trae el agua por día');
const seriesAntes = hojas.Series.datos.length;
r = post({ token: T, accion: 'editar_sesion', sesion_id: 2, sesion: { fecha: '2026-11-06', rutina_id: 'superior', energia_1a5: 2, esfuerzo_1a10: 6, duracion_min: 40, notas: 'editada' },
  series: [{ ejercicio_id: 'press_pecho', serie_n: 1, reps: 12, peso_kg: 7 }, { ejercicio_id: 'press_pecho', serie_n: 2, reps: 10, peso_kg: 7 }] });
const ed = get({ token: T, accion: 'historial', dias: 3650 }).sesiones.find((x) => x.sesion_id === 2);
assert(r.ok && r.sesion_id === 2 && ed.fecha === '2026-11-06' && ed.energia_1a5 === 2 && ed.notas === 'editada', 'editar_sesion cambia fecha, energía y notas manteniendo el id');
assert(ed.series.length === 2 && ed.series[0].reps === 12 && ed.series[1].peso_kg === 7, 'editar_sesion reemplaza las series');
assert(hojas.Sesiones.datos.filter((f) => f[0] === 2).length === 1, 'editar no duplica la sesión');
assert(post({ token: T, accion: 'editar_sesion', sesion_id: 99, sesion: { energia_1a5: 3 }, series: [] }).ok === false, 'editar una sesión inexistente se rechaza');
assert(post({ token: T, accion: 'editar_sesion', sesion_id: 2, sesion: { energia_1a5: 9 }, series: [] }).ok === false && get({ token: T, accion: 'historial', dias: 3650 }).sesiones.find((x) => x.sesion_id === 2).series.length === 2, 'si los datos son inválidos no se toca nada');
ctx.borrarRegistros();
assert(hojas.Sesiones.datos.length === 1 && hojas.Series.datos.length === 1 && hojas.Agua.datos.length === 1, 'borrarRegistros deja solo los encabezados');
assert(hojas.Ejercicios.datos.length === 20 && hojas.Rutinas.datos.length === 21, 'borrarRegistros no toca ejercicios ni rutinas');
