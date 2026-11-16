import json, subprocess, time, urllib.request, sys
from playwright.sync_api import sync_playwright
api = subprocess.Popen(['node', 'servidor_api.js']); web = subprocess.Popen([sys.executable, '-m', 'http.server', '8791', '-d', '../docs'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
URL = 'https://script.google.com/macros/s/PRUEBA/exec'
offline = {'on': False}
fallas = []
def ok(c, m): print(('OK   ' if c else 'FALLA ') + m); (None if c else fallas.append(m))
def ruta(route, req):
    if offline['on']: return route.abort()
    destino = 'http://localhost:8790/' + ('?' + req.url.split('?', 1)[1] if '?' in req.url else '')
    r = urllib.request.urlopen(urllib.request.Request(destino, data=req.post_data_buffer, method=req.method))
    route.fulfill(status=200, body=r.read(), headers={'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})
hojas = lambda: {k: v['datos'] for k, v in json.load(urllib.request.urlopen('http://localhost:8790/_hojas')).items()}
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        errores = []; pg.on('pageerror', lambda e: errores.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.route('https://script.google.com/**', ruta)
        pg.goto('http://localhost:8791/')
        ok(pg.is_visible('#pantalla-config'), 'primera vez abre configuración')
        pg.fill('#cfg-url', URL); pg.fill('#cfg-token', 'mala'); pg.click('text=Probar y guardar'); pg.wait_for_timeout(500)
        ok('Clave incorrecta' in pg.inner_text('#cfg-estado'), 'clave mala muestra el error')
        pg.fill('#cfg-token', 'clave-de-prueba-123'); pg.click('text=Probar y guardar'); pg.wait_for_selector('#pantalla-inicio:not([hidden])')
        ok(pg.locator('.rutina').count() == 5, '5 rutinas en el inicio')
        pg.screenshot(path='../captura_inicio.png', full_page=True)
        pg.click('#btn-vaso'); pg.wait_for_timeout(400); pg.click('#btn-botella'); pg.wait_for_timeout(400)
        ok(pg.inner_text('#agua-vasos') == '3', 'agua: 250 + 500 = 3 vasos')
        ok(sum(f[3] for f in hojas()['Agua'][1:]) == 750, 'agua guardada en la planilla (750 ml)')
        # sesión de piernas 1
        pg.click('[data-rutina="piernas_1"]')
        ok(pg.locator('.ejercicio').count() == 6, 'piernas 1 muestra 6 ejercicios')
        ok(pg.locator('.ejercicio').first.locator('.serie:not(.serie-titulos)').count() == 6, 'hip thrust unilateral: 3 series × 2 lados')
        s = pg.locator('.ejercicio').first.locator('.serie:not(.serie-titulos)')
        s.nth(0).locator('[data-campo=peso_kg]').fill('8'); s.nth(0).locator('[data-campo=reps]').fill('9')
        s.nth(1).locator('[data-campo=peso_kg]').fill('8'); s.nth(1).locator('[data-campo=reps]').fill('8')
        pg.locator('.ejercicio').nth(4).locator('[data-campo=reps]').first.fill('13')
        pg.click('#btn-guardar'); ok('energía' in pg.inner_text('#sesion-error'), 'pide energía y esfuerzo antes de guardar')
        pg.reload(); pg.wait_for_timeout(500)
        ok(pg.is_visible('#aviso-borrador'), 'tras recargar ofrece continuar la sesión')
        pg.click('#btn-continuar')
        ok(pg.locator('.ejercicio').first.locator('[data-campo=reps]').first.input_value() == '9', 'el borrador conserva lo cargado')
        pg.click('[data-sel=energia][data-valor="4"]'); pg.click('[data-sel=esfuerzo][data-valor="7"]'); pg.fill('#in-sueno', '7.5')
        pg.click('#btn-guardar'); pg.wait_for_selector('#pantalla-inicio:not([hidden])'); pg.wait_for_timeout(600)
        h = hojas(); ser = h['Series'][1:]
        ok(len(ser) == 3 and h['Sesiones'][1][4] == 4 and h['Sesiones'][1][5] == 7, 'sesión con 3 series, energía 4 y esfuerzo 7')
        ok(ser[0][5] == 'D' and ser[1][5] == 'I' and ser[0][10] == 72, 'lados D/I y volumen 72 kg')
        ok('hecha hoy' in pg.inner_text('[data-rutina="piernas_1"]'), 'piernas 1 marcada como hecha hoy')
        # la vez pasada
        pg.click('[data-rutina="piernas_1"]'); pg.wait_for_timeout(200)
        ok('der 8 kg × 9' in pg.inner_text('.ref >> nth=0'), 'muestra la vez pasada por lado')
        ok(pg.locator('[data-campo=peso_kg]').first.input_value() == '8', 'precarga el peso de la vez pasada')
        pg.screenshot(path='../captura_sesion.png', full_page=True)
        pg.evaluate("document.getElementById('btn-descartar').click()"); pg.wait_for_timeout(300)
        # sin conexión: bici
        offline['on'] = True
        pg.click('[data-rutina="bici"]'); pg.fill('[data-campo=distancia_km]', '18.5')
        pg.click('[data-sel=energia][data-valor="3"]'); pg.click('[data-sel=esfuerzo][data-valor="6"]')
        pg.click('#btn-guardar'); pg.wait_for_timeout(500)
        ok(pg.is_visible('#aviso-pendientes'), 'sin conexión la sesión queda pendiente')
        offline['on'] = False
        pg.click('#btn-reintentar'); pg.wait_for_timeout(800)
        h = hojas()
        ok(len(h['Sesiones']) == 3 and h['Series'][-1][8] == 45 and h['Series'][-1][9] == 18.5, 'al volver la conexión se envía: 45 min, 18,5 km')
        ok(not pg.is_visible('#aviso-pendientes'), 'cola vacía después de enviar')
        pg.set_viewport_size({'width': 320, 'height': 640}); pg.click('[data-rutina="superior"]')
        ancho = pg.evaluate('document.documentElement.scrollWidth')
        ok(ancho <= 320, f'sin desborde horizontal en 320 px ({ancho})')
        ok(not errores, 'sin errores de JavaScript ' + str(errores))
        b.close()
finally:
    api.kill(); web.kill()
print('\n' + ('TODO OK' if not fallas else f'{len(fallas)} FALLAS'))
