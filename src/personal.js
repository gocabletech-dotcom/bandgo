// BandGo · Fase 1 · bandas (con logo), integrantes (con foto), pasaportes y visas, datos de pago y portal del músico.
// Todo filtra por empresa_id y revisa el permiso en el servidor.
import { json, err, txt, soloDigitos, fecha, aCentavos, moneda, emailOk, cifrar, descifrar, mascara, auditar, rnd, sha256, enviarCorreo, correoBase, cfgCorreo, escHtml } from './nucleo.js';
import { ROLES, ROLES_PORTAL } from './permisos.js';

const ALERTAS_DIAS = [180, 90, 60, 30];
const diasPara = (f) => (f ? Math.ceil((Date.parse(f + 'T12:00:00Z') - Date.now()) / 864e5) : null);
const alertaDoc = (vence) => { const d = diasPara(vence); if (d == null) return null; if (d < 0) return { nivel: 'vencido', dias: d }; const u = ALERTAS_DIAS.filter((x) => d <= x).pop(); return u ? { nivel: d <= 60 ? 'urgente' : 'aviso', dias: d } : null; };

async function limite(db, empresa, que) {
  const p = await db.prepare('SELECT * FROM planes WHERE clave = ?').bind(empresa.plan).first();
  const max = p ? p[que] : null; if (max == null) return null;
  const tabla = { bandas: 'SELECT COUNT(*) n FROM bandas WHERE empresa_id = ? AND activa = 1', musicos: 'SELECT COUNT(*) n FROM musicos WHERE empresa_id = ? AND activo = 1' }[que];
  const n = (await db.prepare(tabla).bind(empresa.id).first()).n;
  return n >= max ? `Su plan ${p.nombre} permite ${max} ${que === 'bandas' ? (max === 1 ? 'banda' : 'bandas') : 'integrantes'}. Cambie de plan para agregar más.` : null;
}
// el archivo tiene que ser de esta empresa y del tipo correcto
async function archivoValido(db, empresaId, clave, tipo) {
  if (!clave) return null;
  const a = await db.prepare('SELECT clave FROM archivos WHERE clave = ? AND empresa_id = ? AND tipo = ?').bind(String(clave), empresaId, tipo).first();
  if (!a) throw Object.assign(new Error('El archivo no es válido'), { publico: true, estado: 400 });
  return a.clave;
}
const bandaPub = (b) => ({ ...b, logo_url: b.logo_r2 ? '/api/archivo/' + encodeURIComponent(b.logo_r2) : null });
const musicoPub = (m, ver) => ({ ...m, foto_url: m.foto_r2 ? '/api/archivo/' + encodeURIComponent(m.foto_r2) : null, tarifa: m.tarifa_c != null ? m.tarifa_c / 100 : null, ...(ver ? {} : { direccion: undefined, nacimiento: undefined, emergencia_nombre: undefined, emergencia_telefono: undefined }) });

