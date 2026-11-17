// BandGo · Fase 4 · giras y viajes. Una gira agrupa eventos, la delegación (quiénes viajan), los tramos
// (vuelo, autobús, tren, vehículo), los hoteles y otras actividades. El itinerario consolidado se arma con todo eso
// y cada quien ve su versión: la oficina ve costos y contactos privados; el músico solo lo suyo.
import { json, err, txt, soloDigitos, fecha, aCentavos, moneda, emailOk, auditar, escHtml, enviarCorreo, correoBase, cfgCorreo } from './nucleo.js';

export const TIPOS_TRAMO = { vuelo: 'Vuelo', autobus: 'Autobús', tren: 'Tren', privado: 'Vehículo privado', alquilado: 'Vehículo alquilado', otro: 'Otro' };
const ESTADOS_VIAJE = ['planificando', 'confirmado', 'en_curso', 'terminado', 'cancelado'];
const CUBRE = ['empresa', 'cliente', 'booking', 'otro'];
const PARA = ['todos', 'tecnico', 'oficina'];
const EVENTO_VISIBLE = "('cotizacion','negociacion','cancelado')"; // estados que el músico NO ve
const hora = (v) => (/^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v).padStart(5, '0') : null);
const cent = (c) => (c == null ? null : c / 100);
const hoy = () => new Date().toISOString().slice(0, 10);
const sumarDias = (dia, n) => new Date(Date.parse(dia + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ALIAS_PAIS = { rd: 'republica dominicana', 'rep dom': 'republica dominicana', 'republica dominicana': 'republica dominicana', dominicana: 'republica dominicana', do: 'republica dominicana',
  usa: 'estados unidos', us: 'estados unidos', eeuu: 'estados unidos', 'ee uu': 'estados unidos', 'estados unidos de america': 'estados unidos', 'united states': 'estados unidos', pr: 'puerto rico', es: 'espana', mx: 'mexico', co: 'colombia' };
const pais = (t) => { const n = norm(t).replace(/\./g, '').replace(/\s+/g, ' ').trim(); return ALIAS_PAIS[n] || n; };
const archivoUrl = (k) => (k ? '/api/archivo/' + encodeURIComponent(k) : null);
const zona = (z) => { const v = txt(z, 60); if (!v) return null; try { new Intl.DateTimeFormat('en-US', { timeZone: v }); return v; } catch { return null; } };

// hora local + zona horaria → milisegundos UTC (para calcular duraciones y ordenar vuelos entre zonas)
export function aUTC(dia, h, tz) {
  if (!dia || !h) return null;
  const base = Date.parse(`${dia}T${h}:00Z`); if (!tz) return base;
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(base)).map((x) => [x.type, x.value]));
    const comoLocal = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    return base - (comoLocal - base);
  } catch { return base; }
}
const duracion = (t) => { const a = aUTC(t.sale_fecha, t.sale_hora, t.sale_tz), b = aUTC(t.llega_fecha || t.sale_fecha, t.llega_hora, t.llega_tz); return a != null && b != null ? Math.round((b - a) / 60000) : null; };

async function siguienteCodigo(db, E, prefijo) {
  const r = await db.prepare('INSERT INTO correlativos (empresa_id, prefijo, ultimo) VALUES (?, ?, 1) ON CONFLICT(empresa_id, prefijo) DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo').bind(E, prefijo).first();
  return `${prefijo}-${String(r.ultimo).padStart(5, '0')}`;
}
async function musicosValidos(db, E, lista) {
  const v = [...new Set((Array.isArray(lista) ? lista : []).map((x) => Number(typeof x === 'object' && x ? x.musico_id ?? x.id : x)).filter((n) => n > 0))];
  if (!v.length) return [];
  const ok = (await db.prepare(`SELECT id FROM musicos WHERE empresa_id = ? AND id IN (${v.map(() => '?').join(',')})`).bind(E, ...v).all()).results.map((r) => r.id);
  return v.filter((x) => ok.includes(x));
}
async function archivoValido(db, E, clave) {
  if (!clave) return null;
  return (await db.prepare("SELECT clave FROM archivos WHERE clave = ? AND empresa_id = ? AND tipo = 'documento'").bind(clave, E).first())?.clave || false;
}

