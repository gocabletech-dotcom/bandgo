// BandGo · Fase 6 · reportes. Cada reporte sale de los movimientos y cálculos de origen (nada se guarda aparte),
// separa por moneda y, si se pide «consolidar», convierte a la moneda base con la tasa registrada a la fecha de cada
// evento o movimiento, sin tocar los registros. Se exportan a Excel (.xlsx) y a PDF (hoja para imprimir).
import { json, err, fecha, aCentavos, txt, auditar } from './nucleo.js';
import { tasaDe, calcularCuadre } from './finanzas.js';
import { ESTADOS_EVENTO } from './agenda.js';
import { crearXlsx } from './xlsx.js';

const cent = (c) => (c == null ? null : Math.round(c) / 100);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesTxt = (f) => (f ? `${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}` : '');
const VIAJE = ['Dietas y alimentación', 'Vuelos y equipaje', 'Hospedaje', 'Transporte terrestre y combustible'];
const CONFIRMADOS = "('confirmado','anticipo','pendiente_pago','realizado','en_cuadre','liquidado')";
const METODOS = { efectivo: 'Efectivo', deposito: 'Depósito', transferencia: 'Transferencia', zelle: 'Zelle', cheque: 'Cheque', tarjeta: 'Tarjeta', otro: 'Otro' };

export const REPORTES = {
  ventas: { titulo: 'Ventas', agrupar: { mes: 'Mes', anio: 'Año', booking: 'Booking', pais: 'País', tipo: 'Público / privado', banda: 'Banda', estado: 'Estado', cliente: 'Cliente' } },
  cobros: { titulo: 'Cobrado y cuentas por cobrar', agrupar: { evento: 'Evento', antiguedad: 'Antigüedad', cliente: 'Cliente', booking: 'Booking' } },
  gastos: { titulo: 'Gastos', agrupar: { categoria: 'Categoría', mes: 'Mes', evento: 'Evento', clase: 'Evento / general / nómina / comisiones' } },
  rentabilidad: { titulo: 'Rentabilidad', agrupar: { evento: 'Evento', mes: 'Mes', anio: 'Año', pais: 'País', booking: 'Booking', banda: 'Banda' } },
  presupuesto: { titulo: 'Presupuesto estimado frente a resultado real', agrupar: { evento: 'Evento' } },
  pagos: { titulo: 'Pagos a músicos', agrupar: { musico: 'Músico', mes: 'Mes', metodo: 'Método', estado: 'Estado del pago', pendientes: 'Pendientes por pagar' } },
  control: { titulo: 'Comprobantes y entregas de dinero', agrupar: { detalle: 'Detalle' } },
};