async function docsDe(db, empresaId, musicoId, completo) {
  const rs = (await db.prepare('SELECT * FROM documentos_viaje WHERE empresa_id = ? AND musico_id = ? ORDER BY tipo DESC, vence').bind(empresaId, musicoId).all()).results;
  const out = [];
  for (const d of rs) out.push({ id: d.id, tipo: d.tipo, pais: d.pais, clase: d.clase, emision: d.emision, vence: d.vence, numero: completo ? await descifrar(d.numero_cif) : mascara(d.numero_fin), tiene_archivo: !!d.archivo_r2, archivo_url: completo && d.archivo_r2 ? '/api/archivo/' + encodeURIComponent(d.archivo_r2) : null, alerta: alertaDoc(d.vence) });
  return out;
}
async function guardarDoc(db, ctx, musicoId, d, docId) {
  const tipo = d.tipo === 'visa' ? 'visa' : 'pasaporte';
  const num = txt(d.numero, 40);
  const archivo = d.archivo ? await archivoValido(db, ctx.empresa.id, d.archivo, 'documento') : null;
  if (!fecha(d.vence)) return err('Escriba la fecha de vencimiento');
  if (docId) {
    const ya = await db.prepare('SELECT id FROM documentos_viaje WHERE id = ? AND empresa_id = ? AND musico_id = ?').bind(docId, ctx.empresa.id, musicoId).first();
    if (!ya) return err('No encontrado', 404);
    await db.prepare(`UPDATE documentos_viaje SET tipo = ?, pais = ?, clase = ?, emision = ?, vence = ?${num ? ', numero_cif = ?, numero_fin = ?' : ''}${archivo ? ', archivo_r2 = ?' : ''} WHERE id = ?`)
      .bind(...[tipo, txt(d.pais, 40), tipo === 'visa' ? txt(d.clase, 40) : null, fecha(d.emision), fecha(d.vence), ...(num ? [await cifrar(num), num.slice(-4)] : []), ...(archivo ? [archivo] : []), docId]).run();
  } else {
    if (!num) return err('Escriba el número del documento');
    await db.prepare('INSERT INTO documentos_viaje (empresa_id, musico_id, tipo, pais, clase, numero_cif, numero_fin, emision, vence, archivo_r2, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(ctx.empresa.id, musicoId, tipo, txt(d.pais, 40), tipo === 'visa' ? txt(d.clase, 40) : null, await cifrar(num), num.slice(-4), fecha(d.emision), fecha(d.vence), archivo, ctx.user.id).run();
  }
  await auditar(ctx, docId ? 'documento_editado' : 'documento_creado', 'musico', musicoId, `${tipo} ${txt(d.pais, 40) || ''} vence ${d.vence}`);
  return json({ ok: true });
}
async function cuentaDe(db, empresaId, musicoId, completo) {
  const c = await db.prepare('SELECT * FROM cuentas_pago WHERE musico_id = ? AND empresa_id = ?').bind(musicoId, empresaId).first();
  if (!c) return null;
  return { banco: c.banco, tipo_cuenta: c.tipo_cuenta, numero: completo ? await descifrar(c.numero_cif) : mascara(c.numero_fin), titular: await descifrar(c.titular_cif), zelle: completo ? await descifrar(c.zelle_cif) : (c.zelle_cif ? 'Registrado' : null), actualizado: c.actualizado };
}
async function guardarCuenta(db, ctx, musicoId, d) {
  const num = txt(d.numero, 40);
  const ya = await db.prepare('SELECT numero_cif, numero_fin, zelle_cif FROM cuentas_pago WHERE musico_id = ?').bind(musicoId).first();
  await db.prepare(`INSERT INTO cuentas_pago (musico_id, empresa_id, banco, titular_cif, tipo_cuenta, numero_cif, numero_fin, zelle_cif, actualizado) VALUES (?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(musico_id) DO UPDATE SET banco = excluded.banco, titular_cif = excluded.titular_cif, tipo_cuenta = excluded.tipo_cuenta, numero_cif = excluded.numero_cif, numero_fin = excluded.numero_fin, zelle_cif = excluded.zelle_cif, actualizado = excluded.actualizado`)
    .bind(musicoId, ctx.empresa.id, txt(d.banco, 80), await cifrar(txt(d.titular, 80)), txt(d.tipo_cuenta, 30), num ? await cifrar(num) : ya?.numero_cif ?? null, num ? num.slice(-4) : ya?.numero_fin ?? null, d.zelle !== undefined ? await cifrar(txt(d.zelle, 120)) : ya?.zelle_cif ?? null).run();
  await auditar(ctx, 'cuenta_pago_cambiada', 'musico', musicoId, num ? 'cuenta ' + mascara(num.slice(-4)) : 'datos de pago');
  return json({ ok: true });
}

export async function rutasPersonal(L) {
  const { db, req, url, method, mod, id, accion, sub, d, ctx, puede, empresa, user, env, ectx } = L;
  const no = (p) => (puede(p) ? null : err('Su rol no tiene permiso para esto', 403));
  const E = empresa.id;

  if (mod === 'bandas') {
    if (method === 'GET' && !id) { const e = no('bandas.ver'); if (e) return e;
      const rs = (await db.prepare('SELECT b.*, (SELECT COUNT(*) FROM banda_miembros bm JOIN musicos m ON m.id = bm.musico_id WHERE bm.banda_id = b.id AND m.activo = 1) AS integrantes FROM bandas b WHERE b.empresa_id = ? ORDER BY b.activa DESC, b.nombre').bind(E).all()).results;
      return json(rs.map(bandaPub)); }
    if (method === 'GET' && id) { const e = no('bandas.ver'); if (e) return e;
      const b = await db.prepare('SELECT * FROM bandas WHERE id = ? AND empresa_id = ?').bind(id, E).first(); if (!b) return err('No encontrada', 404);
      const ms = (await db.prepare('SELECT m.id, m.nombre, m.instrumento, m.foto_r2, m.tipo, bm.funcion, bm.tarifa_c, bm.moneda FROM banda_miembros bm JOIN musicos m ON m.id = bm.musico_id WHERE bm.banda_id = ? AND m.activo = 1 ORDER BY m.nombre').bind(id).all()).results;
      return json({ ...bandaPub(b), integrantes: ms.map((m) => ({ ...musicoPub(m, false), tarifa: m.tarifa_c != null ? m.tarifa_c / 100 : null })) }); }
    if (method === 'POST' && !id) { const e = no('bandas.crear') || (await limite(db, empresa, 'bandas') && err(await limite(db, empresa, 'bandas'), 402)); if (e) return e;
      if (!txt(d.nombre)) return err('Escriba el nombre de la banda');
      const logo = await archivoValido(db, E, d.logo, 'logo_banda');
      const r = await db.prepare('INSERT INTO bandas (empresa_id, nombre, categoria, pais, moneda, logo_r2, notas) VALUES (?,?,?,?,?,?,?) RETURNING id').bind(E, txt(d.nombre, 80), txt(d.categoria, 40), txt(d.pais, 40), moneda(d.moneda, empresa.moneda_base), logo, txt(d.notas, 1000)).first();
      await auditar(ctx, 'banda_creada', 'banda', r.id, d.nombre); return json({ ok: true, id: r.id }, 201); }
    if (method === 'PUT' && id) { const e = no('bandas.editar'); if (e) return e;
      const b = await db.prepare('SELECT * FROM bandas WHERE id = ? AND empresa_id = ?').bind(id, E).first(); if (!b) return err('No encontrada', 404);
      if (d.nombre !== undefined && !txt(d.nombre)) return err('Escriba el nombre de la banda');
      if (d.activa === false || d.activa === 0) { const e2 = no('bandas.eliminar'); if (e2) return e2; }
      const logo = d.logo === null ? null : d.logo ? await archivoValido(db, E, d.logo, 'logo_banda') : b.logo_r2;
      await db.prepare('UPDATE bandas SET nombre = ?, categoria = ?, pais = ?, moneda = ?, logo_r2 = ?, notas = ?, activa = ? WHERE id = ?')
        .bind(txt(d.nombre, 80) ?? b.nombre, d.categoria !== undefined ? txt(d.categoria, 40) : b.categoria, d.pais !== undefined ? txt(d.pais, 40) : b.pais, d.moneda ? moneda(d.moneda) : b.moneda, logo, d.notas !== undefined ? txt(d.notas, 1000) : b.notas, d.activa !== undefined ? (d.activa ? 1 : 0) : b.activa, id).run();
      await auditar(ctx, 'banda_editada', 'banda', id, txt(d.nombre, 80) || b.nombre); return json({ ok: true }); }
    // integrantes de la banda: PUT /api/bandas/:id/integrantes { musicos: [{id, funcion, tarifa, moneda}] }
    if (method === 'PUT' && id && accion === 'integrantes') { const e = no('bandas.editar'); if (e) return e;
      if (!(await db.prepare('SELECT 1 FROM bandas WHERE id = ? AND empresa_id = ?').bind(id, E).first())) return err('No encontrada', 404);
      const lista = Array.isArray(d.musicos) ? d.musicos.slice(0, 200) : [];
      const validos = new Set((await db.prepare('SELECT id FROM musicos WHERE empresa_id = ?').bind(E).all()).results.map((m) => m.id));
      await db.batch([db.prepare('DELETE FROM banda_miembros WHERE banda_id = ?').bind(id),
        ...lista.filter((m) => validos.has(Number(m.id))).map((m) => db.prepare('INSERT INTO banda_miembros (banda_id, musico_id, funcion, tarifa_c, moneda) VALUES (?,?,?,?,?)').bind(id, Number(m.id), txt(m.funcion, 60), aCentavos(m.tarifa), m.moneda ? moneda(m.moneda) : null))]);
      await auditar(ctx, 'banda_integrantes', 'banda', id, `${lista.length} integrantes`); return json({ ok: true }); }
  }

  if (mod === 'musicos') {
    const verPrivado = puede('musicos.editar');
    if (method === 'GET' && !id) { const e = no('musicos.ver'); if (e) return e;
      const rs = (await db.prepare(`SELECT m.*, (SELECT GROUP_CONCAT(b.id || ':' || b.nombre, '|') FROM banda_miembros bm JOIN bandas b ON b.id = bm.banda_id WHERE bm.musico_id = m.id AND b.activa = 1) AS bandas_txt,
          (SELECT MIN(vence) FROM documentos_viaje dv WHERE dv.musico_id = m.id AND dv.tipo = 'pasaporte') AS pasaporte_vence,
          (SELECT MIN(vence) FROM documentos_viaje dv WHERE dv.musico_id = m.id AND dv.vence IS NOT NULL) AS doc_vence
        FROM musicos m WHERE m.empresa_id = ? ORDER BY m.activo DESC, m.nombre`).bind(E).all()).results;
      return json(rs.map((m) => ({ ...musicoPub(m, verPrivado), bandas: (m.bandas_txt || '').split('|').filter(Boolean).map((x) => { const [bid, ...n] = x.split(':'); return { id: Number(bid), nombre: n.join(':') }; }), bandas_txt: undefined, portal: !!m.usuario_id, alerta_doc: puede('documentos.ver') ? alertaDoc(m.doc_vence) : null, sin_pasaporte: puede('documentos.ver') ? !m.pasaporte_vence : null, doc_vence: undefined }))); }
    if (method === 'GET' && id && !accion) { const e = no('musicos.ver'); if (e) return e;
      const m = await db.prepare('SELECT * FROM musicos WHERE id = ? AND empresa_id = ?').bind(id, E).first(); if (!m) return err('No encontrado', 404);
      const bandas = (await db.prepare('SELECT b.id, b.nombre, bm.funcion, bm.tarifa_c, bm.moneda FROM banda_miembros bm JOIN bandas b ON b.id = bm.banda_id WHERE bm.musico_id = ?').bind(id).all()).results.map((b) => ({ ...b, tarifa: b.tarifa_c != null ? b.tarifa_c / 100 : null }));
      return json({ ...musicoPub(m, verPrivado), bandas, portal: !!m.usuario_id,
        documentos: puede('documentos.ver') ? await docsDe(db, E, id, puede('documentos.descargar')) : null,
        cuenta_pago: puede('pagos.ver') ? await cuentaDe(db, E, id, false) : null }); }
    if (method === 'POST' && !id) { const e = no('musicos.crear') || (await limite(db, empresa, 'musicos') && err(await limite(db, empresa, 'musicos'), 402)); if (e) return e;
      if (!txt(d.nombre)) return err('Escriba el nombre');
      if (d.email && !emailOk(d.email)) return err('Correo no válido');
      const foto = await archivoValido(db, E, d.foto, 'foto_musico');
      const r = await db.prepare(`INSERT INTO musicos (empresa_id, nombre, instrumento, tipo, telefono, whatsapp, email, nacimiento, direccion, pais_residencia, emergencia_nombre, emergencia_telefono, foto_r2, tarifa_c, tarifa_moneda, notas)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(E, txt(d.nombre, 80), txt(d.instrumento, 60), ['musico', 'sonidista', 'tecnico'].includes(d.tipo) ? d.tipo : 'musico', soloDigitos(d.telefono) || null, soloDigitos(d.whatsapp) || null,
        d.email ? String(d.email).toLowerCase().trim() : null, fecha(d.nacimiento), txt(d.direccion, 200), txt(d.pais_residencia, 40), txt(d.emergencia_nombre, 80), soloDigitos(d.emergencia_telefono) || null, foto, aCentavos(d.tarifa), d.tarifa != null && d.tarifa !== '' ? moneda(d.tarifa_moneda, empresa.moneda_base) : null, txt(d.notas, 1000)).first();
      if (Array.isArray(d.bandas)) { const vb = new Set((await db.prepare('SELECT id FROM bandas WHERE empresa_id = ?').bind(E).all()).results.map((b) => b.id));
        const stmts = d.bandas.map(Number).filter((b) => vb.has(b)).map((b) => db.prepare('INSERT OR IGNORE INTO banda_miembros (banda_id, musico_id) VALUES (?,?)').bind(b, r.id)); if (stmts.length) await db.batch(stmts); }
      await auditar(ctx, 'musico_creado', 'musico', r.id, d.nombre); return json({ ok: true, id: r.id }, 201); }
    if (method === 'PUT' && id && !accion) { const e = no('musicos.editar'); if (e) return e;
      const m = await db.prepare('SELECT * FROM musicos WHERE id = ? AND empresa_id = ?').bind(id, E).first(); if (!m) return err('No encontrado', 404);
      if (d.nombre !== undefined && !txt(d.nombre)) return err('Escriba el nombre');
      if (d.email && !emailOk(d.email)) return err('Correo no válido');
      if (d.activo === false || d.activo === 0) { const e2 = no('musicos.eliminar'); if (e2) return e2; }
      const v = (k, f) => (d[k] !== undefined ? f(d[k]) : m[k]);
      const foto = d.foto === null ? null : d.foto ? await archivoValido(db, E, d.foto, 'foto_musico') : m.foto_r2;
      await db.prepare(`UPDATE musicos SET nombre = ?, instrumento = ?, tipo = ?, telefono = ?, whatsapp = ?, email = ?, nacimiento = ?, direccion = ?, pais_residencia = ?, emergencia_nombre = ?, emergencia_telefono = ?, foto_r2 = ?, tarifa_c = ?, tarifa_moneda = ?, notas = ?, activo = ? WHERE id = ?`)
        .bind(v('nombre', (x) => txt(x, 80)), v('instrumento', (x) => txt(x, 60)), v('tipo', (x) => (['musico', 'sonidista', 'tecnico'].includes(x) ? x : 'musico')), v('telefono', (x) => soloDigitos(x) || null), v('whatsapp', (x) => soloDigitos(x) || null), v('email', (x) => (x ? String(x).toLowerCase().trim() : null)),
          v('nacimiento', fecha), v('direccion', (x) => txt(x, 200)), v('pais_residencia', (x) => txt(x, 40)), v('emergencia_nombre', (x) => txt(x, 80)), v('emergencia_telefono', (x) => soloDigitos(x) || null), foto,
          d.tarifa !== undefined ? aCentavos(d.tarifa) : m.tarifa_c, d.tarifa_moneda !== undefined ? moneda(d.tarifa_moneda, empresa.moneda_base) : m.tarifa_moneda, v('notas', (x) => txt(x, 1000)), d.activo !== undefined ? (d.activo ? 1 : 0) : m.activo, id).run();
      if (Array.isArray(d.bandas)) { const vb = new Set((await db.prepare('SELECT id FROM bandas WHERE empresa_id = ?').bind(E).all()).results.map((b) => b.id)); const quiere = new Set(d.bandas.map(Number).filter((b) => vb.has(b)));
        const tiene = new Set((await db.prepare('SELECT banda_id FROM banda_miembros WHERE musico_id = ?').bind(id).all()).results.map((x) => x.banda_id));
        const st = [...[...tiene].filter((b) => !quiere.has(b)).map((b) => db.prepare('DELETE FROM banda_miembros WHERE banda_id = ? AND musico_id = ?').bind(b, id)), ...[...quiere].filter((b) => !tiene.has(b)).map((b) => db.prepare('INSERT INTO banda_miembros (banda_id, musico_id) VALUES (?,?)').bind(b, id))];
        if (st.length) await db.batch(st); }
      await auditar(ctx, d.activo === false || d.activo === 0 ? 'musico_baja' : 'musico_editado', 'musico', id, m.nombre); return json({ ok: true }); }
    // documentos de viaje
    if (id && accion === 'documentos') {
      if (!(await db.prepare('SELECT 1 FROM musicos WHERE id = ? AND empresa_id = ?').bind(id, E).first())) return err('No encontrado', 404);
      if (method === 'GET') { const e = no('documentos.ver'); if (e) return e; if (puede('documentos.descargar')) await auditar(ctx, 'documentos_vistos', 'musico', id, 'completo'); return json(await docsDe(db, E, id, puede('documentos.descargar'))); }
      if (method === 'POST') { const e = no('documentos.editar'); if (e) return e; return guardarDoc(db, ctx, id, d, null); }
      if (method === 'PUT' && sub) { const e = no('documentos.editar'); if (e) return e; return guardarDoc(db, ctx, id, d, Number(sub)); }
      if (method === 'DELETE' && sub) { const e = no('documentos.editar'); if (e) return e;
        const r = await db.prepare('DELETE FROM documentos_viaje WHERE id = ? AND musico_id = ? AND empresa_id = ?').bind(Number(sub), id, E).run(); if (!r.meta.changes) return err('No encontrado', 404);
        await auditar(ctx, 'documento_borrado', 'musico', id, 'doc ' + sub); return json({ ok: true }); }
    }
    if (id && accion === 'cuenta-pago') {
      if (!(await db.prepare('SELECT 1 FROM musicos WHERE id = ? AND empresa_id = ?').bind(id, E).first())) return err('No encontrado', 404);
      if (method === 'GET') { const e = no('pagos.ver'); if (e) return e; return json(await cuentaDe(db, E, id, false)); }
      if (method === 'PUT') { const e = no('pagos.editar'); if (e) return e; return guardarCuenta(db, ctx, id, d); }
    }
    if (id && accion === 'enlazar' && method === 'POST') { const e = no('usuarios.editar'); if (e) return e;
      const m = await db.prepare('SELECT * FROM musicos WHERE id = ? AND empresa_id = ?').bind(id, E).first(); if (!m) return err('No encontrado', 404);
      const uid = Number(d.usuario_id) || null;
      if (uid) { const ok = await db.prepare("SELECT 1 FROM miembros WHERE usuario_id = ? AND empresa_id = ? AND activo = 1 AND rol IN ('dueno','admin','manager','booking')").bind(uid, E).first(); if (!ok) return err('Escoja un usuario de la oficina');
        if (await db.prepare('SELECT 1 FROM musicos WHERE usuario_id = ? AND empresa_id = ? AND id != ?').bind(uid, E, id).first()) return err('Ese usuario ya está enlazado a otro integrante'); }
      await db.prepare('UPDATE musicos SET usuario_id = ? WHERE id = ?').bind(uid, id).run();
      await auditar(ctx, uid ? 'musico_enlazado' : 'musico_desenlazado', 'musico', id, uid ? 'usuario ' + uid : '');
      return json({ ok: true }); }
    // dar acceso al portal: manda (o devuelve) un enlace de invitación de 7 días
    if (id && accion === 'invitar' && method === 'POST') { const e = no('usuarios.invitar'); if (e) return e;
      const m = await db.prepare('SELECT * FROM musicos WHERE id = ? AND empresa_id = ?').bind(id, E).first(); if (!m) return err('No encontrado', 404);
      if (m.usuario_id) return err('Ya tiene acceso al portal');
      if (!emailOk(m.email)) return err('Agregue primero el correo del integrante');
      // si ese correo ya es de alguien de la oficina (manager, admin…), se enlaza sin bajarle el acceso
      const of = await db.prepare("SELECT u.id, mi.rol FROM usuarios u JOIN miembros mi ON mi.usuario_id = u.id AND mi.empresa_id = ? AND mi.activo = 1 WHERE u.email = ? AND mi.rol IN ('dueno','admin','manager','booking')").bind(E, String(m.email).toLowerCase()).first();
      if (of) { if (await db.prepare('SELECT 1 FROM musicos WHERE usuario_id = ? AND empresa_id = ? AND id != ?').bind(of.id, E, id).first()) return err('Ese usuario ya está enlazado a otro integrante');
        await db.prepare('UPDATE musicos SET usuario_id = ? WHERE id = ?').bind(of.id, id).run(); await auditar(ctx, 'musico_enlazado', 'musico', id, 'usuario ' + of.id);
        return json({ ok: true, enlazado: true, rol: of.rol }); }
      return invitar(L, { email: m.email, nombre: m.nombre, rol: m.tipo === 'sonidista' ? 'sonidista' : 'musico', musico_id: m.id });
    }
  }

  // alertas de documentos por vencer (180, 90, 60 y 30 días)
  if (mod === 'alertas' && method === 'GET') {
    const r = [];
    if (puede('documentos.ver')) {
      const rs = (await db.prepare("SELECT dv.tipo, dv.pais, dv.clase, dv.vence, m.id AS musico_id, m.nombre FROM documentos_viaje dv JOIN musicos m ON m.id = dv.musico_id WHERE dv.empresa_id = ? AND m.activo = 1 AND dv.vence <= date('now', '+180 days') ORDER BY dv.vence").bind(E).all()).results;
      for (const x of rs) r.push({ tipo: 'documento', musico_id: x.musico_id, titulo: `${x.tipo === 'visa' ? 'Visa ' + (x.clase || '') + (x.pais ? ' · ' + x.pais : '') : 'Pasaporte'} de ${x.nombre}`, ...alertaDoc(x.vence), vence: x.vence });
    }
    return json(r);
  }

  // portal del músico o sonidista: solo lo suyo
  if (mod === 'portal') {
    if (!ROLES_PORTAL.includes(L.rol) && !puede('musicos.ver')) return err('Solo para integrantes', 403);
    const m = await db.prepare('SELECT * FROM musicos WHERE usuario_id = ? AND empresa_id = ? AND activo = 1').bind(user.id, E).first();
    if (!m) return err('Su usuario no está enlazado a un integrante de esta empresa. Pida a la oficina que le mande la invitación desde su ficha.', 404);
    const yo = { ...ctx, recurso: 'musico' };
    if (method === 'GET' && !L.idRaw) {
      const bandas = (await db.prepare('SELECT b.id, b.nombre, b.logo_r2, bm.funcion FROM banda_miembros bm JOIN bandas b ON b.id = bm.banda_id WHERE bm.musico_id = ? AND b.activa = 1').bind(m.id).all()).results.map(bandaPub);
      return json({ musico: musicoPub(m, true), bandas, documentos: await docsDe(db, E, m.id, true), cuenta_pago: await cuentaDe(db, E, m.id, true), empresa: { nombre: empresa.nombre } });
    }
    if (method === 'PUT' && L.idRaw === 'perfil') {
      if (d.email && !emailOk(d.email)) return err('Correo no válido');
      const foto = d.foto ? await archivoValido(db, E, d.foto, 'foto_musico') : m.foto_r2;
      await db.prepare('UPDATE musicos SET telefono = ?, whatsapp = ?, direccion = ?, pais_residencia = ?, nacimiento = ?, emergencia_nombre = ?, emergencia_telefono = ?, foto_r2 = ? WHERE id = ?')
        .bind(...[['telefono', (x) => soloDigitos(x) || null], ['whatsapp', (x) => soloDigitos(x) || null], ['direccion', (x) => txt(x, 200)], ['pais_residencia', (x) => txt(x, 40)], ['nacimiento', fecha], ['emergencia_nombre', (x) => txt(x, 80)], ['emergencia_telefono', (x) => soloDigitos(x) || null]].map(([k, f]) => (d[k] !== undefined ? f(d[k]) : m[k])), foto, m.id).run();
      await auditar(yo, 'portal_perfil', 'musico', m.id, 'el integrante cambió su perfil'); return json({ ok: true });
    }
    if (L.idRaw === 'documentos' && method === 'POST') return guardarDoc(db, ctx, m.id, d, null);
    if (L.idRaw === 'documentos' && method === 'PUT' && accion) return guardarDoc(db, ctx, m.id, d, Number(accion));
    if (L.idRaw === 'cuenta-pago' && method === 'PUT') return guardarCuenta(db, ctx, m.id, d);
  }
  return null;
}

// invitación con enlace de 7 días; si los correos están activos se manda, si no se devuelve el enlace para pasarlo por WhatsApp
export async function invitar(L, { email, nombre, rol, musico_id, cliente_id }) {
  const { db, env, url, empresa, user, ctx } = L;
  const t = rnd(24);
  await db.prepare('DELETE FROM invitaciones WHERE empresa_id = ? AND email = ? AND usado = 0').bind(empresa.id, email).run();
  await db.prepare('INSERT INTO invitaciones (token, empresa_id, email, nombre, rol, musico_id, cliente_id, expira, creado_por) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(await sha256(t), empresa.id, email, nombre || null, rol, musico_id || null, cliente_id || null, new Date(Date.now() + 7 * 864e5).toISOString(), user.id).run();
  const enlace = `${url.origin}/app/#/invitacion/${t}`;
  let enviado = false;
  if ((await cfgCorreo(env, db)).listo) {
    try { await enviarCorreo(env, db, { para: email, asunto: `${empresa.nombre} le invita a BandGo`, html: correoBase(`Bienvenido a ${escHtml(empresa.nombre)}`, `<p>Hola ${escHtml(String(nombre || '').split(' ')[0])}: ${escHtml(empresa.nombre)} le dio acceso a BandGo como <b>${escHtml(ROLES[rol] || rol)}</b>.</p><p><a href="${enlace}" style="background:#0F172A;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Crear mi contraseña</a></p><p style="color:#64748B">El enlace vence en 7 días.</p>`) }); enviado = true; }
    catch (e) { console.error('invitar', e.message); }
  }
  await auditar(ctx, 'invitacion_creada', 'usuario', null, `${email} · ${rol}`);
  return json({ ok: true, enviado, enlace });
}
