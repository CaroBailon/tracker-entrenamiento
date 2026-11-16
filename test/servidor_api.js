// Expone Code.gs simulado por HTTP para probar la app en el navegador
const http = require('http');
const { ctx, hojas } = require('./simulacion');
ctx.setup();
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/_hojas') return send(hojas);
  if (req.method === 'GET') return send(ctx.doGet({ parameter: Object.fromEntries(u.searchParams) }));
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => send(ctx.doPost({ postData: { contents: b } })));
}).listen(8790, () => console.log('api lista'));