export async function rutasReportes(L) {
  const { db, req, method, mod, idRaw, ctx, puede, empresa } = L;
  if (mod !== 'reportes' || method !== 'GET') return null;
  const E = empresa.id, BASE = empresa.moneda_base || 'USD';
  if (!puede('reportes.ver')) return err('Su rol no tiene permiso para esto', 403);
  const u = new URL(req.url), q = (k) => u.searchParams.get(k) || '';
  if (!idRaw) {
    // catálogo de reportes y opciones de los filtros
    const [bandas, bookings, paises, clientes] = await Promise.all([
      db.prepare('SELECT id, nombre FROM bandas WHERE empresa_id = ? ORDER BY nombre').bind(E).all(),
      db.prepare("SELECT DISTINCT u.id, u.nombre FROM eventos e JOIN usuarios u ON u.id = e.booking_id WHERE e.empresa_id = ? ORDER BY u.nombre").bind(E).all(),
      db.prepare("SELECT DISTINCT pais FROM eventos WHERE empresa_id = ? AND pais IS NOT NULL AND pais != '' ORDER BY pais").bind(E).all(),
      db.prepare('SELECT id, nombre FROM clientes WHERE empresa_id = ? ORDER BY nombre LIMIT 500').bind(E).all(),
    ]);
    return json({ reportes: Object.fromEntries(Object.entries(REPORTES).map(([k, v]) => [k, { titulo: v.titulo, agrupar: v.agrupar }])), estados: ESTADOS_EVENTO, moneda_base: BASE,
      bandas: bandas.results, bookings: bookings.results, paises: paises.results.map((r) => r.pais), clientes: clientes.results, exportar: puede('reportes.exportar') });
  }
  const R = REPORTES[idRaw]; if (!R) return err('Reporte no encontrado', 404);
  const formato = q('formato');
  if ((formato === 'xlsx' || q('imprimir') === '1') && !puede('reportes.exportar')) return err('Su rol no tiene permiso para exportar reportes', 403);
  const hoy = new Date().toISOString().slice(0, 10);
  const F = { desde: fecha(q('desde')) || hoy.slice(0, 4) + '-01-01', hasta: fecha(q('hasta')) || hoy.slice(0, 4) + '-12-31', pais: txt(q('pais'), 60), moneda: ['USD', 'DOP', 'EUR'].includes(q('moneda')) ? q('moneda') : null,
    banda: Number(q('banda')) || null, booking: Number(q('booking')) || null, cliente: Number(q('cliente')) || null, evento: Number(q('evento')) || null, estado: ESTADOS_EVENTO[q('estado')] ? q('estado') : null,
    tipo: ['publico', 'privado'].includes(q('tipo')) ? q('tipo') : null, consolidar: q('consolidar') === '1' };
  if (F.hasta < F.desde) return err('La fecha final es antes de la inicial');
  const agrupar = R.agrupar[q('agrupar')] ? q('agrupar') : Object.keys(R.agrupar)[0];

  // filtro de eventos (se usa en casi todos los reportes)
  const filtroEv = (al = 'e', { fechas = true } = {}) => {
    const w = [`${al}.empresa_id = ?`], b = [E];
    if (fechas) { w.push(`${al}.fecha BETWEEN ? AND ?`); b.push(F.desde, F.hasta); }
    if (F.estado) { w.push(`${al}.estado = ?`); b.push(F.estado); } else w.push(`${al}.estado != 'cancelado'`);
    for (const [k, c] of [['pais', 'pais'], ['banda', 'banda_id'], ['booking', 'booking_id'], ['cliente', 'cliente_id'], ['tipo', 'tipo'], ['evento', 'id']]) if (F[k]) { w.push(`${al}.${c} = ?`); b.push(F[k]); }
    if (F.moneda) { w.push(`${al}.moneda = ?`); b.push(F.moneda); }
    return { w: w.join(' AND '), b };
  };
  const hayFiltroEvento = F.pais || F.banda || F.booking || F.cliente || F.tipo || F.evento || F.estado;

  // conversión a la moneda base (con caché por moneda y día)
  const cache = new Map(), usadas = new Map(), sinTasa = new Set();
  const aBase = async (c, mon, dia) => {
    if (c == null) return null; if (mon === BASE) return c;
    const k = mon + dia;
    if (!cache.has(k)) cache.set(k, await tasaDe(db, E, mon, BASE, dia));
    const t = cache.get(k);
    if (!t) { sinTasa.add(`${mon}→${BASE} al ${dia}`); return null; }
    usadas.set(`${mon}→${BASE} ${t.fecha}`, `1 ${mon} = ${(t.tasa_e6 / 1e6).toLocaleString('es-DO', { maximumFractionDigits: 6 })} ${BASE} (${t.fecha}${t.fuente ? ', ' + t.fuente : ''})`);
    return Math.round(c * t.tasa_e6 / 1e6);
  };

  let columnas = [], filas = [], notas = [], grafico = null;
  const D = (k, t) => ({ k, t, tipo: 'dinero' }), N = (k, t) => ({ k, t, tipo: 'num' }), X = (k, t) => ({ k, t, tipo: 'texto' }), P = (k, t) => ({ k, t, tipo: 'pct' });
  // agrega filas por (grupo, moneda) sumando las claves numéricas
  const acumular = (lista, claveGrupo, sumas) => {
    const m = new Map();
    for (const x of lista) {
      const g = claveGrupo(x), k = g.k + '|' + x.moneda;
      if (!m.has(k)) m.set(k, { grupo: g.t, orden: g.o ?? g.t, moneda: x.moneda, ...Object.fromEntries(sumas.map((s) => [s, 0])) });
      const a = m.get(k); for (const s of sumas) a[s] += x[s] || 0;
    }
    return [...m.values()].sort((a, b) => String(a.orden).localeCompare(String(b.orden)) || a.moneda.localeCompare(b.moneda));
  };
  const grupoEv = (e) => ({
    mes: { k: e.fecha.slice(0, 7), t: mesTxt(e.fecha), o: e.fecha.slice(0, 7) }, anio: { k: e.fecha.slice(0, 4), t: e.fecha.slice(0, 4) },
    booking: { k: e.booking || '—', t: e.booking || 'Sin booking' }, pais: { k: e.pais || '—', t: e.pais || 'Sin país' }, tipo: { k: e.tipo, t: e.tipo === 'publico' ? 'Público' : 'Privado' },
    banda: { k: e.banda || '—', t: e.banda || 'Sin banda' }, estado: { k: e.estado, t: ESTADOS_EVENTO[e.estado], o: Object.keys(ESTADOS_EVENTO).indexOf(e.estado) + 10 }, cliente: { k: e.cliente || '—', t: e.cliente || 'Sin cliente' },
    evento: { k: e.id, t: `${e.codigo} · ${e.nombre}`, o: e.fecha + e.codigo },
  }[agrupar]);
  const EVQ = (al = 'e') => `SELECT ${al}.*, b.nombre AS banda, u.nombre AS booking, cl.nombre AS cliente,
      (SELECT COALESCE(SUM(m.monto_evento_c),0) FROM movimientos m WHERE m.evento_id = ${al}.id AND m.tipo = 'ingreso' AND m.anulado = 0) AS cobrado_c
    FROM eventos ${al} LEFT JOIN bandas b ON b.id = ${al}.banda_id LEFT JOIN usuarios u ON u.id = ${al}.booking_id LEFT JOIN clientes cl ON cl.id = ${al}.cliente_id`;

  if (idRaw === 'ventas') {
    const f = filtroEv();
    const evs = (await db.prepare(`${EVQ()} WHERE ${f.w} ORDER BY e.fecha LIMIT 5000`).bind(...f.b).all()).results;
    const lista = evs.map((e) => ({ ...e, eventos: 1, confirmados: /^(confirmado|anticipo|pendiente_pago|realizado|en_cuadre|liquidado)$/.test(e.estado) ? 1 : 0, contratado: e.precio_c || 0, cobrado: e.cobrado_c, por_cobrar: Math.max(0, (e.precio_c || 0) - e.cobrado_c) }));
    filas = acumular(lista, grupoEv, ['eventos', 'confirmados', 'contratado', 'cobrado', 'por_cobrar']);
    columnas = [X('grupo', R.agrupar[agrupar]), X('moneda', 'Moneda'), N('eventos', 'Eventos'), N('confirmados', 'Confirmados'), D('contratado', 'Contratado'), D('cobrado', 'Cobrado'), D('por_cobrar', 'Por cobrar')];
    if (agrupar === 'mes') grafico = { valor: 'contratado', etiqueta: 'Contratado por mes' };
    notas.push('«Contratado» es el precio de cada evento en su moneda; «Confirmados» cuenta los eventos desde «Confirmado» en adelante. Los cancelados no entran salvo que filtre ese estado.');
  }

  if (idRaw === 'cobros') {
    const f = filtroEv();
    const evs = (await db.prepare(`${EVQ()} WHERE ${f.w} AND e.estado NOT IN ('cotizacion','negociacion') ORDER BY e.fecha LIMIT 5000`).bind(...f.b).all()).results;
    const bucket = (d) => (d < 0 ? ['0', 'Todavía no se presenta'] : d <= 30 ? ['1', '0 a 30 días'] : d <= 60 ? ['2', '31 a 60 días'] : d <= 90 ? ['3', '61 a 90 días'] : ['4', 'Más de 90 días']);
    const lista = evs.map((e) => { const dias = Math.round((Date.parse(hoy) - Date.parse(e.fecha)) / 864e5); const [o, t] = bucket(dias);
      return { ...e, eventos: 1, contratado: e.precio_c || 0, cobrado: e.cobrado_c, por_cobrar: Math.max(0, (e.precio_c || 0) - e.cobrado_c), dias, ant_o: o, ant_t: t }; }).filter((e) => e.por_cobrar > 0 || agrupar !== 'evento' || q('todos') === '1');
    if (agrupar === 'evento') {
      columnas = [X('evento', 'Evento'), X('fecha', 'Fecha'), X('cliente', 'Cliente'), X('booking', 'Booking'), X('moneda', 'Moneda'), D('contratado', 'Contratado'), D('cobrado', 'Cobrado'), D('por_cobrar', 'Saldo'), X('ant_t', 'Antigüedad')];
      filas = lista.map((e) => ({ evento: `${e.codigo} · ${e.nombre}`, evento_id: e.id, fecha: e.fecha, cliente: e.cliente || '', booking: e.booking || '', moneda: e.moneda, contratado: e.contratado, cobrado: e.cobrado, por_cobrar: e.por_cobrar, ant_t: e.ant_t }));
    } else {
      const g = { antiguedad: (e) => ({ k: e.ant_o, t: e.ant_t, o: e.ant_o }), cliente: (e) => ({ k: e.cliente || '—', t: e.cliente || 'Sin cliente' }), booking: (e) => ({ k: e.booking || '—', t: e.booking || 'Sin booking' }) }[agrupar];
      filas = acumular(lista, g, ['eventos', 'contratado', 'cobrado', 'por_cobrar']);
      columnas = [X('grupo', R.agrupar[agrupar]), X('moneda', 'Moneda'), N('eventos', 'Eventos'), D('contratado', 'Contratado'), D('cobrado', 'Cobrado'), D('por_cobrar', 'Por cobrar')];
    }
    notas.push('Lo cobrado es lo registrado en el evento (convertido a su moneda con la tasa de cada cobro). La antigüedad cuenta los días desde la fecha del evento.');
  }

  if (idRaw === 'gastos') {
    // base de caja: lo que salió (movimientos), no lo comprometido. Los gastos que pagó el cliente se informan aparte.
    const w = ["m.empresa_id = ?", "m.anulado = 0", "m.tipo IN ('gasto','nomina','comision')", 'm.fecha BETWEEN ? AND ?'], b = [E, F.desde, F.hasta];
    if (hayFiltroEvento) { const f = filtroEv('e', { fechas: false }); w.push(`m.evento_id IN (SELECT e.id FROM eventos e WHERE ${f.w})`); b.push(...f.b); }
    if (F.moneda) { w.push('m.moneda = ?'); b.push(F.moneda); }
    const movs = (await db.prepare(`SELECT m.*, e.codigo AS evento_codigo, e.nombre AS evento FROM movimientos m LEFT JOIN eventos e ON e.id = m.evento_id WHERE ${w.join(' AND ')} ORDER BY m.fecha LIMIT 20000`).bind(...b).all()).results;
    const cliente = movs.filter((m) => m.tipo === 'gasto' && m.cubierto_por === 'cliente');
    const lista = movs.filter((m) => !(m.tipo === 'gasto' && m.cubierto_por === 'cliente')).map((m) => ({ ...m, movimientos: 1, total: m.monto_c,
      cat: m.tipo === 'nomina' ? 'Nómina de músicos' : m.tipo === 'comision' ? 'Comisiones' : (m.evento_id ? '' : 'General · ') + (m.categoria || 'Otros'),
      clase: m.tipo === 'nomina' ? 'Nómina de músicos' : m.tipo === 'comision' ? 'Comisiones' : m.evento_id ? 'Gastos de eventos' : 'Gastos generales' }));
    const g = { categoria: (m) => ({ k: m.cat, t: m.cat, o: (VIAJE.includes(m.categoria) ? '0' : '1') + m.cat }), mes: (m) => ({ k: m.fecha.slice(0, 7), t: mesTxt(m.fecha), o: m.fecha.slice(0, 7) }),
      evento: (m) => ({ k: m.evento_id || 0, t: m.evento_id ? `${m.evento_codigo} · ${m.evento}` : 'Gastos generales', o: m.evento_id ? '0' + m.evento_codigo : '1' }), clase: (m) => ({ k: m.clase, t: m.clase }) }[agrupar];
    filas = acumular(lista, g, ['movimientos', 'total']);
    columnas = [X('grupo', R.agrupar[agrupar]), X('moneda', 'Moneda'), N('movimientos', 'Movimientos'), D('total', 'Total')];
    if (agrupar === 'mes') grafico = { valor: 'total', etiqueta: 'Gastos por mes' };
    const viaje = lista.filter((m) => VIAJE.includes(m.categoria)).reduce((a, m) => ((a[m.moneda] = (a[m.moneda] || 0) + m.monto_c), a), {});
    if (Object.keys(viaje).length) notas.push('Viajes (dietas, vuelos, hospedaje y transporte): ' + Object.entries(viaje).map(([mo, c]) => `${mo} ${(c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`).join(' · '));
    if (cliente.length) notas.push(`Además, el cliente o promotor cubrió ${cliente.length} gasto(s): ` + Object.entries(cliente.reduce((a, m) => ((a[m.moneda] = (a[m.moneda] || 0) + m.monto_c), a), {})).map(([mo, c]) => `${mo} ${(c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`).join(' · ') + '. No restan.');
    notas.push('Base de caja: lo que efectivamente se pagó en el período (por fecha del movimiento), incluidas nóminas y comisiones pagadas. Los anulados no entran.');
  }

  if (idRaw === 'rentabilidad' || idRaw === 'presupuesto') {
    const f = filtroEv();
    const extra = idRaw === 'presupuesto' ? 'AND e.id IN (SELECT evento_id FROM presupuestos)' : `AND e.estado IN ${CONFIRMADOS}`;
    const evs = (await db.prepare(`${EVQ()} WHERE ${f.w} ${extra} ORDER BY e.fecha LIMIT 401`).bind(...f.b).all()).results;
    if (evs.length > 400) { evs.length = 400; notas.push('Se calcularon los primeros 400 eventos del período. Acorte las fechas para ver el resto.'); }
    const pres = idRaw === 'presupuesto' ? Object.fromEntries((await db.prepare('SELECT * FROM presupuestos WHERE empresa_id = ?').bind(E).all()).results.map((p) => [p.evento_id, p])) : {};
    const lista = [];
    for (const e of evs) {
      const k = await calcularCuadre(db, E, e);
      for (const t of k.faltan_tasas) notas.push(`${e.codigo}: falta ${t}`);
      const c = (v) => Math.round((v || 0) * 100);
      const viajes = k.gastos.filter((g) => VIAJE.includes(g.categoria)).reduce((a, g) => a + c(g.total), 0);
      lista.push({ ...e, eventos: 1, contratado: c(k.contratado), cobrado: c(k.cobrado), gastos: c(k.gastos_total), viajes, otros: c(k.gastos_total) - viajes, nomina: c(k.nomina_total), comisiones: c(k.comisiones_total), salidas: c(k.salidas_total), resultado: c(k.resultado), p: pres[e.id] });
    }
    if (idRaw === 'rentabilidad') {
      filas = acumular(lista, grupoEv, ['eventos', 'contratado', 'gastos', 'nomina', 'comisiones', 'salidas', 'resultado']).map((x) => ({ ...x, margen: x.contratado ? x.resultado / x.contratado : null }));
      columnas = [X('grupo', R.agrupar[agrupar]), X('moneda', 'Moneda'), N('eventos', 'Eventos'), D('contratado', 'Contratado'), D('gastos', 'Gastos'), D('nomina', 'Nómina'), D('comisiones', 'Comisiones'), D('resultado', 'Resultado'), P('margen', 'Margen')];
      if (agrupar === 'evento') filas.forEach((x, i) => (x.evento_id = lista.find((e) => `${e.codigo} · ${e.nombre}` === x.grupo)?.id));
      if (['mes', 'pais', 'booking', 'banda'].includes(agrupar)) grafico = { valor: 'resultado', etiqueta: 'Resultado por ' + R.agrupar[agrupar].toLowerCase() };
      notas.push('Resultado = contratado − (gastos del evento que no pagó el cliente + nómina acordada + comisiones no anuladas), igual que el cuadre. Solo eventos desde «Confirmado».');
    } else {
      columnas = [X('grupo', 'Evento'), X('moneda', 'Moneda'), D('contratado', 'Contratado'), D('est_salidas', 'Salidas estimadas'), D('salidas', 'Salidas reales'), D('est_resultado', 'Resultado estimado'), D('resultado', 'Resultado real'), D('diferencia', 'Diferencia'),
        D('est_nomina', 'Nómina est.'), D('nomina', 'Nómina real'), D('est_viajes', 'Viajes est.'), D('viajes', 'Viajes reales'), D('est_comisiones', 'Comisiones est.'), D('comisiones', 'Comisiones reales')];
      filas = lista.map((e) => { const p = e.p, est = p.nomina_c + p.comisiones_c + p.viajes_c + p.otros_c;
        return { grupo: `${e.codigo} · ${e.nombre}`, evento_id: e.id, moneda: e.moneda, contratado: e.contratado, est_salidas: est, salidas: e.salidas, est_resultado: e.contratado - est, resultado: e.resultado, diferencia: e.resultado - (e.contratado - est),
          est_nomina: p.nomina_c, nomina: e.nomina, est_viajes: p.viajes_c, viajes: e.viajes, est_comisiones: p.comisiones_c, comisiones: e.comisiones }; });
      notas.push('Diferencia = resultado real − resultado estimado. Negativa: salió más caro de lo presupuestado.');
    }
  }

  if (idRaw === 'pagos') {
    if (agrupar === 'pendientes') {
      const f = filtroEv();
      const its = (await db.prepare(`SELECT n.*, m.nombre AS musico, e.codigo, e.nombre AS evento, e.fecha,
          (SELECT COALESCE(SUM(x.monto_c),0) FROM movimientos x WHERE x.evento_id = n.evento_id AND x.musico_id = n.musico_id AND x.tipo = 'nomina' AND x.anulado = 0 AND x.moneda = n.moneda) AS pagado_c
        FROM nomina n JOIN musicos m ON m.id = n.musico_id JOIN eventos e ON e.id = n.evento_id WHERE ${f.w} ORDER BY e.fecha, m.nombre`).bind(...f.b).all()).results;
      filas = its.map((n) => { const neto = n.acordado_c - (n.descuento_c || 0); return { grupo: n.musico, evento: `${n.codigo} · ${n.evento}`, evento_id: n.evento_id, fecha: n.fecha, moneda: n.moneda, acordado: neto, pagado: n.pagado_c, pendiente: Math.max(0, neto - n.pagado_c), estado: n.pagado_c <= 0 ? 'Sin pago' : n.pagado_c < neto ? 'Parcial' : 'Pagado' }; })
        .filter((x) => x.pendiente > 0);
      columnas = [X('grupo', 'Músico'), X('evento', 'Evento'), X('fecha', 'Fecha'), X('moneda', 'Moneda'), D('acordado', 'Acordado'), D('pagado', 'Pagado'), D('pendiente', 'Pendiente'), X('estado', 'Estado')];
    } else {
      const w = ["x.empresa_id = ?", "x.tipo = 'nomina'", 'x.anulado = 0', 'x.fecha BETWEEN ? AND ?'], b = [E, F.desde, F.hasta];
      if (hayFiltroEvento) { const f = filtroEv('e', { fechas: false }); w.push(`x.evento_id IN (SELECT e.id FROM eventos e WHERE ${f.w})`); b.push(...f.b); }
      if (F.moneda) { w.push('x.moneda = ?'); b.push(F.moneda); }
      const ps = (await db.prepare(`SELECT x.*, m.nombre AS musico FROM movimientos x LEFT JOIN musicos m ON m.id = x.musico_id WHERE ${w.join(' AND ')} ORDER BY x.fecha LIMIT 20000`).bind(...b).all()).results
        .map((x) => ({ ...x, pagos: 1, total: x.monto_c, confirmados: x.confirmado_en ? 1 : 0, discrepancias: x.discrepancia ? 1 : 0, est: x.discrepancia ? 'Con discrepancia' : x.confirmado_en ? 'Confirmado por el músico' : 'Por confirmar' }));
      const g = { musico: (x) => ({ k: x.musico_id, t: x.musico || '—' }), mes: (x) => ({ k: x.fecha.slice(0, 7), t: mesTxt(x.fecha), o: x.fecha.slice(0, 7) }), metodo: (x) => ({ k: x.metodo || '—', t: METODOS[x.metodo] || 'Sin método' }), estado: (x) => ({ k: x.est, t: x.est }) }[agrupar];
      filas = acumular(ps, g, ['pagos', 'confirmados', 'discrepancias', 'total']);
      columnas = [X('grupo', R.agrupar[agrupar]), X('moneda', 'Moneda'), N('pagos', 'Pagos'), N('confirmados', 'Confirmados'), N('discrepancias', 'Discrepancias'), D('total', 'Total pagado')];
    }
  }

  if (idRaw === 'control') {
    const w = ['m.empresa_id = ?', 'm.fecha BETWEEN ? AND ?'], b = [E, F.desde, F.hasta];
    if (hayFiltroEvento) { const f = filtroEv('e', { fechas: false }); w.push(`m.evento_id IN (SELECT e.id FROM eventos e WHERE ${f.w})`); b.push(...f.b); }
    if (F.moneda) { w.push('m.moneda = ?'); b.push(F.moneda); }
    const ms = (await db.prepare(`SELECT m.*, e.codigo AS evento_codigo, e.nombre AS evento, mu.nombre AS musico, u.nombre AS por FROM movimientos m LEFT JOIN eventos e ON e.id = m.evento_id LEFT JOIN musicos mu ON mu.id = m.musico_id LEFT JOIN usuarios u ON u.id = m.creado_por WHERE ${w.join(' AND ')} ORDER BY m.fecha, m.id LIMIT 20000`).bind(...b).all()).results;
    const T = { ingreso: 'Cobro', gasto: 'Gasto', nomina: 'Pago a músico', comision: 'Comisión' };
    for (const m of ms) {
      const p = [];
      if (m.anulado) p.push('Anulado: ' + (m.anulado_motivo || ''));
      else {
        if (['gasto', 'nomina', 'comision'].includes(m.tipo) && !m.comprobante_r2) p.push('Sin comprobante');
        if (m.tipo === 'ingreso' && !m.entregado) p.push(`Sin entregar (lo tiene: ${m.receptor || '—'})`);
        if (m.tipo === 'ingreso' && m.entregado && !m.confirmado_en) p.push('Entregado, falta confirmar que llegó');
        if (m.discrepancia) p.push('Discrepancia: ' + m.discrepancia);
      }
      if (p.length) filas.push({ fecha: m.fecha, codigo: m.codigo, tipo: T[m.tipo], evento: m.evento_id ? `${m.evento_codigo} · ${m.evento}` : 'General', evento_id: m.evento_id, concepto: [m.categoria, m.descripcion, m.musico].filter(Boolean).join(' · '), moneda: m.moneda, monto: m.monto_c, problema: p.join(' · '), por: m.por || '' });
    }
    columnas = [X('fecha', 'Fecha'), X('codigo', 'Código'), X('tipo', 'Tipo'), X('evento', 'Evento'), X('concepto', 'Concepto'), X('moneda', 'Moneda'), D('monto', 'Importe'), X('problema', 'Pendiente'), X('por', 'Registró')];
    notas.push('Lista lo que falta cerrar: comprobantes, entregas de dinero, confirmaciones del artista, discrepancias de los músicos y movimientos anulados.');
  }

  // totales por moneda (nunca se suman monedas distintas) y, si se pide, consolidado en la moneda base
  const sumables = columnas.filter((c) => c.tipo === 'dinero' || c.tipo === 'num').map((c) => c.k);
  const totales = Object.values(filas.reduce((a, f) => { const t = (a[f.moneda] ||= { moneda: f.moneda, filas: 0, ...Object.fromEntries(sumables.map((k) => [k, 0])) }); t.filas++; for (const k of sumables) t[k] += f[k] || 0; return a; }, {}));
  for (const t of totales) if ('margen' in (filas[0] || {})) t.margen = t.contratado ? t.resultado / t.contratado : null;
  let consolidado = null;
  if (F.consolidar) {
    const dinero = columnas.filter((c) => c.tipo === 'dinero').map((c) => c.k);
    consolidado = { moneda: BASE, ...Object.fromEntries(dinero.map((k) => [k, 0])), excluidas: 0 };
    // cada fila agregada se convierte con la tasa de su último día del período (o la fecha de la fila si la tiene)
    for (const f of filas) {
      const dia = f.fecha || (f.orden && /^\d{4}-\d{2}$/.test(f.orden) ? f.orden + '-28' : F.hasta);
      let ok = true; const conv = {};
      for (const k of dinero) { const v = await aBase(f[k], f.moneda, dia > hoy ? hoy : dia); if (v == null && f[k]) ok = false; conv[k] = v || 0; }
      if (!ok) { consolidado.excluidas++; continue; }
      for (const k of dinero) consolidado[k] += conv[k];
    }
    if ('margen' in (filas[0] || {})) consolidado.margen = consolidado.contratado ? consolidado.resultado / consolidado.contratado : null;
  }
  const criterio = F.consolidar
    ? `Consolidado en ${BASE} con la tasa registrada más reciente a la fecha de cada fila (por mes: el día 28 de cada mes; por evento: la fecha del evento; en las demás agrupaciones: la fecha final del período, o hoy si es futura). Los registros no se recalculan.${sinTasa.size ? ` Faltan tasas (${[...sinTasa].slice(0, 6).join('; ')}): esas filas no entran al consolidado.` : ''}`
    : 'Cada moneda va por separado; no se suman pesos con dólares ni euros.';

  // salida en dinero con decimales para la pantalla
  const aDec = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, columnas.find((c) => c.k === k)?.tipo === 'dinero' ? cent(v) : v]));
  const out = { reporte: idRaw, titulo: R.titulo, agrupar, agrupar_nombre: R.agrupar[agrupar], filtros: F, columnas, filas: filas.map(aDec), totales: totales.map(aDec), consolidado: consolidado ? aDec(consolidado) : null, tasas_usadas: [...usadas.values()], criterio, notas: [...new Set(notas)].slice(0, 30), grafico, empresa: empresa.nombre, generado: new Date().toISOString() };

  if (formato === 'xlsx') {
    const filtrosTxt = [`Del ${F.desde} al ${F.hasta}`, F.pais && 'País: ' + F.pais, F.moneda && 'Moneda: ' + F.moneda, F.estado && 'Estado: ' + ESTADOS_EVENTO[F.estado], F.tipo && (F.tipo === 'publico' ? 'Públicos' : 'Privados'), 'Agrupado por: ' + R.agrupar[agrupar]].filter(Boolean).join(' · ');
    const valor = (c, v) => (c.tipo === 'pct' ? (v == null ? null : Math.round(v * 10000) / 10000) : v);
    const hoja = { nombre: R.titulo, titulo: `${empresa.nombre} · ${R.titulo}`, subtitulo: filtrosTxt, columnas: columnas.map((c) => ({ t: c.t, tipo: c.tipo })), filas: out.filas.map((f) => columnas.map((c) => valor(c, f[c.k]))) };
    if (out.totales.length) { hoja.filas.push([]); for (const t of out.totales) hoja.filas.push(columnas.map((c, i) => (i === 0 ? 'Total ' + t.moneda : c.k === 'moneda' ? t.moneda : c.tipo === 'dinero' || c.tipo === 'num' ? t[c.k] : c.tipo === 'pct' ? valor(c, t[c.k]) : ''))); }
    if (out.consolidado) hoja.filas.push(columnas.map((c, i) => (i === 0 ? 'Consolidado ' + BASE : c.k === 'moneda' ? BASE : c.tipo === 'dinero' ? out.consolidado[c.k] : c.tipo === 'pct' ? valor(c, out.consolidado[c.k]) : '')));
    const extra = { nombre: 'Criterio', columnas: [{ t: 'Notas', tipo: 'texto' }], filas: [[criterio], ...out.tasas_usadas.map((t) => ['Tasa: ' + t]), ...out.notas.map((n) => [n]), ['Generado ' + out.generado.slice(0, 16).replace('T', ' ') + ' UTC']] };
    await auditar(ctx, 'reporte_exportado', 'reporte', null, `${idRaw} xlsx ${F.desde}..${F.hasta}`);
    const nombre = `BandGo-${idRaw}-${F.desde}-a-${F.hasta}.xlsx`;
    return new Response(crearXlsx([hoja, extra]), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${nombre}"`, 'cache-control': 'no-store' } });
  }
  if (q('imprimir') === '1') await auditar(ctx, 'reporte_exportado', 'reporte', null, `${idRaw} pdf ${F.desde}..${F.hasta}`);
  return json(out);
}