// ---------- itinerario consolidado ----------
// alcance: { viajeId } | { eventoId } | { musicoId } | { desde, hasta, bandaId } ; oficina = ve costos, contactos privados y lo marcado «solo oficina»
export async function armarItinerario(db, E, alcance, { oficina = false, costos = false, tecnico = false } = {}) {
  const desde = alcance.desde || sumarDias(hoy(), -2), hasta = alcance.hasta || sumarDias(hoy(), 120);
  let tramos, hoteles, acts, eventos;
  const T = `SELECT t.*, v.codigo AS viaje_codigo, v.nombre AS viaje, e.codigo AS evento_codigo, e.nombre AS evento FROM tramos t LEFT JOIN viajes v ON v.id = t.viaje_id LEFT JOIN eventos e ON e.id = t.evento_id`;
  const H = `SELECT h.*, v.codigo AS viaje_codigo, v.nombre AS viaje, e.codigo AS evento_codigo, e.nombre AS evento FROM hoteles h LEFT JOIN viajes v ON v.id = h.viaje_id LEFT JOIN eventos e ON e.id = h.evento_id`;
  const A = `SELECT a.*, v.nombre AS viaje, e.codigo AS evento_codigo, e.nombre AS evento FROM actividades a LEFT JOIN viajes v ON v.id = a.viaje_id LEFT JOIN eventos e ON e.id = a.evento_id`;
  const EV = `SELECT e.id, e.codigo, e.nombre, e.fecha, e.estado, e.zona_horaria, e.hora_llegada, e.hora_montaje, e.hora_soundcheck, e.hora_show, e.hora_fin, e.lugar, e.direccion, e.ciudad, e.pais, e.viaje_id, b.nombre AS banda FROM eventos e LEFT JOIN bandas b ON b.id = e.banda_id`;
  if (alcance.viajeId) {
    const V = alcance.viajeId;
    const evIds = `SELECT id FROM eventos WHERE viaje_id = ${Number(V)} AND empresa_id = ${Number(E)}`;
    tramos = (await db.prepare(`${T} WHERE t.empresa_id = ? AND (t.viaje_id = ? OR t.evento_id IN (${evIds}))`).bind(E, V).all()).results;
    hoteles = (await db.prepare(`${H} WHERE h.empresa_id = ? AND (h.viaje_id = ? OR h.evento_id IN (${evIds}))`).bind(E, V).all()).results;
    acts = (await db.prepare(`${A} WHERE a.empresa_id = ? AND (a.viaje_id = ? OR a.evento_id IN (${evIds}))`).bind(E, V).all()).results;
    eventos = (await db.prepare(`${EV} WHERE e.empresa_id = ? AND e.viaje_id = ? AND e.estado != 'cancelado'`).bind(E, V).all()).results;
  } else if (alcance.eventoId) {
    const X = alcance.eventoId;
    tramos = (await db.prepare(`${T} WHERE t.empresa_id = ? AND t.evento_id = ?`).bind(E, X).all()).results;
    hoteles = (await db.prepare(`${H} WHERE h.empresa_id = ? AND h.evento_id = ?`).bind(E, X).all()).results;
    acts = (await db.prepare(`${A} WHERE a.empresa_id = ? AND a.evento_id = ?`).bind(E, X).all()).results;
    eventos = (await db.prepare(`${EV} WHERE e.empresa_id = ? AND e.id = ?`).bind(E, X).all()).results;
  } else if (alcance.musicoId) {
    // portal: solo lo suyo, y de una gira solo lo que ya se publicó
    const M = alcance.musicoId, pub = '(v.id IS NULL OR v.publicado_en IS NOT NULL)';
    tramos = (await db.prepare(`${T} JOIN tramo_pasajeros p ON p.tramo_id = t.id AND p.musico_id = ? WHERE t.empresa_id = ? AND ${pub} AND COALESCE(t.llega_fecha, t.sale_fecha) >= ? AND t.sale_fecha <= ?`).bind(M, E, desde, hasta).all()).results;
    hoteles = (await db.prepare(`${H} JOIN hotel_huespedes g ON g.hotel_id = h.id AND g.musico_id = ? WHERE h.empresa_id = ? AND ${pub} AND h.salida >= ? AND h.entrada <= ?`).bind(M, E, desde, hasta).all()).results;
    eventos = (await db.prepare(`${EV} JOIN evento_asignaciones x ON x.evento_id = e.id AND x.musico_id = ? WHERE e.empresa_id = ? AND e.estado NOT IN ${EVENTO_VISIBLE} AND e.fecha BETWEEN ? AND ?`).bind(M, E, desde, hasta).all()).results;
    acts = (await db.prepare(`${A} WHERE a.empresa_id = ? AND a.fecha BETWEEN ? AND ? AND a.para != 'oficina' AND (
        (a.viaje_id IN (SELECT vp.viaje_id FROM viaje_personas vp JOIN viajes v2 ON v2.id = vp.viaje_id WHERE vp.musico_id = ? AND v2.publicado_en IS NOT NULL))
        OR (a.viaje_id IS NULL AND a.evento_id IN (SELECT x.evento_id FROM evento_asignaciones x JOIN eventos e2 ON e2.id = x.evento_id WHERE x.musico_id = ? AND e2.estado NOT IN ${EVENTO_VISIBLE})))`).bind(E, desde, hasta, M, M).all()).results;
  } else {
    const B = alcance.bandaId;
    tramos = (await db.prepare(`${T} WHERE t.empresa_id = ? AND COALESCE(t.llega_fecha, t.sale_fecha) >= ? AND t.sale_fecha <= ? ${B ? 'AND (v.banda_id = ? OR e.banda_id = ?)' : ''}`).bind(...[E, desde, hasta, ...(B ? [B, B] : [])]).all()).results;
    hoteles = (await db.prepare(`${H} WHERE h.empresa_id = ? AND h.salida >= ? AND h.entrada <= ? ${B ? 'AND (v.banda_id = ? OR e.banda_id = ?)' : ''}`).bind(...[E, desde, hasta, ...(B ? [B, B] : [])]).all()).results;
    acts = (await db.prepare(`${A} WHERE a.empresa_id = ? AND a.fecha BETWEEN ? AND ? ${B ? 'AND (v.banda_id = ? OR e.banda_id = ?)' : ''}`).bind(...[E, desde, hasta, ...(B ? [B, B] : [])]).all()).results;
    eventos = (await db.prepare(`${EV} WHERE e.empresa_id = ? AND e.fecha BETWEEN ? AND ? AND e.estado NOT IN ('cancelado','cotizacion') ${B ? 'AND e.banda_id = ?' : ''}`).bind(...[E, desde, hasta, ...(B ? [B] : [])]).all()).results;
  }
  if (!oficina) acts = acts.filter((a) => a.para === 'todos' || (a.para === 'tecnico' && tecnico));

  // pasajeros y huéspedes
  const tIds = tramos.map((t) => t.id), hIds = hoteles.map((h) => h.id);
  const pas = tIds.length ? (await db.prepare(`SELECT p.*, m.nombre FROM tramo_pasajeros p JOIN musicos m ON m.id = p.musico_id WHERE p.tramo_id IN (${tIds.map(() => '?').join(',')}) ORDER BY m.nombre`).bind(...tIds).all()).results : [];
  const hue = hIds.length ? (await db.prepare(`SELECT g.*, m.nombre FROM hotel_huespedes g JOIN musicos m ON m.id = g.musico_id WHERE g.hotel_id IN (${hIds.map(() => '?').join(',')}) ORDER BY m.nombre`).bind(...hIds).all()).results : [];
  const yo = alcance.musicoId;
  const items = [];
  const lugarDe = (...x) => x.filter(Boolean).join(', ');
  for (const t of tramos) {
    const ps = pas.filter((p) => p.tramo_id === t.id), mio = yo ? ps.find((p) => p.musico_id === yo) : null;
    items.push({ clave: 't' + t.id, tipo: 'tramo', subtipo: t.tipo, fecha: t.sale_fecha, hora: t.sale_hora, tz: t.sale_tz,
      titulo: `${TIPOS_TRAMO[t.tipo] || 'Traslado'} ${[t.origen_ciudad || t.origen, t.destino_ciudad || t.destino].filter(Boolean).join(' → ')}`,
      sale: { fecha: t.sale_fecha, hora: t.sale_hora, tz: t.sale_tz, lugar: lugarDe(t.origen, t.origen_ciudad, t.origen_pais), terminal: t.terminal },
      llega: { fecha: t.llega_fecha || t.sale_fecha, hora: t.llega_hora, tz: t.llega_tz, lugar: lugarDe(t.destino, t.destino_ciudad, t.destino_pais) },
      duracion: duracion(t), compania: t.compania, numero: t.numero, reserva: t.reserva, equipaje: t.equipaje, notas: t.notas, contacto: t.contacto,
      asiento: mio ? mio.asiento : null, archivo_url: archivoUrl(mio?.archivo_r2 || t.archivo_r2),
      personas: yo ? ps.length : ps.map((p) => ({ musico_id: p.musico_id, nombre: p.nombre, asiento: p.asiento, archivo_url: archivoUrl(p.archivo_r2) })),
      ...(oficina ? { contacto_privado: t.contacto_privado, cubierto_por: t.cubierto_por, orig: { origen: t.origen, origen_ciudad: t.origen_ciudad, origen_pais: t.origen_pais, destino: t.destino, destino_ciudad: t.destino_ciudad, destino_pais: t.destino_pais } } : {}),
      ...(costos ? { costo: cent(t.costo_c), moneda: t.moneda, movimiento_id: t.movimiento_id } : {}),
      id: t.id, viaje_id: t.viaje_id, viaje: t.viaje, evento_id: t.evento_id, evento: t.evento ? `${t.evento_codigo} · ${t.evento}` : null });
  }
  for (const h of hoteles) {
    const gs = hue.filter((g) => g.hotel_id === h.id), mio = yo ? gs.find((g) => g.musico_id === yo) : null;
    const base = { hotel_id: h.id, nombre: h.nombre, lugar: lugarDe(h.direccion, h.ciudad, h.pais), direccion: h.direccion, telefono: h.telefono, reserva: h.reserva, contacto: h.contacto, notas: h.notas,
      habitacion: mio ? mio.habitacion : null, archivo_url: yo ? null : archivoUrl(h.archivo_r2),
      personas: yo ? gs.length : gs.map((g) => ({ musico_id: g.musico_id, nombre: g.nombre, habitacion: g.habitacion })),
      ...(oficina ? { contacto_privado: h.contacto_privado, cubierto_por: h.cubierto_por, habitaciones: h.habitaciones, orig: { ciudad: h.ciudad, pais: h.pais } } : {}),
      ...(costos ? { costo: cent(h.costo_c), moneda: h.moneda, movimiento_id: h.movimiento_id } : {}),
      id: h.id, viaje_id: h.viaje_id, evento_id: h.evento_id, evento: h.evento ? `${h.evento_codigo} · ${h.evento}` : null, entrada: h.entrada, salida: h.salida, entrada_hora: h.entrada_hora, salida_hora: h.salida_hora };
    items.push({ clave: 'he' + h.id, tipo: 'hotel_entrada', fecha: h.entrada, hora: h.entrada_hora, titulo: `Entrada al hotel · ${h.nombre}`, ...base });
    items.push({ clave: 'hs' + h.id, tipo: 'hotel_salida', fecha: h.salida, hora: h.salida_hora, titulo: `Salida del hotel · ${h.nombre}`, ...base });
  }
  for (const a of acts) items.push({ clave: 'a' + a.id, tipo: 'actividad', id: a.id, fecha: a.fecha, hora: a.hora, hora_fin: a.hora_fin, titulo: a.titulo, lugar: lugarDe(a.lugar, a.direccion), lugar_solo: a.lugar, direccion: a.direccion, notas: a.notas, para: a.para, viaje_id: a.viaje_id, evento_id: a.evento_id, evento: a.evento ? `${a.evento_codigo} · ${a.evento}` : null });
  for (const e of eventos) {
    const lugar = lugarDe(e.lugar, e.direccion, e.ciudad, e.pais), ev = `${e.codigo} · ${e.nombre}`;
    const pasos = [['llegada', 'Llegada al lugar', e.hora_llegada], ...(oficina || tecnico ? [['montaje', 'Montaje', e.hora_montaje]] : []), ['soundcheck', 'Prueba de sonido', e.hora_soundcheck], ['show', 'Presentación', e.hora_show]];
    let alguno = false;
    for (const [k, t, h] of pasos) if (h) { alguno = true; items.push({ clave: `e${e.id}${k}`, tipo: 'evento', paso: k, fecha: e.fecha, hora: h, hora_fin: k === 'show' ? e.hora_fin : null, tz: e.zona_horaria, titulo: `${t} · ${e.nombre}`, lugar, direccion: e.direccion, evento_id: e.id, evento: ev, banda: e.banda }); }
    if (!alguno) items.push({ clave: `e${e.id}`, tipo: 'evento', paso: 'show', fecha: e.fecha, hora: null, titulo: `Presentación · ${e.nombre}`, lugar, direccion: e.direccion, evento_id: e.id, evento: ev, banda: e.banda });
  }
  const orden = { hotel_salida: 0, tramo: 1, evento: 2, actividad: 2, hotel_entrada: 3 };
  items.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '99:99').localeCompare(b.hora || '99:99') || orden[a.tipo] - orden[b.tipo]);
  const dias = [];
  for (const it of items) { const ul = dias[dias.length - 1]; if (ul && ul.fecha === it.fecha) ul.items.push(it); else dias.push({ fecha: it.fecha, items: [it] }); }
  return { dias, tramos: tramos.length, hoteles: hoteles.length, eventos: eventos.map((e) => e.id) };
}

