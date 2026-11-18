// BandGo · Fase 3 · finanzas: libro multimoneda, cobros y entregas, gastos, nómina por evento, comisiones y cuadre con versiones.
import { json, err, txt, fecha, aCentavos, moneda, MONEDAS, auditar, sha256, rnd } from './nucleo.js';
import { ESTADOS_EVENTO } from './agenda.js';

const hoy = () => new Date().toISOString().slice(0, 10);
const cent = (c) => (c == null ? null : c / 100);
const METODOS = ['efectivo', 'deposito', 'transferencia', 'zelle', 'cheque', 'tarjeta', 'otro'];
export const CAT_EVENTO = ['Dietas y alimentación', 'Vuelos y equipaje', 'Hospedaje', 'Transporte terrestre y combustible', 'Alquiler de instrumentos', 'Sonido y personal técnico', 'Otros'];
export const CAT_GENERAL = ['Oficina y administración', 'Teléfono e internet', 'Publicidad', 'Honorarios profesionales', 'Servicios y mantenimiento', 'Otros'];
const RECEPTORES = ['booking', 'manager', 'artista', 'empresa', 'otro'];

export async function siguiente(db, E, prefijo) {
  const r = await db.prepare('INSERT INTO correlativos (empresa_id, prefijo, ultimo) VALUES (?, ?, 1) ON CONFLICT(empresa_id, prefijo) DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo').bind(E, prefijo).first();
  return `${prefijo}-${String(r.ultimo).padStart(5, '0')}`;
}
// tasa para pasar de una moneda a otra en una fecha: la registrada más reciente (o su inversa). null si no hay.
export async function tasaDe(db, E, de, a, dia) {
  if (de === a) return { tasa_e6: 1e6, fecha: dia, fuente: 'misma moneda' };
  const r = await db.prepare('SELECT tasa_e6, fecha, fuente FROM tasas WHERE empresa_id = ? AND de = ? AND a = ? AND fecha <= ? ORDER BY fecha DESC, id DESC LIMIT 1').bind(E, de, a, dia).first();
  if (r) return r;
  const i = await db.prepare('SELECT tasa_e6, fecha, fuente FROM tasas WHERE empresa_id = ? AND de = ? AND a = ? AND fecha <= ? ORDER BY fecha DESC, id DESC LIMIT 1').bind(E, a, de, dia).first();
  return i ? { tasa_e6: Math.round(1e12 / i.tasa_e6), fecha: i.fecha, fuente: (i.fuente || '') + ' (inversa)' } : null;
}
// convierte un importe a la moneda del evento; la tasa puede venir escrita (manual) o de la tabla de tasas
export async function convertir(db, E, monto_c, mon, monEvento, dia, d) {
  if (mon === monEvento) return { tasa_e6: null, tasa_fecha: null, tasa_fuente: null, monto_evento_c: monto_c };
  let t = null;
  if (d && d.tasa) { const n = Number(String(d.tasa).replace(',', '.')); if (!(n > 0)) throw Object.assign(new Error('La tasa no es válida'), { publico: true }); t = { tasa_e6: Math.round(n * 1e6), fecha: dia, fuente: txt(d.tasa_fuente, 60) || 'Escrita al registrar' }; }
  else t = await tasaDe(db, E, mon, monEvento, dia);
  if (!t) throw Object.assign(new Error(`Falta la tasa de ${mon} a ${monEvento}. Escríbala o regístrela en Finanzas → Tasas de cambio.`), { publico: true, estado: 400 });
  return { tasa_e6: t.tasa_e6, tasa_fecha: t.fecha, tasa_fuente: t.fuente, monto_evento_c: Math.round(monto_c * t.tasa_e6 / 1e6) };
}
const movPub = (m) => ({ ...m, monto: cent(m.monto_c), monto_evento: cent(m.monto_evento_c), tasa: m.tasa_e6 ? m.tasa_e6 / 1e6 : null, comprobante_url: m.comprobante_r2 ? '/api/archivo/' + encodeURIComponent(m.comprobante_r2) : null, monto_c: undefined, monto_evento_c: undefined, tasa_e6: undefined, comprobante_r2: undefined });

