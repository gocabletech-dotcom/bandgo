// BandGo · Fase 5 · rider técnico. Un rider tiene un borrador (se guarda mientras se edita) y versiones congeladas
// con número, fecha, autor, nota de cambios y huella. Hay riders por país (RD, EE. UU., Europa), generales y
// personalizados por evento. El sonidista ve la última versión del rider asignado a sus eventos; el promotor no.
import { json, err, txt, emailOk, sha256, auditar } from './nucleo.js';

export const ALCANCES = { general: 'General', rd: 'República Dominicana', us: 'Estados Unidos', eu: 'Europa', evento: 'Personalizado para un evento' };
export const TIPOS_PLOT = ['bateria', 'percusion', 'timbal', 'teclado', 'amp_guitarra', 'amp_bajo', 'monitor', 'sidefill', 'mic', 'mic_inst', 'di', 'toma', 'tarima', 'musico', 'iem', 'consola', 'texto', 'bongo', 'guira', 'guitarra', 'bajo', 'trompeta', 'trombon', 'saxofon'];
const SOPORTES = ['', 'alto', 'bajo', 'clip', 'mesa'];
const TIPOS_MEZCLA = ['cuna', 'iem_estereo', 'iem_mono', 'sidefill'];
const SECCIONES = ['consola', 'monitores', 'microfonia', 'di_backline', 'energia', 'escenario', 'instrucciones'];
const EVENTO_VISIBLE = "('cotizacion','negociacion','cancelado')";
const num = (v, min, max, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : def; };
const hoy = () => new Date().toISOString().slice(0, 10);
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\./g, '').trim();
const EUROPA = ['espana', 'francia', 'italia', 'alemania', 'portugal', 'paises bajos', 'holanda', 'belgica', 'suiza', 'austria', 'reino unido', 'inglaterra', 'irlanda', 'suecia', 'noruega', 'dinamarca', 'grecia', 'polonia'];
export function alcanceDePais(pais) {
  const p = norm(pais);
  if (['republica dominicana', 'rd', 'dominicana', 'do'].includes(p)) return 'rd';
  if (['estados unidos', 'usa', 'us', 'eeuu', 'ee uu', 'puerto rico', 'pr'].includes(p)) return 'us';
  if (EUROPA.includes(p)) return 'eu';
  return null;
}

// plantilla inicial: el ejemplo del blueprint, para no empezar en blanco
export function plantilla() {
  return {
    escenario: { ancho: 10, fondo: 7 },
    plot: [
      { id: 'p1', tipo: 'tarima', x: 5, y: 1.6, rot: 0, ancho: 3, fondo: 2.4, etiqueta: 'Tarima batería 2,4 × 3 m' },
      { id: 'p2', tipo: 'bateria', x: 5, y: 1.6, rot: 0, etiqueta: 'Batería' },
      { id: 'p3', tipo: 'amp_bajo', x: 2.4, y: 1.4, rot: 0, etiqueta: 'Amp. bajo' },
      { id: 'p4', tipo: 'teclado', x: 7.8, y: 2.2, rot: 0, etiqueta: 'Teclado' },
      { id: 'p5', tipo: 'mic', x: 5, y: 5.4, rot: 0, etiqueta: 'Voz principal' },
      { id: 'p6', tipo: 'monitor', x: 4.4, y: 6.3, rot: 0, etiqueta: 'Mezcla 1' },
      { id: 'p7', tipo: 'monitor', x: 5.6, y: 6.3, rot: 0, etiqueta: 'Mezcla 1' },
      { id: 'p8', tipo: 'toma', x: 7.8, y: 1.2, rot: 0, etiqueta: '110 V' },
    ],
    canales: [
      { n: 1, fuente: 'Kick', mic: 'Micrófono dinámico (Beta 52)', soporte: 'bajo', phantom: false, sub: 'A', notas: '' },
      { n: 2, fuente: 'Snare', mic: 'Micrófono dinámico (SM57)', soporte: 'clip', phantom: false, sub: 'A', notas: '' },
      { n: 3, fuente: 'Hi-Hat', mic: 'Condensador', soporte: 'bajo', phantom: true, sub: 'A', notas: '' },
      { n: 4, fuente: 'Bajo', mic: 'DI Box', soporte: '', phantom: false, sub: 'B', notas: '' },
      { n: 5, fuente: 'Teclado L', mic: 'DI Box', soporte: '', phantom: false, sub: 'B', notas: '' },
      { n: 6, fuente: 'Teclado R', mic: 'DI Box', soporte: '', phantom: false, sub: 'B', notas: '' },
      { n: 7, fuente: 'Voz principal', mic: 'Micrófono vocal (SM58 / inalámbrico)', soporte: 'alto', phantom: false, sub: '', notas: '' },
    ],
    mezclas: [{ n: 1, para: 'Voz principal', tipo: 'cuna', notas: '2 cuñas' }, { n: 2, para: 'Batería', tipo: 'cuna', notas: '' }],
    secciones: { consola: 'Consola digital de 32 canales mínimo (Yamaha CL/QL, Midas M32, Allen & Heath dLive o similar).', monitores: '', microfonia: '', di_backline: '', energia: 'Tomas de 110 V con tierra en cada posición marcada.', escenario: 'Escenario mínimo de 10 × 7 m, techado.', instrucciones: '' },
    contactos: [],
  };
}

