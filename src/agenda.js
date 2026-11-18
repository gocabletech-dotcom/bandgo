// BandGo · Fase 2 · calendario, clientes, eventos (expediente), contratos con versiones, ensayos y bloqueos.
// Regla del blueprint: una presentación NO bloquea a todas las bandas. Se revisan los músicos asignados,
// los bloqueos (empresa, país, banda o integrante), los choques de horario y los traslados entre países.
import { json, err, txt, soloDigitos, fecha, aCentavos, moneda, emailOk, auditar, escHtml, enviarCorreo, correoBase, cfgCorreo } from './nucleo.js';

// EE. UU.: estado (2 letras) y ZIP; en otros países la dirección va corrida
export const ESTADOS_US = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
export const esUS = (p) => ['us', 'usa', 'eeuu', 'ee uu', 'estados unidos', 'estados unidos de america', 'united states'].includes(String(p || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\./g, '').trim());
function datosUS(d, actual = {}) {
  const pais = d.pais !== undefined ? d.pais : actual.pais;
  if (!esUS(pais)) return { estado_us: null, codigo_postal: null };
  const est = d.estado_us !== undefined ? String(d.estado_us || '').toUpperCase().trim() : actual.estado_us;
  const zip = d.codigo_postal !== undefined ? String(d.codigo_postal || '').trim() : actual.codigo_postal;
  if (est && !ESTADOS_US.includes(est)) return { e: 'Escoja un estado de Estados Unidos válido' };
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) return { e: 'El ZIP debe tener 5 números (o 5-4)' };
  return { estado_us: est || null, codigo_postal: zip || null };
}
// estudio de ensayo: el escogido, o uno nuevo que queda guardado al escribir un lugar que no existe
async function resolverEstudio(db, E, d) {
  if (Number(d.estudio_id)) {
    const x = await db.prepare('SELECT * FROM estudios WHERE id = ? AND empresa_id = ?').bind(Number(d.estudio_id), E).first();
    if (x) return { id: x.id, lugar: x.nombre, direccion: txt(d.direccion, 200) || x.direccion };
  }
  const lugar = txt(d.lugar, 120), direccion = txt(d.direccion, 200);
  if (!lugar) return { id: null, lugar: null, direccion };
  let x = await db.prepare('SELECT * FROM estudios WHERE empresa_id = ? AND lower(nombre) = lower(?)').bind(E, lugar).first();
  if (!x) x = await db.prepare('INSERT INTO estudios (empresa_id, nombre, direccion) VALUES (?,?,?) ON CONFLICT(empresa_id, nombre) DO UPDATE SET activo = 1 RETURNING *').bind(E, lugar, direccion).first();
  else if (!x.direccion && direccion) await db.prepare('UPDATE estudios SET direccion = ? WHERE id = ?').bind(direccion, x.id).run();
  return { id: x.id, lugar: x.nombre, direccion: direccion || x.direccion };
}
export const ESTADOS_EVENTO = {
  cotizacion: 'Cotización', negociacion: 'Negociación', pendiente: 'Pendiente de confirmación', confirmado: 'Confirmado',
  anticipo: 'Anticipo recibido', pendiente_pago: 'Pendiente de pago', realizado: 'Evento realizado', en_cuadre: 'En proceso de cuadre',
  liquidado: 'Liquidado', cancelado: 'Cancelado',
};
const ESTADOS_MANUALES = Object.keys(ESTADOS_EVENTO).filter((e) => !['en_cuadre', 'liquidado'].includes(e)); // esos dos los pone el cuadre (Fase 3)
const hora = (v) => (/^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v).padStart(5, '0') : null);
const minutos = (h) => (h ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : null);
const cent = (c) => (c == null ? null : c / 100);
const sumarDias = (dia, n) => new Date(Date.parse(dia + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const hoy = () => new Date().toISOString().slice(0, 10);
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ids = (a) => [...new Set((Array.isArray(a) ? a : []).map((x) => Number(typeof x === 'object' && x ? x.id : x)).filter((n) => n > 0))];

async function siguienteCodigo(db, E, prefijo) {
  const r = await db.prepare('INSERT INTO correlativos (empresa_id, prefijo, ultimo) VALUES (?, ?, 1) ON CONFLICT(empresa_id, prefijo) DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo').bind(E, prefijo).first();
  return `${prefijo}-${String(r.ultimo).padStart(5, '0')}`;
}
async function integrantesDeBanda(db, bandaId) {
  if (!bandaId) return [];
  return (await db.prepare('SELECT bm.musico_id AS id, bm.funcion FROM banda_miembros bm JOIN musicos m ON m.id = bm.musico_id WHERE bm.banda_id = ? AND m.activo = 1').bind(bandaId).all()).results;
}

// ---------- motor de disponibilidad ----------
// devuelve { bloqueos, choques, traslados } para una fecha y unos músicos. «excluir» evita compararse consigo mismo.
export async function revisarAgenda(db, E, { fecha: dia, inicio, fin, musicos = [], bandaId = null, pais = null, excluirEvento = 0, excluirEnsayo = 0, esEnsayo = false }) {
  const res = { bloqueos: [], choques: [], traslados: [] };
  const bl = (await db.prepare("SELECT b.*, ba.nombre AS banda, m.nombre AS musico FROM bloqueos b LEFT JOIN bandas ba ON ba.id = b.banda_id LEFT JOIN musicos m ON m.id = b.musico_id WHERE b.empresa_id = ? AND b.activo = 1 AND b.desde <= ? AND b.hasta >= ? AND (b.vence IS NULL OR b.vence >= ?)").bind(E, dia, dia, hoy()).all()).results;
  for (const b of bl) {
    const aplica = b.alcance === 'global' || (b.alcance === 'banda' && bandaId && b.banda_id === bandaId) || (b.alcance === 'musico' && musicos.includes(b.musico_id)) || (!esEnsayo && b.alcance === 'pais' && pais && norm(b.pais) === norm(pais));
    if (aplica) res.bloqueos.push({ id: b.id, alcance: b.alcance, detalle: b.alcance === 'global' ? 'Toda la empresa' : b.alcance === 'pais' ? b.pais : b.alcance === 'banda' ? b.banda : b.musico, motivo: b.motivo, desde: b.desde, hasta: b.hasta });
  }
  if (!musicos.length) return res;
  const q = musicos.map(() => '?').join(',');
  const ini = minutos(inicio), fn = minutos(fin) ?? (ini != null ? ini + 240 : null); // sin hora de fin se asumen 4 horas
  const choca = (a, b) => (ini == null || a == null ? true : ini < (b ?? a + 240) && a < fn);
  const evs = (await db.prepare(`SELECT e.id, e.codigo, e.nombre, e.fecha, e.pais, e.ciudad, COALESCE(e.hora_llegada, e.hora_soundcheck, e.hora_show) AS ini, e.hora_fin AS fin, a.musico_id, m.nombre AS musico
    FROM evento_asignaciones a JOIN eventos e ON e.id = a.evento_id JOIN musicos m ON m.id = a.musico_id
    WHERE e.empresa_id = ? AND e.estado != 'cancelado' AND e.id != ? AND a.musico_id IN (${q}) AND e.fecha BETWEEN ? AND ?`).bind(E, excluirEvento, ...musicos, sumarDias(dia, -1), sumarDias(dia, 1)).all()).results;
  for (const x of evs) {
    if (x.fecha === dia && choca(minutos(x.ini), minutos(x.fin))) res.choques.push({ tipo: 'evento', id: x.id, titulo: `${x.codigo} · ${x.nombre}`, musico: x.musico, hora: x.ini });
    else if (x.fecha !== dia && pais && x.pais && norm(x.pais) !== norm(pais)) res.traslados.push({ id: x.id, titulo: `${x.codigo} · ${x.nombre}`, musico: x.musico, fecha: x.fecha, lugar: [x.ciudad, x.pais].filter(Boolean).join(', ') });
  }
  const ens = (await db.prepare(`SELECT s.id, s.titulo, s.hora_inicio AS ini, s.hora_fin AS fin, c.musico_id, m.nombre AS musico FROM ensayo_citados c JOIN ensayos s ON s.id = c.ensayo_id JOIN musicos m ON m.id = c.musico_id
    WHERE s.empresa_id = ? AND s.estado != 'cancelado' AND s.id != ? AND s.fecha = ? AND c.musico_id IN (${q})`).bind(E, excluirEnsayo, dia, ...musicos).all()).results;
  for (const x of ens) if (choca(minutos(x.ini), minutos(x.fin))) res.choques.push({ tipo: 'ensayo', id: x.id, titulo: 'Ensayo · ' + x.titulo, musico: x.musico, hora: x.ini });
  return res;
}
const hayProblema = (r) => r.bloqueos.length || r.choques.length;

// ---------- vista de un evento según quién mira ----------
function eventoPub(e, L) {
  const propio = e.booking_id === L.user.id;
  const montos = L.puede('eventos.ver_montos') || propio;
  return { ...e, precio: montos ? cent(e.precio_c) : null, precio_c: undefined, montos, cubre: e.cubre ? JSON.parse(e.cubre) : {}, estado_nombre: ESTADOS_EVENTO[e.estado], flyer_url: e.flyer_r2 ? '/api/archivo/' + encodeURIComponent(e.flyer_r2) : null, puede_editar: L.puede('eventos.editar') && (propio || L.puede('eventos.editar_todos')) };
}
async function cargarEvento(db, E, id) {
  return db.prepare(`SELECT e.*, b.nombre AS banda, c.nombre AS cliente, ub.nombre AS booking, um.nombre AS manager FROM eventos e LEFT JOIN bandas b ON b.id = e.banda_id LEFT JOIN clientes c ON c.id = e.cliente_id
    LEFT JOIN usuarios ub ON ub.id = e.booking_id LEFT JOIN usuarios um ON um.id = e.manager_id WHERE e.id = ? AND e.empresa_id = ?`).bind(id, E).first();
}
async function validarRefs(db, E, d) {
  if (d.cliente_id && !(await db.prepare('SELECT 1 FROM clientes WHERE id = ? AND empresa_id = ?').bind(Number(d.cliente_id), E).first())) return 'El cliente no es válido';
  if (d.banda_id && !(await db.prepare('SELECT 1 FROM bandas WHERE id = ? AND empresa_id = ?').bind(Number(d.banda_id), E).first())) return 'La banda no es válida';
  for (const k of ['booking_id', 'manager_id']) if (d[k] && !(await db.prepare("SELECT 1 FROM miembros WHERE usuario_id = ? AND empresa_id = ? AND activo = 1 AND rol IN ('dueno','admin','manager','booking')").bind(Number(d[k]), E).first())) return 'El responsable no es válido';
  return null;
}
const CUBRE = ['vuelo', 'hospedaje', 'transporte', 'dietas', 'sonido'];
const limpiarCubre = (c) => Object.fromEntries(CUBRE.filter((k) => c && c[k]).map((k) => [k, { quien: txt(c[k].quien, 30), forma: txt(c[k].forma, 60) }]));

async function avisarEnsayo(L, ens, tipo) {
  const { db, env, url, empresa } = L;
  const cit = (await db.prepare('SELECT m.nombre, m.email, m.whatsapp FROM ensayo_citados c JOIN musicos m ON m.id = c.musico_id WHERE c.ensayo_id = ?').bind(ens.id).all()).results;
  const correo = (await cfgCorreo(env, db)).listo;
  let enviados = 0;
  const cuando = `${ens.fecha}${ens.hora_inicio ? ' · ' + ens.hora_inicio + (ens.hora_fin ? '–' + ens.hora_fin : '') : ''}`;
  const titulo = tipo === 'cancelado' ? `Ensayo cancelado: ${ens.titulo}` : tipo === 'cambio' ? `Cambió el ensayo: ${ens.titulo}` : `Nuevo ensayo: ${ens.titulo}`;
  if (correo) for (const c of cit) {
    if (!emailOk(c.email)) continue;
    try { await enviarCorreo(env, db, { para: c.email, asunto: `${titulo} · ${empresa.nombre}`, html: correoBase(escHtml(titulo), `<p>Hola ${escHtml(c.nombre.split(' ')[0])}:</p><p><b>${escHtml(cuando)}</b><br>${escHtml(ens.lugar || '')}</p>${tipo === 'cancelado' ? '' : `<p><a href="${url.origin}/app/#/agenda" style="background:#0F172A;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Confirmar si voy</a></p>`}`) }); enviados++; }
    catch (e) { console.error('aviso ensayo', e.message); }
  }
  const texto = `${titulo} · ${cuando}${ens.lugar ? ' · ' + ens.lugar : ''}. Confirma en BandGo: ${url.origin}/app/#/agenda`;
  return { citados: cit.length, correos: enviados, whatsapp: cit.filter((c) => c.whatsapp).map((c) => ({ nombre: c.nombre, enlace: `https://wa.me/${soloDigitos(c.whatsapp)}?text=${encodeURIComponent(texto)}` })) };
}

export async function rutasAgenda(L) {
  const { db, method, mod, id, idRaw, accion, sub, d, ctx, puede, empresa, user, req } = L;
  const E = empresa.id;
  const no = (p) => (puede(p) ? null : err('Su rol no tiene permiso para esto', 403));

  // ---------- calendario ----------
  if (mod === 'calendario' && method === 'GET') {
    const e0 = no('eventos.ver') && no('ensayos.ver'); if (e0) return e0;
    const u = new URL(req.url), desde = fecha(u.searchParams.get('desde')) || hoy(), hasta = fecha(u.searchParams.get('hasta')) || sumarDias(desde, 42);
    const banda = Number(u.searchParams.get('banda')) || null;
    const out = { eventos: [], ensayos: [], bloqueos: [], viajes: [] };
    if (puede('eventos.ver')) {
      const rs = (await db.prepare(`SELECT e.*, b.nombre AS banda, c.nombre AS cliente, ub.nombre AS booking FROM eventos e LEFT JOIN bandas b ON b.id = e.banda_id LEFT JOIN clientes c ON c.id = e.cliente_id LEFT JOIN usuarios ub ON ub.id = e.booking_id
        WHERE e.empresa_id = ? AND e.fecha BETWEEN ? AND ? ${banda ? 'AND e.banda_id = ?' : ''} ORDER BY e.fecha, e.hora_show`).bind(...[E, desde, hasta, ...(banda ? [banda] : [])]).all()).results;
      out.eventos = rs.map((e) => eventoPub(e, L));
    }
    if (puede('ensayos.ver')) {
      out.ensayos = (await db.prepare(`SELECT s.id, s.titulo, s.fecha, s.hora_inicio, s.hora_fin, s.lugar, s.estado, s.banda_id, b.nombre AS banda,
        (SELECT COUNT(*) FROM ensayo_citados c WHERE c.ensayo_id = s.id) AS citados, (SELECT COUNT(*) FROM ensayo_citados c WHERE c.ensayo_id = s.id AND c.respuesta = 'voy') AS van
        FROM ensayos s LEFT JOIN bandas b ON b.id = s.banda_id WHERE s.empresa_id = ? AND s.fecha BETWEEN ? AND ? ${banda ? 'AND s.banda_id = ?' : ''} ${puede('ensayos.editar') ? '' : "AND s.estado = 'publicado'"} ORDER BY s.fecha, s.hora_inicio`).bind(...[E, desde, hasta, ...(banda ? [banda] : [])]).all()).results;
    }
    if (puede('viajes.ver')) out.viajes = (await db.prepare(`SELECT t.id, t.tipo, t.sale_fecha AS fecha, t.sale_hora AS hora, t.origen, t.origen_ciudad, t.destino, t.destino_ciudad, t.compania, t.numero, t.viaje_id, t.evento_id, v.nombre AS viaje
      FROM tramos t LEFT JOIN viajes v ON v.id = t.viaje_id LEFT JOIN eventos e ON e.id = t.evento_id WHERE t.empresa_id = ? AND t.sale_fecha BETWEEN ? AND ? ${banda ? 'AND (v.banda_id = ? OR e.banda_id = ?)' : ''} ORDER BY t.sale_fecha, t.sale_hora`).bind(...[E, desde, hasta, ...(banda ? [banda, banda] : [])]).all()).results;
    out.bloqueos = (await db.prepare('SELECT b.*, ba.nombre AS banda, m.nombre AS musico FROM bloqueos b LEFT JOIN bandas ba ON ba.id = b.banda_id LEFT JOIN musicos m ON m.id = b.musico_id WHERE b.empresa_id = ? AND b.activo = 1 AND b.hasta >= ? AND b.desde <= ?').bind(E, desde, hasta).all()).results;
    return json(out);
  }
  // revisar disponibilidad antes de guardar (la pantalla lo usa para avisar)
  if (mod === 'disponibilidad' && method === 'POST') {
    const e0 = no('eventos.ver') && no('ensayos.ver'); if (e0) return e0;
    if (!fecha(d.fecha)) return err('Escriba la fecha');
    let musicos = ids(d.musicos); if (!musicos.length && d.banda_id) musicos = (await integrantesDeBanda(db, Number(d.banda_id))).map((m) => m.id);
    return json(await revisarAgenda(db, E, { fecha: d.fecha, inicio: hora(d.inicio), fin: hora(d.fin), musicos, bandaId: Number(d.banda_id) || null, pais: txt(d.pais, 40), excluirEvento: Number(d.evento_id) || 0, excluirEnsayo: Number(d.ensayo_id) || 0, esEnsayo: !!d.ensayo }));
  }

  // ---------- bloqueos ----------
  if (mod === 'bloqueos') {
    if (method === 'GET') { const e0 = no('eventos.ver'); if (e0) return e0;
      return json((await db.prepare('SELECT b.*, ba.nombre AS banda, m.nombre AS musico, u.nombre AS creado_por_nombre FROM bloqueos b LEFT JOIN bandas ba ON ba.id = b.banda_id LEFT JOIN musicos m ON m.id = b.musico_id LEFT JOIN usuarios u ON u.id = b.creado_por WHERE b.empresa_id = ? AND b.activo = 1 AND b.hasta >= ? ORDER BY b.desde').bind(E, hoy()).all()).results); }
    const e0 = no('bloqueos.editar'); if (e0) return e0;
    if (method === 'POST') {
      if (!fecha(d.desde)) return err('Escriba desde qué fecha');
      const hasta = fecha(d.hasta) || d.desde; if (hasta < d.desde) return err('La fecha final es antes de la inicial');
      const alcance = ['global', 'pais', 'banda', 'musico'].includes(d.alcance) ? d.alcance : 'global';
      if (alcance === 'pais' && !txt(d.pais)) return err('Escriba el país');
      if (alcance === 'banda' && !(await db.prepare('SELECT 1 FROM bandas WHERE id = ? AND empresa_id = ?').bind(Number(d.banda_id), E).first())) return err('Escoja la banda');
      if (alcance === 'musico' && !(await db.prepare('SELECT 1 FROM musicos WHERE id = ? AND empresa_id = ?').bind(Number(d.musico_id), E).first())) return err('Escoja el integrante');
      const r = await db.prepare('INSERT INTO bloqueos (empresa_id, desde, hasta, alcance, pais, banda_id, musico_id, motivo, vence, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id')
        .bind(E, d.desde, hasta, alcance, alcance === 'pais' ? txt(d.pais, 40) : null, alcance === 'banda' ? Number(d.banda_id) : null, alcance === 'musico' ? Number(d.musico_id) : null, txt(d.motivo, 200), fecha(d.vence), user.id).first();
      await auditar(ctx, 'bloqueo_creado', 'bloqueo', r.id, `${alcance} ${d.desde}→${hasta} ${txt(d.motivo, 100) || ''}`);
      return json({ ok: true, id: r.id }, 201);
    }
    if (method === 'DELETE' && id) {
      const r = await db.prepare('UPDATE bloqueos SET activo = 0 WHERE id = ? AND empresa_id = ?').bind(id, E).run(); if (!r.meta.changes) return err('No encontrado', 404);
      await auditar(ctx, 'bloqueo_quitado', 'bloqueo', id, 'fechas habilitadas otra vez'); return json({ ok: true });
    }
  }

  // ---------- clientes ----------
  if (mod === 'clientes') {
    if (method === 'GET' && !id) { const e0 = no('clientes.ver'); if (e0) return e0;
      return json((await db.prepare('SELECT c.*, (SELECT COUNT(*) FROM eventos e WHERE e.cliente_id = c.id) AS eventos, (SELECT MAX(fecha) FROM eventos e WHERE e.cliente_id = c.id) AS ultimo FROM clientes c WHERE c.empresa_id = ? ORDER BY c.activo DESC, c.nombre').bind(E).all()).results); }
    if (method === 'GET' && id) { const e0 = no('clientes.ver'); if (e0) return e0;
      const c = await db.prepare('SELECT * FROM clientes WHERE id = ? AND empresa_id = ?').bind(id, E).first(); if (!c) return err('No encontrado', 404);
      const evs = (await db.prepare('SELECT e.*, b.nombre AS banda FROM eventos e LEFT JOIN bandas b ON b.id = e.banda_id WHERE e.cliente_id = ? AND e.empresa_id = ? ORDER BY e.fecha DESC').bind(id, E).all()).results;
      return json({ ...c, eventos: evs.map((e) => eventoPub(e, L)) }); }
    if ((method === 'POST' && !id) || (method === 'PUT' && id)) { const e0 = no('clientes.editar'); if (e0) return e0;
      if (!txt(d.nombre)) return err('Escriba el nombre del cliente');
      if (d.email && !emailOk(d.email)) return err('Correo no válido');
      const us = datosUS(d, id ? (await db.prepare('SELECT pais, estado_us, codigo_postal FROM clientes WHERE id = ? AND empresa_id = ?').bind(id, E).first()) || {} : {}); if (us.e) return err(us.e);
      const v = [txt(d.nombre, 120), txt(d.nombre_comercial, 120), d.tipo === 'persona' ? 'persona' : 'empresa', soloDigitos(d.telefono) || null, soloDigitos(d.whatsapp) || null, d.email ? String(d.email).toLowerCase().trim() : null, txt(d.pais, 40), txt(d.ciudad, 60), txt(d.direccion, 200), txt(d.fiscal, 40), txt(d.contacto_nombre, 80), soloDigitos(d.contacto_telefono) || null, txt(d.notas, 1000)];
      if (method === 'POST') { const r = await db.prepare('INSERT INTO clientes (nombre, nombre_comercial, tipo, telefono, whatsapp, email, pais, ciudad, direccion, fiscal, contacto_nombre, contacto_telefono, notas, empresa_id, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id').bind(...v, E, user.id).first();
        await db.prepare('UPDATE clientes SET estado_us = ?, codigo_postal = ?, lugar = ? WHERE id = ?').bind(us.estado_us, us.codigo_postal, txt(d.lugar, 120), r.id).run();
        await auditar(ctx, 'cliente_creado', 'cliente', r.id, d.nombre); return json({ ok: true, id: r.id }, 201); }
      const r = await db.prepare('UPDATE clientes SET nombre = ?, nombre_comercial = ?, tipo = ?, telefono = ?, whatsapp = ?, email = ?, pais = ?, ciudad = ?, direccion = ?, fiscal = ?, contacto_nombre = ?, contacto_telefono = ?, notas = ?, activo = ? WHERE id = ? AND empresa_id = ?').bind(...v, d.activo === false ? 0 : 1, id, E).run();
      if (!r.meta.changes) return err('No encontrado', 404);
      await db.prepare('UPDATE clientes SET estado_us = ?, codigo_postal = ?, lugar = COALESCE(?, lugar) WHERE id = ?').bind(us.estado_us, us.codigo_postal, d.lugar !== undefined ? txt(d.lugar, 120) || '' : null, id).run();
      await auditar(ctx, 'cliente_editado', 'cliente', id, d.nombre); return json({ ok: true }); }
  }

  // ---------- eventos ----------
  if (mod === 'eventos') {
    if (method === 'GET' && !id) { const e0 = no('eventos.ver'); if (e0) return e0;
      const u = new URL(req.url), estado = u.searchParams.get('estado'), pasados = u.searchParams.get('pasados') === '1';
      const rs = (await db.prepare(`SELECT e.*, b.nombre AS banda, c.nombre AS cliente, ub.nombre AS booking FROM eventos e LEFT JOIN bandas b ON b.id = e.banda_id LEFT JOIN clientes c ON c.id = e.cliente_id LEFT JOIN usuarios ub ON ub.id = e.booking_id
        WHERE e.empresa_id = ? ${estado && ESTADOS_EVENTO[estado] ? 'AND e.estado = ?' : ''} AND e.fecha ${pasados ? '<' : '>='} ? ORDER BY e.fecha ${pasados ? 'DESC' : 'ASC'} LIMIT 300`).bind(...[E, ...(estado && ESTADOS_EVENTO[estado] ? [estado] : []), hoy()]).all()).results;
      return json({ eventos: rs.map((e) => eventoPub(e, L)), estados: ESTADOS_EVENTO }); }
    if (method === 'GET' && id && !accion) { const e0 = no('eventos.ver'); if (e0) return e0;
      const e = await cargarEvento(db, E, id); if (!e) return err('No encontrado', 404);
      const equipo = (await db.prepare('SELECT m.id, m.nombre, m.instrumento, m.tipo, m.foto_r2, a.funcion, a.confirmado FROM evento_asignaciones a JOIN musicos m ON m.id = a.musico_id WHERE a.evento_id = ? ORDER BY m.tipo DESC, m.nombre').bind(id).all()).results
        .map((m) => ({ ...m, foto_url: m.foto_r2 ? '/api/archivo/' + encodeURIComponent(m.foto_r2) : null, foto_r2: undefined }));
      const pub = eventoPub(e, L);
      const contratos = puede('contratos.ver') && (pub.montos || pub.puede_editar) ? (await db.prepare('SELECT id, version, estado, precio_c, moneda, anticipo_c, creado, archivo_firmado_r2, (SELECT nombre FROM usuarios WHERE id = contratos.creado_por) AS por FROM contratos WHERE evento_id = ? ORDER BY version DESC').bind(id).all()).results.map((c) => ({ ...c, precio: cent(c.precio_c), anticipo: cent(c.anticipo_c), firmado_url: c.archivo_firmado_r2 ? '/api/archivo/' + encodeURIComponent(c.archivo_firmado_r2) : null, precio_c: undefined, anticipo_c: undefined, archivo_firmado_r2: undefined })) : null;
      const historial = (await db.prepare('SELECT h.cambio, h.creado, u.nombre AS por FROM evento_historial h LEFT JOIN usuarios u ON u.id = h.usuario_id WHERE h.evento_id = ? ORDER BY h.id DESC LIMIT 50').bind(id).all()).results;
      const agenda = await revisarAgenda(db, E, { fecha: e.fecha, inicio: e.hora_llegada || e.hora_soundcheck || e.hora_show, fin: e.hora_fin, musicos: equipo.map((m) => m.id), bandaId: e.banda_id, pais: e.pais, excluirEvento: id });
      return json({ ...pub, equipo, contratos, historial, agenda }); }
    if (method === 'POST' && !id) {
      const e0 = no('eventos.crear'); if (e0) return e0;
      if (!txt(d.nombre)) return err('Escriba el nombre del evento');
      if (!fecha(d.fecha)) return err('Escriba la fecha');
      const malo = await validarRefs(db, E, d); if (malo) return err(malo);
      const equipoIni = d.musicos ? ids(d.musicos).map((x) => ({ id: x })) : await integrantesDeBanda(db, Number(d.banda_id) || null);
      const ag = await revisarAgenda(db, E, { fecha: d.fecha, inicio: hora(d.hora_llegada) || hora(d.hora_soundcheck) || hora(d.hora_show), fin: hora(d.hora_fin), musicos: equipoIni.map((m) => m.id), bandaId: Number(d.banda_id) || null, pais: txt(d.pais, 40) });
      if (hayProblema(ag) && !d.excepcion) return json({ error: 'Hay conflictos en esa fecha. Revíselos y, si corresponde, autorice la excepción.', agenda: ag }, 409);
      if (hayProblema(ag) && !puede('eventos.excepcion')) return json({ error: 'Esa fecha tiene bloqueos o choques. Solo un manager puede autorizar la excepción.', agenda: ag }, 403);
      const estado = ESTADOS_MANUALES.includes(d.estado) ? d.estado : 'cotizacion';
      const booking = Number(d.booking_id) || (L.rol === 'booking' ? user.id : null);
      if (L.rol === 'booking' && booking !== user.id) return err('Como booking, el evento queda a su nombre', 403);
      const usE = datosUS(d); if (usE.e) return err(usE.e);
      const codigo = await siguienteCodigo(db, E, 'EVT');
      const r = await db.prepare(`INSERT INTO eventos (empresa_id, codigo, nombre, tipo, estado, fecha, zona_horaria, hora_llegada, hora_montaje, hora_soundcheck, hora_show, hora_fin, pais, ciudad, lugar, direccion, cliente_id, banda_id, booking_id, manager_id, precio_c, moneda, cubre, notas, creado_por)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(E, codigo, txt(d.nombre, 120), d.tipo === 'publico' ? 'publico' : 'privado', estado, d.fecha, txt(d.zona_horaria, 60) || empresa.zona_horaria,
        hora(d.hora_llegada), hora(d.hora_montaje), hora(d.hora_soundcheck), hora(d.hora_show), hora(d.hora_fin), txt(d.pais, 40), txt(d.ciudad, 60), txt(d.lugar, 120), txt(d.direccion, 200),
        Number(d.cliente_id) || null, Number(d.banda_id) || null, booking, Number(d.manager_id) || null, aCentavos(d.precio), moneda(d.moneda, empresa.moneda_base), JSON.stringify(limpiarCubre(d.cubre)), txt(d.notas, 2000), user.id).first();
      await db.prepare('UPDATE eventos SET estado_us = ?, codigo_postal = ? WHERE id = ?').bind(usE.estado_us, usE.codigo_postal, r.id).run();
      if (equipoIni.length) await db.batch(equipoIni.map((m) => db.prepare('INSERT OR IGNORE INTO evento_asignaciones (evento_id, musico_id, funcion) VALUES (?,?,?)').bind(r.id, m.id, m.funcion || null)));
      await db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(r.id, user.id, `Creado como «${ESTADOS_EVENTO[estado]}»${hayProblema(ag) ? ' · con excepción autorizada' : ''}`).run();
      await auditar(ctx, hayProblema(ag) ? 'evento_creado_excepcion' : 'evento_creado', 'evento', r.id, `${codigo} ${d.nombre} ${d.fecha}`);
      return json({ ok: true, id: r.id, codigo, agenda: ag }, 201);
    }
    // cargar y revisar permisos de edición
    if (id && ['PUT', 'POST', 'DELETE'].includes(method)) {
      const e = await cargarEvento(db, E, id); if (!e) return err('No encontrado', 404);
      const pub = eventoPub(e, L);
      if (!accion && method === 'PUT') {
        if (!pub.puede_editar) return err('No puede editar este evento', 403);
        if (d.nombre !== undefined && !txt(d.nombre)) return err('Escriba el nombre del evento');
        if (d.fecha !== undefined && !fecha(d.fecha)) return err('Fecha no válida');
        const malo = await validarRefs(db, E, d); if (malo) return err(malo);
        if (d.estado && !ESTADOS_MANUALES.includes(d.estado)) return err('Ese estado lo pone el cuadre');
        if (['en_cuadre', 'liquidado'].includes(e.estado) && ((d.precio !== undefined && aCentavos(d.precio) !== e.precio_c) || (d.fecha !== undefined && d.fecha !== e.fecha) || (d.estado && d.estado !== e.estado && d.estado !== 'cancelado'))) return err('El evento está en cuadre o liquidado: el precio, la fecha y el estado se manejan desde el cuadre', 409);
        const n = (k, f) => (d[k] !== undefined ? f(d[k]) : e[k]);
        const nuevo = { fecha: n('fecha', fecha), pais: n('pais', (x) => txt(x, 40)), banda_id: n('banda_id', (x) => Number(x) || null), ini: n('hora_llegada', hora) || n('hora_soundcheck', hora) || n('hora_show', hora), fin: n('hora_fin', hora) };
        if (nuevo.fecha !== e.fecha || nuevo.pais !== e.pais || nuevo.ini !== (e.hora_llegada || e.hora_soundcheck || e.hora_show)) {
          const eq = (await db.prepare('SELECT musico_id FROM evento_asignaciones WHERE evento_id = ?').bind(id).all()).results.map((x) => x.musico_id);
          const ag = await revisarAgenda(db, E, { fecha: nuevo.fecha, inicio: nuevo.ini, fin: nuevo.fin, musicos: eq, bandaId: nuevo.banda_id, pais: nuevo.pais, excluirEvento: id });
          if (hayProblema(ag) && !d.excepcion) return json({ error: 'Hay conflictos en esa fecha.', agenda: ag }, 409);
          if (hayProblema(ag) && !puede('eventos.excepcion')) return json({ error: 'Solo un manager puede autorizar la excepción.', agenda: ag }, 403);
        }
        const usE = datosUS(d, e); if (usE.e) return err(usE.e);
        const cambios = [];
        for (const k of ['nombre', 'fecha', 'estado', 'hora_show', 'lugar', 'ciudad', 'pais', 'direccion', 'estado_us', 'codigo_postal']) if (d[k] !== undefined && String(d[k] ?? '') !== String(e[k] ?? '')) cambios.push(`${k}: ${k === 'estado' ? ESTADOS_EVENTO[e[k]] + ' → ' + ESTADOS_EVENTO[d[k]] : (e[k] ?? '—') + ' → ' + (d[k] || '—')}`);
        if (d.precio !== undefined && aCentavos(d.precio) !== e.precio_c) { if (!pub.montos) return err('No puede cambiar el precio', 403); cambios.push(`precio: ${cent(e.precio_c) ?? '—'} → ${d.precio || '—'}`); }
        await db.prepare(`UPDATE eventos SET nombre = ?, tipo = ?, estado = ?, fecha = ?, zona_horaria = ?, hora_llegada = ?, hora_montaje = ?, hora_soundcheck = ?, hora_show = ?, hora_fin = ?, pais = ?, ciudad = ?, lugar = ?, direccion = ?, cliente_id = ?, banda_id = ?, booking_id = ?, manager_id = ?, precio_c = ?, moneda = ?, cubre = ?, notas = ?, actualizado = datetime('now') WHERE id = ?`)
          .bind(n('nombre', (x) => txt(x, 120)), n('tipo', (x) => (x === 'publico' ? 'publico' : 'privado')), d.estado || e.estado, nuevo.fecha, n('zona_horaria', (x) => txt(x, 60)), n('hora_llegada', hora), n('hora_montaje', hora), n('hora_soundcheck', hora), n('hora_show', hora), n('hora_fin', hora),
            nuevo.pais, n('ciudad', (x) => txt(x, 60)), n('lugar', (x) => txt(x, 120)), n('direccion', (x) => txt(x, 200)), n('cliente_id', (x) => Number(x) || null), nuevo.banda_id,
            L.rol === 'booking' ? e.booking_id : n('booking_id', (x) => Number(x) || null), n('manager_id', (x) => Number(x) || null), pub.montos && d.precio !== undefined ? aCentavos(d.precio) : e.precio_c, pub.montos && d.moneda ? moneda(d.moneda) : e.moneda,
            d.cubre !== undefined ? JSON.stringify(limpiarCubre(d.cubre)) : e.cubre, n('notas', (x) => txt(x, 2000)), id).run();
        await db.prepare('UPDATE eventos SET estado_us = ?, codigo_postal = ? WHERE id = ?').bind(usE.estado_us, usE.codigo_postal, id).run();
        if (d.flyer !== undefined) { const fl = d.flyer ? (await db.prepare("SELECT clave FROM archivos WHERE clave = ? AND empresa_id = ? AND tipo = 'flyer'").bind(d.flyer, E).first())?.clave : null; if (d.flyer && !fl) return err('El flyer no es válido');
          await db.prepare('UPDATE eventos SET flyer_r2 = ? WHERE id = ?').bind(fl, id).run(); cambios.push(fl ? 'flyer nuevo' : 'quitó el flyer'); }
        if (cambios.length) await db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(id, user.id, cambios.join(' · ').slice(0, 500)).run();
        await auditar(ctx, 'evento_editado', 'evento', id, cambios.join(' · ').slice(0, 400) || 'datos');
        return json({ ok: true });
      }
      // equipo: músicos y sonidista asignados
      if (accion === 'equipo' && method === 'PUT') {
        if (!pub.puede_editar) return err('No puede editar este evento', 403);
        const validos = new Set((await db.prepare('SELECT id FROM musicos WHERE empresa_id = ? AND activo = 1').bind(E).all()).results.map((x) => x.id));
        const lista = (Array.isArray(d.musicos) ? d.musicos : []).filter((m) => validos.has(Number(m.id)));
        const ag = await revisarAgenda(db, E, { fecha: e.fecha, inicio: e.hora_llegada || e.hora_soundcheck || e.hora_show, fin: e.hora_fin, musicos: lista.map((m) => Number(m.id)), bandaId: null, pais: null, excluirEvento: id });
        if (hayProblema(ag) && !d.excepcion) return json({ error: 'Algunos integrantes ya tienen otra actividad o están bloqueados ese día.', agenda: ag }, 409);
        if (hayProblema(ag) && !puede('eventos.excepcion')) return json({ error: 'Solo un manager puede autorizar la excepción.', agenda: ag }, 403);
        await db.batch([db.prepare('DELETE FROM evento_asignaciones WHERE evento_id = ?').bind(id), ...lista.map((m) => db.prepare('INSERT INTO evento_asignaciones (evento_id, musico_id, funcion) VALUES (?,?,?)').bind(id, Number(m.id), txt(m.funcion, 60)))]);
        await db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(id, user.id, `Equipo: ${lista.length} integrantes`).run();
        await auditar(ctx, 'evento_equipo', 'evento', id, `${lista.length} integrantes`);
        return json({ ok: true });
      }
      // contrato: cada guardado crea una versión nueva
      if (accion === 'contratos' && method === 'POST') {
        if (!puede('contratos.editar') || !pub.puede_editar || !pub.montos) return err('No puede hacer contratos de este evento', 403);
        const precio = aCentavos(d.precio); if (precio == null || precio <= 0) return err('Escriba el precio del contrato');
        const cli = e.cliente_id ? await db.prepare('SELECT * FROM clientes WHERE id = ?').bind(e.cliente_id).first() : null;
        if (!cli) return err('Agregue primero el cliente al evento');
        const banda = e.banda_id ? await db.prepare('SELECT nombre, logo_r2 FROM bandas WHERE id = ?').bind(e.banda_id).first() : null;
        const ver = ((await db.prepare('SELECT MAX(version) v FROM contratos WHERE evento_id = ?').bind(id).first()).v || 0) + 1;
        const mon = moneda(d.moneda, e.moneda);
        const datos = { evento: { codigo: e.codigo, nombre: e.nombre, tipo: e.tipo, fecha: e.fecha, lugar: e.lugar, direccion: e.direccion, ciudad: e.ciudad, pais: e.pais, estado_us: e.estado_us, codigo_postal: e.codigo_postal, hora_llegada: e.hora_llegada, hora_soundcheck: e.hora_soundcheck, hora_show: e.hora_show, hora_fin: e.hora_fin, cubre: e.cubre ? JSON.parse(e.cubre) : {} },
          cliente: { nombre: cli.nombre, nombre_comercial: cli.nombre_comercial, fiscal: cli.fiscal, direccion: cli.direccion, ciudad: cli.ciudad, pais: cli.pais, estado_us: cli.estado_us, codigo_postal: cli.codigo_postal, telefono: cli.telefono, email: cli.email, contacto: cli.contacto_nombre },
          empresa: { nombre: empresa.nombre, telefono: empresa.telefono, email: empresa.email, pais: empresa.pais, logo_r2: empresa.logo_r2 }, banda: banda ? { nombre: banda.nombre, logo_r2: banda.logo_r2 } : null };
        await db.batch([
          db.prepare("UPDATE contratos SET estado = 'anulado' WHERE evento_id = ? AND estado IN ('borrador','enviado')").bind(id),
          db.prepare('INSERT INTO contratos (empresa_id, evento_id, version, estado, precio_c, moneda, anticipo_c, anticipo_vence, saldo_vence, condiciones, datos, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
            .bind(E, id, ver, 'borrador', precio, mon, aCentavos(d.anticipo), fecha(d.anticipo_vence), fecha(d.saldo_vence), txt(d.condiciones, 6000), JSON.stringify(datos), user.id),
          db.prepare("UPDATE eventos SET precio_c = ?, moneda = ?, actualizado = datetime('now') WHERE id = ?").bind(precio, mon, id),
          db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(id, user.id, `Contrato versión ${ver}: ${mon} ${(precio / 100).toLocaleString('en-US')}`),
        ]);
        await auditar(ctx, 'contrato_version', 'evento', id, `v${ver} ${mon} ${precio / 100}`);
        return json({ ok: true, version: ver }, 201);
      }
    }
  }
  if (mod === 'estudios') {
    if (method === 'GET') { const e0 = no('ensayos.ver'); if (e0) return e0;
      return json((await db.prepare('SELECT s.*, (SELECT COUNT(*) FROM ensayos x WHERE x.estudio_id = s.id) AS ensayos FROM estudios s WHERE s.empresa_id = ? AND s.activo = 1 ORDER BY s.nombre').bind(E).all()).results); }
    const e0 = no('ensayos.editar'); if (e0) return e0;
    if (method === 'POST' && !id) { const nombre = txt(d.nombre, 120); if (!nombre) return err('Escriba el nombre del estudio');
      if (await db.prepare('SELECT 1 FROM estudios WHERE empresa_id = ? AND lower(nombre) = lower(?) AND activo = 1').bind(E, nombre).first()) return err('Ya existe un estudio con ese nombre');
      const r = await db.prepare('INSERT INTO estudios (empresa_id, nombre, direccion, telefono, notas) VALUES (?,?,?,?,?) ON CONFLICT(empresa_id, nombre) DO UPDATE SET activo = 1, direccion = excluded.direccion RETURNING id').bind(E, nombre, txt(d.direccion, 200), soloDigitos(d.telefono) || null, txt(d.notas, 300)).first();
      return json({ ok: true, id: r.id }, 201); }
    if (method === 'PUT' && id) { const x = await db.prepare('SELECT * FROM estudios WHERE id = ? AND empresa_id = ?').bind(id, E).first(); if (!x) return err('No encontrado', 404);
      await db.prepare('UPDATE estudios SET nombre = ?, direccion = ?, telefono = ?, notas = ?, activo = ? WHERE id = ?').bind(txt(d.nombre, 120) || x.nombre, d.direccion !== undefined ? txt(d.direccion, 200) : x.direccion, d.telefono !== undefined ? soloDigitos(d.telefono) || null : x.telefono, d.notas !== undefined ? txt(d.notas, 300) : x.notas, d.activo === false ? 0 : 1, id).run();
      return json({ ok: true }); }
  }
  if (mod === 'contratos' && id) {
    const c = await db.prepare('SELECT c.*, e.booking_id, u.nombre AS por FROM contratos c JOIN eventos e ON e.id = c.evento_id LEFT JOIN usuarios u ON u.id = c.creado_por WHERE c.id = ? AND c.empresa_id = ?').bind(id, E).first();
    if (!c) return err('No encontrado', 404);
    const propio = c.booking_id === user.id;
    if (!puede('contratos.ver') || !(puede('eventos.ver_montos') || propio)) return err('No puede ver este contrato', 403);
    if (method === 'GET') {
      const datos = JSON.parse(c.datos);
      const url = (k) => (k ? '/api/archivo/' + encodeURIComponent(k) : null);
      return json({ id: c.id, evento_id: c.evento_id, version: c.version, estado: c.estado, precio: cent(c.precio_c), moneda: c.moneda, anticipo: cent(c.anticipo_c), anticipo_vence: c.anticipo_vence, saldo_vence: c.saldo_vence, condiciones: c.condiciones, creado: c.creado, por: c.por,
        datos: { ...datos, empresa: { ...datos.empresa, logo_url: url(datos.empresa.logo_r2) }, banda: datos.banda ? { ...datos.banda, logo_url: url(datos.banda.logo_r2) } : null }, firmado_url: url(c.archivo_firmado_r2),
        firma: c.firma_en ? { nombre: c.firma_nombre, en: c.firma_en, url: url(c.firma_r2), ip: c.firma_ip, huella: c.firma_huella } : null });
    }
    if (method === 'PUT' && accion === 'estado') {
      if (!puede('contratos.editar') || !(propio || puede('eventos.editar_todos'))) return err('No puede cambiar este contrato', 403);
      if (!['enviado', 'firmado', 'anulado'].includes(d.estado)) return err('Estado no válido');
      if (c.estado === 'anulado' || c.estado === 'firmado' && d.estado !== 'anulado') return err('Esta versión ya no se puede cambiar. Cree una versión nueva.', 409);
      let archivo = c.archivo_firmado_r2;
      if (d.archivo) { const a = await db.prepare("SELECT clave FROM archivos WHERE clave = ? AND empresa_id = ? AND tipo = 'documento'").bind(d.archivo, E).first(); if (!a) return err('El archivo no es válido'); archivo = a.clave; }
      const st = [db.prepare('UPDATE contratos SET estado = ?, archivo_firmado_r2 = ? WHERE id = ?').bind(d.estado, archivo, id),
        db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(c.evento_id, user.id, `Contrato v${c.version}: ${d.estado}${d.archivo ? ' (con archivo firmado)' : ''}`)];
      if (d.estado === 'firmado') st.push(db.prepare("UPDATE eventos SET estado = 'confirmado', actualizado = datetime('now') WHERE id = ? AND estado IN ('cotizacion','negociacion','pendiente')").bind(c.evento_id));
      await db.batch(st);
      await auditar(ctx, 'contrato_' + d.estado, 'evento', c.evento_id, `v${c.version}`);
      return json({ ok: true });
    }
  }

  // ---------- ensayos ----------
  if (mod === 'ensayos') {
    const cargar = (eid) => db.prepare('SELECT s.*, b.nombre AS banda FROM ensayos s LEFT JOIN bandas b ON b.id = s.banda_id WHERE s.id = ? AND s.empresa_id = ?').bind(eid, E).first();
    if (method === 'GET' && !id) { const e0 = no('ensayos.ver'); if (e0) return e0;
      const pas = new URL(req.url).searchParams.get('pasados') === '1';
      return json((await db.prepare(`SELECT s.*, b.nombre AS banda, (SELECT COUNT(*) FROM ensayo_citados c WHERE c.ensayo_id = s.id) AS citados,
        (SELECT COUNT(*) FROM ensayo_citados c WHERE c.ensayo_id = s.id AND c.respuesta = 'voy') AS van, (SELECT COUNT(*) FROM ensayo_citados c WHERE c.ensayo_id = s.id AND c.respuesta = 'no') AS no_van,
        (SELECT COUNT(*) FROM ensayo_citados c WHERE c.ensayo_id = s.id AND c.respuesta = 'talvez') AS talvez, (SELECT COUNT(*) FROM ensayo_citados c WHERE c.ensayo_id = s.id AND c.respuesta = 'pendiente') AS pendientes
        FROM ensayos s LEFT JOIN bandas b ON b.id = s.banda_id WHERE s.empresa_id = ? AND s.fecha ${pas ? '<' : '>='} ? ${puede('ensayos.editar') ? '' : "AND s.estado = 'publicado'"} ORDER BY s.fecha ${pas ? 'DESC' : 'ASC'}, s.hora_inicio LIMIT 200`).bind(E, hoy()).all()).results); }
    if (method === 'GET' && id) { const e0 = no('ensayos.ver'); if (e0) return e0;
      const s = await cargar(id); if (!s || (s.estado === 'borrador' && !puede('ensayos.editar'))) return err('No encontrado', 404);
      const citados = (await db.prepare('SELECT m.id, m.nombre, m.instrumento, m.foto_r2, m.whatsapp, c.respuesta, c.motivo, c.respondido, c.asistio FROM ensayo_citados c JOIN musicos m ON m.id = c.musico_id WHERE c.ensayo_id = ? ORDER BY m.nombre').bind(id).all()).results
        .map((m) => ({ ...m, foto_url: m.foto_r2 ? '/api/archivo/' + encodeURIComponent(m.foto_r2) : null, foto_r2: undefined }));
      const repertorio = (await db.prepare('SELECT id, titulo, detalle, enlace FROM ensayo_repertorio WHERE ensayo_id = ? ORDER BY orden, id').bind(id).all()).results;
      const serie = s.serie ? (await db.prepare('SELECT id, fecha, estado FROM ensayos WHERE serie = ? AND empresa_id = ? ORDER BY fecha').bind(s.serie, E).all()).results : [];
      return json({ ...s, citados, repertorio, serie }); }
    const e0 = no('ensayos.editar');
    if (method === 'POST' && !id) { if (e0) return e0;
      if (!txt(d.titulo)) return err('Escriba el título del ensayo');
      if (!fecha(d.fecha)) return err('Escriba la fecha');
      if (d.banda_id && !(await db.prepare('SELECT 1 FROM bandas WHERE id = ? AND empresa_id = ?').bind(Number(d.banda_id), E).first())) return err('La banda no es válida');
      const validos = new Set((await db.prepare('SELECT id FROM musicos WHERE empresa_id = ? AND activo = 1').bind(E).all()).results.map((x) => x.id));
      let citados = ids(d.citados).filter((x) => validos.has(x));
      if (!d.citados && d.banda_id) citados = (await integrantesDeBanda(db, Number(d.banda_id))).map((m) => m.id);
      const est = await resolverEstudio(db, E, d);
      const semanas = Math.min(26, Math.max(1, Number(d.repetir_semanas) || 1));
      const serie = semanas > 1 ? crypto.randomUUID() : null;
      const rep = (Array.isArray(d.repertorio) ? d.repertorio : []).filter((x) => txt(x && x.titulo)).slice(0, 60);
      const creados = [], advertencias = [];
      for (let i = 0; i < semanas; i++) {
        const dia = sumarDias(d.fecha, i * 7);
        const r = await db.prepare('INSERT INTO ensayos (empresa_id, banda_id, titulo, fecha, hora_inicio, hora_fin, lugar, direccion, notas, serie, creado_por, estudio_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
          .bind(E, Number(d.banda_id) || null, txt(d.titulo, 120), dia, hora(d.hora_inicio), hora(d.hora_fin), est.lugar, est.direccion, txt(d.notas, 2000), serie, user.id, est.id).first();
        const st = citados.map((m) => db.prepare('INSERT INTO ensayo_citados (ensayo_id, musico_id) VALUES (?,?)').bind(r.id, m));
        rep.forEach((x, k) => st.push(db.prepare('INSERT INTO ensayo_repertorio (ensayo_id, orden, titulo, detalle, enlace) VALUES (?,?,?,?,?)').bind(r.id, k, txt(x.titulo, 120), txt(x.detalle, 200), /^https?:\/\//.test(String(x.enlace || '')) ? String(x.enlace).slice(0, 500) : null)));
        if (st.length) await db.batch(st);
        const ag = await revisarAgenda(db, E, { fecha: dia, inicio: hora(d.hora_inicio), fin: hora(d.hora_fin), musicos: citados, bandaId: Number(d.banda_id) || null, excluirEnsayo: r.id, esEnsayo: true });
        if (hayProblema(ag)) advertencias.push({ fecha: dia, ...ag });
        creados.push(r.id);
      }
      await auditar(ctx, 'ensayo_creado', 'ensayo', creados[0], `${d.titulo} · ${semanas} fecha(s)`);
      return json({ ok: true, ids: creados, advertencias }, 201);
    }
    if (id) {
      const s = await cargar(id); if (!s) return err('No encontrado', 404);
      if (method === 'PUT' && !accion) { if (e0) return e0;
        if (s.estado === 'cancelado') return err('El ensayo está cancelado');
        if (d.fecha !== undefined && !fecha(d.fecha)) return err('Fecha no válida');
        const n = (k, f) => (d[k] !== undefined ? f(d[k]) : s[k]);
        const cambioClave = (d.fecha && d.fecha !== s.fecha) || (d.hora_inicio !== undefined && hora(d.hora_inicio) !== s.hora_inicio) || (d.lugar !== undefined && txt(d.lugar, 120) !== s.lugar);
        await db.prepare('UPDATE ensayos SET titulo = ?, fecha = ?, hora_inicio = ?, hora_fin = ?, lugar = ?, direccion = ?, notas = ? WHERE id = ?').bind(n('titulo', (x) => txt(x, 120)) || s.titulo, n('fecha', fecha), n('hora_inicio', hora), n('hora_fin', hora), n('lugar', (x) => txt(x, 120)), n('direccion', (x) => txt(x, 200)), n('notas', (x) => txt(x, 2000)), id).run();
        if (d.lugar !== undefined || d.estudio_id !== undefined) { const es2 = await resolverEstudio(db, E, d); await db.prepare('UPDATE ensayos SET estudio_id = ?, lugar = COALESCE(?, lugar), direccion = COALESCE(?, direccion) WHERE id = ?').bind(es2.id, es2.lugar, es2.direccion, id).run(); }
        if (Array.isArray(d.citados)) {
          const validos = new Set((await db.prepare('SELECT id FROM musicos WHERE empresa_id = ? AND activo = 1').bind(E).all()).results.map((x) => x.id));
          const quiere = new Set(ids(d.citados).filter((x) => validos.has(x)));
          const tiene = new Set((await db.prepare('SELECT musico_id FROM ensayo_citados WHERE ensayo_id = ?').bind(id).all()).results.map((x) => x.musico_id));
          const st = [...[...tiene].filter((m) => !quiere.has(m)).map((m) => db.prepare('DELETE FROM ensayo_citados WHERE ensayo_id = ? AND musico_id = ?').bind(id, m)), ...[...quiere].filter((m) => !tiene.has(m)).map((m) => db.prepare('INSERT INTO ensayo_citados (ensayo_id, musico_id) VALUES (?,?)').bind(id, m))];
          if (st.length) await db.batch(st);
        }
        if (Array.isArray(d.repertorio)) {
          const rep = d.repertorio.filter((x) => txt(x && x.titulo)).slice(0, 60);
          await db.batch([db.prepare('DELETE FROM ensayo_repertorio WHERE ensayo_id = ?').bind(id), ...rep.map((x, k) => db.prepare('INSERT INTO ensayo_repertorio (ensayo_id, orden, titulo, detalle, enlace) VALUES (?,?,?,?,?)').bind(id, k, txt(x.titulo, 120), txt(x.detalle, 200), /^https?:\/\//.test(String(x.enlace || '')) ? String(x.enlace).slice(0, 500) : null))]);
        }
        await auditar(ctx, 'ensayo_editado', 'ensayo', id, s.titulo);
        const aviso = s.estado === 'publicado' && cambioClave && puede('ensayos.publicar') ? await avisarEnsayo(L, await cargar(id), 'cambio') : null;
        return json({ ok: true, aviso });
      }
      if (method === 'POST' && accion === 'publicar') { const e1 = no('ensayos.publicar'); if (e1) return e1;
        if (s.estado === 'cancelado') return err('El ensayo está cancelado');
        const lista = d.serie && s.serie ? (await db.prepare("SELECT * FROM ensayos WHERE serie = ? AND empresa_id = ? AND estado = 'borrador'").bind(s.serie, E).all()).results : [s];
        if (!lista.length) return json({ ok: true, publicados: 0 });
        await db.batch(lista.map((x) => db.prepare("UPDATE ensayos SET estado = 'publicado', publicado_en = datetime('now') WHERE id = ?").bind(x.id)));
        await auditar(ctx, 'ensayo_publicado', 'ensayo', id, `${s.titulo} · ${lista.length} fecha(s)`);
        return json({ ok: true, publicados: lista.length, aviso: await avisarEnsayo(L, { ...s, fecha: lista.length > 1 ? `${lista.length} ensayos desde ${lista[0].fecha}` : s.fecha }, 'nuevo') });
      }
      if (method === 'POST' && accion === 'cancelar') { if (e0) return e0;
        await db.prepare("UPDATE ensayos SET estado = 'cancelado' WHERE id = ?").bind(id).run();
        await auditar(ctx, 'ensayo_cancelado', 'ensayo', id, s.titulo);
        return json({ ok: true, aviso: s.estado === 'publicado' ? await avisarEnsayo(L, s, 'cancelado') : null });
      }
      if (method === 'POST' && accion === 'recordar') { const e1 = no('ensayos.publicar'); if (e1) return e1;
        if (s.estado !== 'publicado') return err('Publique primero el ensayo');
        const r = await avisarEnsayo(L, s, 'nuevo'); return json({ ok: true, aviso: r });
      }
      if (method === 'PUT' && accion === 'asistencia') { if (e0) return e0;
        const r = await db.prepare('UPDATE ensayo_citados SET asistio = ? WHERE ensayo_id = ? AND musico_id = ?').bind(d.asistio == null ? null : d.asistio ? 1 : 0, id, Number(d.musico_id)).run();
        if (!r.meta.changes) return err('No está citado', 404);
        return json({ ok: true });
      }
    }
  }

  // ---------- agenda del músico (portal) ----------
  if (mod === 'portal' && (idRaw === 'agenda' || idRaw === 'ensayos')) {
    const m = await db.prepare('SELECT id FROM musicos WHERE usuario_id = ? AND empresa_id = ? AND activo = 1').bind(user.id, E).first();
    if (!m) return err('Su usuario no está enlazado a un integrante de esta empresa.', 404);
    if (idRaw === 'agenda' && method === 'GET') {
      const desde = sumarDias(hoy(), -7);
      const eventos = (await db.prepare(`SELECT e.id, e.codigo, e.nombre, e.tipo, e.estado, e.fecha, e.hora_llegada, e.hora_soundcheck, e.hora_show, e.hora_fin, e.lugar, e.direccion, e.ciudad, e.pais, b.nombre AS banda, a.funcion
        FROM evento_asignaciones a JOIN eventos e ON e.id = a.evento_id LEFT JOIN bandas b ON b.id = e.banda_id WHERE a.musico_id = ? AND e.estado NOT IN ('cancelado','cotizacion','negociacion') AND e.fecha >= ? ORDER BY e.fecha`).bind(m.id, desde).all()).results
        .map((e) => ({ ...e, estado_nombre: ESTADOS_EVENTO[e.estado] }));
      const ensayos = (await db.prepare(`SELECT s.id, s.titulo, s.fecha, s.hora_inicio, s.hora_fin, s.lugar, s.direccion, s.notas, s.estado, b.nombre AS banda, c.respuesta, c.motivo FROM ensayo_citados c JOIN ensayos s ON s.id = c.ensayo_id LEFT JOIN bandas b ON b.id = s.banda_id
        WHERE c.musico_id = ? AND s.estado IN ('publicado','cancelado') AND s.fecha >= ? ORDER BY s.fecha, s.hora_inicio`).bind(m.id, desde).all()).results;
      for (const s of ensayos) s.repertorio = (await db.prepare('SELECT titulo, detalle, enlace FROM ensayo_repertorio WHERE ensayo_id = ? ORDER BY orden, id').bind(s.id).all()).results;
      return json({ eventos, ensayos });
    }
    if (idRaw === 'ensayos' && accion && sub === 'responder' && method === 'POST') {
      const resp = ['voy', 'no', 'talvez'].includes(d.respuesta) ? d.respuesta : null; if (!resp) return err('Escoja Voy, No voy o Tal vez');
      if (resp !== 'voy' && !txt(d.motivo)) return err('Cuéntele a la oficina el motivo');
      const r = await db.prepare("UPDATE ensayo_citados SET respuesta = ?, motivo = ?, respondido = datetime('now') WHERE ensayo_id = ? AND musico_id = ? AND ensayo_id IN (SELECT id FROM ensayos WHERE empresa_id = ? AND estado = 'publicado')").bind(resp, resp === 'voy' ? null : txt(d.motivo, 200), Number(accion), m.id, E).run();
      if (!r.meta.changes) return err('No está citado a ese ensayo', 404);
      await auditar(ctx, 'ensayo_respuesta', 'ensayo', Number(accion), resp);
      return json({ ok: true });
    }
  }
  return null;
}
