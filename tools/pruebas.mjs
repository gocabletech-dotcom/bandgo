// BandGo · pruebas automáticas con una base LOCAL y TEMPORAL (se crea y se borra aquí). Nunca toca producción.
// Uso: node tools/pruebas.mjs   — sale con 0 si todo pasó y 1 si algo falló. «Publicar BandGo.bat» la corre antes de publicar.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const PUERTO = 8891, FALSO = 8897, B = `http://127.0.0.1:${PUERTO}`;
if (!existsSync(join(RAIZ, 'wrangler.jsonc'))) copyFileSync(join(RAIZ, 'wrangler.ejemplo.jsonc'), join(RAIZ, 'wrangler.jsonc'));
const DATOS = mkdtempSync(join(tmpdir(), 'bandgo-pruebas-'));
const FILTRADA = 'Estelares-Filtrada-2024';
let bien = 0, mal = 0; const fallas = [];
const t = (ok, msg, extra) => { if (ok) { bien++; console.log('  \x1b[32m✓\x1b[0m ' + msg); } else { mal++; fallas.push(msg); console.log('  \x1b[31m✗ ' + msg + '\x1b[0m' + (extra ? '\n      ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const titulo = (s) => console.log('\n\x1b[33m' + s + '\x1b[0m');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// servicio falso de contraseñas filtradas (como api.pwnedpasswords.com)
const falso = createServer((req, res) => {
  if (req.url.startsWith('/range/')) { const pre = req.url.slice(7, 12).toUpperCase(), h = createHash('sha1').update(FILTRADA).digest('hex').toUpperCase();
    res.writeHead(200, { 'content-type': 'text/plain' }); return res.end((pre === h.slice(0, 5) ? h.slice(5) + ':52\r\n' : '') + '0000000000000000000000000000000000A:0'); }
  res.writeHead(404); res.end();
}).listen(FALSO, '127.0.0.1');

const WRANGLER = join(RAIZ, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const ENV = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };
let wr = null;
function apagar() {
  try { if (wr && !wr.killed) { if (WIN) spawnSync('taskkill', ['/pid', String(wr.pid), '/T', '/F'], { stdio: 'ignore' }); else process.kill(-wr.pid, 'SIGTERM'); } } catch {}
  try { falso.close(); } catch {}
  try { rmSync(DATOS, { recursive: true, force: true }); } catch {}
}
const sql = (q) => { const r = spawnSync(process.execPath, [WRANGLER, 'd1', 'execute', 'bandgo-db', '--local', '--persist-to', DATOS, '--json', '--command', q], { cwd: RAIZ, encoding: 'utf8', env: ENV }); try { return JSON.parse(r.stdout)[0].results; } catch { throw new Error(r.stderr || r.stdout); } };

const cliente = () => { const jar = {}; const f = async (ruta, o = {}) => {
  const r = await fetch(B + (ruta.startsWith('/') ? ruta : '/api/' + ruta), { method: o.method || 'GET', redirect: 'manual', headers: { 'content-type': 'application/json', ...(o.sinCsrf ? {} : { 'x-requested-with': 'bg' }), cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(o.headers || {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
  const ct = r.headers.get('content-type') || ''; let j = {};
  if (ct.includes('json')) { try { j = await r.json(); } catch {} } else { j = { _bytes: (await r.arrayBuffer()).byteLength, _tipo: ct, _csp: r.headers.get('content-security-policy') }; }
  return { s: r.status, j }; }; return f; };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CLAVE = 'una frase larga de prueba 2026';

async function main() {
  titulo('Preparando una base temporal');
  const m = spawnSync(process.execPath, [WRANGLER, 'd1', 'migrations', 'apply', 'bandgo-db', '--local', '--persist-to', DATOS], { cwd: RAIZ, encoding: 'utf8', env: ENV });
  t(m.status === 0, 'migraciones aplicadas en la base temporal', m.stderr.slice(-500));
  const vars = ['BANDGO_LLAVE:llave-maestra-de-prueba-0123456789-abcdef', `PWNED_API:http://127.0.0.1:${FALSO}`, 'BANDGO_VERSION:pruebas'];
  wr = spawn(process.execPath, [WRANGLER, 'dev', '--local', '--port', String(PUERTO), '--ip', '127.0.0.1', '--persist-to', DATOS, ...vars.flatMap((v) => ['--var', v])], { cwd: RAIZ, detached: !WIN, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; wr.stdout.on('data', (d) => (log += d)); wr.stderr.on('data', (d) => (log += d));
  let listo = false; for (let i = 0; i < 90 && !listo; i++) { try { listo = (await fetch(B + '/api/ping')).ok; } catch {} if (!listo) await esperar(1000); }
  if (!listo) { console.log(log.slice(-3000)); throw new Error('wrangler dev no arrancó'); }

  titulo('Plataforma y entrada');
  const S = cliente(), A = cliente(), Bc = cliente();
  t((await S('setup')).j.necesita_setup === true, 'pide crear el superadministrador la primera vez');
  t((await S('setup', { method: 'POST', body: { nombre: 'Plataforma', email: 'plataforma@bandgo.local', password: 'corta' } })).s === 400, 'rechaza contraseñas cortas');
  t((await S('setup', { method: 'POST', body: { nombre: 'Plataforma', email: 'plataforma@bandgo.local', password: FILTRADA } })).s === 400, 'rechaza contraseñas filtradas');
  t((await S('setup', { method: 'POST', body: { nombre: 'Plataforma', email: 'plataforma@bandgo.local', password: CLAVE } })).s === 201, 'crea el superadministrador');
  t((await S('setup', { method: 'POST', body: { nombre: 'Otro', email: 'x@bandgo.local', password: CLAVE } })).s === 403, 'no deja crear un segundo superadministrador por setup');
  const h = await fetch(B + '/app/'); t(h.ok && (h.headers.get('content-security-policy') || '').includes("default-src 'self'"), 'la app sale con cabeceras de seguridad (CSP)');

  let r = await A('registro', { method: 'POST', body: { empresa: 'Los Estelares', nombre: 'Rafael Durán', email: 'rafael@bandgo.local', password: CLAVE, pais: 'DO', acepta: true } });
  t(r.s === 200 && r.j.ok, 'registra la empresa A con su dueño', r.j);
  r = await Bc('registro', { method: 'POST', body: { empresa: 'Orquesta Rival', nombre: 'Beto', email: 'beto@bandgo.local', password: CLAVE, pais: 'US', acepta: true } });
  t(r.s === 200, 'registra la empresa B');
  t((await A('registro', { method: 'POST', body: { empresa: 'X', nombre: 'X', email: 'rafael@bandgo.local', password: CLAVE, acepta: true } })).s === 400, 'no repite correos');
  r = await A('me'); t(r.j.rol === 'dueno' && r.j.empresa.plan.clave === 'prueba' && !!r.j.empresa.prueba_hasta, 'el dueño entra con prueba gratis', r.j);
  const X = cliente(); t((await X('login', { method: 'POST', body: { email: 'rafael@bandgo.local', password: 'equivocada 123456' } })).s === 401, 'contraseña equivocada no entra');
  t((await X('login', { method: 'POST', body: { email: 'rafael@bandgo.local', password: CLAVE } })).s === 200, 'contraseña correcta entra');
  t((await X('logout', { method: 'POST' })).s === 200 && (await X('me')).s === 401, 'cerrar sesión borra la sesión');
  t((await A('bandas', { method: 'POST', sinCsrf: true, body: { nombre: 'Sin encabezado' } })).s === 403, 'rechaza cambios sin el encabezado anti-CSRF');

  titulo('Bandas, integrantes, fotos y documentos');
  r = await A('archivos', { method: 'POST', body: { tipo: 'logo_banda', datos: PNG } }); const logo = r.j.clave;
  t(r.s === 201 && /^e\/\d+\/logo_banda\//.test(logo), 'sube el logo de la banda a R2', r.j);
  r = await A('bandas', { method: 'POST', body: { nombre: 'Banda RD', categoria: 'Banda RD', moneda: 'DOP', logo } }); const bandaId = r.j.id;
  t(r.s === 201, 'crea la banda con logo');
  r = await A('archivos', { method: 'POST', body: { tipo: 'foto_musico', datos: PNG } }); const foto = r.j.clave;
  r = await A('musicos', { method: 'POST', body: { nombre: 'José Martínez', instrumento: 'Trompeta', email: 'jose@bandgo.local', whatsapp: '18095550188', tarifa: '250.50', tarifa_moneda: 'USD', foto, bandas: [bandaId] } }); const musId = r.j.id;
  t(r.s === 201, 'crea el integrante con foto y banda');
  r = await A('musicos/' + musId); t(r.j.tarifa === 250.5 && r.j.foto_url && r.j.bandas[0].id === bandaId, 'guarda la tarifa en centavos y la devuelve bien', r.j);
  t((await A(r.j.foto_url)).j._tipo === 'image/png', 'la foto se sirve desde R2 con sesión');
  r = await A(`musicos/${musId}/documentos`, { method: 'POST', body: { tipo: 'pasaporte', pais: 'República Dominicana', numero: 'RD1234567', emision: '2020-01-10', vence: new Date(Date.now() + 50 * 864e5).toISOString().slice(0, 10) } });
  t(r.s === 200, 'registra el pasaporte');
  t(sql(`SELECT numero_cif FROM documentos_viaje WHERE musico_id = ${musId}`)[0].numero_cif.startsWith('enc:v1:'), 'el número del pasaporte queda cifrado en la base');
  r = await A(`musicos/${musId}/documentos`); t(r.j[0].numero === 'RD1234567' && r.j[0].alerta.nivel === 'urgente', 'el dueño ve el número completo y la alerta de vencimiento', r.j);
  t((await A('alertas')).j.length === 1, 'aparece en las alertas de documentos');
  r = await A(`musicos/${musId}/cuenta-pago`, { method: 'PUT', body: { banco: 'Banco Popular', titular: 'José Martínez', numero: '7894561234417', tipo_cuenta: 'Ahorros', zelle: 'jose@correo.com' } });
  t(r.s === 200 && (await A(`musicos/${musId}/cuenta-pago`)).j.numero === '•••• 4417', 'datos de pago cifrados y enmascarados');

  titulo('Aislamiento entre empresas');
  t((await Bc('musicos/' + musId)).s === 404, 'la empresa B no ve el integrante de A');
  t((await Bc('bandas/' + bandaId)).s === 404, 'la empresa B no ve la banda de A');
  t((await Bc('bandas/' + bandaId, { method: 'PUT', body: { nombre: 'Robada' } })).s === 404, 'la empresa B no puede editar la banda de A');
  t((await Bc('/api/archivo/' + encodeURIComponent(foto))).s === 404, 'la empresa B no puede abrir la foto de A');
  t((await Bc(`musicos/${musId}/documentos`)).s === 404, 'la empresa B no ve los documentos de A');
  t((await Bc('bandas', { method: 'POST', body: { nombre: 'Con logo ajeno', logo } })).s === 400, 'la empresa B no puede usar un archivo de A');
  t((await Bc('musicos')).j.length === 0 && (await Bc('bandas')).j.length === 0, 'la lista de B está vacía');

  titulo('Roles y permisos');
  r = await A('usuarios', { method: 'POST', body: { email: 'carlos@bandgo.local', nombre: 'Carlos Mejía', rol: 'booking' } });
  t(r.s === 200 && r.j.enlace, 'invita a un booking (enlace sin correo activado)', r.j);
  const K = cliente(); const tk = r.j.enlace.split('/').pop();
  t((await K('invitacion/' + tk)).j.rol === 'Booking', 'la invitación dice el rol');
  t((await K('invitacion/' + tk, { method: 'POST', body: { nombre: 'Carlos Mejía', password: CLAVE } })).s === 200, 'el booking crea su contraseña');
  t((await K('invitacion/' + tk, { method: 'POST', body: { nombre: 'Otra vez', password: CLAVE } })).s === 404, 'la invitación no se usa dos veces');
  t((await K('bandas')).s === 200, 'el booking ve las bandas');
  t((await K('bandas', { method: 'POST', body: { nombre: 'No debe' } })).s === 403, 'el booking no crea bandas');
  r = await K('musicos/' + musId); t(r.j.documentos === null && r.j.direccion === undefined && r.j.cuenta_pago === null, 'el booking no ve documentos, datos privados ni de pago', r.j);
  t((await K(`musicos/${musId}/documentos`)).s === 403, 'el booking no abre los documentos');
  t((await K('permisos', { method: 'PUT', body: { rol: 'booking', permiso: 'bandas.crear', permitido: true } })).s === 403, 'el booking no cambia permisos');
  t((await A('permisos', { method: 'PUT', body: { rol: 'booking', permiso: 'bandas.crear', permitido: true } })).s === 200, 'el dueño le da «crear bandas» al booking');
  t((await K('bandas', { method: 'POST', body: { nombre: 'Banda USA' } })).s === 201, 'ahora el booking sí crea bandas');

  titulo('Portal del músico');
  r = await A(`musicos/${musId}/invitar`, { method: 'POST' }); t(r.s === 200 && r.j.enlace, 'la oficina da acceso al portal');
  const P = cliente(); t((await P('invitacion/' + r.j.enlace.split('/').pop(), { method: 'POST', body: { nombre: 'José', password: CLAVE } })).s === 200, 'el músico crea su contraseña');
  r = await P('me'); t(r.j.portal === true && r.j.rol === 'musico', 'el músico entra a su portal');
  r = await P('portal'); t(r.j.musico.id === musId && r.j.documentos[0].numero === 'RD1234567' && r.j.cuenta_pago.numero === '7894561234417', 've lo suyo completo', r.j);
  t((await P('musicos')).s === 403 && (await P('bandas')).s === 403 && (await P('usuarios')).s === 403, 'no ve la oficina');
  t((await P('/api/archivo/' + encodeURIComponent(foto))).s === 200, 've su propia foto');
  t((await P('portal/perfil', { method: 'PUT', body: { telefono: '8095551111', emergencia_nombre: 'María' } })).s === 200, 'actualiza su perfil');
  t((await P('portal/documentos', { method: 'POST', body: { tipo: 'visa', pais: 'Estados Unidos', clase: 'B1/B2', numero: 'V998877', vence: '2029-05-01' } })).s === 200, 'agrega su visa');

  titulo('Agenda: eventos, bloqueos, choques, contratos y ensayos (Fase 2)');
  const dia = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  r = await A('clientes', { method: 'POST', body: { nombre: 'Hotel Jaragua', telefono: '8095550142', email: 'eventos@jaragua.local', fiscal: '101-00000-1' } }); const cliId = r.j.id;
  t(r.s === 201, 'crea el cliente');
  r = await A('eventos', { method: 'POST', body: { nombre: 'Festival Latino Miami', fecha: dia(20), pais: 'Estados Unidos', ciudad: 'Miami', hora_llegada: '15:00', hora_show: '21:30', hora_fin: '23:00', banda_id: bandaId, cliente_id: cliId, precio: '6000', moneda: 'USD', tipo: 'publico', cubre: { vuelo: { quien: 'cliente' } } } });
  const ev1 = r.j.id; t(r.s === 201 && r.j.codigo === 'EVT-00001', 'crea el evento con código correlativo', r.j);
  r = await A('eventos/' + ev1); t(r.j.equipo.length === 1 && r.j.equipo[0].id === musId && r.j.precio === 6000, 'asigna solo a los integrantes de la banda y guarda el precio', r.j);
  r = await A('eventos', { method: 'POST', body: { nombre: 'Choque', fecha: dia(20), hora_show: '22:00', banda_id: bandaId } });
  t(r.s === 409 && r.j.agenda.choques.length === 1, 'detecta que el músico ya tiene otra actividad a esa hora', r.j);
  t((await A('eventos', { method: 'POST', body: { nombre: 'Otra banda mismo día', fecha: dia(20), hora_show: '22:00', musicos: [] } })).s === 201, 'otra banda sin esos músicos sí puede tocar el mismo día');
  t((await A('bloqueos', { method: 'POST', body: { desde: dia(25), hasta: dia(27), alcance: 'pais', pais: 'España', motivo: 'Exclusividad con promotor' } })).s === 201, 'bloquea fechas para un país');
  r = await A('eventos', { method: 'POST', body: { nombre: 'Madrid', fecha: dia(26), pais: 'españa', banda_id: bandaId } });
  t(r.s === 409 && r.j.agenda.bloqueos.length === 1, 'el bloqueo por país frena el evento (sin importar acentos)', r.j);
  t((await A('eventos', { method: 'POST', body: { nombre: 'Santo Domingo', fecha: dia(26), pais: 'República Dominicana', musicos: [] } })).s === 201, 'el bloqueo de España no bloquea otros países');
  r = await A('eventos', { method: 'POST', body: { nombre: 'Madrid', fecha: dia(26), pais: 'España', banda_id: bandaId, excepcion: true } });
  t(r.s === 201, 'el dueño autoriza la excepción');
  r = await A('disponibilidad', { method: 'POST', body: { fecha: dia(21), pais: 'República Dominicana', musicos: [musId] } });
  t(r.j.traslados.length === 1, 'avisa del traslado entre países en días seguidos', r.j);

  r = await K('eventos', { method: 'POST', body: { nombre: 'Boda Céspedes', fecha: dia(40), precio: '5000', moneda: 'USD', musicos: [] } }); const evK = r.j.id;
  t(r.s === 201, 'el booking crea su evento');
  t((await K('eventos/' + evK)).j.precio === 5000, 'el booking ve el monto de su evento');
  t((await K('eventos/' + ev1)).j.precio === null, 'el booking NO ve el monto de eventos ajenos');
  t((await K('eventos/' + ev1, { method: 'PUT', body: { nombre: 'Cambiado' } })).s === 403, 'el booking no edita eventos ajenos');
  t((await K('calendario?desde=' + dia(0) + '&hasta=' + dia(60))).j.eventos.find((e) => e.id === ev1).precio === null, 'en el calendario tampoco ve montos ajenos');

  r = await A('eventos/' + ev1 + '/contratos', { method: 'POST', body: { precio: '10000', moneda: 'USD', anticipo: '5000', condiciones: 'Dos tandas de 60 minutos.' } });
  t(r.s === 201 && r.j.version === 1, 'crea la versión 1 del contrato');
  r = await A('eventos/' + ev1 + '/contratos', { method: 'POST', body: { precio: '10500', moneda: 'USD', anticipo: '5000' } });
  t(r.j.version === 2, 'crea la versión 2 (la 1 queda anulada, no se borra)');
  r = await A('eventos/' + ev1); const v2 = r.j.contratos[0].id;
  t(r.j.contratos.length === 2 && r.j.contratos[1].estado === 'anulado' && r.j.precio === 10500, 'conserva el historial de versiones', r.j.contratos);
  t((await A('contratos/' + v2 + '/estado', { method: 'PUT', body: { estado: 'firmado' } })).s === 200 && (await A('eventos/' + ev1)).j.estado === 'confirmado', 'firmar el contrato confirma el evento');
  t((await A('contratos/' + v2 + '/estado', { method: 'PUT', body: { estado: 'enviado' } })).s === 409, 'un contrato firmado no se modifica');
  t((await K('contratos/' + v2)).s === 403, 'el booking no ve contratos ajenos');
  t((await A('contratos/' + v2)).j.datos.cliente.nombre === 'Hotel Jaragua', 'el contrato guarda la foto de los datos del cliente');

  r = await A('ensayos', { method: 'POST', body: { titulo: 'Ensayo general', fecha: dia(20), hora_inicio: '20:00', hora_fin: '22:00', banda_id: bandaId, lugar: 'Estudio', repertorio: [{ titulo: 'Medley', enlace: 'https://youtube.com/x' }], repetir_semanas: 3 } });
  const ens1 = r.j.ids[0]; t(r.s === 201 && r.j.ids.length === 3, 'crea 3 ensayos semanales en borrador');
  t(r.j.advertencias.length === 1 && r.j.advertencias[0].choques.length === 1, 'avisa que el primer ensayo choca con el festival', r.j.advertencias);
  t((await P('portal/agenda')).j.ensayos.length === 0, 'el músico no ve ensayos en borrador');
  r = await A('ensayos/' + ens1 + '/publicar', { method: 'POST', body: { serie: true } });
  t(r.s === 200 && r.j.publicados === 3 && r.j.aviso.whatsapp.length === 1, 'publica la serie y prepara el aviso por WhatsApp', r.j);
  r = await P('portal/agenda'); t(r.j.ensayos.length === 3 && r.j.ensayos[0].repertorio.length === 1 && r.j.eventos.some((e) => e.id === ev1), 'el músico ve sus ensayos con repertorio y su evento confirmado', r.j);
  t(r.j.eventos.every((e) => e.precio === undefined && e.precio_c === undefined), 'el músico no ve el precio del evento');
  t((await P(`portal/ensayos/${ens1}/responder`, { method: 'POST', body: { respuesta: 'no' } })).s === 400, 'para decir «No voy» pide el motivo');
  t((await P(`portal/ensayos/${ens1}/responder`, { method: 'POST', body: { respuesta: 'no', motivo: 'Estoy en Miami' } })).s === 200, 'el músico responde');
  r = await A('ensayos/' + ens1); t(r.j.citados[0].respuesta === 'no' && r.j.citados[0].motivo === 'Estoy en Miami', 'la oficina ve la respuesta y el motivo');
  t((await K('ensayos', { method: 'POST', body: { titulo: 'x', fecha: dia(3) } })).s === 403, 'el booking no crea ensayos');
  t((await A('ensayos/' + ens1 + '/cancelar', { method: 'POST' })).s === 200 && (await P('portal/agenda')).j.ensayos.find((e) => e.id === ens1).estado === 'cancelado', 'cancelar el ensayo se ve en el portal');

  t((await Bc('eventos/' + ev1)).s === 404 && (await Bc('contratos/' + v2)).s === 404 && (await Bc('ensayos/' + ens1)).s === 404, 'la empresa B no ve eventos, contratos ni ensayos de A');
  t((await Bc('calendario?desde=' + dia(0) + '&hasta=' + dia(60))).j.eventos.length === 0, 'el calendario de B está vacío');
  t((await Bc('eventos', { method: 'POST', body: { nombre: 'x', fecha: dia(5), cliente_id: cliId } })).s === 400, 'B no puede usar un cliente de A');

  titulo('Finanzas: cobros, multimoneda, nómina, comisiones y cuadre (Fase 3)');
  r = await A('eventos/' + ev1 + '/finanzas'); t(r.s === 200 && r.j.calculo.contratado === 10500 && r.j.calculo.moneda === 'USD', 'el cuadre parte del precio del contrato', r.j.calculo);
  t((await A('eventos/' + ev1 + '/movimientos', { method: 'POST', body: { tipo: 'ingreso', monto: '60150', moneda: 'DOP', receptor: 'empresa' } })).s === 400, 'no suma pesos a un evento en dólares sin tasa');
  r = await A('eventos/' + ev1 + '/movimientos', { method: 'POST', body: { tipo: 'ingreso', monto: '60150', moneda: 'DOP', tasa: '0.016625', tasa_fuente: 'Banco Popular', receptor: 'empresa', metodo: 'transferencia' } });
  t(r.s === 201, 'registra un cobro en DOP con su tasa');
  r = await A('eventos/' + ev1 + '/finanzas'); const mDop = r.j.movimientos.find((m) => m.moneda === 'DOP');
  t(mDop.monto === 60150 && mDop.tasa === 0.016625 && Math.abs(mDop.monto_evento - 1000) < 0.01 && mDop.tasa_fuente === 'Banco Popular', 'guarda moneda, importe original, tasa, fuente y el convertido', mDop);
  t((await A('tasas', { method: 'POST', body: { de: 'USD', a: 'DOP', tasa: '60.15', fuente: 'BCRD' } })).s === 201, 'registra una tasa de cambio');
  r = await A('eventos/' + ev1 + '/movimientos', { method: 'POST', body: { tipo: 'ingreso', monto: '5000', moneda: 'USD', receptor: 'booking', metodo: 'efectivo', entregado: false } }); const cobBk = r.j.id;
  r = await A('eventos/' + ev1 + '/finanzas'); t(Math.abs(r.j.calculo.cobrado - 6000) < 0.02 && r.j.calculo.por_entregar === 5000 && Math.abs(r.j.calculo.por_cobrar - 4500) < 0.02, 'separa contratado, cobrado, por cobrar y dinero sin entregar', r.j.calculo);
  t((await A('finanzas/resumen')).j.por_entregar.length === 1, 'el resumen muestra el dinero cobrado sin entregar');
  t((await A('movimientos/' + cobBk + '/confirmar', { method: 'PUT' })).s === 400, 'no se confirma dinero que no se ha entregado');
  t((await A('movimientos/' + cobBk + '/entregar', { method: 'PUT', body: { entregado_a: 'Rafael (artista)' } })).s === 200, 'el booking entrega el dinero');
  t((await A('movimientos/' + cobBk + '/confirmar', { method: 'PUT' })).s === 200, 'el artista confirma que llegó');
  t((await K('eventos/' + ev1 + '/finanzas')).s === 403, 'el booking no ve las finanzas de eventos ajenos');
  t((await K('eventos/' + evK + '/movimientos', { method: 'POST', body: { tipo: 'ingreso', monto: '1000', receptor: 'booking' } })).s === 201, 'el booking registra el anticipo de su evento');
  t((await A('eventos/' + ev1 + '/movimientos', { method: 'POST', body: { tipo: 'gasto', categoria: 'Vuelos y equipaje', monto: '800', cubierto_por: 'empresa' } })).s === 201, 'registra un gasto del evento');
  t((await A('eventos/' + ev1 + '/movimientos', { method: 'POST', body: { tipo: 'gasto', categoria: 'Dietas y alimentación', monto: '300', cubierto_por: 'cliente' } })).s === 201, 'registra un gasto que paga el cliente');
  t((await A('eventos/' + ev1 + '/nomina', { method: 'PUT', body: { items: [{ musico_id: musId, acordado: '300', moneda: 'DOP' }] } })).s === 400, 'pagar en otra moneda pide el acuerdo individual');
  t((await A('eventos/' + ev1 + '/nomina', { method: 'PUT', body: { items: [{ musico_id: musId, acordado: '300', moneda: 'USD' }] } })).s === 200, 'arma la nómina del evento');
  r = await A('eventos/' + ev1 + '/nomina/' + musId, { method: 'POST', body: { monto: '150', metodo: 'zelle', referencia: 'Z-1', adelanto: true } }); const pago1 = r.j.id;
  t(r.s === 201 && r.j.codigo.startsWith('PAG-'), 'registra un adelanto al músico');
  t((await A('eventos/' + ev1 + '/nomina/' + musId, { method: 'POST', body: { monto: '200' } })).s === 400, 'no deja pagar más de lo acordado');
  r = await A('eventos/' + ev1 + '/nomina'); t(r.j.items[0].pagado === 150 && r.j.items[0].pendiente === 150, 'la nómina muestra pagado y pendiente', r.j.items);
  r = await P('portal/pagos'); t(r.j[0].pendiente === 150 && r.j[0].pagos.length === 1, 'el músico ve lo acordado, lo pagado y lo pendiente', r.j);
  t((await P(`portal/pagos/${pago1}/confirmar`, { method: 'POST', body: {} })).s === 200, 'el músico confirma que recibió el pago');
  t((await P('/api/recibo/' + pago1)).s === 200 && (await K('/api/recibo/' + pago1)).s === 403, 'el recibo lo ve el músico, no el booking');
  r = await A('eventos/' + ev1 + '/comisiones', { method: 'POST', body: { beneficiario: 'Carlos Mejía', relacion: 'booking', modo: 'porcentaje', porcentaje: '5', base: 'contrato' } }); const com1 = r.j.id;
  t(r.s === 201 && (await A('eventos/' + ev1 + '/comisiones')).j[0].monto === 525, 'calcula la comisión del 5 % sobre el contrato');
  t((await A('comisiones/' + com1 + '/pagar', { method: 'POST', body: {} })).s === 409, 'no se paga una comisión sin aprobar');
  t((await A('comisiones/' + com1, { method: 'PUT', body: { estado: 'aprobada' } })).s === 200 && (await A('comisiones/' + com1 + '/pagar', { method: 'POST', body: { metodo: 'transferencia' } })).s === 200, 'aprueba y paga la comisión');
  r = await A('eventos/' + ev1 + '/cuadre'); const cal = r.j.calculo;
  t(cal.gastos_total === 800 && cal.gastos_cliente === 300 && cal.nomina_total === 300 && cal.comisiones_total === 525 && cal.resultado === 8875, 'el resultado = contratado − gastos − nómina − comisiones (lo que paga el cliente no resta)', cal);
  t((await K('eventos/' + ev1 + '/cuadre/enviar', { method: 'POST' })).s === 403, 'el booking no envía cuadres de eventos ajenos');
  t((await A('eventos/' + ev1 + '/cuadre/enviar', { method: 'POST' })).s === 200 && (await A('eventos/' + ev1)).j.estado === 'en_cuadre', 'envía el cuadre a revisión (v1)');
  await A('eventos/' + ev1 + '/movimientos', { method: 'POST', body: { tipo: 'gasto', categoria: 'Hospedaje', monto: '600' } });
  t((await A('eventos/' + ev1 + '/cuadre')).j.estado === 'abierto', 'si cambian los números después de enviarlo, vuelve a abierto');
  t((await A('eventos/' + ev1 + '/cuadre/aprobar', { method: 'POST' })).s === 409, 'no se aprueba algo que ya cambió');
  t((await A('eventos/' + ev1 + '/cuadre/enviar', { method: 'POST' })).j.version === 2, 'se envía otra vez (v2)');
  t((await A('eventos/' + ev1 + '/cuadre/devolver', { method: 'POST', body: {} })).s === 400, 'para devolver hay que escribir la observación');
  t((await A('eventos/' + ev1 + '/cuadre/revisar', { method: 'POST', body: { observacion: 'Todo cuadra' } })).s === 200, 'el manager lo revisa y lo pasa al artista');
  t((await K('eventos/' + ev1 + '/cuadre/aprobar', { method: 'POST' })).s === 403, 'el booking no aprueba cuadres');
  t((await A('eventos/' + ev1 + '/cuadre/aprobar', { method: 'POST' })).s === 200 && (await A('eventos/' + ev1)).j.estado === 'liquidado', 'el artista aprueba y el evento queda liquidado');
  t((await A('eventos/' + ev1 + '/movimientos', { method: 'POST', body: { tipo: 'gasto', monto: '10' } })).s === 409, 'un cuadre aprobado no acepta cambios');
  t((await A('movimientos/' + cobBk + '/anular', { method: 'POST', body: { motivo: 'x' } })).s === 409, 'ni anulaciones');
  r = await A('eventos/' + ev1 + '/cuadre'); t(r.j.versiones.length === 2 && r.j.versiones[0].decision === 'aprobado' && r.j.versiones[0].revisado_por_n && r.j.versiones[0].huella.length === 64, 'guarda quién revisó, quién aprobó y la huella de la versión aprobada', r.j.versiones[0]);
  t((await A('eventos/' + ev1 + '/cuadre/reabrir', { method: 'POST', body: { motivo: 'Faltó un recibo' } })).s === 200 && (await A('eventos/' + ev1 + '/cuadre')).j.versiones[0].decision === 'aprobado', 'reabrir no borra la versión aprobada');
  t((await A('movimientos', { method: 'POST', body: { categoria: 'Publicidad', monto: '120', moneda: 'USD', descripcion: 'Anuncios Instagram' } })).s === 201, 'registra un gasto general de la empresa');
  r = await A('finanzas/resumen'); t(r.j.por_moneda.USD && r.j.por_moneda.DOP && r.j.por_moneda.DOP.ingreso === 60150, 'el resumen separa cada moneda (no las suma)', r.j.por_moneda);
  t((await Bc('eventos/' + ev1 + '/finanzas')).s === 404 && (await Bc('/api/recibo/' + pago1)).s === 404 && (await Bc('finanzas/resumen')).j.por_entregar.length === 0, 'la empresa B no ve las finanzas de A');

  titulo('Giras y viajes: tramos, hoteles, itinerario y portal (Fase 4)');
  t((await K('viajes', { method: 'POST', body: { nombre: 'No debe' } })).s === 403 && (await K('viajes')).s === 200, 'el booking ve las giras pero no las crea');
  r = await A('viajes', { method: 'POST', body: { nombre: 'Gira Florida', desde: dia(19), hasta: dia(21), banda_id: bandaId, eventos: [ev1] } }); const gir = r.j.id;
  t(r.s === 201 && r.j.codigo === 'GIR-00001', 'crea la gira con código correlativo', r.j);
  r = await A('viajes/' + gir); t(r.j.eventos.length === 1 && r.j.personas.length === 1 && r.j.personas[0].musico_id === musId, 'la delegación sale del equipo de los eventos', r.j);
  t((await A('tramos', { method: 'POST', body: { viaje_id: gir, tipo: 'vuelo', sale_fecha: dia(19), sale_hora: '10:00', llega_fecha: dia(18) } })).s === 400, 'no deja una llegada antes de la salida');
  r = await A('archivos', { method: 'POST', body: { tipo: 'documento', datos: PNG } }); const boleto = r.j.clave;
  r = await A('tramos', { method: 'POST', body: { viaje_id: gir, evento_id: ev1, tipo: 'vuelo', sale_fecha: dia(19), sale_hora: '10:00', sale_tz: 'America/Santo_Domingo', llega_hora: '12:00', llega_tz: 'America/Panama',
    origen: 'SDQ', origen_ciudad: 'Santo Domingo', origen_pais: 'República Dominicana', destino: 'MIA', destino_ciudad: 'Miami', destino_pais: 'Estados Unidos', compania: 'JetBlue', numero: 'B6 1234', reserva: 'XK9P2L',
    contacto_privado: 'Agente: Laura 809-555-0100', costo: '450', moneda: 'USD', cubierto_por: 'empresa', pasajeros: [{ musico_id: musId, asiento: '14C', archivo: boleto }] } }); const vue = r.j.id;
  t(r.s === 201, 'registra el vuelo con su pasajero, asiento y boleto');
  r = await A('hoteles', { method: 'POST', body: { viaje_id: gir, nombre: 'Hotel Riviera', ciudad: 'Miami', pais: 'Estados Unidos', entrada: dia(19), entrada_hora: '15:00', salida: dia(21), salida_hora: '11:00', reserva: 'H-7781', huespedes: [{ musico_id: musId, habitacion: '1204' }] } });
  t(r.s === 201, 'registra el hotel con el huésped y su habitación');
  await A('actividades', { method: 'POST', body: { viaje_id: gir, fecha: dia(20), hora: '13:00', titulo: 'Entrevista en radio', lugar: 'Mega 106.9' } });
  r = await A('actividades', { method: 'POST', body: { viaje_id: gir, fecha: dia(20), hora: '09:00', titulo: 'Pagar al promotor', para: 'oficina' } }); const actOf = r.j.id;
  r = await A('viajes/' + gir); const tv = r.j.itinerario.flatMap((x) => x.items).find((i) => i.tipo === 'tramo');
  t(tv && tv.duracion === 180 && tv.costo === 450 && tv.contacto_privado, 'el itinerario de la oficina calcula la duración con zonas horarias y muestra costo y contacto privado', tv);
  t(r.j.itinerario.length >= 3 && r.j.itinerario[0].items[0].tipo === 'tramo', 'el itinerario se ordena por día y hora');
  t(r.j.alertas.some((a) => a.tipo === 'pasaporte_6m' && a.musico_id === musId), 'avisa que el pasaporte vence a menos de 6 meses del viaje', r.j.alertas);
  t(!r.j.alertas.some((a) => a.tipo === 'sin_visa'), 'no pide visa si el músico ya la tiene para ese país');
  r = await P('portal/itinerario'); t(r.s === 200 && !r.j.dias.flatMap((x) => x.items).some((i) => i.tipo === 'tramo'), 'el músico no ve la gira antes de publicarla');
  t((await K('viajes/' + gir + '/publicar', { method: 'POST' })).s === 403, 'el booking no publica giras');
  r = await A('viajes/' + gir + '/publicar', { method: 'POST' }); t(r.s === 200 && r.j.delegacion === 1 && r.j.whatsapp.length === 1, 'publica la gira y prepara el WhatsApp para la delegación', r.j);
  r = await P('portal/itinerario'); const its = r.j.dias.flatMap((x) => x.items), mt = its.find((i) => i.tipo === 'tramo'), mh = its.find((i) => i.tipo === 'hotel_entrada');
  t(mt && mt.asiento === '14C' && mt.reserva === 'XK9P2L' && mh && mh.habitacion === '1204', 'el músico ve su vuelo, asiento, reserva y habitación', its);
  t(mt && mt.costo === undefined && mt.contacto_privado === undefined && typeof mt.personas === 'number', 'el músico no ve costos, contactos privados ni la lista de pasajeros');
  t(its.some((i) => i.titulo === 'Entrevista en radio') && !its.some((i) => i.titulo === 'Pagar al promotor'), 'lo marcado «solo oficina» no le llega al músico');
  t((await P(mt.archivo_url)).s === 200 && (await Bc(mt.archivo_url)).s === 404, 'el pasajero abre su boleto; otra empresa no');
  t((await A('tramos/' + vue, { method: 'PUT', body: { sale_hora: '11:30', llega_hora: '13:30' } })).s === 200, 'cambia la hora del vuelo');
  r = await A('viajes/' + gir); t(r.j.cambios_sin_avisar === 1 && r.j.cambios[0].detalle.includes('11:30') && r.j.personas.length === 1, 'después de publicar, el cambio queda anotado para avisar', r.j.cambios);
  r = await A('viajes/' + gir); t(r.j.itinerario.flatMap((x) => x.items).find((i) => i.tipo === 'tramo').pasajeros === undefined && r.j.itinerario.flatMap((x) => x.items).find((i) => i.tipo === 'tramo').personas.length === 1, 'editar solo la hora conserva los pasajeros');
  r = await A('viajes/' + gir + '/publicar', { method: 'POST' }); t(r.j.cambios === 1 && (await A('viajes/' + gir)).j.cambios_sin_avisar === 0, 'avisa los cambios a la delegación');
  r = await A('eventos/' + ev1 + '/movimientos', { method: 'POST', body: { tipo: 'gasto', categoria: 'Vuelos y equipaje', monto: '450', moneda: 'USD', cubierto_por: 'empresa' } });
  t((await A('tramos/' + vue, { method: 'PUT', body: { movimiento_id: r.j.id } })).s === 200 && (await A('tramos/' + vue, { method: 'PUT', body: { movimiento_id: 999999 } })).s === 400, 'enlaza el vuelo con su gasto del evento (y rechaza uno ajeno)');
  r = await A('eventos/' + ev1 + '/logistica'); t(r.s === 200 && r.j.viaje_id === gir && r.j.dias.flatMap((x) => x.items).some((i) => i.tipo === 'tramo'), 'el expediente del evento muestra su logística');
  r = await A(`calendario?desde=${dia(18)}&hasta=${dia(22)}`); t(r.j.viajes.length === 1 && r.j.viajes[0].numero === 'B6 1234', 'el calendario muestra los vuelos');
  t((await A('itinerario?desde=' + dia(18) + '&hasta=' + dia(22))).j.dias.length >= 3, 'el itinerario consolidado junta todas las giras');
  t((await A('actividades/' + actOf, { method: 'DELETE' })).s === 200, 'quita una actividad');
  t((await Bc('viajes/' + gir)).s === 404 && (await Bc('tramos', { method: 'POST', body: { viaje_id: gir, sale_fecha: dia(19) } })).s === 400 && (await Bc('viajes')).j.length === 0, 'la empresa B no ve ni toca las giras de A');

  titulo('Rider técnico, plano del escenario y portal del sonidista (Fase 5)');
  t((await K('riders', { method: 'POST', body: { nombre: 'No debe' } })).s === 403 && (await K('riders')).s === 200, 'el booking ve los riders pero no los crea');
  r = await A('riders', { method: 'POST', body: { nombre: 'Rider RD', alcance: 'rd', banda_id: bandaId } }); const rid = r.j.id;
  t(r.s === 201 && r.j.codigo === 'RID-00001', 'crea el rider con código correlativo');
  r = await A('riders/' + rid); t(r.j.datos.canales.length === 7 && r.j.datos.plot.length > 3 && r.j.version === 0, 'empieza con la plantilla (plano y lista de canales)', r.j);
  const dat = r.j.datos;
  dat.plot.push({ id: 'zz', tipo: 'nave_espacial', x: 1, y: 1 }, { id: 'x1', tipo: 'amp_guitarra', x: 999, y: -5, rot: 45, etiqueta: '<b>Guitarra</b>' });
  dat.canales.push({ n: 8, fuente: 'Guitarra', mic: 'SM57', soporte: 'bajo', phantom: 'si' });
  t((await A('riders/' + rid, { method: 'PUT', body: { datos: dat } })).s === 200, 'guarda el borrador del editor');
  r = await A('riders/' + rid); const g = r.j.datos.plot.find((p) => p.id === 'x1');
  t(!r.j.datos.plot.some((p) => p.tipo === 'nave_espacial') && g.x === 10 && g.y === 0 && r.j.datos.canales.length === 8 && r.j.datos.canales[7].phantom === true, 'limpia lo que llega: tipos conocidos y posiciones dentro del escenario', g);
  t((await A('riders/' + rid, { method: 'PUT', body: { estado: 'vigente' } })).s === 409, 'no se marca vigente sin una versión guardada');
  t((await A('riders/' + rid + '/version', { method: 'POST', body: {} })).s === 400, 'guardar una versión pide escribir qué cambió');
  r = await A('riders/' + rid + '/version', { method: 'POST', body: { cambios: 'Primera versión' } }); t(r.s === 200 && r.j.version === 1 && r.j.huella.length === 64, 'guarda la versión 1 con su huella');
  t((await A('riders/' + rid + '/version', { method: 'POST', body: { cambios: 'Nada' } })).s === 409, 'no crea versiones sin cambios');
  r = await A('riders/' + rid); t(r.j.estado === 'vigente' && r.j.versiones.length === 1 && r.j.versiones[0].por, 'la versión queda vigente con fecha y autor');
  dat.canales.push({ n: 9, fuente: 'Güira', mic: 'SM57', soporte: 'alto' });
  await A('riders/' + rid, { method: 'PUT', body: { datos: dat } });
  r = await A('riders/' + rid + '/version', { method: 'POST', body: { cambios: 'Agregué la güira' } }); t(r.j.version === 2, 'guarda la versión 2');
  r = await A('riders/' + rid + '/versiones/1'); t(r.s === 200 && r.j.datos.canales.length === 8, 'la versión 1 sigue igual (no se pisa)');
  t((await K('riders/' + rid + '/versiones/2?imprimir=1')).s === 200, 'el booking puede descargar el PDF');
  t(sql("SELECT COUNT(*) n FROM auditoria WHERE accion = 'rider_descargado'")[0].n === 1, 'cada descarga queda en la bitácora');
  r = await A('riders', { method: 'POST', body: { nombre: 'Rider Festival Miami', alcance: 'evento', evento_id: ev1, copiar_de: rid } }); const ridEv = r.j.id;
  r = await A('riders/' + ridEv); t(r.j.datos.canales.length === 9 && r.j.base_id === rid, 'copia un rider para un evento (desde la última versión)');
  r = await A('eventos/' + ev1 + '/tecnico'); t(r.j.rider && r.j.rider.id === ridEv, 'el rider personalizado queda asignado a su evento', r.j);
  t((await A('eventos/' + ev1 + '/tecnico', { method: 'PUT', body: { sonido_email: 'malo' } })).s === 400, 'valida el correo del proveedor de sonido');
  t((await A('eventos/' + ev1 + '/tecnico', { method: 'PUT', body: { rider_id: rid, sonido_proveedor: 'Miami Pro Audio', sonido_tecnico: 'Mike R.', sonido_telefono: '3055550199', sonido_email: 'mike@proaudio.local', escenario_info: '12 × 8 m, techado' } })).s === 200, 'asigna el rider y los datos del proveedor de sonido');
  r = await A('musicos', { method: 'POST', body: { nombre: 'Ramón Sonido', tipo: 'sonidista', email: 'ramon@bandgo.local', bandas: [bandaId] } }); const sonId = r.j.id;
  await A('eventos/' + ev1 + '/equipo', { method: 'PUT', body: { musicos: [{ id: musId }, { id: sonId }], excepcion: true } });
  r = await A(`musicos/${sonId}/invitar`, { method: 'POST' });
  const SN = cliente(); await SN('invitacion/' + r.j.enlace.split('/').pop(), { method: 'POST', body: { nombre: 'Ramón', password: CLAVE } });
  t((await SN('me')).j.rol === 'sonidista', 'el sonidista entra a su portal');
  r = await SN('portal/tecnico'); const te = r.j.find((e) => e.id === ev1);
  t(te && te.rider_id === rid && te.rider_version === 2 && te.sonido_tecnico === 'Mike R.' && te.precio === undefined && te.precio_c === undefined, 've sus eventos con horarios, contactos de sonido y el rider (sin montos)', r.j);
  r = await SN('portal/rider/' + ev1); t(r.s === 200 && r.j.version === 2 && r.j.datos.canales.length === 9, 've la última versión del rider asignado');
  dat.canales.push({ n: 10, fuente: 'Borrador', mic: '' }); await A('riders/' + rid, { method: 'PUT', body: { datos: dat } });
  t((await SN('portal/rider/' + ev1)).j.datos.canales.length === 9, 'el sonidista no ve el borrador, solo lo guardado como versión');
  t((await P('portal/tecnico')).s === 403 && (await SN('riders')).s === 403, 'el músico no entra a la sección técnica y el sonidista no ve la lista de riders');
  t((await SN('portal/rider/' + evK)).s === 404, 'no ve riders de eventos donde no está');
  t((await Bc('riders/' + rid)).s === 404 && (await Bc('riders')).j.length === 0 && (await Bc('eventos/' + ev1 + '/tecnico')).s === 404, 'la empresa B no ve los riders de A');

  titulo('Reportes y presupuesto (Fase 6)');
  t((await K('reportes')).s === 403 && (await K('reportes/ventas')).s === 403, 'el booking no ve los reportes (permiso reportes.ver)');
  r = await A('reportes'); t(r.s === 200 && Object.keys(r.j.reportes).length === 7 && r.j.exportar === true, 'catálogo de reportes y filtros');
  const rango = `desde=${dia(-400)}&hasta=${dia(400)}`;
  r = await A(`reportes/ventas?${rango}&agrupar=anio`);
  const evDb = sql(`SELECT moneda, SUM(precio_c) c, COUNT(*) n FROM eventos WHERE empresa_id = (SELECT empresa_id FROM eventos WHERE id = ${ev1}) AND estado != 'cancelado' GROUP BY moneda`);
  t(evDb.every((x) => { const tt = r.j.totales.find((y) => y.moneda === x.moneda); return tt && Math.abs(tt.contratado - x.c / 100) < 0.01 && tt.eventos === x.n; }), 'ventas cuadran con los eventos de origen, por moneda', { tot: r.j.totales, evDb });
  t(new Set(r.j.totales.map((x) => x.moneda)).size === r.j.totales.length && /no se suman/.test(r.j.criterio), 'cada moneda va por separado');
  r = await A(`reportes/ventas?${rango}&agrupar=mes&banda=${bandaId}&tipo=privado`); t(r.s === 200 && r.j.grafico && r.j.filas.every((f) => f.grupo), 'ventas por mes con filtros de banda y tipo');
  r = await A(`reportes/rentabilidad?${rango}&agrupar=evento&evento=${ev1}`); const cu = await A('eventos/' + ev1 + '/cuadre');
  t(r.j.filas.length === 1 && Math.abs(r.j.filas[0].resultado - cu.j.calculo.resultado) < 0.01, 'la rentabilidad del evento es la misma del cuadre', { rep: r.j.filas[0], cu: cu.j.calculo.resultado });
  r = await A(`reportes/gastos?${rango}&agrupar=clase`); t(r.s === 200 && r.j.filas.some((f) => f.grupo === 'Nómina de músicos'), 'gastos incluyen nómina pagada y gastos generales');
  const gDb = sql(`SELECT moneda, SUM(monto_c) c FROM movimientos WHERE empresa_id = (SELECT empresa_id FROM eventos WHERE id = ${ev1}) AND anulado = 0 AND tipo IN ('gasto','nomina','comision') AND NOT (tipo = 'gasto' AND IFNULL(cubierto_por,'') = 'cliente') GROUP BY moneda`);
  t(gDb.every((x) => Math.abs(r.j.totales.find((y) => y.moneda === x.moneda).total - x.c / 100) < 0.01), 'los gastos cuadran con los movimientos (sin lo que pagó el cliente)', { tot: r.j.totales, gDb });
  r = await A(`reportes/pagos?${rango}&agrupar=musico`); t(r.s === 200 && r.j.filas.length >= 1 && r.j.filas[0].pagos >= 1, 'pagos por músico');
  r = await A(`reportes/pagos?${rango}&agrupar=pendientes`); t(r.s === 200 && r.j.filas.every((f) => f.pendiente > 0), 'pagos pendientes y parciales');
  r = await A(`reportes/cobros?${rango}&agrupar=antiguedad`); t(r.s === 200 && r.j.columnas.some((c) => c.k === 'por_cobrar'), 'cuentas por cobrar por antigüedad');
  r = await A(`reportes/control?${rango}`); t(r.s === 200 && r.j.filas.some((f) => /Sin comprobante|Anulado/.test(f.problema)), 'control de comprobantes y entregas');
  await A('tasas', { method: 'POST', body: { de: 'DOP', a: 'USD', tasa: '0.0166', fecha: dia(-400) } });
  r = await A(`reportes/ventas?${rango}&agrupar=anio&consolidar=1`); t(r.j.consolidado && r.j.consolidado.moneda === 'USD' && r.j.consolidado.contratado > 0 && /Consolidado en USD/.test(r.j.criterio) && (r.j.totales.every((x) => x.moneda === 'USD') || r.j.tasas_usadas.length >= 1), 'consolida en la moneda base y muestra la tasa usada', r.j.consolidado);
  r = await A(`reportes/ventas?${rango}&formato=xlsx`); t(r.s === 200 && r.j._tipo.includes('spreadsheetml') && r.j._bytes > 1500, 'exporta a Excel (.xlsx)', r.j);
  t((await K(`reportes/ventas?formato=xlsx`)).s === 403, 'sin permiso no exporta');
  t(sql("SELECT COUNT(*) n FROM auditoria WHERE accion = 'reporte_exportado'")[0].n === 1, 'cada exportación queda en la bitácora');
  t((await A(`reportes/ventas?desde=${dia(5)}&hasta=${dia(1)}`)).s === 400 && (await A('reportes/nada')).s === 404, 'valida fechas y nombres de reporte');
  t((await A('eventos/' + ev1 + '/presupuesto', { method: 'PUT', body: { nomina: '30000', comisiones: '500', viajes: '1200', otros: '0', notas: 'Estimado antes de confirmar' } })).s === 200, 'guarda el presupuesto estimado del evento');
  r = await A('eventos/' + ev1 + '/presupuesto'); t(r.j.presupuesto.nomina === 30000 && r.j.real && typeof r.j.real.resultado === 'number', 'compara presupuesto con lo real');
  r = await A(`reportes/presupuesto?${rango}`); t(r.j.filas.length === 1 && r.j.filas[0].est_nomina === 30000 && typeof r.j.filas[0].diferencia === 'number', 'reporte de presupuesto frente a resultado real');
  r = await Bc(`reportes/ventas?${rango}`); t(r.s === 200 && r.j.filas.length === 0, 'la empresa B no ve las cifras de A');
  t((await Bc('eventos/' + ev1 + '/presupuesto')).s === 404, 'ni su presupuesto');

  titulo('Comunicados y chat (Fase 7)');
  const uA = (await A('me')).j.usuario.id, uK = (await K('me')).j.usuario.id;
  t((await K('comunicados')).s === 200 && (await K('comunicados', { method: 'POST', body: { titulo: 'x', cuerpo: 'y' } })).s === 403, 'el booking ve los comunicados pero no los envía');
  t((await A('comunicados', { method: 'POST', body: { titulo: '', cuerpo: 'y' } })).s === 400 && (await A('comunicados', { method: 'POST', body: { titulo: 'x', cuerpo: 'y', alcance: 'banda' } })).s === 400, 'valida título y grupo');
  r = await A('comunicados', { method: 'POST', body: { titulo: 'Cambio de uniforme', cuerpo: 'Para la gala: camisa negra y pantalón negro.', alcance: 'banda', alcance_id: bandaId, requiere_acuse: true, importancia: 'urgente' } }); const comA = r.j.id;
  const enBanda = sql(`SELECT COUNT(*) n FROM banda_miembros x JOIN musicos m ON m.id = x.musico_id WHERE x.banda_id = ${bandaId} AND m.activo = 1`)[0].n;
  t(r.s === 201 && r.j.destinatarios === enBanda && Array.isArray(r.j.whatsapp), 'envía el comunicado a los integrantes activos de la banda', r.j);
  r = await P('mensajes/pendientes'); t(r.j.avisos >= 1 && r.j.acuses >= 1, 'el músico ve el aviso pendiente en su insignia', r.j);
  r = await P('portal/avisos'); t(r.j.some((c) => c.id === comA && c.importancia === 'urgente' && !c.leido_en), 'el aviso aparece en su portal');
  t((await P(`portal/avisos/${comA}/enterado`, { method: 'POST' })).s === 200, 'el músico confirma «Enterado»');
  r = await A('comunicados/' + comA); const dP = r.j.destinatarios.find((x) => x.musico_id === musId);
  t(dP && dP.leido_en && dP.acuse_en, 'la oficina ve quién leyó y quién confirmó');
  r = await A(`comunicados/${comA}/recordar`, { method: 'POST' }); t(r.s === 200 && r.j.pendientes === enBanda - 1, 'recordar va solo a los que faltan', r.j);
  t((await A('comunicados', { method: 'POST', body: { titulo: 'x', cuerpo: 'y', alcance: 'personas', personas: [999999] } })).s === 400, 'no envía a personas de otra empresa');
  t((await A(`comunicados/${comA}/retirar`, { method: 'POST' })).s === 200 && !(await P('portal/avisos')).j.some((c) => c.id === comA), 'un comunicado retirado deja de verse en el portal');
  t((await Bc('comunicados')).j.length === 0 && (await Bc('comunicados/' + comA)).s === 404, 'la empresa B no ve los comunicados de A');

  r = await P('chat/canales'); const cb = r.j.find((c) => c.tipo === 'banda' && c.ref_id === bandaId);
  t(cb, 'cada banda tiene su conversación y el músico la ve', r.j);
  r = await A(`chat/canales/${cb.id}/mensajes`, { method: 'POST', body: { texto: 'Ensayo general el jueves a las 7' } }); const m1 = r.j.id;
  t(r.s === 201 && r.j.mio && r.j.texto.includes('jueves'), 'la oficina escribe en la conversación de la banda');
  t((await P('mensajes/pendientes')).j.chat >= 1, 'el músico ve el mensaje sin leer');
  r = await P(`chat/canales/${cb.id}/mensajes`); t(r.j.mensajes.some((m) => m.id === m1) && r.j.canal.escribir && Array.isArray(r.j.miembros), 'abre la conversación');
  t((await P('mensajes/pendientes')).j.chat === 0, 'al abrirla queda leída');
  r = await P(`chat/canales/${cb.id}/mensajes`, { method: 'POST', body: { texto: 'Confirmado, ahí estaré', responde_a: m1 } }); const m2 = r.j.id;
  t(r.s === 201 && r.j.responde_a && r.j.responde_a.id === m1, 'el músico responde citando el mensaje');
  r = await A(`chat/canales/${cb.id}/mensajes?despues=${m1}`); t(r.j.mensajes.some((m) => m.id === m2), 'la oficina recibe lo nuevo consultando desde el último');
  t((await P('chat/mensajes/' + m2, { method: 'PUT', body: { texto: 'Confirmado, ahí estaré a las 6:45' } })).s === 200 && (await P('chat/mensajes/' + m1, { method: 'PUT', body: { texto: 'x' } })).s === 403, 'cada quien edita solo sus mensajes');
  t((await P('chat/mensajes/' + m1, { method: 'DELETE' })).s === 403, 'el músico no borra mensajes ajenos');
  t((await A('chat/mensajes/' + m2, { method: 'DELETE' })).s === 200, 'la oficina puede ocultar un mensaje');
  r = await P(`chat/canales/${cb.id}/mensajes`); const mb = r.j.mensajes.find((m) => m.id === m2); t(mb.borrado && mb.texto === null, 'el mensaje oculto aparece como eliminado, sin el texto');
  t(sql("SELECT COUNT(*) n FROM auditoria WHERE accion = 'chat_mensaje_moderado'")[0].n === 1, 'ocultar un mensaje ajeno queda en la bitácora');
  t((await A(`chat/canales/${cb.id}`, { method: 'PUT', body: { solo_oficina: true } })).s === 200 && (await P(`chat/canales/${cb.id}/mensajes`, { method: 'POST', body: { texto: 'hola' } })).s === 403, 'en un canal de anuncios solo escribe la oficina');
  await A(`chat/canales/${cb.id}`, { method: 'PUT', body: { solo_oficina: false } });
  r = await P('archivos', { method: 'POST', body: { tipo: 'adjunto', datos: PNG } }); const adj = r.j.clave;
  r = await P(`chat/canales/${cb.id}/mensajes`, { method: 'POST', body: { texto: 'Foto del uniforme', archivo: adj } });
  t(r.s === 201 && r.j.archivo_url, 'envía una foto en el chat');
  t((await SN(r.j.archivo_url)).s === 200 && (await Bc(r.j.archivo_url)).s === 404, 'la ve otro integrante de la banda; otra empresa no');
  t((await A(`chat/canales/${cb.id}/mensajes`, { method: 'POST', body: { texto: 'reuso', archivo: adj } })).s === 400, 'no se puede reusar el archivo de otra persona');
  r = await A('chat/canales', { method: 'POST', body: { tipo: 'evento', ref_id: ev1 } }); const ce = r.j.id;
  t(r.s === 200 && (await A('chat/canales', { method: 'POST', body: { tipo: 'evento', ref_id: ev1 } })).j.id === ce, 'la conversación del evento se crea una sola vez');
  t((await SN('chat/canales')).j.some((c) => c.id === ce), 'el equipo del evento la ve');
  r = await P('chat/contactos'); t(r.j.length >= 1 && r.j.every((u) => ['dueno', 'admin', 'manager', 'booking'].includes(u.rol)), 'desde el portal se puede escribir solo a la oficina');
  const uSN = (await SN('me')).j.usuario.id;
  t((await P('chat/canales', { method: 'POST', body: { tipo: 'directo', usuario_id: uSN } })).s === 403, 'un músico no abre directos con otro músico');
  r = await P('chat/canales', { method: 'POST', body: { tipo: 'directo', usuario_id: uA } }); const cd = r.j.id;
  t(r.s === 200 && (await A('chat/canales', { method: 'POST', body: { tipo: 'directo', usuario_id: (await P('me')).j.usuario.id } })).j.id === cd, 'el chat directo es uno solo para las dos personas');
  await P(`chat/canales/${cd}/mensajes`, { method: 'POST', body: { texto: '¿Cuándo pagan la gala?' } });
  t((await SN(`chat/canales/${cd}/mensajes`)).s === 404 && (await K(`chat/canales/${cd}/mensajes`)).s === 404, 'nadie más entra a un chat directo');
  r = await A('chat/canales', { method: 'POST', body: { tipo: 'grupo', nombre: 'Logística', usuarios: [uK] } });
  t(r.s === 201 && (await K('chat/canales')).j.some((c) => c.id === r.j.id) && !(await P('chat/canales')).j.some((c) => c.id === r.j.id), 'los grupos los ven solo sus miembros');
  t((await Bc(`chat/canales/${cb.id}/mensajes`)).s === 404 && !(await Bc('chat/canales')).j.some((c) => c.id === cb.id), 'la empresa B no ve las conversaciones de A');

  titulo('Mejoras: varias funciones, nómina con extras, direcciones, estudios, portal del cliente');
  // un manager que también toca: se enlaza su usuario de oficina al integrante (sin bajarle el acceso)
  r = await A('usuarios', { method: 'POST', body: { email: 'mario.manager@bandgo.local', nombre: 'Mario Manager', rol: 'manager' } });
  const MG = cliente(); await MG('invitacion/' + r.j.enlace.split('/').pop(), { method: 'POST', body: { nombre: 'Mario Manager', password: CLAVE } });
  t((await MG('me')).j.rol === 'manager', 'entra el manager');
  r = await A('musicos', { method: 'POST', body: { nombre: 'Mario Manager', instrumento: 'Trompeta', email: 'mario.manager@bandgo.local', tarifa: '3000', bandas: [bandaId] } }); const mgMus = r.j.id;
  r = await A(`musicos/${mgMus}/invitar`, { method: 'POST' }); t(r.s === 200 && r.j.enlazado === true, 'si el correo es de la oficina, el integrante se enlaza sin invitación');
  r = await MG('me'); t(r.j.rol === 'manager' && r.j.mi_musico && r.j.mi_musico.id === mgMus, 'sigue siendo manager y además tiene su perfil de músico', r.j);
  const uMG = r.j.usuario.id;
  // funciones con pago: manager por porcentaje, dirección musical fija, booking fijo de un usuario que no toca
  t((await K('funciones', { method: 'POST', body: { funcion: 'manager', musico_id: mgMus, modo: 'porcentaje', porcentaje: '10' } })).s === 403, 'el booking no define pagos de funciones');
  t((await A('funciones', { method: 'POST', body: { funcion: 'manager', musico_id: mgMus, modo: 'porcentaje', porcentaje: '150' } })).s === 400, 'valida el porcentaje');
  r = await A('funciones', { method: 'POST', body: { funcion: 'manager', musico_id: mgMus, modo: 'porcentaje', porcentaje: '10', base: 'contrato', banda_id: bandaId } }); t(r.s === 201, 'el manager cobra 10 % del contrato');
  r = await A('funciones', { method: 'POST', body: { funcion: 'direccion', musico_id: mgMus, modo: 'fijo', monto: '1500', moneda: 'USD', aplica: 'toca' } }); t(r.s === 201, 'y 1,500 fijos por dirección musical cuando toca');
  r = await A('funciones', { method: 'POST', body: { funcion: 'booking', usuario_id: uK, modo: 'fijo', monto: '500', moneda: 'USD', aplica: 'propios' } }); t(r.s === 201, 'el booking cobra 500 fijos en sus eventos');
  // gastos guardados
  r = await A('gastos-guardados', { method: 'POST', body: { nombre: 'Transporte guagua', categoria: 'Transporte terrestre y combustible', monto: '400', moneda: 'USD', siempre: true } }); const gTr = r.j.id; t(r.s === 201, 'guarda el gasto «Transporte» con su precio');
  // evento en EE. UU. con dirección por partes
  t((await A('eventos', { method: 'POST', body: { nombre: 'Malo', fecha: dia(60), pais: 'Estados Unidos', estado_us: 'XX', banda_id: bandaId } })).s === 400, 'en EE. UU. pide un estado válido');
  t((await A('eventos', { method: 'POST', body: { nombre: 'Malo', fecha: dia(60), pais: 'Estados Unidos', estado_us: 'FL', codigo_postal: '33' } })).s === 400, 'y un ZIP de 5 números');
  r = await A('clientes', { method: 'POST', body: { nombre: 'Club Mango', lugar: 'Mango Club', pais: 'Estados Unidos', ciudad: 'Orlando', direccion: '1600 International Dr', estado_us: 'FL', codigo_postal: '32819', email: 'mango@club.local' } }); const cMango = r.j.id;
  t(r.s === 201 && (await A('clientes/' + cMango)).j.estado_us === 'FL', 'el cliente guarda su dirección de EE. UU. y el nombre del local');
  r = await A('eventos', { method: 'POST', body: { nombre: 'Noche en Mango', fecha: dia(62), pais: 'Estados Unidos', ciudad: 'Orlando', lugar: 'Mango Club', direccion: '1600 International Dr', estado_us: 'fl', codigo_postal: '32819', hora_show: '22:00', hora_fin: '01:00', banda_id: bandaId, cliente_id: cMango, booking_id: uK, precio: '10000', moneda: 'USD', tipo: 'privado', excepcion: true } });
  const evM = r.j.id; t(r.s === 201, 'crea el evento con calle, ciudad, estado y ZIP', r.j);
  r = await A('eventos/' + evM); t(r.j.estado_us === 'FL' && r.j.codigo_postal === '32819', 'guarda el estado en mayúsculas y el ZIP');
  r = await A('eventos', { method: 'POST', body: { nombre: 'En RD', fecha: dia(63), pais: 'República Dominicana', direccion: 'Av. Winston Churchill 10, Piantini, Santo Domingo', estado_us: 'FL', excepcion: true } });
  t((await A('eventos/' + r.j.id)).j.estado_us === null, 'fuera de EE. UU. la dirección va corrida (sin estado ni ZIP)');
  await A('eventos/' + evM + '/equipo', { method: 'PUT', body: { musicos: [{ id: musId }, { id: mgMus }], excepcion: true } });
  // armar la nómina: equipo + dirección musical (fijo al músico) + transporte (siempre) + comisiones del manager (10 %) y del booking (fijo)
  r = await A(`eventos/${evM}/nomina/armar`, { method: 'POST' }); t(r.s === 200 && r.j.conceptos === 2 && r.j.comisiones === 2, 'arma la nómina con funciones, gastos guardados y comisiones', r.j);
  t((await A(`eventos/${evM}/nomina/armar`, { method: 'POST' })).j.comisiones === 0, 'armar otra vez no repite nada');
  r = await A(`eventos/${evM}/nomina`); const itMg = r.j.items.find((x) => x.musico_id === mgMus);
  t(itMg && itMg.acordado === 3000 && itMg.extras === 1500 && itMg.neto === 4500, 'el manager cobra como músico y su dirección musical aparte', itMg);
  const trans = r.j.conceptos.find((k) => k.gasto_id === gTr); t(trans && trans.monto === 400 && !trans.musico_id, 'el transporte guardado entra a la nómina con su precio');
  r = await A(`eventos/${evM}/comisiones`); t(r.j.some((c) => c.funcion_id && c.monto === 1000 && /Manager/.test(c.beneficiario)) && r.j.some((c) => c.monto === 500 && c.relacion === 'booking'), 'las comisiones van separadas: 10 % del manager y el fijo del booking', r.j);
  // cambiar el transporte, agregar combustible a un músico y borrar un renglón
  const N0 = (await A(`eventos/${evM}/nomina`)).j;
  const items = N0.items.map((x) => ({ musico_id: x.musico_id, acordado: x.acordado, moneda: x.moneda }));
  let conc = N0.conceptos.map((k) => ({ id: k.id, musico_id: k.musico_id, concepto: k.concepto, categoria: k.categoria, monto: k.monto, moneda: k.moneda, funcion_id: k.funcion_id, gasto_id: k.gasto_id }));
  conc = conc.map((k) => (k.gasto_id === gTr ? { ...k, monto: 450 } : k));
  conc.push({ musico_id: musId, concepto: 'Combustible', categoria: 'Transporte terrestre y combustible', monto: 60 }, { concepto: 'Peaje', categoria: 'Transporte terrestre y combustible', monto: 25, moneda: 'USD' });
  t((await A(`eventos/${evM}/nomina`, { method: 'PUT', body: { items, conceptos: conc } })).s === 200, 'guarda la nómina con renglones cambiados y nuevos');
  r = await A(`eventos/${evM}/nomina`);
  t(r.j.conceptos.find((k) => k.gasto_id === gTr).monto === 450 && r.j.items.find((x) => x.musico_id === musId).extras === 60, 'el precio del transporte cambió solo en esta nómina y el combustible se suma al músico');
  t((await A('gastos-guardados')).j.gastos.find((g) => g.id === gTr).monto === 400, 'el gasto guardado conserva su precio original');
  const peaje = r.j.conceptos.find((k) => k.concepto === 'Peaje');
  const sinPeaje = r.j.conceptos.filter((k) => k.id !== peaje.id).map((k) => ({ ...k }));
  t((await A(`eventos/${evM}/nomina`, { method: 'PUT', body: { items, conceptos: sinPeaje } })).s === 200 && !(await A(`eventos/${evM}/nomina`)).j.conceptos.some((k) => k.concepto === 'Peaje'), 'borra un renglón de la nómina');
  const cu1 = (await A(`eventos/${evM}/cuadre`)).j.calculo;
  t(Math.abs(cu1.nomina_total - (3000 + 1500 + (r.j.items.find((x) => x.musico_id === musId).acordado) + 60 + 450)) < 0.01 && cu1.comisiones_total === 1500, 'el cuadre suma músicos, extras y transporte; las comisiones aparte', cu1);
  const tr2 = (await A(`eventos/${evM}/nomina`)).j.conceptos.find((k) => k.gasto_id === gTr);
  r = await A(`eventos/${evM}/conceptos/${tr2.id}`, { method: 'POST', body: { metodo: 'efectivo', receptor: 'Transportes Pérez' } }); t(r.s === 201, 'paga el transporte (queda como gasto del evento)');
  const cu2 = (await A(`eventos/${evM}/cuadre`)).j.calculo; t(Math.abs(cu2.salidas_total - cu1.salidas_total) < 0.01, 'pagarlo no lo cuenta dos veces en el cuadre', { cu1: cu1.salidas_total, cu2: cu2.salidas_total });
  t((await A(`eventos/${evM}/nomina`, { method: 'PUT', body: { items, conceptos: [] } })).s === 409, 'un renglón ya pagado no se borra sin anular el pago');
  t((await A(`eventos/${evM}/nomina/${mgMus}`, { method: 'POST', body: { monto: '4600', metodo: 'transferencia' } })).s === 400 && (await A(`eventos/${evM}/nomina/${mgMus}`, { method: 'POST', body: { monto: '4500', metodo: 'transferencia' } })).s === 201, 'al músico se le paga hasta lo acordado más sus extras');
  r = await MG('portal/pagos'); t(r.s === 200 && r.j.some((x) => x.evento_id === evM && x.extras === 1500 && x.extras_detalle.length === 1), 'el manager ve sus pagos de músico con el detalle de sus extras');
  // estudios de ensayo
  r = await A('ensayos', { method: 'POST', body: { titulo: 'Ensayo en estudio nuevo', fecha: dia(70), hora_inicio: '19:00', banda_id: bandaId, lugar: 'Estudio La Bodega', direccion: 'Calle 5 #12, Naco' } });
  r = await A('estudios'); const est = r.j.find((x) => x.nombre === 'Estudio La Bodega'); t(est && est.direccion === 'Calle 5 #12, Naco', 'un lugar de ensayo nuevo queda guardado como estudio');
  r = await A('ensayos', { method: 'POST', body: { titulo: 'Otro ensayo', fecha: dia(77), hora_inicio: '19:00', banda_id: bandaId, estudio_id: est.id } });
  t((await A('ensayos/' + r.j.ids[0])).j.lugar === 'Estudio La Bodega' && (await A('estudios')).j.filter((x) => x.nombre === 'Estudio La Bodega').length === 1, 'se escoge el estudio guardado sin repetirlo');
  // qué puede hacer cada rol
  r = await A('roles-info'); t(r.j.booking.resumen && r.j.booking.permisos.length > 3 && r.j.dueno.permisos.length > r.j.booking.permisos.length, 'explica qué puede hacer cada rol');
  // portal del cliente
  t((await A('usuarios', { method: 'POST', body: { email: 'x@cli.local', rol: 'cliente' } })).s === 400, 'al cliente se le da acceso desde su ficha');
  r = await A(`clientes/${cMango}/invitar`, { method: 'POST' }); t(r.s === 200 && r.j.enlace, 'invita al cliente a su portal');
  const CL = cliente(); await CL('invitacion/' + r.j.enlace.split('/').pop(), { method: 'POST', body: { nombre: 'Laura Mango', password: CLAVE } });
  r = await CL('me'); t(r.j.rol === 'cliente' && r.j.cliente === true && !r.j.portal, 'el cliente entra a su portal', r.j);
  t((await CL('bandas')).s === 403 && (await CL('eventos')).s === 403 && (await CL('portal/pagos')).s === 404, 'el cliente no ve la oficina ni el portal de músicos');
  await A(`eventos/${evM}/movimientos`, { method: 'POST', body: { tipo: 'ingreso', categoria: 'anticipo', monto: '4000', moneda: 'USD', receptor: 'empresa' } });
  r = await A(`eventos/${evM}/contratos`, { method: 'POST', body: { precio: '10000', moneda: 'USD', anticipo: '4000', condiciones: 'Dos tandas.' } }); const ctM = r.j.id || (await A('eventos/' + evM)).j.contratos[0].id;
  r = await CL('cliente/inicio'); const evC = r.j.eventos.find((x) => x.id === evM);
  t(evC && evC.precio === 10000 && evC.cobrado === 4000 && evC.saldo === 6000 && evC.pagos.length === 1, 've su depósito y lo que le falta', evC);
  t(evC && !evC.contrato, 'no ve contratos en borrador');
  t(r.j.eventos.every((x) => x.id !== ev1), 'solo ve los eventos de su cliente');
  await A('contratos/' + ctM + '/estado', { method: 'PUT', body: { estado: 'enviado' } });
  r = await CL('cliente/inicio'); t(r.j.eventos.find((x) => x.id === evM).contrato.estado === 'enviado', 've el contrato enviado');
  r = await CL('cliente/contratos/' + ctM); t(r.s === 200 && r.j.datos.evento.estado_us === 'FL' && r.j.datos.cliente.codigo_postal === '32819', 'el contrato lleva la dirección de EE. UU. por partes', r.j.datos);
  t((await CL(`cliente/contratos/${ctM}/firmar`, { method: 'POST', body: { nombre: 'Laura Mango', acepto: true } })).s === 400, 'para firmar hay que dibujar la firma');
  r = await CL('archivos', { method: 'POST', body: { tipo: 'firma', datos: PNG } }); const firma = r.j.clave;
  t((await CL(`cliente/contratos/${ctM}/firmar`, { method: 'POST', body: { nombre: 'Laura Mango', firma } })).s === 400, 'y marcar que acepta');
  r = await CL(`cliente/contratos/${ctM}/firmar`, { method: 'POST', body: { nombre: 'Laura Mango', firma, acepto: true } }); t(r.s === 200 && r.j.huella.length === 64, 'el cliente firma el contrato desde su portal');
  r = await A('contratos/' + ctM); t(r.j.estado === 'firmado' && r.j.firma.nombre === 'Laura Mango' && r.j.firma.url, 'la oficina ve la firma, la fecha y la huella');
  t((await A(r.j.firma.url)).s === 200 && (await Bc(r.j.firma.url)).s === 404, 'la imagen de la firma es privada');
  t((await CL(`cliente/contratos/${ctM}/firmar`, { method: 'POST', body: { nombre: 'Laura Mango', firma, acepto: true } })).s === 409, 'no se firma dos veces');
  r = await CL('archivos', { method: 'POST', body: { tipo: 'flyer', datos: PNG } }); const fly = r.j.clave;
  r = await CL('cliente/eventos/' + evM, { method: 'PUT', body: { lugar: 'Mango Club Orlando', hora_show: '22:30', hora_fin: '02:00', flyer: fly, estado_us: 'FL', codigo_postal: '32819' } });
  t(r.s === 200 && r.j.cambios === 4, 'el cliente sube el flyer y cambia el local y las horas', r.j);
  r = await A('eventos/' + evM); t(r.j.lugar === 'Mango Club Orlando' && r.j.hora_show === '22:30' && r.j.flyer_url && r.j.historial?.some?.((h) => /El cliente cambió/.test(h.cambio)) !== false, 'la oficina ve los cambios del cliente');
  t((await P(r.j.flyer_url)).s === 200, 'los músicos del evento ven el flyer');
  t((await CL('cliente/eventos/' + ev1)).s === 404 && (await CL('cliente/contratos/' + v2)).s === 404, 'no ve eventos ni contratos de otros clientes');
  t((await A(`clientes/${cMango}/quitar-acceso`, { method: 'POST' })).s === 200 && (await CL('me')).s === 401, 'la oficina le puede quitar el acceso');

  titulo('Plataforma, suspensión y prueba vencida');
  t((await S('login', { method: 'POST', body: { email: 'plataforma@bandgo.local', password: CLAVE } })).s === 200, 'el superadministrador entra');
  r = await S('plataforma/empresas'); t(r.j.length === 2, 've las dos empresas', r.j); const listaInicial = r.j;
  t((await S('bandas')).s === 403, 'la plataforma no opera empresas');
  t([403, 404].includes((await A('plataforma/empresas')).s), 'el dueño no entra a la plataforma');
  const idB = listaInicial.find((e) => e.nombre === 'Orquesta Rival').id, idA = listaInicial.find((e) => e.nombre === 'Los Estelares').id;
  t((await S('me')).j.dos_pasos === false && (await S('plataforma/resumen')).s === 200, 'la plataforma funciona sin activar dos pasos (es opcional)');
  t((await S('plataforma/empresas', { method: 'POST', body: { nombre: 'Banda Nueva', dueno_nombre: 'Ana Dueña', dueno_email: 'malo' } })).s === 400, 'pide un correo válido para el dueño');
  t((await S('plataforma/empresas', { method: 'POST', body: { nombre: 'Banda Nueva', dueno_nombre: 'Ana', dueno_email: 'plataforma@bandgo.local' } })).s === 400, 'no usa el correo de la plataforma para un dueño');
  r = await S('plataforma/empresas', { method: 'POST', body: { nombre: 'Banda Nueva', pais: 'US', plan: 'basico', dueno_nombre: 'Ana Dueña', dueno_email: 'ana@nueva.local' } });
  t(r.s === 201 && r.j.enlace.includes('#/invitacion/'), 'la plataforma crea una empresa y el enlace para el dueño', r.j);
  const NV = cliente(); r = await NV('invitacion/' + r.j.enlace.split('/').pop(), { method: 'POST', body: { nombre: 'Ana Dueña', password: CLAVE } });
  r = await NV('me'); t(r.s === 200 && r.j.rol === 'dueno' && r.j.empresa.nombre === 'Banda Nueva', 'el dueño crea su contraseña y entra a su empresa', r.j);
  t((await NV('bandas', { method: 'POST', body: { nombre: 'Primera banda' } })).s === 201, 'el dueño nuevo trabaja sin activar dos pasos');
  t((await S('plataforma/empresas/' + idB, { method: 'PUT', body: { estado: 'suspendida' } })).s === 200, 'suspende la empresa B');
  t((await Bc('me')).s === 401, 'la empresa suspendida pierde la sesión');
  t((await S('plataforma/empresas/' + idA, { method: 'PUT', body: { prueba_hasta: '2020-01-01' } })).s === 200, 'vence la prueba de A');
  t((await A('bandas', { method: 'POST', body: { nombre: 'Después de la prueba' } })).s === 402, 'con la prueba vencida no se hacen cambios');
  t((await A('bandas')).s === 200, 'pero se puede ver todo');
  t(sql("SELECT COUNT(*) n FROM auditoria WHERE accion IN ('banda_creada','musico_creado','documento_creado','cuenta_pago_cambiada','permiso_cambiado')")[0].n >= 5, 'la bitácora registró los cambios');
}

const reloj = setTimeout(() => { console.log('\nSe pasó del tiempo'); apagar(); process.exit(1); }, 5 * 60 * 1000);
main().catch((e) => { mal++; fallas.push(e.message); console.error(e); }).finally(() => {
  clearTimeout(reloj); apagar();
  console.log(`\n${mal ? '\x1b[31m' : '\x1b[32m'}${bien} bien · ${mal} mal\x1b[0m`); if (mal) console.log('Fallaron:\n - ' + fallas.join('\n - '));
  process.exit(mal ? 1 : 0);
});
