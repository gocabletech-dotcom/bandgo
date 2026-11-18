// BandGo · funciones con pago (manager, booking, administración…), gastos guardados, acceso del cliente a su portal,
// el portal del cliente (sus eventos, contratos para ver y firmar, depósitos y saldo, flyer y datos del evento)
// y la explicación de qué puede hacer cada rol.
import { json, err, txt, emailOk, sha256, aCentavos, moneda, fecha, auditar } from './nucleo.js';
import { ROLES, PERMISOS_CAT, permisosDe } from './permisos.js';
import { CAT_EVENTO } from './finanzas.js';
import { ESTADOS_US, esUS, ESTADOS_EVENTO } from './agenda.js';
import { invitar } from './personal.js';

const cent = (c) => (c == null ? null : c / 100);
const url = (k) => (k ? '/api/archivo/' + encodeURIComponent(k) : null);
const hora = (v) => (/^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v).padStart(5, '0') : null);
export const FUNCIONES = { manager: 'Manager', booking: 'Booking', administracion: 'Administración', direccion: 'Dirección musical', otra: 'Otra función' };
const APLICA = { banda: 'En cada evento de la banda', propios: 'Solo en los eventos donde es el booking o manager', toca: 'Solo cuando está en el equipo del evento' };
const RESUMEN_ROL = {
  dueno: 'Es el artista o propietario: ve y decide todo, aprueba los cuadres y cambia los permisos.',
  admin: 'Administra la empresa: personal, agenda, finanzas y usuarios. No aprueba cuadres ni cambia permisos.',
  manager: 'Maneja la operación: eventos, contratos, giras, nómina y finanzas, y revisa los cuadres antes del artista.',
  booking: 'Consigue y registra presentaciones: ve los montos de sus propios eventos, registra cobros y envía el cuadre.',
  musico: 'Entra a su portal: ve su agenda, ensayos, itinerario, pagos y avisos, y confirma lo que recibe.',
  sonidista: 'Portal del músico más la sección técnica: rider, horarios de montaje y contactos de sonido.',
  promotor: 'Sin acceso a la oficina (reservado).',
  cliente: 'Portal del cliente: ve y firma sus contratos, ve sus depósitos y saldo, y sube el flyer y los datos del evento.',
};
const EDITABLE_CLIENTE = ['lugar', 'direccion', 'ciudad', 'estado_us', 'codigo_postal', 'hora_show', 'hora_fin'];

// ¿puede ver este flyer o firma? (lo usa la ruta de archivos)
export async function accesoArchivoCliente(L, clave, tipo) {
  const { db, empresa, user, puede, rol } = L;
  if (tipo === 'flyer') {
    const ev = await db.prepare('SELECT id, cliente_id FROM eventos WHERE flyer_r2 = ? AND empresa_id = ?').bind(clave, empresa.id).first();
    if (!ev) return false;
    if (puede('eventos.ver')) return true;
    if (rol === 'cliente') return !!(await db.prepare('SELECT 1 FROM clientes WHERE id = ? AND usuario_id = ?').bind(ev.cliente_id, user.id).first());
    return !!(await db.prepare('SELECT 1 FROM evento_asignaciones a JOIN musicos m ON m.id = a.musico_id WHERE a.evento_id = ? AND m.usuario_id = ?').bind(ev.id, user.id).first());
  }
  const c = await db.prepare('SELECT c.id, e.cliente_id FROM contratos c JOIN eventos e ON e.id = c.evento_id WHERE c.firma_r2 = ? AND c.empresa_id = ?').bind(clave, empresa.id).first();
  if (!c) return false;
  if (puede('contratos.ver')) return true;
  return rol === 'cliente' && !!(await db.prepare('SELECT 1 FROM clientes WHERE id = ? AND usuario_id = ?').bind(c.cliente_id, user.id).first());
}
// contenido que se firma: la foto del contrato + precio + condiciones (si algo cambia, la huella cambia)
const textoFirmado = (c) => JSON.stringify({ version: c.version, datos: c.datos, precio_c: c.precio_c, moneda: c.moneda, anticipo_c: c.anticipo_c, anticipo_vence: c.anticipo_vence, saldo_vence: c.saldo_vence, condiciones: c.condiciones });

