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
  const vars = ['BANDGO_LLAVE:llave-maestra-de-prueba-0123456789-abcdef', 'DOS_PASOS_OPCIONAL:1', `PWNED_API:http://127.0.0.1:${FALSO}`, 'BANDGO_VERSION:pruebas'];
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

  titulo('Plataforma, suspensión y prueba vencida');
  t((await S('login', { method: 'POST', body: { email: 'plataforma@bandgo.local', password: CLAVE } })).s === 200, 'el superadministrador entra');
  r = await S('plataforma/empresas'); t(r.j.length === 2, 've las dos empresas', r.j);
  t((await S('bandas')).s === 403, 'la plataforma no opera empresas');
  t([403, 404].includes((await A('plataforma/empresas')).s), 'el dueño no entra a la plataforma');
  const idB = r.j.find((e) => e.nombre === 'Orquesta Rival').id, idA = r.j.find((e) => e.nombre === 'Los Estelares').id;
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