// presupuesto estimado de un evento (lo usa la pestaña Finanzas)
export async function rutasPresupuesto(L) {
  const { db, method, mod, id, accion, d, ctx, puede, empresa, user } = L;
  if (!(mod === 'eventos' && id && accion === 'presupuesto')) return null;
  const E = empresa.id;
  const ev = await db.prepare('SELECT id, moneda, precio_c, booking_id, fecha FROM eventos WHERE id = ? AND empresa_id = ?').bind(id, E).first();
  if (!ev) return err('Evento no encontrado', 404);
  const ver = puede('finanzas.ver') || (ev.booking_id === user.id && puede('finanzas.registrar'));
  if (!ver) return err('Su rol no tiene permiso para esto', 403);
  if (method === 'GET') {
    const p = await db.prepare('SELECT p.*, u.nombre AS por FROM presupuestos p LEFT JOIN usuarios u ON u.id = p.actualizado_por WHERE p.evento_id = ?').bind(id).first();
    const k = await calcularCuadre(db, E, ev);
    const viajes = k.gastos.filter((g) => VIAJE.includes(g.categoria)).reduce((a, g) => a + g.total, 0);
    return json({ moneda: ev.moneda, contratado: cent(ev.precio_c || 0), editar: puede('finanzas.registrar') || puede('finanzas.ver'),
      presupuesto: p ? { nomina: cent(p.nomina_c), comisiones: cent(p.comisiones_c), viajes: cent(p.viajes_c), otros: cent(p.otros_c), notas: p.notas, actualizado: p.actualizado, por: p.por } : null,
      real: { nomina: k.nomina_total, comisiones: k.comisiones_total, viajes: Math.round(viajes * 100) / 100, otros: Math.round((k.gastos_total - viajes) * 100) / 100, resultado: k.resultado } });
  }
  if (method === 'PUT') {
    if (!(puede('finanzas.registrar') || puede('finanzas.ver'))) return err('Su rol no tiene permiso para esto', 403);
    const v = (k) => Math.max(0, aCentavos(d[k]) || 0);
    await db.prepare(`INSERT INTO presupuestos (evento_id, empresa_id, nomina_c, comisiones_c, viajes_c, otros_c, notas, actualizado, actualizado_por) VALUES (?,?,?,?,?,?,?,datetime('now'),?)
      ON CONFLICT(evento_id) DO UPDATE SET nomina_c = excluded.nomina_c, comisiones_c = excluded.comisiones_c, viajes_c = excluded.viajes_c, otros_c = excluded.otros_c, notas = excluded.notas, actualizado = excluded.actualizado, actualizado_por = excluded.actualizado_por`)
      .bind(id, E, v('nomina'), v('comisiones'), v('viajes'), v('otros'), txt(d.notas, 1000), user.id).run();
    await auditar(ctx, 'presupuesto_guardado', 'evento', id, '');
    return json({ ok: true });
  }
  return null;
}