// limpia todo lo que llega del editor: tipos conocidos, textos cortos, números dentro de rango y límites de cantidad
export function limpiarDatos(d) {
  const s = d && typeof d === 'object' ? d : {};
  const ancho = num(s.escenario?.ancho, 2, 40, 10), fondo = num(s.escenario?.fondo, 2, 30, 7);
  const plot = (Array.isArray(s.plot) ? s.plot : []).filter((p) => p && TIPOS_PLOT.includes(p.tipo)).slice(0, 150).map((p, i) => ({
    id: String(p.id || 'p' + i).replace(/[^\w-]/g, '').slice(0, 20) || 'p' + i, tipo: p.tipo,
    x: num(p.x, 0, ancho, ancho / 2), y: num(p.y, 0, fondo, fondo / 2), rot: Math.round(num(p.rot, -360, 360, 0)) % 360,
    ...(p.tipo === 'tarima' ? { ancho: num(p.ancho, 0.5, ancho, 2), fondo: num(p.fondo, 0.5, fondo, 2) } : {}),
    etiqueta: txt(p.etiqueta, 60) || '', ...(Number(p.musico_id) > 0 ? { musico_id: Number(p.musico_id) } : {}) }));
  const canales = (Array.isArray(s.canales) ? s.canales : []).slice(0, 128).map((c, i) => ({
    n: Math.round(num(c?.n, 1, 999, i + 1)), fuente: txt(c?.fuente, 60) || '', mic: txt(c?.mic, 80) || '', soporte: SOPORTES.includes(c?.soporte) ? c.soporte : '',
    phantom: !!c?.phantom, sub: txt(c?.sub, 10) || '', notas: txt(c?.notas, 120) || '' }));
  const mezclas = (Array.isArray(s.mezclas) ? s.mezclas : []).slice(0, 32).map((m, i) => ({ n: Math.round(num(m?.n, 1, 99, i + 1)), para: txt(m?.para, 60) || '', tipo: TIPOS_MEZCLA.includes(m?.tipo) ? m.tipo : 'cuna', notas: txt(m?.notas, 120) || '' }));
  const secciones = Object.fromEntries(SECCIONES.map((k) => [k, txt(s.secciones?.[k], 3000) || '']));
  const contactos = (Array.isArray(s.contactos) ? s.contactos : []).slice(0, 12).map((c) => ({ nombre: txt(c?.nombre, 80) || '', rol: txt(c?.rol, 60) || '', telefono: txt(c?.telefono, 30) || '', email: emailOk(c?.email) ? String(c.email).trim().slice(0, 120) : '' })).filter((c) => c.nombre);
  return { escenario: { ancho, fondo }, plot, canales, mezclas, secciones, contactos };
}