export async function rutasExtras(L) {
  const { db, method, mod, id, idRaw, accion, sub, d, ctx, puede, empresa, user, rol, req } = L;
  const E = empresa.id;
  const no = (p) => (puede(p) ? null : err('Su rol no tiene permiso para esto', 403));

  // ---------- qué puede hacer cada rol (con los permisos de esta empresa) ----------
  if (mod === 'roles-info' && method === 'GET') {
    const out = {};
    for (const r of Object.keys(ROLES)) { const s = await permisosDe(db, E, r); out[r] = { nombre: ROLES[r], resumen: RESUMEN_ROL[r] || '', permisos: [...s].filter((p) => PERMISOS_CAT[p]).map((p) => PERMISOS_CAT[p]) }; }
    return json(out);
  }

  // ---------- funciones con pago ----------
  if (mod === 'funciones') {
    if (method === 'GET') {
      if (!puede('nomina.ver') && !puede('comisiones.ver')) return err('Su rol no tiene permiso para esto', 403);
      const rs = (await db.prepare(`SELECT f.*, m.nombre AS musico, m.instrumento, u.nombre AS usuario, b.nombre AS banda FROM funciones_pago f LEFT JOIN musicos m ON m.id = f.musico_id LEFT JOIN usuarios u ON u.id = f.usuario_id LEFT JOIN bandas b ON b.id = f.banda_id
        WHERE f.empresa_id = ? ${new URL(req.url).searchParams.get('musico') ? 'AND f.musico_id = ' + Number(new URL(req.url).searchParams.get('musico')) : ''} ORDER BY f.activo DESC, COALESCE(m.nombre, u.nombre)`).bind(E).all()).results;
      return json({ funciones: rs.map((f) => ({ ...f, monto: cent(f.monto_c), porcentaje: f.porcentaje_e2 != null ? f.porcentaje_e2 / 100 : null, funcion_nombre: f.nombre || FUNCIONES[f.funcion], aplica_nombre: APLICA[f.aplica] })), tipos: FUNCIONES, aplica: APLICA });
    }
    const e0 = no('nomina.editar'); if (e0) return e0;
    const actual = id ? await db.prepare('SELECT * FROM funciones_pago WHERE id = ? AND empresa_id = ?').bind(id, E).first() : null;
    if (id && !actual) return err('No encontrado', 404);
    if (method === 'DELETE' && id) { await db.prepare('UPDATE funciones_pago SET activo = 0 WHERE id = ?').bind(id).run(); await auditar(ctx, 'funcion_quitada', 'funcion', id, ''); return json({ ok: true }); }
    if ((method === 'POST' && !id) || (method === 'PUT' && id)) {
      const g = (k) => (d[k] !== undefined ? d[k] : actual?.[k]);
      const funcion = FUNCIONES[g('funcion')] ? g('funcion') : null; if (!funcion) return err('Escoja la función');
      const mid = Number(g('musico_id')) || null, uid = mid ? null : Number(g('usuario_id')) || null;
      if (!mid && !uid) return err('Escoja a la persona');
      if (mid && !(await db.prepare('SELECT 1 FROM musicos WHERE id = ? AND empresa_id = ?').bind(mid, E).first())) return err('El integrante no es válido');
      if (uid && !(await db.prepare("SELECT 1 FROM miembros WHERE usuario_id = ? AND empresa_id = ? AND activo = 1 AND rol IN ('dueno','admin','manager','booking')").bind(uid, E).first())) return err('El usuario no es válido');
      const modo = g('modo') === 'porcentaje' ? 'porcentaje' : 'fijo';
      let monto_c = null, pct = null, mon = null;
      if (modo === 'fijo') { monto_c = d.monto !== undefined ? aCentavos(d.monto) : actual?.monto_c; if (!(monto_c >= 0) || monto_c == null) return err('Escriba el importe'); mon = moneda(g('moneda'), empresa.moneda_base); }
      else { pct = d.porcentaje !== undefined ? Math.round(Number(String(d.porcentaje).replace(',', '.')) * 100) : actual?.porcentaje_e2; if (!(pct > 0 && pct <= 10000)) return err('Escriba el porcentaje (entre 0 y 100)'); }
      const banda = Number(g('banda_id')) || null;
      if (banda && !(await db.prepare('SELECT 1 FROM bandas WHERE id = ? AND empresa_id = ?').bind(banda, E).first())) return err('La banda no es válida');
      const aplica = APLICA[g('aplica')] ? g('aplica') : funcion === 'booking' ? 'propios' : funcion === 'manager' ? 'banda' : 'toca';
      const vals = [mid, uid, funcion, txt(g('nombre'), 60), modo, monto_c, mon, pct, g('base') === 'cobrado' ? 'cobrado' : 'contrato', banda, aplica, d.activo === false ? 0 : 1];
      if (id) await db.prepare('UPDATE funciones_pago SET musico_id = ?, usuario_id = ?, funcion = ?, nombre = ?, modo = ?, monto_c = ?, moneda = ?, porcentaje_e2 = ?, base = ?, banda_id = ?, aplica = ?, activo = ? WHERE id = ?').bind(...vals, id).run();
      const nid = id || (await db.prepare('INSERT INTO funciones_pago (musico_id, usuario_id, funcion, nombre, modo, monto_c, moneda, porcentaje_e2, base, banda_id, aplica, activo, empresa_id, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id').bind(...vals, E, user.id).first()).id;
      await auditar(ctx, id ? 'funcion_editada' : 'funcion_creada', 'funcion', nid, `${funcion} ${modo === 'fijo' ? (monto_c / 100) + ' ' + mon : pct / 100 + ' %'}`);
      return json({ ok: true, id: nid }, id ? 200 : 201);
    }
  }

  // ---------- gastos guardados (plantillas con precio) ----------
  if (mod === 'gastos-guardados') {
    if (method === 'GET') { if (!puede('nomina.ver') && !puede('finanzas.ver')) return err('Su rol no tiene permiso para esto', 403);
      return json({ gastos: (await db.prepare('SELECT * FROM gastos_guardados WHERE empresa_id = ? AND activo = 1 ORDER BY nombre').bind(E).all()).results.map((g) => ({ ...g, monto: cent(g.monto_c) })), categorias: CAT_EVENTO }); }
    const e0 = no('nomina.editar'); if (e0) return e0;
    if (method === 'DELETE' && id) { await db.prepare('UPDATE gastos_guardados SET activo = 0 WHERE id = ? AND empresa_id = ?').bind(id, E).run(); return json({ ok: true }); }
    if ((method === 'POST' && !id) || (method === 'PUT' && id)) {
      const nombre = txt(d.nombre, 80); if (!nombre) return err('Escriba el nombre del gasto');
      const monto = aCentavos(d.monto); if (monto == null || monto < 0) return err('Escriba el precio');
      const vals = [nombre, CAT_EVENTO.includes(d.categoria) ? d.categoria : 'Otros', monto, moneda(d.moneda, empresa.moneda_base), d.siempre ? 1 : 0];
      if (id) { const r = await db.prepare('UPDATE gastos_guardados SET nombre = ?, categoria = ?, monto_c = ?, moneda = ?, siempre = ? WHERE id = ? AND empresa_id = ?').bind(...vals, id, E).run(); if (!r.meta.changes) return err('No encontrado', 404); return json({ ok: true }); }
      const r = await db.prepare('INSERT INTO gastos_guardados (nombre, categoria, monto_c, moneda, siempre, empresa_id) VALUES (?,?,?,?,?,?) RETURNING id').bind(...vals, E).first();
      return json({ ok: true, id: r.id }, 201);
    }
  }

  // ---------- dar acceso al portal a un cliente ----------
  if (mod === 'clientes' && id && accion === 'invitar' && method === 'POST') {
    if (!puede('clientes.editar') || !puede('usuarios.invitar')) return err('Su rol no tiene permiso para esto', 403);
    const c = await db.prepare('SELECT * FROM clientes WHERE id = ? AND empresa_id = ?').bind(id, E).first(); if (!c) return err('No encontrado', 404);
    if (c.usuario_id) return err('Este cliente ya tiene acceso a su portal');
    const email = String(d.email || c.email || '').toLowerCase().trim();
    if (!emailOk(email)) return err('Agregue primero el correo del cliente');
    const otro = await db.prepare('SELECT mi.rol FROM usuarios u JOIN miembros mi ON mi.usuario_id = u.id AND mi.empresa_id = ? AND mi.activo = 1 WHERE u.email = ?').bind(E, email).first();
    if (otro && otro.rol !== 'cliente') return err('Ese correo ya es de un usuario de la empresa. Use otro correo para el cliente.');
    if (!c.email) await db.prepare('UPDATE clientes SET email = ? WHERE id = ?').bind(email, id).run();
    return invitar(L, { email, nombre: c.contacto_nombre || c.nombre, rol: 'cliente', cliente_id: c.id });
  }
  if (mod === 'clientes' && id && accion === 'quitar-acceso' && method === 'POST') {
    if (!puede('clientes.editar') || !puede('usuarios.editar')) return err('Su rol no tiene permiso para esto', 403);
    const c = await db.prepare('SELECT * FROM clientes WHERE id = ? AND empresa_id = ?').bind(id, E).first(); if (!c || !c.usuario_id) return err('No encontrado', 404);
    await db.batch([db.prepare("UPDATE miembros SET activo = 0 WHERE usuario_id = ? AND empresa_id = ? AND rol = 'cliente'").bind(c.usuario_id, E), db.prepare('UPDATE clientes SET usuario_id = NULL WHERE id = ?').bind(id), db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND empresa_id = ?').bind(c.usuario_id, E)]);
    await auditar(ctx, 'cliente_acceso_quitado', 'cliente', id, c.nombre);
    return json({ ok: true });
  }

  // ---------- portal del cliente ----------
  if (mod !== 'cliente') return null;
  if (rol !== 'cliente') return err('Esta sección es para clientes', 403);
  const cl = await db.prepare('SELECT * FROM clientes WHERE usuario_id = ? AND empresa_id = ? AND activo = 1').bind(user.id, E).first();
  if (!cl) return err('Su usuario no está enlazado a un cliente de esta empresa.', 404);
  const saldoDe = async (ev) => {
    const pagos = (await db.prepare("SELECT codigo, fecha, monto_c, moneda, monto_evento_c, metodo, categoria FROM movimientos WHERE evento_id = ? AND tipo = 'ingreso' AND anulado = 0 ORDER BY fecha, id").bind(ev.id).all()).results;
    const cobrado = pagos.reduce((a, p) => a + (p.monto_evento_c || 0), 0);
    return { precio: cent(ev.precio_c), cobrado: cent(cobrado), saldo: cent(Math.max(0, (ev.precio_c || 0) - cobrado)), pagos: pagos.map((p) => ({ codigo: p.codigo, fecha: p.fecha, monto: cent(p.monto_c), moneda: p.moneda, metodo: p.metodo, tipo: { anticipo: 'Anticipo', pago_final: 'Pago final' }[p.categoria] || 'Pago' })) };
  };
  const contratoDe = async (ev) => {
    const c = await db.prepare("SELECT * FROM contratos WHERE evento_id = ? AND estado IN ('enviado','firmado') ORDER BY version DESC LIMIT 1").bind(ev.id).first();
    return c ? { id: c.id, version: c.version, estado: c.estado, firma_nombre: c.firma_nombre, firma_en: c.firma_en, firmado_url: url(c.archivo_firmado_r2) } : null;
  };
  const evPub = async (e) => ({ id: e.id, codigo: e.codigo, nombre: e.nombre, fecha: e.fecha, estado: e.estado, estado_nombre: ESTADOS_EVENTO[e.estado], banda: e.banda, lugar: e.lugar, direccion: e.direccion, ciudad: e.ciudad, pais: e.pais, estado_us: e.estado_us, codigo_postal: e.codigo_postal,
    hora_show: e.hora_show, hora_fin: e.hora_fin, moneda: e.moneda, flyer_url: url(e.flyer_r2), editable: !['en_cuadre', 'liquidado', 'cancelado'].includes(e.estado), es_us: esUS(e.pais), ...(await saldoDe(e)), contrato: await contratoDe(e) });
  const EVQ = "SELECT e.*, b.nombre AS banda FROM eventos e LEFT JOIN bandas b ON b.id = e.banda_id WHERE e.cliente_id = ? AND e.empresa_id = ?";
  if (idRaw === 'inicio' && method === 'GET') {
    const evs = (await db.prepare(`${EVQ} AND e.estado != 'cancelado' ORDER BY e.fecha DESC LIMIT 100`).bind(cl.id, E).all()).results;
    return json({ cliente: { nombre: cl.nombre, nombre_comercial: cl.nombre_comercial, contacto: cl.contacto_nombre }, empresa: { nombre: empresa.nombre, telefono: empresa.telefono, email: empresa.email, logo_url: url(empresa.logo_r2) }, eventos: await Promise.all(evs.map(evPub)), estados_us: ESTADOS_US });
  }
  if (idRaw === 'eventos' && Number(accion)) {
    const e = await db.prepare(`${EVQ} AND e.id = ?`).bind(cl.id, E, Number(accion)).first();
    if (!e) return err('Evento no encontrado', 404);
    if (method === 'GET') return json(await evPub(e));
    if (method === 'PUT') {
      if (['en_cuadre', 'liquidado', 'cancelado'].includes(e.estado)) return err('Este evento ya no se puede cambiar desde el portal. Escríbale a la oficina.', 409);
      const nuevo = {}, cambios = [];
      for (const k of EDITABLE_CLIENTE) if (d[k] !== undefined) {
        let v = ['hora_show', 'hora_fin'].includes(k) ? hora(d[k]) : k === 'estado_us' ? (String(d[k] || '').toUpperCase() || null) : txt(d[k], k === 'direccion' ? 200 : 120);
        if (k === 'estado_us' && v && (!esUS(e.pais) || !ESTADOS_US.includes(v))) return err('Escoja un estado de Estados Unidos válido');
        if (k === 'codigo_postal' && v && esUS(e.pais) && !/^\d{5}(-\d{4})?$/.test(v)) return err('El ZIP debe tener 5 números');
        if (String(v ?? '') !== String(e[k] ?? '')) { nuevo[k] = v; cambios.push(`${{ lugar: 'Local', direccion: 'Dirección', ciudad: 'Ciudad', estado_us: 'Estado', codigo_postal: 'ZIP', hora_show: 'Empieza', hora_fin: 'Termina' }[k]}: ${e[k] ?? '—'} → ${v ?? '—'}`); }
      }
      if (d.flyer) {
        const a = await db.prepare("SELECT clave FROM archivos WHERE clave = ? AND empresa_id = ? AND tipo = 'flyer' AND creado_por = ?").bind(d.flyer, E, user.id).first();
        if (!a) return err('El flyer no es válido');
        nuevo.flyer_r2 = a.clave; cambios.push('Subió el flyer');
      }
      if (!cambios.length) return json({ ok: true, cambios: 0 });
      const ks = Object.keys(nuevo);
      await db.batch([db.prepare(`UPDATE eventos SET ${ks.map((k) => k + ' = ?').join(', ')}, actualizado = datetime('now') WHERE id = ?`).bind(...ks.map((k) => nuevo[k]), e.id),
        db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(e.id, user.id, ('El cliente cambió: ' + cambios.join(' · ')).slice(0, 500))]);
      await auditar(ctx, 'cliente_cambio_evento', 'evento', e.id, cambios.join(' · ').slice(0, 400));
      return json({ ok: true, cambios: cambios.length });
    }
  }
  if (idRaw === 'contratos' && Number(accion)) {
    const c = await db.prepare('SELECT c.*, e.cliente_id, e.codigo AS evento_codigo FROM contratos c JOIN eventos e ON e.id = c.evento_id WHERE c.id = ? AND c.empresa_id = ?').bind(Number(accion), E).first();
    if (!c || c.cliente_id !== cl.id || !['enviado', 'firmado'].includes(c.estado)) return err('Contrato no encontrado', 404);
    if (method === 'GET' && !sub) {
      const datos = JSON.parse(c.datos);
      return json({ id: c.id, evento_id: c.evento_id, version: c.version, estado: c.estado, precio: cent(c.precio_c), moneda: c.moneda, anticipo: cent(c.anticipo_c), anticipo_vence: c.anticipo_vence, saldo_vence: c.saldo_vence, condiciones: c.condiciones, creado: c.creado,
        datos: { ...datos, empresa: { ...datos.empresa, logo_url: url(datos.empresa.logo_r2) }, banda: datos.banda ? { ...datos.banda, logo_url: url(datos.banda.logo_r2) } : null },
        firma: c.firma_en ? { nombre: c.firma_nombre, en: c.firma_en, url: url(c.firma_r2), huella: c.firma_huella } : null, firmado_url: url(c.archivo_firmado_r2) });
    }
    if (method === 'POST' && sub === 'firmar') {
      if (c.estado === 'firmado') return err('Este contrato ya está firmado', 409);
      const ultima = (await db.prepare('SELECT MAX(version) v FROM contratos WHERE evento_id = ?').bind(c.evento_id).first()).v;
      if (c.version !== ultima) return err('Hay una versión más nueva de este contrato', 409);
      const nombre = txt(d.nombre, 120); if (!nombre || nombre.length < 4) return err('Escriba su nombre completo');
      if (!d.acepto) return err('Marque que leyó y acepta el contrato');
      const a = d.firma ? await db.prepare("SELECT clave FROM archivos WHERE clave = ? AND empresa_id = ? AND tipo = 'firma' AND creado_por = ?").bind(d.firma, E, user.id).first() : null;
      if (!a) return err('Dibuje su firma');
      const huella = await sha256(textoFirmado(c)), ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-bg-ip') || '';
      await db.batch([
        db.prepare("UPDATE contratos SET estado = 'firmado', firma_nombre = ?, firma_r2 = ?, firma_en = datetime('now'), firma_ip = ?, firma_huella = ?, firma_usuario_id = ? WHERE id = ? AND estado = 'enviado'").bind(nombre, a.clave, ip, huella, user.id, c.id),
        db.prepare("UPDATE eventos SET estado = 'confirmado', actualizado = datetime('now') WHERE id = ? AND estado IN ('cotizacion','negociacion','pendiente')").bind(c.evento_id),
        db.prepare('INSERT INTO evento_historial (evento_id, usuario_id, cambio) VALUES (?,?,?)').bind(c.evento_id, user.id, `Contrato v${c.version} firmado por el cliente (${nombre}) desde su portal`),
      ]);
      await auditar(ctx, 'contrato_firmado_cliente', 'evento', c.evento_id, `v${c.version} · ${nombre} · ${huella.slice(0, 16)}`);
      return json({ ok: true, huella });
    }
  }
  return null;
}