// ---------- revisiones de la gira: quién no tiene transporte, hotel o documentos ----------
async function alertasViaje(db, E, V) {
  const out = [];
  const per = (await db.prepare('SELECT vp.musico_id, m.nombre, m.pais_residencia FROM viaje_personas vp JOIN musicos m ON m.id = vp.musico_id WHERE vp.viaje_id = ?').bind(V).all()).results;
  const tramos = (await db.prepare('SELECT * FROM tramos WHERE empresa_id = ? AND (viaje_id = ? OR evento_id IN (SELECT id FROM eventos WHERE viaje_id = ?))').bind(E, V, V).all()).results;
  const nHot = (await db.prepare('SELECT COUNT(*) n FROM hoteles WHERE empresa_id = ? AND (viaje_id = ? OR evento_id IN (SELECT id FROM eventos WHERE viaje_id = ?))').bind(E, V, V).first()).n;
  const pas = tramos.length ? (await db.prepare(`SELECT tramo_id, musico_id FROM tramo_pasajeros WHERE tramo_id IN (${tramos.map(() => '?').join(',')})`).bind(...tramos.map((t) => t.id)).all()).results : [];
  const hue = nHot ? (await db.prepare('SELECT DISTINCT g.musico_id FROM hotel_huespedes g JOIN hoteles h ON h.id = g.hotel_id WHERE h.empresa_id = ? AND (h.viaje_id = ? OR h.evento_id IN (SELECT id FROM eventos WHERE viaje_id = ?))').bind(E, V, V).all()).results.map((r) => r.musico_id) : [];
  for (const p of per) {
    if (tramos.length && !pas.some((x) => x.musico_id === p.musico_id)) out.push({ nivel: 'adv', tipo: 'sin_transporte', musico_id: p.musico_id, texto: `${p.nombre} no está en ningún traslado.` });
    if (nHot && !hue.includes(p.musico_id)) out.push({ nivel: 'adv', tipo: 'sin_hotel', musico_id: p.musico_id, texto: `${p.nombre} no tiene hotel asignado.` });
  }
  // músicos asignados a un evento de la gira que no están en la delegación
  const fuera = (await db.prepare('SELECT DISTINCT m.id, m.nombre, e.codigo FROM evento_asignaciones a JOIN eventos e ON e.id = a.evento_id JOIN musicos m ON m.id = a.musico_id WHERE e.viaje_id = ? AND e.empresa_id = ? AND e.estado != \'cancelado\' AND a.musico_id NOT IN (SELECT musico_id FROM viaje_personas WHERE viaje_id = ?)').bind(V, E, V).all()).results;
  for (const f of fuera) out.push({ nivel: 'adv', tipo: 'fuera_delegacion', musico_id: f.id, texto: `${f.nombre} toca en ${f.codigo} pero no está en la delegación.` });
  // documentos: pasaporte con 6 meses de vigencia y visa del país de destino, en traslados internacionales
  const internac = tramos.filter((t) => t.destino_pais && (!t.origen_pais || pais(t.origen_pais) !== pais(t.destino_pais)));
    // «casa» de cada pasajero: el país de donde sale en su primer traslado (al volver no se pide visa)
    const ordenados = [...tramos].sort((a, b) => (a.sale_fecha + (a.sale_hora || '')).localeCompare(b.sale_fecha + (b.sale_hora || '')));
    const casa = {}; for (const t of ordenados) for (const x of pas.filter((p) => p.tramo_id === t.id)) if (!(x.musico_id in casa) && t.origen_pais) casa[x.musico_id] = pais(t.origen_pais);
  if (internac.length) {
    const ids = [...new Set(pas.filter((x) => internac.some((t) => t.id === x.tramo_id)).map((x) => x.musico_id))];
    const docs = ids.length ? (await db.prepare(`SELECT musico_id, tipo, pais, vence FROM documentos_viaje WHERE empresa_id = ? AND musico_id IN (${ids.map(() => '?').join(',')})`).bind(E, ...ids).all()).results : [];
    const nombres = Object.fromEntries((ids.length ? (await db.prepare(`SELECT id, nombre, pais_residencia FROM musicos WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results : []).map((m) => [m.id, m]));
    const vistos = new Set();
    for (const t of internac) for (const x of pas.filter((p) => p.tramo_id === t.id)) {
      const m = nombres[x.musico_id]; if (!m) continue;
      const llega = t.llega_fecha || t.sale_fecha, mis = docs.filter((d) => d.musico_id === m.id);
      const pasaportes = mis.filter((d) => d.tipo === 'pasaporte');
      const pp = pasaportes.sort((a, b) => String(b.vence || '').localeCompare(String(a.vence || '')))[0];
      const k1 = 'p' + m.id;
      if (!vistos.has(k1)) {
        if (!pp) { out.push({ nivel: 'mal', tipo: 'sin_pasaporte', musico_id: m.id, texto: `${m.nombre} no tiene pasaporte registrado.` }); vistos.add(k1); }
        else if (pp.vence && pp.vence < llega) { out.push({ nivel: 'mal', tipo: 'pasaporte_vencido', musico_id: m.id, texto: `El pasaporte de ${m.nombre} vence el ${pp.vence}, antes del viaje.` }); vistos.add(k1); }
        else if (pp.vence && pp.vence < sumarDias(llega, 180)) { out.push({ nivel: 'adv', tipo: 'pasaporte_6m', musico_id: m.id, texto: `El pasaporte de ${m.nombre} vence el ${pp.vence}: menos de 6 meses después del viaje. Muchos países lo exigen.` }); vistos.add(k1); }
      }
      const destino = pais(t.destino_pais), k2 = 'v' + m.id + destino;
      if (vistos.has(k2) || destino === casa[m.id] || destino === pais(m.pais_residencia) || pasaportes.some((d) => pais(d.pais) === destino)) continue;
      const visa = mis.filter((d) => d.tipo === 'visa' && pais(d.pais) === destino).sort((a, b) => String(b.vence || '').localeCompare(String(a.vence || '')))[0];
      vistos.add(k2);
      if (!visa) out.push({ nivel: 'adv', tipo: 'sin_visa', musico_id: m.id, texto: `${m.nombre} no tiene visa registrada para ${t.destino_pais}. Verifique si la necesita.` });
      else if (visa.vence && visa.vence < llega) out.push({ nivel: 'mal', tipo: 'visa_vencida', musico_id: m.id, texto: `La visa de ${m.nombre} para ${t.destino_pais} vence el ${visa.vence}, antes del viaje.` });
    }
  }
  return out;
}

// avisar a la delegación por correo y dejar enlaces de WhatsApp
async function avisarDelegacion(L, v, cambios) {
  const { db, env, url, empresa } = L;
  const per = (await db.prepare('SELECT m.nombre, m.email, m.whatsapp FROM viaje_personas vp JOIN musicos m ON m.id = vp.musico_id WHERE vp.viaje_id = ? AND m.activo = 1').bind(v.id).all()).results;
  const titulo = cambios.length ? `Cambió el itinerario: ${v.nombre}` : `Itinerario de la gira: ${v.nombre}`;
  const fechas = [v.desde, v.hasta].filter(Boolean).join(' al ');
  const lista = cambios.length ? `<ul>${cambios.slice(0, 15).map((c) => `<li>${escHtml(c)}</li>`).join('')}</ul>` : '';
  let correos = 0;
  if ((await cfgCorreo(env, db)).listo) for (const p of per) {
    if (!emailOk(p.email)) continue;
    try { await enviarCorreo(env, db, { para: p.email, asunto: `${titulo} · ${empresa.nombre}`, html: correoBase(escHtml(titulo), `<p>Hola ${escHtml(p.nombre.split(' ')[0])}:</p><p>${fechas ? '<b>' + escHtml(fechas) + '</b><br>' : ''}Ya puede ver sus vuelos, hotel, horarios y contactos en BandGo.</p>${lista}<p><a href="${url.origin}/app/#/agenda" style="background:#0F172A;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Ver mi itinerario</a></p>`) }); correos++; }
    catch (e) { console.error('aviso gira', e.message); }
  }
  const texto = `${titulo}${fechas ? ' (' + fechas + ')' : ''}.${cambios.length ? ' ' + cambios.slice(0, 5).join(' · ') + '.' : ''} Véalo en BandGo: ${url.origin}/app/#/agenda`;
  return { delegacion: per.length, correos, whatsapp: per.filter((p) => p.whatsapp).map((p) => ({ nombre: p.nombre, enlace: `https://wa.me/${soloDigitos(p.whatsapp)}?text=${encodeURIComponent(texto)}` })) };
}

export async function rutasViajes(L) {
  const { db, method, mod, id, idRaw, accion, d, ctx, puede, empresa, user, req } = L;
  const E = empresa.id;
  const no = (p) => (puede(p) ? null : err('Su rol no tiene permiso para esto', 403));
  const costos = puede('finanzas.ver') || puede('viajes.editar');
  const opc = { oficina: true, costos, tecnico: true };

  // anota un cambio si la gira ya se publicó (para avisar después)
  const anotar = async (viajeId, detalle) => {
    if (!viajeId) return;
    const v = await db.prepare('SELECT publicado_en FROM viajes WHERE id = ? AND empresa_id = ?').bind(viajeId, E).first();
    if (!v?.publicado_en) return;
    await db.batch([db.prepare('INSERT INTO itinerario_cambios (empresa_id, viaje_id, detalle, creado_por) VALUES (?,?,?,?)').bind(E, viajeId, detalle.slice(0, 200), user.id),
      db.prepare('UPDATE viajes SET cambios_sin_avisar = 1 WHERE id = ?').bind(viajeId)]);
  };
  // la gira de un evento (si la tiene) para anotar cambios hechos desde el evento
  const viajeDe = async (viajeId, eventoId) => viajeId || (eventoId ? (await db.prepare('SELECT viaje_id FROM eventos WHERE id = ? AND empresa_id = ?').bind(eventoId, E).first())?.viaje_id : null);
  const refs = async () => {
    const viaje_id = d.viaje_id ? Number(d.viaje_id) : null, evento_id = d.evento_id ? Number(d.evento_id) : null;
    if (!viaje_id && !evento_id) return { e: 'Indique la gira o el evento' };
    if (viaje_id && !(await db.prepare('SELECT 1 FROM viajes WHERE id = ? AND empresa_id = ?').bind(viaje_id, E).first())) return { e: 'La gira no es válida' };
    if (evento_id && !(await db.prepare('SELECT 1 FROM eventos WHERE id = ? AND empresa_id = ?').bind(evento_id, E).first())) return { e: 'El evento no es válido' };
    return { viaje_id, evento_id };
  };
  const gastoValido = async (movId, eventoId) => {
    if (d.movimiento_id === undefined) return undefined;
    if (!d.movimiento_id) return null;
    const m = await db.prepare("SELECT id FROM movimientos WHERE id = ? AND empresa_id = ? AND tipo = 'gasto' AND anulado = 0 AND (evento_id = ? OR ? IS NULL)").bind(Number(movId), E, eventoId, eventoId).first();
    return m ? m.id : false;
  };

  // ---------- giras ----------
  if (mod === 'viajes' && !id && method === 'GET') {
    const e0 = no('viajes.ver'); if (e0) return e0;
    const todos = new URL(req.url).searchParams.get('todos') === '1';
    const rs = (await db.prepare(`SELECT v.*, b.nombre AS banda, u.nombre AS responsable,
      (SELECT COUNT(*) FROM eventos e WHERE e.viaje_id = v.id AND e.estado != 'cancelado') AS eventos,
      (SELECT COUNT(*) FROM viaje_personas p WHERE p.viaje_id = v.id) AS personas,
      (SELECT COUNT(*) FROM tramos t WHERE t.viaje_id = v.id OR t.evento_id IN (SELECT id FROM eventos WHERE viaje_id = v.id)) AS tramos,
      (SELECT COUNT(*) FROM hoteles h WHERE h.viaje_id = v.id OR h.evento_id IN (SELECT id FROM eventos WHERE viaje_id = v.id)) AS hoteles
      FROM viajes v LEFT JOIN bandas b ON b.id = v.banda_id LEFT JOIN usuarios u ON u.id = v.responsable_id
      WHERE v.empresa_id = ? ${todos ? '' : "AND v.estado NOT IN ('terminado','cancelado') AND (v.hasta IS NULL OR v.hasta >= date('now','-7 days'))"} ORDER BY COALESCE(v.desde, '9999') ${todos ? 'DESC' : 'ASC'} LIMIT 300`).bind(E).all()).results;
    return json(rs);
  }
  if (mod === 'viajes' && !id && method === 'POST') {
    const e0 = no('viajes.editar'); if (e0) return e0;
    const nombre = txt(d.nombre, 120); if (!nombre) return err('Escriba el nombre de la gira');
    const desde = fecha(d.desde), hasta = fecha(d.hasta);
    if (desde && hasta && hasta < desde) return err('La fecha final es antes de la inicial');
    const banda = d.banda_id ? Number(d.banda_id) : null;
    if (banda && !(await db.prepare('SELECT 1 FROM bandas WHERE id = ? AND empresa_id = ?').bind(banda, E).first())) return err('La banda no es válida');
    const codigo = await siguienteCodigo(db, E, 'GIR');
    const r = await db.prepare('INSERT INTO viajes (empresa_id, codigo, nombre, banda_id, desde, hasta, estado, responsable_id, notas, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id')
      .bind(E, codigo, nombre, banda, desde, hasta, ESTADOS_VIAJE.includes(d.estado) ? d.estado : 'planificando', d.responsable_id ? Number(d.responsable_id) : user.id, txt(d.notas, 2000), user.id).first();
    await guardarEventosPersonas(r.id, true);
    await auditar(ctx, 'gira_creada', 'viaje', r.id, `${codigo} ${nombre}`);
    return json({ ok: true, id: r.id, codigo }, 201);
  }
  async function guardarEventosPersonas(V, nuevo) {
    if (Array.isArray(d.eventos)) {
      const ev = [...new Set(d.eventos.map(Number).filter((n) => n > 0))];
      await db.prepare('UPDATE eventos SET viaje_id = NULL WHERE viaje_id = ? AND empresa_id = ?').bind(V, E).run();
      if (ev.length) await db.prepare(`UPDATE eventos SET viaje_id = ? WHERE empresa_id = ? AND id IN (${ev.map(() => '?').join(',')})`).bind(V, E, ...ev).run();
    }
    let per = Array.isArray(d.personas) ? await musicosValidos(db, E, d.personas) : null;
    if (nuevo && (!per || !per.length) && Array.isArray(d.eventos) && d.eventos.length) // sin delegación: la del equipo de los eventos
      per = (await db.prepare("SELECT DISTINCT a.musico_id FROM evento_asignaciones a JOIN eventos e ON e.id = a.evento_id WHERE e.viaje_id = ? AND e.estado != 'cancelado'").bind(V).all()).results.map((r) => r.musico_id);
    if (per) {
      const funciones = Object.fromEntries((Array.isArray(d.personas) ? d.personas : []).filter((x) => typeof x === 'object' && x).map((x) => [Number(x.musico_id ?? x.id), txt(x.funcion, 60)]));
      await db.batch([db.prepare('DELETE FROM viaje_personas WHERE viaje_id = ?').bind(V), ...per.map((m) => db.prepare('INSERT INTO viaje_personas (viaje_id, musico_id, funcion) VALUES (?,?,?)').bind(V, m, funciones[m] || null))]);
    }
  }
  if (mod === 'viajes' && id && !accion) {
    const v = await db.prepare('SELECT v.*, b.nombre AS banda, u.nombre AS responsable FROM viajes v LEFT JOIN bandas b ON b.id = v.banda_id LEFT JOIN usuarios u ON u.id = v.responsable_id WHERE v.id = ? AND v.empresa_id = ?').bind(id, E).first();
    if (!v) return err('Gira no encontrada', 404);
    if (method === 'GET') {
      const e0 = no('viajes.ver'); if (e0) return e0;
      const [eventos, personas, cambios] = await Promise.all([
        db.prepare('SELECT e.id, e.codigo, e.nombre, e.fecha, e.estado, e.ciudad, e.pais, e.lugar, e.hora_show FROM eventos e WHERE e.viaje_id = ? AND e.empresa_id = ? ORDER BY e.fecha').bind(id, E).all(),
        db.prepare(`SELECT vp.musico_id, vp.funcion, m.nombre, m.instrumento, m.tipo, m.foto_r2, m.whatsapp, m.email, m.usuario_id,
          (SELECT MAX(vence) FROM documentos_viaje dv WHERE dv.musico_id = m.id AND dv.tipo = 'pasaporte') AS pasaporte_vence,
          (SELECT COUNT(*) FROM documentos_viaje dv WHERE dv.musico_id = m.id AND dv.tipo = 'visa' AND (dv.vence IS NULL OR dv.vence >= date('now'))) AS visas
          FROM viaje_personas vp JOIN musicos m ON m.id = vp.musico_id WHERE vp.viaje_id = ? ORDER BY m.nombre`).bind(id).all(),
        db.prepare('SELECT c.detalle, c.avisado, c.creado, u.nombre AS por FROM itinerario_cambios c LEFT JOIN usuarios u ON u.id = c.creado_por WHERE c.viaje_id = ? ORDER BY c.id DESC LIMIT 50').bind(id).all(),
      ]);
      const itin = await armarItinerario(db, E, { viajeId: id }, opc);
      return json({ ...v, eventos: eventos.results, personas: personas.results.map((p) => ({ ...p, foto_url: archivoUrl(p.foto_r2), foto_r2: undefined })), cambios: cambios.results,
        itinerario: itin.dias, alertas: await alertasViaje(db, E, id), editar: puede('viajes.editar'), publicar: puede('viajes.publicar'), costos });
    }
    if (method === 'PUT') {
      const e0 = no('viajes.editar'); if (e0) return e0;
      const nombre = d.nombre !== undefined ? txt(d.nombre, 120) : v.nombre; if (!nombre) return err('Escriba el nombre de la gira');
      const desde = d.desde !== undefined ? fecha(d.desde) : v.desde, hasta = d.hasta !== undefined ? fecha(d.hasta) : v.hasta;
      if (desde && hasta && hasta < desde) return err('La fecha final es antes de la inicial');
      const estado = d.estado !== undefined ? (ESTADOS_VIAJE.includes(d.estado) ? d.estado : null) : v.estado; if (!estado) return err('Estado no válido');
      const banda = d.banda_id !== undefined ? (d.banda_id ? Number(d.banda_id) : null) : v.banda_id;
      if (banda && !(await db.prepare('SELECT 1 FROM bandas WHERE id = ? AND empresa_id = ?').bind(banda, E).first())) return err('La banda no es válida');
      await db.prepare('UPDATE viajes SET nombre = ?, banda_id = ?, desde = ?, hasta = ?, estado = ?, responsable_id = ?, notas = ? WHERE id = ?')
        .bind(nombre, banda, desde, hasta, estado, d.responsable_id !== undefined ? (Number(d.responsable_id) || null) : v.responsable_id, d.notas !== undefined ? txt(d.notas, 2000) : v.notas, id).run();
      await guardarEventosPersonas(id, false);
      if (desde !== v.desde || hasta !== v.hasta) await anotar(id, `Fechas de la gira: ${desde || '?'} al ${hasta || '?'}`);
      if (estado !== v.estado && estado === 'cancelado') await anotar(id, 'La gira se canceló');
      await auditar(ctx, 'gira_editada', 'viaje', id, nombre);
      return json({ ok: true });
    }
  }
  if (mod === 'viajes' && id && accion === 'publicar' && method === 'POST') {
    const e0 = no('viajes.publicar'); if (e0) return e0;
    const v = await db.prepare('SELECT * FROM viajes WHERE id = ? AND empresa_id = ?').bind(id, E).first(); if (!v) return err('Gira no encontrada', 404);
    if (v.estado === 'cancelado') return err('La gira está cancelada', 409);
    const cambios = v.publicado_en ? (await db.prepare('SELECT detalle FROM itinerario_cambios WHERE viaje_id = ? AND avisado = 0 ORDER BY id').bind(id).all()).results.map((c) => c.detalle) : [];
    const r = await avisarDelegacion(L, v, cambios);
    await db.batch([db.prepare("UPDATE viajes SET publicado_en = COALESCE(publicado_en, datetime('now')), cambios_sin_avisar = 0 WHERE id = ?").bind(id),
      db.prepare('UPDATE itinerario_cambios SET avisado = 1 WHERE viaje_id = ?').bind(id)]);
    await auditar(ctx, v.publicado_en ? 'gira_cambios_avisados' : 'gira_publicada', 'viaje', id, `${r.correos} correos`);
    return json({ ok: true, ...r, cambios: cambios.length });
  }

  // ---------- itinerarios ----------
  if (mod === 'itinerario' && method === 'GET') {
    const e0 = no('viajes.ver'); if (e0) return e0;
    const u = new URL(req.url);
    const desde = fecha(u.searchParams.get('desde')) || hoy(), hasta = fecha(u.searchParams.get('hasta')) || sumarDias(desde, 30);
    const r = await armarItinerario(db, E, { desde, hasta, bandaId: Number(u.searchParams.get('banda')) || null }, opc);
    return json({ desde, hasta, dias: r.dias });
  }
  if (mod === 'eventos' && id && accion === 'logistica' && method === 'GET') {
    const e0 = no('viajes.ver'); if (e0) return e0;
    const e = await db.prepare('SELECT e.id, e.viaje_id, v.codigo AS viaje_codigo, v.nombre AS viaje FROM eventos e LEFT JOIN viajes v ON v.id = e.viaje_id WHERE e.id = ? AND e.empresa_id = ?').bind(id, E).first();
    if (!e) return err('Evento no encontrado', 404);
    const r = await armarItinerario(db, E, { eventoId: id }, opc);
    return json({ ...e, dias: r.dias, editar: puede('viajes.editar'), costos });
  }

  // ---------- tramos, hoteles y actividades ----------
  if (['tramos', 'hoteles', 'actividades'].includes(mod) && ['POST', 'PUT', 'DELETE'].includes(method) && !accion) {
    const e0 = no('viajes.editar'); if (e0) return e0;
    const tabla = mod;
    const actual = id ? await db.prepare(`SELECT * FROM ${tabla} WHERE id = ? AND empresa_id = ?`).bind(id, E).first() : null;
    if (id && !actual) return err('No encontrado', 404);
    if (method === 'DELETE') {
      await db.prepare(`DELETE FROM ${tabla} WHERE id = ?`).bind(id).run();
      const nom = tabla === 'tramos' ? `${TIPOS_TRAMO[actual.tipo]} del ${actual.sale_fecha}` : tabla === 'hoteles' ? `Hotel ${actual.nombre}` : `${actual.titulo} (${actual.fecha})`;
      await anotar(await viajeDe(actual.viaje_id, actual.evento_id), `Se quitó: ${nom}`);
      await auditar(ctx, tabla + '_quitado', tabla, id, nom);
      return json({ ok: true });
    }
    // en PUT, lo que no venga se conserva
    for (const k of Object.keys(actual || {})) if (d[k] === undefined && !['id', 'empresa_id', 'creado', 'creado_por', 'movimiento_id', 'archivo_r2'].includes(k)) d[k] = k.endsWith('_c') ? undefined : actual[k];
    if (actual && d.costo === undefined && actual.costo_c != null) d.costo = actual.costo_c / 100;
    const r0 = await refs(); if (r0.e) return err(r0.e);
    const { viaje_id, evento_id } = r0;
    const arch = await archivoValido(db, E, d.archivo); if (arch === false) return err('El archivo no es válido');
    const archivo = d.archivo === undefined ? actual?.archivo_r2 ?? null : arch;
    const mov = await gastoValido(d.movimiento_id, evento_id); if (mov === false) return err('El gasto no es válido');
    const movimiento = mov === undefined ? actual?.movimiento_id ?? null : mov;
    const costo = aCentavos(d.costo), mon = costo != null ? moneda(d.moneda) : null, cubre = CUBRE.includes(d.cubierto_por) ? d.cubierto_por : null;
    let nuevoId = id, detalle;
    if (tabla === 'tramos') {
      const tipo = TIPOS_TRAMO[d.tipo] ? d.tipo : 'vuelo';
      const sale = fecha(d.sale_fecha); if (!sale) return err('Escriba la fecha de salida');
      const llega = fecha(d.llega_fecha) || sale;
      if (llega < sale) return err('La llegada es antes de la salida');
      const t = { tipo, sale_fecha: sale, sale_hora: hora(d.sale_hora), sale_tz: zona(d.sale_tz), llega_fecha: llega, llega_hora: hora(d.llega_hora), llega_tz: zona(d.llega_tz) };
      const dur = duracion(t); if (dur != null && dur < 0) return err('Con esas horas y zonas la llegada queda antes de la salida');
      const vals = [viaje_id, evento_id, tipo, t.sale_fecha, t.sale_hora, t.sale_tz, t.llega_fecha, t.llega_hora, t.llega_tz, txt(d.origen, 120), txt(d.origen_ciudad, 80), txt(d.origen_pais, 60), txt(d.destino, 120), txt(d.destino_ciudad, 80), txt(d.destino_pais, 60),
        txt(d.compania, 80), txt(d.numero, 30), txt(d.reserva, 30), txt(d.terminal, 30), txt(d.equipaje, 120), txt(d.notas, 1000), txt(d.contacto, 200), txt(d.contacto_privado, 200), d.responsable_id ? Number(d.responsable_id) : (actual?.responsable_id ?? user.id), cubre, costo, mon, archivo, movimiento];
      const cols = 'viaje_id, evento_id, tipo, sale_fecha, sale_hora, sale_tz, llega_fecha, llega_hora, llega_tz, origen, origen_ciudad, origen_pais, destino, destino_ciudad, destino_pais, compania, numero, reserva, terminal, equipaje, notas, contacto, contacto_privado, responsable_id, cubierto_por, costo_c, moneda, archivo_r2, movimiento_id';
      if (id) await db.prepare(`UPDATE tramos SET ${cols.split(', ').map((c) => c + ' = ?').join(', ')} WHERE id = ?`).bind(...vals, id).run();
      else nuevoId = (await db.prepare(`INSERT INTO tramos (empresa_id, ${cols}, creado_por) VALUES (?, ${vals.map(() => '?').join(',')}, ?) RETURNING id`).bind(E, ...vals, user.id).first()).id;
      if (Array.isArray(d.pasajeros)) {
        const ok = await musicosValidos(db, E, d.pasajeros), info = Object.fromEntries(d.pasajeros.filter((x) => typeof x === 'object' && x).map((x) => [Number(x.musico_id), x]));
        const previos = id ? Object.fromEntries((await db.prepare('SELECT musico_id, archivo_r2 FROM tramo_pasajeros WHERE tramo_id = ?').bind(id).all()).results.map((p) => [p.musico_id, p.archivo_r2])) : {};
        const filas = [];
        for (const m of ok) { const a = info[m]?.archivo !== undefined ? await archivoValido(db, E, info[m].archivo) : previos[m] ?? null; filas.push(db.prepare('INSERT INTO tramo_pasajeros (tramo_id, musico_id, asiento, archivo_r2) VALUES (?,?,?,?)').bind(nuevoId, m, txt(info[m]?.asiento, 10), a || null)); }
        await db.batch([db.prepare('DELETE FROM tramo_pasajeros WHERE tramo_id = ?').bind(nuevoId), ...filas]);
      }
      detalle = `${TIPOS_TRAMO[tipo]} ${[d.origen_ciudad || d.origen, d.destino_ciudad || d.destino].filter(Boolean).join(' → ')} · ${sale}${t.sale_hora ? ' ' + t.sale_hora : ''}`;
    }
    if (tabla === 'hoteles') {
      const nombre = txt(d.nombre, 120); if (!nombre) return err('Escriba el nombre del hotel');
      const ent = fecha(d.entrada), sal = fecha(d.salida); if (!ent || !sal) return err('Escriba la entrada y la salida');
      if (sal < ent) return err('La salida es antes de la entrada');
      const vals = [viaje_id, evento_id, nombre, txt(d.direccion, 200), txt(d.ciudad, 80), txt(d.pais, 60), txt(d.telefono, 30), ent, hora(d.entrada_hora), sal, hora(d.salida_hora), txt(d.reserva, 40), Number(d.habitaciones) > 0 ? Math.min(999, Number(d.habitaciones)) : null,
        txt(d.contacto, 200), txt(d.contacto_privado, 200), cubre, costo, mon, archivo, txt(d.notas, 1000), movimiento];
      const cols = 'viaje_id, evento_id, nombre, direccion, ciudad, pais, telefono, entrada, entrada_hora, salida, salida_hora, reserva, habitaciones, contacto, contacto_privado, cubierto_por, costo_c, moneda, archivo_r2, notas, movimiento_id';
      if (id) await db.prepare(`UPDATE hoteles SET ${cols.split(', ').map((c) => c + ' = ?').join(', ')} WHERE id = ?`).bind(...vals, id).run();
      else nuevoId = (await db.prepare(`INSERT INTO hoteles (empresa_id, ${cols}, creado_por) VALUES (?, ${vals.map(() => '?').join(',')}, ?) RETURNING id`).bind(E, ...vals, user.id).first()).id;
      if (Array.isArray(d.huespedes)) {
        const ok = await musicosValidos(db, E, d.huespedes), info = Object.fromEntries(d.huespedes.filter((x) => typeof x === 'object' && x).map((x) => [Number(x.musico_id), x]));
        await db.batch([db.prepare('DELETE FROM hotel_huespedes WHERE hotel_id = ?').bind(nuevoId), ...ok.map((m) => db.prepare('INSERT INTO hotel_huespedes (hotel_id, musico_id, habitacion) VALUES (?,?,?)').bind(nuevoId, m, txt(info[m]?.habitacion, 20)))]);
      }
      detalle = `Hotel ${nombre} · ${ent} al ${sal}`;
    }
    if (tabla === 'actividades') {
      const titulo = txt(d.titulo, 120); if (!titulo) return err('Escriba qué actividad es');
      const dia = fecha(d.fecha); if (!dia) return err('Escriba la fecha');
      const vals = [viaje_id, evento_id, dia, hora(d.hora), hora(d.hora_fin), titulo, txt(d.lugar, 120), txt(d.direccion, 200), txt(d.notas, 1000), PARA.includes(d.para) ? d.para : 'todos'];
      const cols = 'viaje_id, evento_id, fecha, hora, hora_fin, titulo, lugar, direccion, notas, para';
      if (id) await db.prepare(`UPDATE actividades SET ${cols.split(', ').map((c) => c + ' = ?').join(', ')} WHERE id = ?`).bind(...vals, id).run();
      else nuevoId = (await db.prepare(`INSERT INTO actividades (empresa_id, ${cols}, creado_por) VALUES (?, ${vals.map(() => '?').join(',')}, ?) RETURNING id`).bind(E, ...vals, user.id).first()).id;
      detalle = `${titulo} · ${dia}${hora(d.hora) ? ' ' + hora(d.hora) : ''}`;
      if (vals[9] === 'oficina') detalle = null; // lo «solo oficina» no se anuncia
    }
    if (detalle) await anotar(await viajeDe(viaje_id, evento_id), (id ? 'Cambió: ' : 'Nuevo: ') + detalle);
    await auditar(ctx, tabla + (id ? '_editado' : '_creado'), tabla, nuevoId, detalle || '');
    return json({ ok: true, id: nuevoId }, id ? 200 : 201);
  }

  // ---------- portal: mi itinerario ----------
  if (mod === 'portal' && idRaw === 'itinerario' && method === 'GET') {
    const m = await db.prepare('SELECT id, tipo FROM musicos WHERE usuario_id = ? AND empresa_id = ? AND activo = 1').bind(user.id, E).first();
    if (!m) return err('Su usuario no está enlazado a un integrante de esta empresa.', 404);
    const r = await armarItinerario(db, E, { musicoId: m.id }, { oficina: false, costos: false, tecnico: ['sonidista', 'tecnico'].includes(m.tipo) });
    const cambios = (await db.prepare(`SELECT c.detalle, c.creado, v.nombre AS viaje FROM itinerario_cambios c JOIN viajes v ON v.id = c.viaje_id JOIN viaje_personas vp ON vp.viaje_id = v.id AND vp.musico_id = ?
      WHERE c.empresa_id = ? AND c.avisado = 1 AND c.creado >= datetime('now','-7 days') ORDER BY c.id DESC LIMIT 10`).bind(m.id, E).all()).results;
    return json({ dias: r.dias, cambios });
  }
  return null;
}