async function siguienteCodigo(db, E, prefijo) {
  const r = await db.prepare('INSERT INTO correlativos (empresa_id, prefijo, ultimo) VALUES (?, ?, 1) ON CONFLICT(empresa_id, prefijo) DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo').bind(E, prefijo).first();
  return `${prefijo}-${String(r.ultimo).padStart(5, '0')}`;
}
// la última versión guardada de un rider (lo que ven el sonidista y el PDF)
async function ultimaVersion(db, riderId) {
  const v = await db.prepare('SELECT v.*, u.nombre AS por FROM rider_versiones v LEFT JOIN usuarios u ON u.id = v.creado_por WHERE v.rider_id = ? ORDER BY v.version DESC LIMIT 1').bind(riderId).first();
  return v ? { version: v.version, fecha: v.creado, por: v.por, cambios: v.cambios, datos: JSON.parse(v.datos) } : null;
}
// rider sugerido para un evento: el personalizado del evento, si no el vigente de su banda para el país, si no el general
async function riderSugerido(db, E, ev) {
  const a = alcanceDePais(ev.pais);
  return db.prepare(`SELECT id, codigo, nombre, alcance, version FROM riders WHERE empresa_id = ? AND estado = 'vigente' AND version > 0 AND (banda_id = ? OR banda_id IS NULL) AND (evento_id = ? OR alcance IN (?, 'general'))
    ORDER BY (evento_id = ?) DESC, (alcance = ?) DESC, (banda_id IS NOT NULL) DESC, id DESC LIMIT 1`).bind(E, ev.banda_id, ev.id, a || 'general', ev.id, a || '').first();
}