async function cuadreDe(db, E, eventoId) {
  let c = await db.prepare('SELECT * FROM cuadres WHERE evento_id = ? AND empresa_id = ?').bind(eventoId, E).first();
  if (!c) c = await db.prepare('INSERT INTO cuadres (empresa_id, evento_id) VALUES (?, ?) RETURNING *').bind(E, eventoId).first();
  return c;
}
// cualquier cambio en las finanzas del evento: si estaba aprobado no se deja; si estaba en revisión vuelve a «abierto»
export async function puedeTocar(db, E, ev) {
  const c = await cuadreDe(db, E, ev.id);
  if (c.estado === 'aprobado') throw Object.assign(new Error('El cuadre de este evento está aprobado. Para corregir, ábralo otra vez (se crea una versión nueva y hay que aprobarla de nuevo).'), { publico: true, estado: 409 });
  if (['en_revision', 'con_artista'].includes(c.estado)) {
    await db.batch([db.prepare("UPDATE cuadres SET estado = 'abierto', actualizado = datetime('now') WHERE id = ?").bind(c.id),
      db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,NULL,?)').bind(ev.id, 'El cuadre volvió a «abierto» porque cambiaron los números después de enviarlo')]);
  }
  return c;
}

// ---------- el cálculo del cuadre (siempre en la moneda del evento) ----------
export async function calcularCuadre(db, E, ev) {
  const M = ev.moneda, faltan = [];
  const movs = (await db.prepare('SELECT * FROM movimientos WHERE evento_id = ? AND anulado = 0 ORDER BY fecha, id').bind(ev.id).all()).results;
  const sum = (f) => movs.filter(f).reduce((a, m) => a + (m.monto_evento_c || 0), 0);
  const cobrado = sum((m) => m.tipo === 'ingreso');
  const porEntregar = sum((m) => m.tipo === 'ingreso' && !m.entregado);
  const sinConfirmar = sum((m) => m.tipo === 'ingreso' && !m.confirmado_en);
  const gastos = {};
  for (const m of movs.filter((x) => x.tipo === 'gasto' && x.cubierto_por !== 'cliente' && !x.nomina_concepto_id)) gastos[m.categoria || 'Otros'] = (gastos[m.categoria || 'Otros'] || 0) + m.monto_evento_c;
  const gastosCliente = sum((m) => m.tipo === 'gasto' && m.cubierto_por === 'cliente');
  const gastosTotal = Object.values(gastos).reduce((a, b) => a + b, 0);
  // nómina: lo acordado menos descuentos, convertido a la moneda del evento con la tasa de la fecha del evento
  const items = (await db.prepare('SELECT n.*, m.nombre FROM nomina n JOIN musicos m ON m.id = n.musico_id WHERE n.evento_id = ?').bind(ev.id).all()).results;
  let nominaTotal = 0;
  for (const it of items) {
    const neto = it.acordado_c - (it.descuento_c || 0) + (it.extras_c || 0);
    if (it.moneda === M) nominaTotal += neto;
    else { const t = await tasaDe(db, E, it.moneda, M, ev.fecha); if (!t) faltan.push(`tasa ${it.moneda}→${M} (nómina de ${it.nombre})`); else nominaTotal += Math.round(neto * t.tasa_e6 / 1e6); }
  }
  // renglones generales de la nómina (transporte, combustible…): cuentan aunque todavía no se hayan pagado
  const generales = (await db.prepare('SELECT * FROM nomina_conceptos WHERE evento_id = ? AND musico_id IS NULL').bind(ev.id).all()).results;
  for (const g of generales) { if (g.moneda === M) nominaTotal += g.monto_c; else { const t = await tasaDe(db, E, g.moneda, M, ev.fecha); if (!t) faltan.push(`tasa ${g.moneda}→${M} (${g.concepto})`); else nominaTotal += Math.round(g.monto_c * t.tasa_e6 / 1e6); } }
  const nominaPagada = sum((m) => m.tipo === 'nomina' || (m.tipo === 'gasto' && m.nomina_concepto_id));
  const coms = (await db.prepare("SELECT * FROM comisiones WHERE evento_id = ? AND estado != 'anulada'").bind(ev.id).all()).results;
  let comTotal = 0;
  for (const c of coms) { if (c.moneda === M) comTotal += c.monto_c; else { const t = await tasaDe(db, E, c.moneda, M, ev.fecha); if (!t) faltan.push(`tasa ${c.moneda}→${M} (comisión de ${c.beneficiario})`); else comTotal += Math.round(c.monto_c * t.tasa_e6 / 1e6); } }
  const sinComprobante = movs.filter((m) => ['gasto', 'nomina'].includes(m.tipo) && !m.comprobante_r2).length;
  const contratado = ev.precio_c || 0;
  const salidas = gastosTotal + nominaTotal + comTotal;
  return {
    moneda: M, contratado: cent(contratado), cobrado: cent(cobrado), por_cobrar: cent(Math.max(0, contratado - cobrado)), por_entregar: cent(porEntregar), sin_confirmar: cent(sinConfirmar),
    gastos: Object.entries(gastos).map(([categoria, c]) => ({ categoria, total: cent(c) })), gastos_total: cent(gastosTotal), gastos_cliente: cent(gastosCliente),
    nomina_total: cent(nominaTotal), nomina_pagada: cent(nominaPagada), nomina_pendiente: cent(Math.max(0, nominaTotal - nominaPagada)),
    comisiones_total: cent(comTotal), salidas_total: cent(salidas), resultado: cent(contratado - salidas), resultado_cobrado: cent(cobrado - salidas),
    sin_comprobante: sinComprobante, faltan_tasas: faltan, movimientos: movs.length,
  };
}

// guarda los renglones extra de la nómina; los generales ya pagados no se pueden quitar ni cambiar
async function guardarConceptos(db, E, ev, lista, enNomina) {
  const monedaDe = Object.fromEntries(enNomina.map((x) => [x.musico_id, x.moneda]));
  const actuales = (await db.prepare('SELECT k.*, x.id AS mov FROM nomina_conceptos k LEFT JOIN movimientos x ON x.nomina_concepto_id = k.id AND x.anulado = 0 WHERE k.evento_id = ?').bind(ev.id).all()).results;
  const pagados = actuales.filter((k) => k.mov);
  if (!Array.isArray(lista)) return async () => { // sin lista: solo se van los renglones de quien salió de la nómina
    await db.prepare(`DELETE FROM nomina_conceptos WHERE evento_id = ? AND musico_id IS NOT NULL${enNomina.length ? ` AND musico_id NOT IN (${enNomina.map(() => '?').join(',')})` : ''}`).bind(ev.id, ...enNomina.map((x) => x.musico_id)).run();
    await recalcularExtras(db, ev.id);
  };
  {
    const nuevos = [];
    for (const x of lista.slice(0, 100)) {
      const concepto = txt(x.concepto, 80), monto = aCentavos(x.monto), mid = Number(x.musico_id) || null;
      if (!concepto) return err('Escriba el concepto de cada renglón extra');
      if (monto == null || monto < 0) return err(`Escriba el importe de «${concepto}»`);
      if (mid && !monedaDe[mid]) continue; // el músico ya no está en la nómina
      nuevos.push({ id: Number(x.id) || null, musico_id: mid, concepto, categoria: CAT_EVENTO.includes(x.categoria) ? x.categoria : 'Otros', monto_c: monto, moneda: mid ? monedaDe[mid] : moneda(x.moneda, ev.moneda), funcion_id: Number(x.funcion_id) || null, gasto_id: Number(x.gasto_id) || null });
    }
    for (const p of pagados) { const n = nuevos.find((x) => x.id === p.id); if (!n || n.monto_c !== p.monto_c || n.moneda !== p.moneda) return err(`«${p.concepto}» ya se pagó: para cambiarlo o quitarlo, anule primero ese pago.`, 409); }
    const quedan = nuevos.filter((x) => !pagados.some((p) => p.id === x.id));
    return async () => { await db.batch([db.prepare(`DELETE FROM nomina_conceptos WHERE evento_id = ?${pagados.length ? ` AND id NOT IN (${pagados.map(() => '?').join(',')})` : ''}`).bind(ev.id, ...pagados.map((p) => p.id)),
      ...quedan.map((x) => db.prepare('INSERT INTO nomina_conceptos (evento_id, empresa_id, musico_id, concepto, categoria, monto_c, moneda, funcion_id, gasto_id) VALUES (?,?,?,?,?,?,?,?,?)').bind(ev.id, E, x.musico_id, x.concepto, x.categoria, x.monto_c, x.moneda, x.funcion_id, x.gasto_id))]);
    await recalcularExtras(db, ev.id); };
  }
}
async function recalcularExtras(db, eventoId) {
  await db.prepare('UPDATE nomina SET extras_c = COALESCE((SELECT SUM(k.monto_c) FROM nomina_conceptos k WHERE k.evento_id = nomina.evento_id AND k.musico_id = nomina.musico_id AND k.moneda = nomina.moneda), 0) WHERE evento_id = ?').bind(eventoId).run();
}
// arma la nómina: equipo con su tarifa, pagos fijos de funciones (manager, administración…), comisiones (fijas de quien no toca
// o por porcentaje) y los gastos guardados marcados «siempre». No repite lo que ya está.
export async function armarNomina(db, E, ev, user) {
  const out = { musicos: 0, conceptos: 0, comisiones: 0 };
  let items = (await db.prepare('SELECT musico_id, moneda FROM nomina WHERE evento_id = ?').bind(ev.id).all()).results;
  const equipo = (await db.prepare(`SELECT m.id, m.usuario_id, a.funcion, COALESCE(bm.tarifa_c, m.tarifa_c) AS tarifa_c, COALESCE(bm.moneda, m.tarifa_moneda) AS moneda FROM evento_asignaciones a JOIN musicos m ON m.id = a.musico_id
    LEFT JOIN banda_miembros bm ON bm.musico_id = m.id AND bm.banda_id = ? WHERE a.evento_id = ?`).bind(ev.banda_id || 0, ev.id).all()).results;
  if (!items.length && equipo.length) {
    await db.batch(equipo.map((m) => db.prepare('INSERT OR IGNORE INTO nomina (evento_id, musico_id, empresa_id, funcion, acordado_c, moneda) VALUES (?,?,?,?,?,?)').bind(ev.id, m.id, E, m.funcion, (m.moneda || ev.moneda) === ev.moneda ? m.tarifa_c || 0 : 0, ev.moneda)));
    out.musicos = equipo.length; items = equipo.map((m) => ({ musico_id: m.id, moneda: ev.moneda }));
  }
  const fs = (await db.prepare(`SELECT f.*, m.nombre AS m_nombre, m.usuario_id AS m_usuario, u.nombre AS u_nombre FROM funciones_pago f LEFT JOIN musicos m ON m.id = f.musico_id LEFT JOIN usuarios u ON u.id = f.usuario_id
    WHERE f.empresa_id = ? AND f.activo = 1 AND (f.banda_id IS NULL OR f.banda_id = ?) AND (f.musico_id IS NULL OR m.activo = 1)`).bind(E, ev.banda_id || 0).all()).results;
  const yaConc = new Set((await db.prepare('SELECT funcion_id FROM nomina_conceptos WHERE evento_id = ? AND funcion_id IS NOT NULL').bind(ev.id).all()).results.map((r) => r.funcion_id));
  const yaCom = new Set((await db.prepare("SELECT funcion_id FROM comisiones WHERE evento_id = ? AND funcion_id IS NOT NULL AND estado != 'anulada'").bind(ev.id).all()).results.map((r) => r.funcion_id));
  const enEquipo = new Set(equipo.map((m) => m.id));
  const NOMBRE = { manager: 'Manager', booking: 'Booking', administracion: 'Administración', direccion: 'Dirección musical', otra: 'Otra función' };
  let cobrado = null;
  for (const f of fs) {
    const usuario = f.usuario_id || f.m_usuario, quien = f.m_nombre || f.u_nombre || '—', etiqueta = f.nombre || NOMBRE[f.funcion] || f.funcion;
    const aplica = f.aplica === 'toca' ? !!f.musico_id && enEquipo.has(f.musico_id)
      : f.aplica === 'propios' ? !!usuario && (ev.booking_id === usuario || ev.manager_id === usuario) : true;
    if (!aplica) continue;
    if (f.modo === 'fijo' && f.musico_id) {
      if (yaConc.has(f.id)) continue;
      const mon = f.moneda || ev.moneda;
      if (!items.some((i) => i.musico_id === f.musico_id)) { await db.prepare('INSERT OR IGNORE INTO nomina (evento_id, musico_id, empresa_id, funcion, acordado_c, moneda) VALUES (?,?,?,?,0,?)').bind(ev.id, f.musico_id, E, etiqueta, mon).run(); items.push({ musico_id: f.musico_id, moneda: mon }); }
      const it = items.find((i) => i.musico_id === f.musico_id);
      await db.prepare('INSERT INTO nomina_conceptos (evento_id, empresa_id, musico_id, concepto, categoria, monto_c, moneda, funcion_id) VALUES (?,?,?,?,?,?,?,?)').bind(ev.id, E, f.musico_id, etiqueta, 'Otros', f.monto_c || 0, it.moneda, f.id).run();
      out.conceptos++;
    } else {
      if (yaCom.has(f.id)) continue;
      let monto = f.monto_c || 0, mon = f.moneda || ev.moneda;
      if (f.modo === 'porcentaje') {
        if (f.base === 'cobrado' && cobrado == null) cobrado = Math.round((await calcularCuadre(db, E, ev)).cobrado * 100);
        monto = Math.round((f.base === 'cobrado' ? cobrado : ev.precio_c || 0) * (f.porcentaje_e2 || 0) / 10000); mon = ev.moneda;
      }
      await db.prepare('INSERT INTO comisiones (empresa_id, evento_id, beneficiario, usuario_id, musico_id, relacion, modo, porcentaje_e2, base, monto_c, moneda, funcion_id, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(E, ev.id, `${quien} (${etiqueta})`, usuario || null, f.musico_id || null, f.funcion === 'booking' ? 'booking' : 'otro', f.modo, f.modo === 'porcentaje' ? f.porcentaje_e2 : null, f.modo === 'porcentaje' ? f.base : null, monto, mon, f.id, user.id).run();
      out.comisiones++;
    }
  }
  const yaG = new Set((await db.prepare('SELECT gasto_id FROM nomina_conceptos WHERE evento_id = ? AND gasto_id IS NOT NULL').bind(ev.id).all()).results.map((r) => r.gasto_id));
  for (const g of (await db.prepare('SELECT * FROM gastos_guardados WHERE empresa_id = ? AND activo = 1 AND siempre = 1').bind(E).all()).results) {
    if (yaG.has(g.id)) continue;
    await db.prepare('INSERT INTO nomina_conceptos (evento_id, empresa_id, musico_id, concepto, categoria, monto_c, moneda, gasto_id) VALUES (?,?,NULL,?,?,?,?,?)').bind(ev.id, E, g.nombre, g.categoria, g.monto_c, g.moneda, g.id).run();
    out.conceptos++;
  }
  await recalcularExtras(db, ev.id);
  return out;
}

export async function rutasFinanzas(L) {
  const { db, req, method, mod, id, idRaw, accion, sub, d, ctx, puede, empresa, user, rol } = L;
  const E = empresa.id;
  const no = (p) => (puede(p) ? null : err('Su rol no tiene permiso para esto', 403));
  // acceso a las finanzas de un evento: todo con finanzas.ver; el booking, las de sus eventos
  const evFin = async (eid) => {
    const ev = await db.prepare('SELECT * FROM eventos WHERE id = ? AND empresa_id = ?').bind(eid, E).first();
    if (!ev) return { e: err('No encontrado', 404) };
    const propio = ev.booking_id === user.id;
    return { ev, ver: puede('finanzas.ver') || (propio && puede('eventos.ver')), registrar: puede('finanzas.registrar') && (puede('finanzas.ver') || propio), propio };
  };

  // ---------- tasas de cambio ----------
  if (mod === 'tasas') {
    if (method === 'GET') { if (!puede('finanzas.ver') && !puede('finanzas.registrar')) return err('Sin permiso', 403);
      return json((await db.prepare('SELECT t.*, u.nombre AS por FROM tasas t LEFT JOIN usuarios u ON u.id = t.creado_por WHERE t.empresa_id = ? ORDER BY t.fecha DESC, t.id DESC LIMIT 100').bind(E).all()).results.map((t) => ({ ...t, tasa: t.tasa_e6 / 1e6 }))); }
    if (method === 'POST') { const e0 = no('tasas.editar'); if (e0) return e0;
      const de = moneda(d.de, ''), a = moneda(d.a, ''), n = Number(String(d.tasa || '').replace(',', '.'));
      if (!MONEDAS.includes(de) || !MONEDAS.includes(a) || de === a) return err('Escoja dos monedas distintas');
      if (!(n > 0)) return err('Escriba la tasa');
      await db.prepare('INSERT INTO tasas (empresa_id, fecha, de, a, tasa_e6, fuente, creado_por) VALUES (?,?,?,?,?,?,?)').bind(E, fecha(d.fecha) || hoy(), de, a, Math.round(n * 1e6), txt(d.fuente, 60), user.id).run();
      await auditar(ctx, 'tasa_registrada', 'tasa', null, `1 ${de} = ${n} ${a}`); return json({ ok: true }, 201); }
  }

  // ---------- libro y resumen ----------
  if (mod === 'movimientos' && method === 'GET' && !id) {
    const e0 = no('finanzas.ver'); if (e0) return e0;
    const u = new URL(req.url), mes = /^\d{4}-\d{2}$/.test(u.searchParams.get('mes') || '') ? u.searchParams.get('mes') : hoy().slice(0, 7);
    const tipo = ['ingreso', 'gasto', 'nomina', 'comision'].includes(u.searchParams.get('tipo')) ? u.searchParams.get('tipo') : null;
    const generales = u.searchParams.get('generales') === '1';
    const rs = (await db.prepare(`SELECT m.*, e.codigo AS evento_codigo, e.nombre AS evento, e.moneda AS evento_moneda, x.nombre AS musico, u.nombre AS por FROM movimientos m LEFT JOIN eventos e ON e.id = m.evento_id LEFT JOIN musicos x ON x.id = m.musico_id LEFT JOIN usuarios u ON u.id = m.creado_por
      WHERE m.empresa_id = ? AND substr(m.fecha, 1, 7) = ? ${tipo ? 'AND m.tipo = ?' : ''} ${generales ? 'AND m.evento_id IS NULL' : ''} ORDER BY m.fecha DESC, m.id DESC LIMIT 500`).bind(...[E, mes, ...(tipo ? [tipo] : [])]).all()).results;
    return json({ mes, movimientos: rs.map(movPub), categorias: { evento: CAT_EVENTO, general: CAT_GENERAL } });
  }
  if (mod === 'finanzas' && idRaw === 'resumen' && method === 'GET') {
    const e0 = no('finanzas.ver'); if (e0) return e0;
    const mes = /^\d{4}-\d{2}$/.test(new URL(req.url).searchParams.get('mes') || '') ? new URL(req.url).searchParams.get('mes') : hoy().slice(0, 7);
    // por moneda ORIGINAL: nunca se suman monedas distintas
    const porMoneda = (await db.prepare("SELECT moneda, tipo, SUM(monto_c) c FROM movimientos WHERE empresa_id = ? AND anulado = 0 AND substr(fecha,1,7) = ? AND NOT (tipo = 'gasto' AND IFNULL(cubierto_por,'') = 'cliente') GROUP BY moneda, tipo").bind(E, mes).all()).results;
    const M = {}; for (const r of porMoneda) { M[r.moneda] = M[r.moneda] || { ingreso: 0, gasto: 0, nomina: 0, comision: 0 }; M[r.moneda][r.tipo] = cent(r.c); }
    const porEntregar = (await db.prepare(`SELECT m.id, m.codigo, m.fecha, m.monto_c, m.moneda, m.receptor, m.metodo, e.id AS evento_id, e.nombre AS evento FROM movimientos m JOIN eventos e ON e.id = m.evento_id WHERE m.empresa_id = ? AND m.tipo = 'ingreso' AND m.anulado = 0 AND m.entregado = 0 ORDER BY m.fecha`).bind(E).all()).results.map((x) => ({ ...x, monto: cent(x.monto_c) }));
    const sinConfirmar = (await db.prepare(`SELECT m.id, m.codigo, m.fecha, m.monto_c, m.moneda, m.receptor, e.id AS evento_id, e.nombre AS evento FROM movimientos m JOIN eventos e ON e.id = m.evento_id WHERE m.empresa_id = ? AND m.tipo = 'ingreso' AND m.anulado = 0 AND m.entregado = 1 AND m.confirmado_en IS NULL ORDER BY m.fecha`).bind(E).all()).results.map((x) => ({ ...x, monto: cent(x.monto_c) }));
    const porCobrar = (await db.prepare(`SELECT e.id, e.codigo, e.nombre, e.fecha, e.moneda, e.precio_c, COALESCE((SELECT SUM(monto_evento_c) FROM movimientos m WHERE m.evento_id = e.id AND m.tipo = 'ingreso' AND m.anulado = 0), 0) AS cobrado_c
      FROM eventos e WHERE e.empresa_id = ? AND e.estado IN ('confirmado','anticipo','pendiente_pago','realizado','en_cuadre') AND e.precio_c IS NOT NULL`).bind(E).all()).results
      .filter((e) => e.precio_c > e.cobrado_c).map((e) => ({ id: e.id, codigo: e.codigo, nombre: e.nombre, fecha: e.fecha, moneda: e.moneda, precio: cent(e.precio_c), cobrado: cent(e.cobrado_c), saldo: cent(e.precio_c - e.cobrado_c) }));
    return json({ mes, por_moneda: M, por_entregar: porEntregar, sin_confirmar: sinConfirmar, por_cobrar: porCobrar });
  }

  // ---------- gastos generales (sin evento) ----------
  if (mod === 'movimientos' && method === 'POST' && !id) {
    const e0 = no('gastos.generales'); if (e0) return e0;
    const monto = aCentavos(d.monto); if (!(monto > 0)) return err('Escriba el importe');
    const mon = moneda(d.moneda, empresa.moneda_base);
    const comp = d.comprobante ? (await db.prepare("SELECT clave FROM archivos WHERE clave = ? AND empresa_id = ? AND tipo = 'documento'").bind(d.comprobante, E).first())?.clave : null;
    if (d.comprobante && !comp) return err('El comprobante no es válido');
    const codigo = await siguiente(db, E, 'MOV');
    const r = await db.prepare(`INSERT INTO movimientos (empresa_id, codigo, tipo, categoria, descripcion, fecha, monto_c, moneda, metodo, referencia, pagador, receptor, comprobante_r2, creado_por) VALUES (?,?, 'gasto', ?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
      .bind(E, codigo, CAT_GENERAL.includes(d.categoria) ? d.categoria : 'Otros', txt(d.descripcion, 200), fecha(d.fecha) || hoy(), monto, mon, METODOS.includes(d.metodo) ? d.metodo : null, txt(d.referencia, 80), txt(d.pagador, 80), txt(d.beneficiario, 80), comp, user.id).first();
    await auditar(ctx, 'gasto_general', 'movimiento', r.id, `${codigo} ${mon} ${monto / 100} ${d.categoria || ''}`);
    return json({ ok: true, id: r.id, codigo }, 201);
  }
  if (mod === 'movimientos' && id && method !== 'GET') {
    const m = await db.prepare('SELECT * FROM movimientos WHERE id = ? AND empresa_id = ?').bind(id, E).first(); if (!m) return err('No encontrado', 404);
    const ev = m.evento_id ? await db.prepare('SELECT * FROM eventos WHERE id = ?').bind(m.evento_id).first() : null;
    if (accion === 'entregar' && method === 'PUT') {
      const f = ev ? await evFin(ev.id) : null; if (!f || !f.registrar || m.tipo !== 'ingreso') return err('Sin permiso', 403);
      if (m.entregado) return err('Ya estaba entregado');
      await puedeTocar(db, E, ev);
      await db.prepare("UPDATE movimientos SET entregado = 1, entregado_a = ?, entregado_en = datetime('now') WHERE id = ?").bind(txt(d.entregado_a, 80) || 'empresa', id).run();
      await auditar(ctx, 'dinero_entregado', 'movimiento', id, `${m.codigo} → ${txt(d.entregado_a, 80) || 'empresa'}`); return json({ ok: true });
    }
    if (accion === 'confirmar' && method === 'PUT') { const e0 = no('finanzas.confirmar'); if (e0) return e0;
      if (m.tipo !== 'ingreso' || !m.entregado) return err('Primero tiene que estar entregado');
      await db.prepare("UPDATE movimientos SET confirmado_por = ?, confirmado_en = datetime('now') WHERE id = ?").bind(user.id, id).run();
      await auditar(ctx, 'dinero_confirmado', 'movimiento', id, m.codigo); return json({ ok: true });
    }
    if (accion === 'anular' && method === 'POST') { const e0 = no('finanzas.anular'); if (e0) return e0;
      if (m.anulado) return err('Ya estaba anulado');
      if (!txt(d.motivo)) return err('Escriba el motivo');
      if (ev) await puedeTocar(db, E, ev);
      const st = [db.prepare('UPDATE movimientos SET anulado = 1, anulado_por = ?, anulado_motivo = ? WHERE id = ?').bind(user.id, txt(d.motivo, 200), id)];
      if (m.tipo === 'comision' && m.comision_id) st.push(db.prepare("UPDATE comisiones SET estado = 'aprobada' WHERE id = ?").bind(m.comision_id));
      await db.batch(st);
      await auditar(ctx, 'movimiento_anulado', 'movimiento', id, `${m.codigo}: ${d.motivo}`); return json({ ok: true });
    }
  }
  // recibo de un pago (para imprimir 80 mm o mandar por WhatsApp)
  if (mod === 'recibo' && id && method === 'GET') {
    const m = await db.prepare('SELECT m.*, e.codigo AS evento_codigo, e.nombre AS evento, e.fecha AS evento_fecha, x.nombre AS musico, x.whatsapp, x.usuario_id, u.nombre AS por FROM movimientos m LEFT JOIN eventos e ON e.id = m.evento_id LEFT JOIN musicos x ON x.id = m.musico_id LEFT JOIN usuarios u ON u.id = m.creado_por WHERE m.id = ? AND m.empresa_id = ?').bind(id, E).first();
    if (!m) return err('No encontrado', 404);
    if (!(puede('finanzas.ver') || puede('nomina.ver') || m.usuario_id === user.id)) return err('Sin permiso', 403);
    let item = null;
    if (m.tipo === 'nomina') { const n = await db.prepare('SELECT acordado_c, descuento_c, extras_c, moneda FROM nomina WHERE evento_id = ? AND musico_id = ?').bind(m.evento_id, m.musico_id).first();
      const pag = (await db.prepare("SELECT SUM(monto_c) c FROM movimientos WHERE evento_id = ? AND musico_id = ? AND tipo = 'nomina' AND anulado = 0 AND moneda = ?").bind(m.evento_id, m.musico_id, n ? n.moneda : m.moneda).first()).c || 0;
      if (n) item = { acordado: cent(n.acordado_c - (n.descuento_c || 0) + (n.extras_c || 0)), pagado: cent(pag), pendiente: cent(Math.max(0, n.acordado_c - (n.descuento_c || 0) + (n.extras_c || 0) - pag)), moneda: n.moneda }; }
    return json({ ...movPub(m), empresa: empresa.nombre, item, usuario_id: undefined });
  }

  // ---------- finanzas de un evento ----------
  if (mod === 'eventos' && id && ['finanzas', 'movimientos', 'nomina', 'comisiones', 'cuadre', 'conceptos'].includes(accion)) {
    const f = await evFin(id); if (f.e) return f.e;
    const { ev } = f;
    if (!f.ver) return err('No puede ver las finanzas de este evento', 403);
    if (accion === 'finanzas' && method === 'GET') {
      const movs = (await db.prepare('SELECT m.*, x.nombre AS musico, u.nombre AS por FROM movimientos m LEFT JOIN musicos x ON x.id = m.musico_id LEFT JOIN usuarios u ON u.id = m.creado_por WHERE m.evento_id = ? ORDER BY m.fecha, m.id').bind(id).all()).results.map(movPub);
      const c = await cuadreDe(db, E, id);
      return json({ evento: { id: ev.id, codigo: ev.codigo, nombre: ev.nombre, fecha: ev.fecha, moneda: ev.moneda, precio: cent(ev.precio_c), estado: ev.estado, estado_nombre: ESTADOS_EVENTO[ev.estado] }, movimientos: movs, cuadre: { estado: c.estado, version: c.version }, calculo: await calcularCuadre(db, E, ev), registrar: f.registrar, categorias: CAT_EVENTO, metodos: METODOS, receptores: RECEPTORES });
    }
    // cobros y gastos del evento
    if (accion === 'movimientos' && method === 'POST') {
      if (!f.registrar) return err('No puede registrar movimientos en este evento', 403);
      if (!['ingreso', 'gasto'].includes(d.tipo)) return err('Tipo no válido');
      const monto = aCentavos(d.monto); if (!(monto > 0)) return err('Escriba el importe');
      await puedeTocar(db, E, ev);
      const mon = moneda(d.moneda, ev.moneda), dia = fecha(d.fecha) || hoy();
      const conv = await convertir(db, E, monto, mon, ev.moneda, dia, d);
      const comp = d.comprobante ? (await db.prepare("SELECT clave FROM archivos WHERE clave = ? AND empresa_id = ? AND tipo = 'documento'").bind(d.comprobante, E).first())?.clave : null;
      if (d.comprobante && !comp) return err('El comprobante no es válido');
      const codigo = await siguiente(db, E, 'MOV');
      const esIng = d.tipo === 'ingreso';
      const r = await db.prepare(`INSERT INTO movimientos (empresa_id, codigo, evento_id, tipo, categoria, descripcion, fecha, monto_c, moneda, tasa_e6, tasa_fecha, tasa_fuente, monto_evento_c, metodo, referencia, pagador, receptor, receptor_usuario_id, cubierto_por, entregado, comprobante_r2, creado_por)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(E, codigo, id, d.tipo, esIng ? (['anticipo', 'pago_final', 'otro'].includes(d.categoria) ? d.categoria : 'pago') : (CAT_EVENTO.includes(d.categoria) ? d.categoria : 'Otros'),
        txt(d.descripcion, 200), dia, monto, mon, conv.tasa_e6, conv.tasa_fecha, conv.tasa_fuente, conv.monto_evento_c, METODOS.includes(d.metodo) ? d.metodo : null, txt(d.referencia, 80), txt(d.pagador, 80),
        esIng ? (RECEPTORES.includes(d.receptor) ? d.receptor : 'empresa') : txt(d.receptor, 80), esIng && d.receptor !== 'empresa' ? user.id : null, esIng ? null : (['empresa', 'cliente', 'booking', 'otro'].includes(d.cubierto_por) ? d.cubierto_por : 'empresa'),
        esIng ? (d.receptor === 'empresa' || !d.receptor ? 1 : d.entregado ? 1 : 0) : 1, comp, user.id).first();
      // estado del evento según lo cobrado
      if (esIng) {
        const cal = await calcularCuadre(db, E, ev);
        const nuevo = cal.por_cobrar <= 0 ? null : ['cotizacion', 'negociacion', 'pendiente', 'confirmado'].includes(ev.estado) ? 'anticipo' : null;
        if (nuevo) await db.prepare("UPDATE eventos SET estado = ?, actualizado = datetime('now') WHERE id = ?").bind(nuevo, id).run();
      }
      await db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(id, user.id, `${esIng ? 'Cobro' : 'Gasto'} ${codigo}: ${mon} ${(monto / 100).toLocaleString('en-US')}${conv.tasa_e6 ? ` (tasa ${conv.tasa_e6 / 1e6} → ${ev.moneda} ${(conv.monto_evento_c / 100).toLocaleString('en-US')})` : ''}`).run();
      await auditar(ctx, esIng ? 'cobro_registrado' : 'gasto_registrado', 'movimiento', r.id, `${codigo} ${mon} ${monto / 100}`);
      return json({ ok: true, id: r.id, codigo }, 201);
    }
    // nómina por presentación
    if (accion === 'nomina') {
      if (method === 'GET') {
        if (!puede('nomina.ver') && !f.propio) return err('Sin permiso', 403);
        let items = (await db.prepare('SELECT n.*, m.nombre, m.instrumento, m.foto_r2, m.whatsapp FROM nomina n JOIN musicos m ON m.id = n.musico_id WHERE n.evento_id = ? ORDER BY m.nombre').bind(id).all()).results;
        const pagos = (await db.prepare("SELECT * FROM movimientos WHERE evento_id = ? AND tipo = 'nomina' AND anulado = 0 ORDER BY fecha, id").bind(id).all()).results;
        const sugerida = !items.length ? (await db.prepare(`SELECT m.id AS musico_id, m.nombre, m.instrumento, a.funcion, COALESCE(bm.tarifa_c, m.tarifa_c) AS tarifa_c, COALESCE(bm.moneda, m.tarifa_moneda) AS moneda FROM evento_asignaciones a JOIN musicos m ON m.id = a.musico_id
          LEFT JOIN banda_miembros bm ON bm.musico_id = m.id AND bm.banda_id = ? WHERE a.evento_id = ? ORDER BY m.nombre`).bind(ev.banda_id || 0, id).all()).results.map((x) => ({ ...x, tarifa: cent(x.tarifa_c), tarifa_c: undefined })) : null;
        const conceptos = (await db.prepare('SELECT k.*, m.nombre AS musico, x.id AS movimiento_id, x.codigo AS movimiento_codigo FROM nomina_conceptos k LEFT JOIN musicos m ON m.id = k.musico_id LEFT JOIN movimientos x ON x.nomina_concepto_id = k.id AND x.anulado = 0 WHERE k.evento_id = ? ORDER BY k.musico_id IS NULL, m.nombre, k.id').bind(id).all()).results
          .map((k) => ({ id: k.id, musico_id: k.musico_id, musico: k.musico, concepto: k.concepto, categoria: k.categoria, monto: cent(k.monto_c), moneda: k.moneda, funcion_id: k.funcion_id, gasto_id: k.gasto_id, pagado: !!k.movimiento_id, movimiento_codigo: k.movimiento_codigo }));
        const guardados = (await db.prepare('SELECT id, nombre, categoria, monto_c, moneda, siempre FROM gastos_guardados WHERE empresa_id = ? AND activo = 1 ORDER BY nombre').bind(E).all()).results.map((g) => ({ ...g, monto: cent(g.monto_c), monto_c: undefined }));
        const nFunciones = (await db.prepare('SELECT COUNT(*) n FROM funciones_pago WHERE empresa_id = ? AND activo = 1').bind(E).first()).n;
        return json({ moneda: ev.moneda, editar: puede('nomina.editar'), pagar: puede('nomina.pagar'), conceptos, guardados, funciones: nFunciones, categorias: CAT_EVENTO, sugerida, items: items.map((it) => { const ps = pagos.filter((p) => p.musico_id === it.musico_id); const pag = ps.filter((p) => p.moneda === it.moneda).reduce((a, p) => a + p.monto_c, 0); const neto = it.acordado_c - (it.descuento_c || 0) + (it.extras_c || 0);
          return { musico_id: it.musico_id, nombre: it.nombre, instrumento: it.instrumento, whatsapp: it.whatsapp, foto_url: it.foto_r2 ? '/api/archivo/' + encodeURIComponent(it.foto_r2) : null, funcion: it.funcion, sustituto: !!it.sustituto, moneda: it.moneda, excepcion: it.excepcion, acordado: cent(it.acordado_c), descuento: cent(it.descuento_c), descuento_motivo: it.descuento_motivo, extras: cent(it.extras_c || 0), neto: cent(neto), pagado: cent(pag), pendiente: cent(Math.max(0, neto - pag)),
            pagos: ps.map((p) => ({ id: p.id, codigo: p.codigo, fecha: p.fecha, monto: cent(p.monto_c), moneda: p.moneda, metodo: p.metodo, referencia: p.referencia, confirmado: !!p.confirmado_en, discrepancia: p.discrepancia, comprobante_url: p.comprobante_r2 ? '/api/archivo/' + encodeURIComponent(p.comprobante_r2) : null })) }; }) });
      }
      if (method === 'PUT' && !sub) { const e0 = no('nomina.editar'); if (e0) return e0;
        await puedeTocar(db, E, ev);
        const validos = new Set((await db.prepare('SELECT id FROM musicos WHERE empresa_id = ?').bind(E).all()).results.map((x) => x.id));
        const lista = (Array.isArray(d.items) ? d.items : []).filter((x) => validos.has(Number(x.musico_id)));
        for (const x of lista) { const mon = moneda(x.moneda, ev.moneda); if (mon !== ev.moneda && !txt(x.excepcion)) return err(`Para pagarle a un músico en ${mon} (el contrato es en ${ev.moneda}) escriba el acuerdo individual.`); if (aCentavos(x.acordado) == null || aCentavos(x.acordado) < 0) return err('Escriba el pago acordado de cada músico'); }
        const conPagos = new Set((await db.prepare("SELECT DISTINCT musico_id FROM movimientos WHERE evento_id = ? AND tipo = 'nomina' AND anulado = 0").bind(id).all()).results.map((x) => x.musico_id));
        const quedan = new Set(lista.map((x) => Number(x.musico_id)));
        for (const mId of conPagos) if (!quedan.has(mId)) return err('No se puede quitar de la nómina a quien ya tiene pagos. Anule primero sus pagos.', 409);
        const aplicarConceptos = await guardarConceptos(db, E, ev, d.conceptos, lista.map((x) => ({ musico_id: Number(x.musico_id), moneda: moneda(x.moneda, ev.moneda) })));
        if (aplicarConceptos instanceof Response) return aplicarConceptos;
        await db.batch([db.prepare('DELETE FROM nomina WHERE evento_id = ?').bind(id), ...lista.map((x) => db.prepare('INSERT INTO nomina (evento_id, musico_id, empresa_id, funcion, sustituto, acordado_c, moneda, descuento_c, descuento_motivo, excepcion) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .bind(id, Number(x.musico_id), E, txt(x.funcion, 60), x.sustituto ? 1 : 0, aCentavos(x.acordado), moneda(x.moneda, ev.moneda), aCentavos(x.descuento) || 0, txt(x.descuento_motivo, 120), moneda(x.moneda, ev.moneda) !== ev.moneda ? txt(x.excepcion, 200) : null))]);
        await aplicarConceptos();
        await db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(id, user.id, `Nómina: ${lista.length} músicos${Array.isArray(d.conceptos) ? ' · ' + d.conceptos.length + ' renglones extra' : ''}`).run();
        await auditar(ctx, 'nomina_guardada', 'evento', id, `${lista.length} músicos`); return json({ ok: true });
      }
      if (method === 'POST' && sub === 'armar') { const e0 = no('nomina.editar'); if (e0) return e0;
        await puedeTocar(db, E, ev);
        const r = await armarNomina(db, E, ev, user);
        await db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(id, user.id, `Nómina armada: ${r.musicos} músicos, ${r.conceptos} renglones extra, ${r.comisiones} comisiones`).run();
        await auditar(ctx, 'nomina_armada', 'evento', id, JSON.stringify(r)); return json({ ok: true, ...r });
      }
      if (method === 'POST' && sub && accion === 'nomina') { const e0 = no('nomina.pagar'); if (e0) return e0;
        const it = await db.prepare('SELECT n.*, m.nombre FROM nomina n JOIN musicos m ON m.id = n.musico_id WHERE n.evento_id = ? AND n.musico_id = ?').bind(id, Number(sub)).first(); if (!it) return err('No está en la nómina', 404);
        const monto = aCentavos(d.monto); if (!(monto > 0)) return err('Escriba el importe');
        await puedeTocar(db, E, ev);
        const pag = (await db.prepare("SELECT COALESCE(SUM(monto_c),0) c FROM movimientos WHERE evento_id = ? AND musico_id = ? AND tipo = 'nomina' AND anulado = 0 AND moneda = ?").bind(id, it.musico_id, it.moneda).first()).c;
        if (pag + monto > it.acordado_c - (it.descuento_c || 0) + (it.extras_c || 0)) return err(`Eso pasa lo acordado. Pendiente: ${it.moneda} ${((it.acordado_c - (it.descuento_c || 0) + (it.extras_c || 0) - pag) / 100).toLocaleString('en-US')}`);
        const conv = await convertir(db, E, monto, it.moneda, ev.moneda, fecha(d.fecha) || hoy(), d);
        const comp = d.comprobante ? (await db.prepare("SELECT clave FROM archivos WHERE clave = ? AND empresa_id = ? AND tipo = 'documento'").bind(d.comprobante, E).first())?.clave : null;
        const codigo = await siguiente(db, E, 'PAG');
        const r = await db.prepare(`INSERT INTO movimientos (empresa_id, codigo, evento_id, tipo, categoria, descripcion, fecha, monto_c, moneda, tasa_e6, tasa_fecha, tasa_fuente, monto_evento_c, metodo, referencia, pagador, receptor, musico_id, comprobante_r2, creado_por)
          VALUES (?,?,?, 'nomina', 'Nómina de músicos', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(E, codigo, id, d.adelanto ? 'Adelanto' : 'Pago', fecha(d.fecha) || hoy(), monto, it.moneda, conv.tasa_e6, conv.tasa_fecha, conv.tasa_fuente, conv.monto_evento_c,
          METODOS.includes(d.metodo) ? d.metodo : null, txt(d.referencia, 80), txt(d.pagador, 80) || user.nombre, it.nombre, it.musico_id, comp, user.id).first();
        await auditar(ctx, 'pago_musico', 'movimiento', r.id, `${codigo} ${it.nombre} ${it.moneda} ${monto / 100}`);
        return json({ ok: true, id: r.id, codigo }, 201);
      }
    }
    // pagar un renglón general de la nómina (transporte, combustible…): queda como gasto del evento
    if (accion === 'conceptos' && sub && method === 'POST') { const e0 = no('nomina.pagar'); if (e0) return e0;
      const k = await db.prepare('SELECT * FROM nomina_conceptos WHERE id = ? AND evento_id = ?').bind(Number(sub), id).first(); if (!k) return err('No encontrado', 404);
      if (k.musico_id) return err('Este renglón se paga junto con el pago del músico');
      if (await db.prepare('SELECT 1 FROM movimientos WHERE nomina_concepto_id = ? AND anulado = 0').bind(k.id).first()) return err('Ya está pagado', 409);
      await puedeTocar(db, E, ev);
      const dia = fecha(d.fecha) || hoy(), conv = await convertir(db, E, k.monto_c, k.moneda, ev.moneda, dia, d);
      const comp = d.comprobante ? (await db.prepare("SELECT clave FROM archivos WHERE clave = ? AND empresa_id = ? AND tipo = 'documento'").bind(d.comprobante, E).first())?.clave : null;
      const codigo = await siguiente(db, E, 'MOV');
      const r = await db.prepare(`INSERT INTO movimientos (empresa_id, codigo, evento_id, tipo, categoria, descripcion, fecha, monto_c, moneda, tasa_e6, tasa_fecha, tasa_fuente, monto_evento_c, metodo, referencia, pagador, receptor, cubierto_por, comprobante_r2, nomina_concepto_id, creado_por)
        VALUES (?,?,?, 'gasto', ?,?,?,?,?,?,?,?,?,?,?,?,?, 'empresa', ?,?,?) RETURNING id`).bind(E, codigo, id, k.categoria || 'Otros', k.concepto, dia, k.monto_c, k.moneda, conv.tasa_e6, conv.tasa_fecha, conv.tasa_fuente, conv.monto_evento_c,
        METODOS.includes(d.metodo) ? d.metodo : null, txt(d.referencia, 80), txt(d.pagador, 80) || user.nombre, txt(d.receptor, 80), comp, k.id, user.id).first();
      await db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(id, user.id, `Pago de ${k.concepto} (${codigo})`).run();
      await auditar(ctx, 'nomina_concepto_pagado', 'movimiento', r.id, `${codigo} ${k.concepto} ${k.moneda} ${k.monto_c / 100}`);
      return json({ ok: true, id: r.id, codigo }, 201);
    }
    // comisiones
    if (accion === 'comisiones') {
      if (method === 'GET') { if (!puede('comisiones.ver') && !f.propio) return err('Sin permiso', 403);
        return json((await db.prepare('SELECT * FROM comisiones WHERE evento_id = ? ORDER BY id').bind(id).all()).results.map((c) => ({ ...c, monto: cent(c.monto_c), porcentaje: c.porcentaje_e2 != null ? c.porcentaje_e2 / 100 : null }))); }
      if (method === 'POST') { const e0 = no('comisiones.editar'); if (e0) return e0;
        if (!txt(d.beneficiario)) return err('Escriba a quién se le paga la comisión');
        await puedeTocar(db, E, ev);
        const modo = d.modo === 'porcentaje' ? 'porcentaje' : 'fijo';
        let monto_c, pct = null, base = null;
        if (modo === 'porcentaje') {
          pct = Math.round(Number(String(d.porcentaje || '').replace(',', '.')) * 100); if (!(pct > 0 && pct <= 10000)) return err('Escriba el porcentaje');
          base = d.base === 'cobrado' ? 'cobrado' : 'contrato';
          const cal = await calcularCuadre(db, E, ev);
          const baseC = base === 'cobrado' ? Math.round(cal.cobrado * 100) : (ev.precio_c || 0);
          if (!baseC) return err(base === 'cobrado' ? 'Todavía no hay nada cobrado' : 'El evento no tiene precio');
          monto_c = Math.round(baseC * pct / 10000);
        } else { monto_c = aCentavos(d.monto); if (!(monto_c > 0)) return err('Escriba el importe'); }
        const r = await db.prepare('INSERT INTO comisiones (empresa_id, evento_id, beneficiario, usuario_id, relacion, modo, porcentaje_e2, base, monto_c, moneda, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
          .bind(E, id, txt(d.beneficiario, 80), Number(d.usuario_id) || null, ['booking', 'referido', 'intermediario', 'otro'].includes(d.relacion) ? d.relacion : 'otro', modo, pct, base, monto_c, modo === 'porcentaje' ? ev.moneda : moneda(d.moneda, ev.moneda), user.id).first();
        await auditar(ctx, 'comision_creada', 'evento', id, `${d.beneficiario} ${monto_c / 100}`); return json({ ok: true, id: r.id }, 201);
      }
    }
    // ---------- cuadre: enviar → revisar → aprobar / devolver; reabrir crea versión nueva ----------
    if (accion === 'cuadre') {
      const c = await cuadreDe(db, E, id);
      if (method === 'GET') {
        const vs = (await db.prepare('SELECT v.*, ue.nombre AS enviado_por_n, ur.nombre AS revisado_por_n, ud.nombre AS decidido_por_n FROM cuadre_versiones v LEFT JOIN usuarios ue ON ue.id = v.enviado_por LEFT JOIN usuarios ur ON ur.id = v.revisado_por LEFT JOIN usuarios ud ON ud.id = v.decidido_por WHERE v.cuadre_id = ? ORDER BY v.version DESC').bind(c.id).all()).results;
        return json({ estado: c.estado, version: c.version, calculo: await calcularCuadre(db, E, ev), versiones: vs.map((v) => ({ ...v, datos: JSON.parse(v.datos) })), puede: { enviar: puede('cuadres.enviar') && (puede('finanzas.ver') || f.propio), revisar: puede('cuadres.revisar'), aprobar: puede('cuadres.aprobar') } });
      }
      const ultima = c.version ? await db.prepare('SELECT * FROM cuadre_versiones WHERE cuadre_id = ? AND version = ?').bind(c.id, c.version).first() : null;
      if (method === 'POST' && sub === 'enviar') {
        if (!(puede('cuadres.enviar') && (puede('finanzas.ver') || f.propio))) return err('No puede enviar este cuadre', 403);
        if (!['abierto', 'devuelto'].includes(c.estado)) return err('El cuadre ya está enviado', 409);
        const cal = await calcularCuadre(db, E, ev);
        if (cal.faltan_tasas.length) return err('Faltan tasas de cambio: ' + cal.faltan_tasas.join(', '));
        const datos = JSON.stringify({ evento: { codigo: ev.codigo, nombre: ev.nombre, fecha: ev.fecha }, calculo: cal, nota: txt(d.nota, 500) });
        const v = c.version + 1;
        await db.batch([db.prepare('INSERT INTO cuadre_versiones (cuadre_id, version, datos, huella, enviado_por) VALUES (?,?,?,?,?)').bind(c.id, v, datos, await sha256(datos), user.id),
          db.prepare("UPDATE cuadres SET estado = 'en_revision', version = ?, actualizado = datetime('now') WHERE id = ?").bind(v, c.id),
          db.prepare("UPDATE eventos SET estado = 'en_cuadre', actualizado = datetime('now') WHERE id = ? AND estado != 'cancelado'").bind(id),
          db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(id, user.id, `Cuadre versión ${v} enviado a revisión`)]);
        await auditar(ctx, 'cuadre_enviado', 'evento', id, `v${v} resultado ${cal.moneda} ${cal.resultado}`); return json({ ok: true, version: v });
      }
      // la versión enviada debe seguir igual a los números de ahora
      const sigueIgual = async () => { const cal = await calcularCuadre(db, E, ev); const ant = JSON.parse(ultima.datos).calculo; return ['contratado', 'cobrado', 'gastos_total', 'nomina_total', 'comisiones_total', 'resultado'].every((k) => ant[k] === cal[k]); };
      if (method === 'POST' && sub === 'revisar') { const e0 = no('cuadres.revisar'); if (e0) return e0;
        if (c.estado !== 'en_revision') return err('El cuadre no está en revisión', 409);
        if (!(await sigueIgual())) { await db.prepare("UPDATE cuadres SET estado = 'abierto' WHERE id = ?").bind(c.id).run(); return err('Los números cambiaron después de enviarlo. Hay que enviarlo otra vez.', 409); }
        await db.batch([db.prepare("UPDATE cuadre_versiones SET revisado_por = ?, revisado_en = datetime('now'), observacion = COALESCE(?, observacion) WHERE id = ?").bind(user.id, txt(d.observacion, 500), ultima.id),
          db.prepare("UPDATE cuadres SET estado = 'con_artista', actualizado = datetime('now') WHERE id = ?").bind(c.id),
          db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(id, user.id, `Cuadre v${c.version} revisado y pasado al artista`)]);
        await auditar(ctx, 'cuadre_revisado', 'evento', id, `v${c.version}`); return json({ ok: true });
      }
      if (method === 'POST' && sub === 'aprobar') { const e0 = no('cuadres.aprobar'); if (e0) return e0;
        if (!['con_artista', 'en_revision'].includes(c.estado)) return err('No hay un cuadre esperando aprobación', 409);
        if (!(await sigueIgual())) { await db.prepare("UPDATE cuadres SET estado = 'abierto' WHERE id = ?").bind(c.id).run(); return err('Los números cambiaron después de enviarlo. Hay que enviarlo otra vez.', 409); }
        await db.batch([db.prepare("UPDATE cuadre_versiones SET decision = 'aprobado', decidido_por = ?, decidido_en = datetime('now') WHERE id = ?").bind(user.id, ultima.id),
          db.prepare("UPDATE cuadres SET estado = 'aprobado', actualizado = datetime('now') WHERE id = ?").bind(c.id),
          db.prepare("UPDATE eventos SET estado = 'liquidado', actualizado = datetime('now') WHERE id = ?").bind(id),
          db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(id, user.id, `Cuadre v${c.version} APROBADO y congelado`)]);
        await auditar(ctx, 'cuadre_aprobado', 'evento', id, `v${c.version} huella ${ultima.huella.slice(0, 12)}`); return json({ ok: true });
      }
      if (method === 'POST' && sub === 'devolver') { if (!puede('cuadres.aprobar') && !puede('cuadres.revisar')) return err('Sin permiso', 403);
        if (!['con_artista', 'en_revision'].includes(c.estado)) return err('No hay un cuadre para devolver', 409);
        if (!txt(d.observacion)) return err('Escriba qué hay que corregir');
        await db.batch([db.prepare("UPDATE cuadre_versiones SET decision = 'devuelto', decidido_por = ?, decidido_en = datetime('now'), observacion = ? WHERE id = ?").bind(user.id, txt(d.observacion, 500), ultima.id),
          db.prepare("UPDATE cuadres SET estado = 'devuelto', actualizado = datetime('now') WHERE id = ?").bind(c.id),
          db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(id, user.id, `Cuadre v${c.version} devuelto: ${txt(d.observacion, 200)}`)]);
        await auditar(ctx, 'cuadre_devuelto', 'evento', id, txt(d.observacion, 200)); return json({ ok: true });
      }
      if (method === 'POST' && sub === 'reabrir') { if (!puede('cuadres.aprobar') && !puede('cuadres.revisar')) return err('Sin permiso', 403);
        if (c.estado !== 'aprobado') return err('Solo se reabre un cuadre aprobado', 409);
        if (!txt(d.motivo)) return err('Escriba por qué se reabre');
        await db.batch([db.prepare("UPDATE cuadres SET estado = 'abierto', actualizado = datetime('now') WHERE id = ?").bind(c.id),
          db.prepare("UPDATE eventos SET estado = 'en_cuadre', actualizado = datetime('now') WHERE id = ?").bind(id),
          db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(id, user.id, `Cuadre reabierto (la v${c.version} aprobada queda guardada): ${txt(d.motivo, 200)}`)]);
        await auditar(ctx, 'cuadre_reabierto', 'evento', id, txt(d.motivo, 200)); return json({ ok: true });
      }
    }
  }
  // comisiones: aprobar, anular, pagar y listado general
  if (mod === 'comisiones') {
    if (method === 'GET' && !id) { if (!puede('comisiones.ver')) return err('Sin permiso', 403);
      return json((await db.prepare('SELECT c.*, e.codigo, e.nombre AS evento, e.fecha FROM comisiones c JOIN eventos e ON e.id = c.evento_id WHERE c.empresa_id = ? ORDER BY e.fecha DESC, c.id DESC LIMIT 300').bind(E).all()).results.map((c) => ({ ...c, monto: cent(c.monto_c), porcentaje: c.porcentaje_e2 != null ? c.porcentaje_e2 / 100 : null }))); }
    if (id) {
      const c = await db.prepare('SELECT * FROM comisiones WHERE id = ? AND empresa_id = ?').bind(id, E).first(); if (!c) return err('No encontrado', 404);
      const e0 = no('comisiones.editar'); if (e0) return e0;
      const ev = await db.prepare('SELECT * FROM eventos WHERE id = ?').bind(c.evento_id).first();
      if (method === 'PUT') {
        if (!['aprobada', 'anulada'].includes(d.estado) || c.estado === 'pagada') return err('No se puede cambiar', 409);
        await puedeTocar(db, E, ev);
        await db.prepare('UPDATE comisiones SET estado = ? WHERE id = ?').bind(d.estado, id).run();
        await auditar(ctx, 'comision_' + d.estado, 'evento', c.evento_id, c.beneficiario); return json({ ok: true });
      }
      if (method === 'POST' && accion === 'pagar') {
        if (c.estado !== 'aprobada') return err('Primero apruebe la comisión', 409);
        await puedeTocar(db, E, ev);
        const conv = await convertir(db, E, c.monto_c, c.moneda, ev.moneda, fecha(d.fecha) || hoy(), d);
        const codigo = await siguiente(db, E, 'MOV');
        await db.batch([db.prepare(`INSERT INTO movimientos (empresa_id, codigo, evento_id, tipo, categoria, descripcion, fecha, monto_c, moneda, tasa_e6, tasa_fecha, tasa_fuente, monto_evento_c, metodo, referencia, receptor, comision_id, creado_por) VALUES (?,?,?, 'comision', 'Comisiones', ?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(E, codigo, c.evento_id, `Comisión ${c.relacion} · ${c.beneficiario}`, fecha(d.fecha) || hoy(), c.monto_c, c.moneda, conv.tasa_e6, conv.tasa_fecha, conv.tasa_fuente, conv.monto_evento_c, METODOS.includes(d.metodo) ? d.metodo : null, txt(d.referencia, 80), c.beneficiario, id, user.id),
          db.prepare("UPDATE comisiones SET estado = 'pagada' WHERE id = ?").bind(id)]);
        await auditar(ctx, 'comision_pagada', 'evento', c.evento_id, `${codigo} ${c.beneficiario}`); return json({ ok: true, codigo });
      }
    }
  }
  if (mod === 'cuadres' && method === 'GET') {
    if (!puede('finanzas.ver') && !puede('cuadres.aprobar')) return err('Sin permiso', 403);
    const rs = (await db.prepare(`SELECT c.*, e.codigo, e.nombre, e.fecha, e.moneda, e.precio_c, b.nombre AS banda, (SELECT datos FROM cuadre_versiones v WHERE v.cuadre_id = c.id AND v.version = c.version) AS datos
      FROM cuadres c JOIN eventos e ON e.id = c.evento_id LEFT JOIN bandas b ON b.id = e.banda_id WHERE c.empresa_id = ? AND (c.version > 0 OR e.estado IN ('realizado','en_cuadre')) ORDER BY CASE c.estado WHEN 'con_artista' THEN 0 WHEN 'en_revision' THEN 1 WHEN 'devuelto' THEN 2 WHEN 'abierto' THEN 3 ELSE 4 END, e.fecha DESC LIMIT 200`).bind(E).all()).results;
    return json(rs.map((c) => { const dt = c.datos ? JSON.parse(c.datos) : null; return { evento_id: c.evento_id, codigo: c.codigo, nombre: c.nombre, fecha: c.fecha, banda: c.banda, moneda: c.moneda, estado: c.estado, version: c.version, resultado: dt ? dt.calculo.resultado : null, cobrado: dt ? dt.calculo.cobrado : null }; }));
  }
  if (mod === 'nominas' && method === 'GET') {
    if (!puede('nomina.ver')) return err('Sin permiso', 403);
    const rs = (await db.prepare(`SELECT e.id, e.codigo, e.nombre, e.fecha, e.moneda, b.nombre AS banda, COUNT(n.musico_id) AS musicos, SUM(n.acordado_c - n.descuento_c + n.extras_c) AS acordado_c,
      (SELECT COALESCE(SUM(monto_c),0) FROM movimientos m WHERE m.evento_id = e.id AND m.tipo = 'nomina' AND m.anulado = 0) AS pagado_c,
      (SELECT COUNT(*) FROM movimientos m WHERE m.evento_id = e.id AND m.tipo = 'nomina' AND m.anulado = 0 AND m.discrepancia IS NOT NULL) AS discrepancias
      FROM eventos e LEFT JOIN nomina n ON n.evento_id = e.id LEFT JOIN bandas b ON b.id = e.banda_id WHERE e.empresa_id = ? AND e.estado NOT IN ('cancelado','cotizacion') GROUP BY e.id ORDER BY e.fecha DESC LIMIT 200`).bind(E).all()).results;
    return json(rs.map((x) => ({ ...x, acordado: cent(x.acordado_c || 0), pagado: cent(x.pagado_c), acordado_c: undefined, pagado_c: undefined })));
  }

  // ---------- portal: mis pagos ----------
  if (mod === 'portal' && idRaw === 'pagos') {
    const m = await db.prepare('SELECT id FROM musicos WHERE usuario_id = ? AND empresa_id = ? AND activo = 1').bind(user.id, E).first();
    if (!m) return err('Su usuario no está enlazado a un integrante de esta empresa.', 404);
    if (method === 'GET') {
      const items = (await db.prepare('SELECT n.*, e.codigo, e.nombre, e.fecha FROM nomina n JOIN eventos e ON e.id = n.evento_id WHERE n.musico_id = ? AND n.empresa_id = ? ORDER BY e.fecha DESC').bind(m.id, E).all()).results;
      const conc = (await db.prepare('SELECT evento_id, concepto, monto_c, moneda FROM nomina_conceptos WHERE musico_id = ? AND empresa_id = ?').bind(m.id, E).all()).results;
      const pagos = (await db.prepare("SELECT id, codigo, evento_id, fecha, monto_c, moneda, metodo, referencia, confirmado_en, discrepancia, descripcion FROM movimientos WHERE musico_id = ? AND empresa_id = ? AND tipo = 'nomina' AND anulado = 0 ORDER BY fecha DESC, id DESC").bind(m.id, E).all()).results;
      return json(items.map((it) => { const ps = pagos.filter((p) => p.evento_id === it.evento_id); const neto = it.acordado_c - (it.descuento_c || 0) + (it.extras_c || 0); const pag = ps.filter((p) => p.moneda === it.moneda).reduce((a, p) => a + p.monto_c, 0);
        return { evento_id: it.evento_id, codigo: it.codigo, evento: it.nombre, fecha: it.fecha, moneda: it.moneda, acordado: cent(it.acordado_c), descuento: cent(it.descuento_c), descuento_motivo: it.descuento_motivo, extras: cent(it.extras_c || 0), extras_detalle: conc.filter((k) => k.evento_id === it.evento_id).map((k) => ({ concepto: k.concepto, monto: cent(k.monto_c), moneda: k.moneda })), neto: cent(neto), pagado: cent(pag), pendiente: cent(Math.max(0, neto - pag)),
          pagos: ps.map((p) => ({ id: p.id, codigo: p.codigo, fecha: p.fecha, monto: cent(p.monto_c), moneda: p.moneda, metodo: p.metodo, referencia: p.referencia, tipo: p.descripcion, confirmado: !!p.confirmado_en, discrepancia: p.discrepancia })) }; }));
    }
    if (method === 'POST' && accion && sub === 'confirmar') {
      const p = await db.prepare("SELECT id, codigo FROM movimientos WHERE id = ? AND musico_id = ? AND empresa_id = ? AND tipo = 'nomina' AND anulado = 0").bind(Number(accion), m.id, E).first();
      if (!p) return err('No encontrado', 404);
      if (d.discrepancia) { await db.prepare('UPDATE movimientos SET discrepancia = ?, confirmado_en = NULL WHERE id = ?').bind(txt(d.discrepancia, 300), p.id).run(); await auditar(ctx, 'pago_discrepancia', 'movimiento', p.id, txt(d.discrepancia, 200)); }
      else { await db.prepare("UPDATE movimientos SET confirmado_por = ?, confirmado_en = datetime('now'), discrepancia = NULL WHERE id = ?").bind(user.id, p.id).run(); await auditar(ctx, 'pago_confirmado', 'movimiento', p.id, p.codigo); }
      return json({ ok: true });
    }
  }
  return null;
}