export async function rutasRider(L) {
  const { db, method, mod, id, idRaw, accion, sub, d, ctx, puede, empresa, user, req } = L;
  const E = empresa.id;
  const no = (p) => (puede(p) ? null : err('Su rol no tiene permiso para esto', 403));
  const pub = (r) => ({ ...r, datos: undefined, alcance_nombre: ALCANCES[r.alcance] });

  if (mod === 'riders' && !id && method === 'GET') {
    const e0 = no('rider.ver'); if (e0) return e0;
    const rs = (await db.prepare(`SELECT r.id, r.codigo, r.nombre, r.banda_id, r.alcance, r.evento_id, r.estado, r.version, r.sin_version, r.actualizado, b.nombre AS banda, e.codigo AS evento_codigo, e.nombre AS evento, u.nombre AS actualizado_por_n,
      (SELECT COUNT(*) FROM eventos x WHERE x.rider_id = r.id AND x.fecha >= date('now') AND x.estado != 'cancelado') AS eventos_proximos
      FROM riders r LEFT JOIN bandas b ON b.id = r.banda_id LEFT JOIN eventos e ON e.id = r.evento_id LEFT JOIN usuarios u ON u.id = r.actualizado_por WHERE r.empresa_id = ? ORDER BY r.estado = 'archivado', b.nombre, r.alcance, r.nombre`).bind(E).all()).results;
    return json(rs.map(pub));
  }
  if (mod === 'riders' && !id && method === 'POST') {
    const e0 = no('rider.editar'); if (e0) return e0;
    const nombre = txt(d.nombre, 120); if (!nombre) return err('Escriba el nombre del rider');
    const alcance = ALCANCES[d.alcance] ? d.alcance : 'general';
    const banda = d.banda_id ? Number(d.banda_id) : null;
    if (banda && !(await db.prepare('SELECT 1 FROM bandas WHERE id = ? AND empresa_id = ?').bind(banda, E).first())) return err('La banda no es válida');
    const evento = alcance === 'evento' ? Number(d.evento_id) || null : null;
    if (alcance === 'evento' && !(evento && (await db.prepare('SELECT 1 FROM eventos WHERE id = ? AND empresa_id = ?').bind(evento, E).first()))) return err('Escoja el evento');
    let datos = plantilla(), base = null;
    if (d.copiar_de) {
      const o = await db.prepare('SELECT id, datos FROM riders WHERE id = ? AND empresa_id = ?').bind(Number(d.copiar_de), E).first();
      if (!o) return err('El rider de origen no es válido');
      const uv = await ultimaVersion(db, o.id); datos = uv ? uv.datos : JSON.parse(o.datos); base = o.id; // se copia lo aprobado, no el borrador
    }
    const codigo = await siguienteCodigo(db, E, 'RID');
    const r = await db.prepare("INSERT INTO riders (empresa_id, codigo, nombre, banda_id, alcance, evento_id, base_id, datos, actualizado, actualizado_por, creado_por) VALUES (?,?,?,?,?,?,?,?,datetime('now'),?,?) RETURNING id")
      .bind(E, codigo, nombre, banda, alcance, evento, base, JSON.stringify(limpiarDatos(datos)), user.id, user.id).first();
    if (evento && d.asignar !== false) await db.prepare('UPDATE eventos SET rider_id = ? WHERE id = ? AND empresa_id = ?').bind(r.id, evento, E).run();
    await auditar(ctx, 'rider_creado', 'rider', r.id, `${codigo} ${nombre}${base ? ' (copia de ' + base + ')' : ''}`);
    return json({ ok: true, id: r.id, codigo }, 201);
  }
  if (mod === 'riders' && id) {
    const r = await db.prepare('SELECT r.*, b.nombre AS banda, e.codigo AS evento_codigo, e.nombre AS evento, u.nombre AS actualizado_por_n FROM riders r LEFT JOIN bandas b ON b.id = r.banda_id LEFT JOIN eventos e ON e.id = r.evento_id LEFT JOIN usuarios u ON u.id = r.actualizado_por WHERE r.id = ? AND r.empresa_id = ?').bind(id, E).first();
    if (!r) return err('Rider no encontrado', 404);
    if (!accion && method === 'GET') {
      const e0 = no('rider.ver'); if (e0) return e0;
      const [vers, evs] = await Promise.all([
        db.prepare('SELECT v.version, v.cambios, v.huella, v.creado, u.nombre AS por FROM rider_versiones v LEFT JOIN usuarios u ON u.id = v.creado_por WHERE v.rider_id = ? ORDER BY v.version DESC').bind(id).all(),
        db.prepare("SELECT id, codigo, nombre, fecha, ciudad, pais FROM eventos WHERE rider_id = ? AND empresa_id = ? AND estado != 'cancelado' ORDER BY fecha DESC LIMIT 30").bind(id, E).all(),
      ]);
      const musicos = (await db.prepare('SELECT m.id, m.nombre, m.instrumento FROM musicos m WHERE m.empresa_id = ? AND m.activo = 1 AND (? IS NULL OR m.id IN (SELECT musico_id FROM banda_miembros WHERE banda_id = ?)) ORDER BY m.nombre').bind(E, r.banda_id, r.banda_id).all()).results;
      return json({ ...pub(r), datos: JSON.parse(r.datos), versiones: vers.results, eventos: evs.results, musicos, editar: puede('rider.editar'), descargar: puede('rider.descargar') });
    }
    if (!accion && method === 'PUT') {
      const e0 = no('rider.editar'); if (e0) return e0;
      const nombre = d.nombre !== undefined ? txt(d.nombre, 120) : r.nombre; if (!nombre) return err('Escriba el nombre del rider');
      const alcance = d.alcance !== undefined ? (ALCANCES[d.alcance] ? d.alcance : null) : r.alcance; if (!alcance) return err('Alcance no válido');
      const estado = d.estado !== undefined ? (['borrador', 'vigente', 'archivado'].includes(d.estado) ? d.estado : null) : r.estado; if (!estado) return err('Estado no válido');
      if (estado === 'vigente' && !r.version) return err('Guarde una versión antes de marcarlo vigente', 409);
      const banda = d.banda_id !== undefined ? (Number(d.banda_id) || null) : r.banda_id;
      if (banda && !(await db.prepare('SELECT 1 FROM bandas WHERE id = ? AND empresa_id = ?').bind(banda, E).first())) return err('La banda no es válida');
      const datos = d.datos !== undefined ? JSON.stringify(limpiarDatos(d.datos)) : r.datos;
      if (datos.length > 200000) return err('El rider es demasiado grande');
      const cambio = datos !== r.datos;
      await db.prepare("UPDATE riders SET nombre = ?, alcance = ?, estado = ?, banda_id = ?, datos = ?, sin_version = CASE WHEN ? THEN 1 ELSE sin_version END, actualizado = datetime('now'), actualizado_por = ? WHERE id = ?")
        .bind(nombre, alcance, estado, banda, datos, cambio ? 1 : 0, user.id, id).run();
      return json({ ok: true, sin_version: cambio ? 1 : r.sin_version });
    }
    if (accion === 'version' && method === 'POST') {
      const e0 = no('rider.editar'); if (e0) return e0;
      const cambios = txt(d.cambios, 500); if (!cambios) return err('Escriba qué cambió en esta versión');
      if (r.version && !r.sin_version) return err('No hay cambios desde la versión ' + r.version, 409);
      const version = r.version + 1, huella = await sha256(r.datos);
      await db.batch([
        db.prepare('INSERT INTO rider_versiones (rider_id, version, datos, cambios, huella, creado_por) VALUES (?,?,?,?,?,?)').bind(id, version, r.datos, cambios, huella, user.id),
        db.prepare("UPDATE riders SET version = ?, sin_version = 0, estado = CASE WHEN estado = 'borrador' THEN 'vigente' ELSE estado END WHERE id = ?").bind(version, id),
      ]);
      await auditar(ctx, 'rider_version', 'rider', id, `v${version}: ${cambios}`);
      return json({ ok: true, version, huella });
    }
    // una versión guardada (para verla o imprimirla); ?imprimir=1 deja constancia de la descarga
    if (accion === 'versiones' && sub && method === 'GET') {
      const imprimir = new URL(req.url).searchParams.get('imprimir') === '1';
      const e0 = no(imprimir ? 'rider.descargar' : 'rider.ver'); if (e0) return e0;
      const v = await db.prepare('SELECT v.*, u.nombre AS por FROM rider_versiones v LEFT JOIN usuarios u ON u.id = v.creado_por WHERE v.rider_id = ? AND v.version = ?').bind(id, Number(sub)).first();
      if (!v) return err('Esa versión no existe', 404);
      if (imprimir) await auditar(ctx, 'rider_descargado', 'rider', id, `v${v.version}`);
      return json({ ...pub(r), version: v.version, fecha: v.creado, por: v.por, cambios: v.cambios, huella: v.huella, datos: JSON.parse(v.datos), empresa: empresa.nombre });
    }
    if (accion === 'restaurar' && sub && method === 'POST') {
      const e0 = no('rider.editar'); if (e0) return e0;
      const v = await db.prepare('SELECT datos FROM rider_versiones WHERE rider_id = ? AND version = ?').bind(id, Number(sub)).first();
      if (!v) return err('Esa versión no existe', 404);
      await db.prepare("UPDATE riders SET datos = ?, sin_version = 1, actualizado = datetime('now'), actualizado_por = ? WHERE id = ?").bind(v.datos, user.id, id).run();
      await auditar(ctx, 'rider_restaurado', 'rider', id, 'borrador desde v' + sub);
      return json({ ok: true });
    }
  }

  // ---------- datos técnicos del evento ----------
  if (mod === 'eventos' && id && accion === 'tecnico') {
    const ev = await db.prepare('SELECT * FROM eventos WHERE id = ? AND empresa_id = ?').bind(id, E).first();
    if (!ev) return err('Evento no encontrado', 404);
    const puedeEditar = puede('rider.editar') || (puede('eventos.editar') && (ev.booking_id === user.id || puede('eventos.editar_todos')));
    if (method === 'GET') {
      const e0 = no('rider.ver') && no('eventos.ver'); if (e0) return e0;
      const rider = ev.rider_id ? await db.prepare('SELECT id, codigo, nombre, alcance, version, estado, sin_version FROM riders WHERE id = ?').bind(ev.rider_id).first() : null;
      const opciones = puede('rider.ver') ? (await db.prepare("SELECT id, codigo, nombre, alcance, version, banda_id FROM riders WHERE empresa_id = ? AND estado != 'archivado' AND (banda_id = ? OR banda_id IS NULL OR ? IS NULL) ORDER BY nombre").bind(E, ev.banda_id, ev.banda_id).all()).results : [];
      const sonidistas = (await db.prepare("SELECT m.id, m.nombre, m.telefono, m.whatsapp FROM evento_asignaciones a JOIN musicos m ON m.id = a.musico_id WHERE a.evento_id = ? AND m.tipo IN ('sonidista','tecnico')").bind(id).all()).results;
      return json({ rider: rider ? { ...rider, alcance_nombre: ALCANCES[rider.alcance] } : null, sugerido: rider ? null : await riderSugerido(db, E, ev), opciones: opciones.map((o) => ({ ...o, alcance_nombre: ALCANCES[o.alcance] })),
        sonido_proveedor: ev.sonido_proveedor, sonido_tecnico: ev.sonido_tecnico, sonido_telefono: ev.sonido_telefono, sonido_email: ev.sonido_email, escenario_info: ev.escenario_info, sonidistas, editar: puedeEditar, ver_rider: puede('rider.ver') });
    }
    if (method === 'PUT') {
      if (!puedeEditar) return err('Su rol no tiene permiso para esto', 403);
      let rider = ev.rider_id;
      if (d.rider_id !== undefined) {
        rider = Number(d.rider_id) || null;
        if (rider && !(await db.prepare('SELECT 1 FROM riders WHERE id = ? AND empresa_id = ?').bind(rider, E).first())) return err('El rider no es válido');
      }
      const v = (k, f) => (d[k] !== undefined ? f(d[k]) : ev[k]);
      const correo = v('sonido_email', (x) => (x ? (emailOk(x) ? String(x).trim() : false) : null)); if (correo === false) return err('El correo del proveedor no es válido');
      await db.prepare('UPDATE eventos SET rider_id = ?, sonido_proveedor = ?, sonido_tecnico = ?, sonido_telefono = ?, sonido_email = ?, escenario_info = ? WHERE id = ?')
        .bind(rider, v('sonido_proveedor', (x) => txt(x, 120)), v('sonido_tecnico', (x) => txt(x, 120)), v('sonido_telefono', (x) => txt(x, 30)), correo, v('escenario_info', (x) => txt(x, 2000)), id).run();
      await auditar(ctx, 'evento_tecnico', 'evento', id, rider ? 'rider ' + rider : '');
      return json({ ok: true });
    }
  }

  // ---------- portal del sonidista ----------
  if (mod === 'portal' && (idRaw === 'tecnico' || idRaw === 'rider') && method === 'GET') {
    const m = await db.prepare('SELECT id, tipo FROM musicos WHERE usuario_id = ? AND empresa_id = ? AND activo = 1').bind(user.id, E).first();
    if (!m) return err('Su usuario no está enlazado a un integrante de esta empresa.', 404);
    if (!['sonidista', 'tecnico'].includes(m.tipo) && L.rol !== 'sonidista') return err('Esta sección es para el sonidista', 403);
    if (idRaw === 'tecnico') {
      const evs = (await db.prepare(`SELECT e.id, e.codigo, e.nombre, e.fecha, e.zona_horaria, e.hora_llegada, e.hora_montaje, e.hora_soundcheck, e.hora_show, e.hora_fin, e.lugar, e.direccion, e.ciudad, e.pais, e.escenario_info,
          e.sonido_proveedor, e.sonido_tecnico, e.sonido_telefono, e.sonido_email, b.nombre AS banda, r.id AS rider_id, r.nombre AS rider, r.version AS rider_version, r.alcance AS rider_alcance
        FROM evento_asignaciones a JOIN eventos e ON e.id = a.evento_id LEFT JOIN bandas b ON b.id = e.banda_id LEFT JOIN riders r ON r.id = e.rider_id
        WHERE a.musico_id = ? AND e.empresa_id = ? AND e.estado NOT IN ${EVENTO_VISIBLE} AND e.fecha >= date('now','-1 day') ORDER BY e.fecha, e.hora_llegada`).bind(m.id, E).all()).results;
      return json(evs.map((e) => ({ ...e, rider_alcance: ALCANCES[e.rider_alcance] || null, rider_version: e.rider_version || null })));
    }
    // portal/rider/:eventoId → la última versión del rider asignado a ese evento
    const ev = await db.prepare(`SELECT e.id, e.codigo, e.nombre, e.fecha, e.rider_id FROM evento_asignaciones a JOIN eventos e ON e.id = a.evento_id WHERE a.musico_id = ? AND e.id = ? AND e.empresa_id = ? AND e.estado NOT IN ${EVENTO_VISIBLE}`).bind(m.id, Number(accion), E).first();
    if (!ev) return err('No está asignado a ese evento', 404);
    if (!ev.rider_id) return err('Este evento todavía no tiene rider asignado', 404);
    const r = await db.prepare('SELECT id, codigo, nombre, alcance, banda_id FROM riders WHERE id = ?').bind(ev.rider_id).first();
    const uv = await ultimaVersion(db, ev.rider_id);
    if (!uv) return err('El rider todavía no tiene una versión guardada', 404);
    await auditar(ctx, 'rider_visto', 'rider', r.id, `v${uv.version} · ${ev.codigo}`);
    const banda = r.banda_id ? (await db.prepare('SELECT nombre FROM bandas WHERE id = ?').bind(r.banda_id).first())?.nombre : null;
    return json({ ...r, banda, alcance_nombre: ALCANCES[r.alcance], evento: ev, empresa: empresa.nombre, ...uv });
  }
  return null;
}
