// BandGo · Fase 7 · comunicación. Dos cosas distintas:
//  · Comunicados: avisos oficiales de la oficina a un grupo (todos, una banda, el equipo de un evento, la delegación de
//    una gira o personas escogidas). Quedan los destinatarios congelados, quién lo leyó y quién confirmó «Enterado».
//  · Chat: conversaciones por banda, por evento, por gira, directas y grupos. Se actualiza consultando cada pocos
//    segundos (sin servicios de pago); los mensajes no se borran de verdad, se ocultan con constancia.
import { json, err, txt, soloDigitos, emailOk, auditar, escHtml, enviarCorreo, correoBase, cfgCorreo, frenarClave } from './nucleo.js';
import { ROLES_PORTAL } from './permisos.js';

const VISIBLE = "('cotizacion','negociacion','cancelado')";      // estados de evento que el músico no ve
const OFICINA_CHAT = ['dueno', 'admin', 'manager', 'booking'];
const urlArchivo = (k) => (k ? '/api/archivo/' + encodeURIComponent(k) : null);

// condición SQL «este usuario puede entrar a este canal» (alias c = chat_canales)
async function condicion(L) {
  const { db, user, rol, puede, empresa } = L;
  if (ROLES_PORTAL.includes(rol)) {
    const m = await db.prepare('SELECT id FROM musicos WHERE usuario_id = ? AND empresa_id = ? AND activo = 1').bind(user.id, empresa.id).first();
    const M = m ? m.id : -1;
    return { sql: `((c.tipo IN ('directo','grupo') AND c.id IN (SELECT canal_id FROM chat_miembros WHERE usuario_id = ?))
      OR (c.tipo = 'banda' AND c.ref_id IN (SELECT banda_id FROM banda_miembros WHERE musico_id = ?))
      OR (c.tipo = 'evento' AND c.ref_id IN (SELECT a.evento_id FROM evento_asignaciones a JOIN eventos e ON e.id = a.evento_id WHERE a.musico_id = ? AND e.estado NOT IN ${VISIBLE}))
      OR (c.tipo = 'viaje' AND c.ref_id IN (SELECT viaje_id FROM viaje_personas WHERE musico_id = ?)))`, b: [user.id, M, M, M], musico: M };
  }
  if (puede('chat.moderar')) return { sql: '1 = 1', b: [] };
  if (!puede('chat.usar')) return { sql: '1 = 0', b: [] };
  return { sql: `((c.tipo IN ('directo','grupo') AND c.id IN (SELECT canal_id FROM chat_miembros WHERE usuario_id = ?))
      OR c.tipo = 'banda'
      OR (c.tipo = 'evento' AND c.ref_id IN (SELECT id FROM eventos WHERE booking_id = ? OR manager_id = ?))
      OR (c.tipo = 'viaje' AND ${puede('viajes.ver') ? '1 = 1' : '1 = 0'}))`, b: [user.id, user.id, user.id] };
}
export async function accesoCanal(L, canalId) {
  const c0 = await condicion(L);
  return L.db.prepare(`SELECT c.* FROM chat_canales c WHERE c.id = ? AND c.empresa_id = ? AND ${c0.sql}`).bind(canalId, L.empresa.id, ...c0.b).first();
}
// ¿puede ver este archivo adjunto? (lo usa la ruta de archivos)
export async function accesoAdjunto(L, clave) {
  const { db, empresa, puede } = L;
  const msg = await db.prepare('SELECT canal_id FROM chat_mensajes WHERE archivo_r2 = ? AND empresa_id = ? AND borrado_en IS NULL').bind(clave, empresa.id).first();
  if (msg && (await accesoCanal(L, msg.canal_id))) return true;
  const com = await db.prepare('SELECT id FROM comunicados WHERE archivo_r2 = ? AND empresa_id = ?').bind(clave, empresa.id).first();
  if (com) {
    if (puede('comunicados.ver')) return true;
    return !!(await db.prepare('SELECT 1 FROM comunicado_destinatarios d JOIN musicos m ON m.id = d.musico_id WHERE d.comunicado_id = ? AND m.usuario_id = ?').bind(com.id, L.user.id).first());
  }
  return false;
}
// crea (si no existen) los canales de las bandas activas
async function asegurarBandas(db, E) {
  const bs = (await db.prepare("SELECT b.id, b.nombre FROM bandas b WHERE b.empresa_id = ? AND b.activa = 1 AND NOT EXISTS (SELECT 1 FROM chat_canales c WHERE c.empresa_id = b.empresa_id AND c.clave = 'banda:' || b.id)").bind(E).all()).results;
  if (bs.length) await db.batch(bs.map((b) => db.prepare("INSERT OR IGNORE INTO chat_canales (empresa_id, tipo, ref_id, clave, nombre) VALUES (?, 'banda', ?, ?, ?)").bind(E, b.id, 'banda:' + b.id, b.nombre)));
}
async function destinatarios(db, E, alcance, alcanceId, personas) {
  const act = 'm.empresa_id = ? AND m.activo = 1';
  if (alcance === 'todos') return (await db.prepare(`SELECT m.id FROM musicos m WHERE ${act}`).bind(E).all()).results.map((r) => r.id);
  if (alcance === 'banda') return (await db.prepare(`SELECT m.id FROM banda_miembros x JOIN musicos m ON m.id = x.musico_id WHERE ${act} AND x.banda_id = ?`).bind(E, alcanceId).all()).results.map((r) => r.id);
  if (alcance === 'evento') return (await db.prepare(`SELECT m.id FROM evento_asignaciones x JOIN musicos m ON m.id = x.musico_id WHERE ${act} AND x.evento_id = ?`).bind(E, alcanceId).all()).results.map((r) => r.id);
  if (alcance === 'viaje') return (await db.prepare(`SELECT m.id FROM viaje_personas x JOIN musicos m ON m.id = x.musico_id WHERE ${act} AND x.viaje_id = ?`).bind(E, alcanceId).all()).results.map((r) => r.id);
  const v = [...new Set((Array.isArray(personas) ? personas : []).map(Number).filter((n) => n > 0))];
  if (!v.length) return [];
  return (await db.prepare(`SELECT m.id FROM musicos m WHERE ${act} AND m.id IN (${v.map(() => '?').join(',')})`).bind(E, ...v).all()).results.map((r) => r.id);
}
async function avisarCorreo(L, com, ids, recordatorio) {
  const { db, env, url, empresa } = L;
  if (!ids.length) return { correos: 0, whatsapp: [] };
  const per = (await db.prepare(`SELECT nombre, email, whatsapp FROM musicos WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results;
  const titulo = `${com.importancia === 'urgente' ? 'URGENTE · ' : ''}${recordatorio ? 'Recordatorio: ' : ''}${com.titulo}`;
  let correos = 0;
  if ((await cfgCorreo(env, db)).listo) for (const p of per) {
    if (!emailOk(p.email)) continue;
    try { await enviarCorreo(env, db, { para: p.email, asunto: `${titulo} · ${empresa.nombre}`, html: correoBase(escHtml(titulo), `<p>Hola ${escHtml(p.nombre.split(' ')[0])}:</p><div style="white-space:pre-wrap">${escHtml(com.cuerpo.slice(0, 1500))}</div>${com.requiere_acuse ? '<p><b>Por favor confirme «Enterado» en BandGo.</b></p>' : ''}<p><a href="${url.origin}/app/#/mensajes" style="background:#0F172A;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Abrir en BandGo</a></p>`) }); correos++; }
    catch (e) { console.error('comunicado', e.message); }
  }
  const texto = `${titulo}\n\n${com.cuerpo.slice(0, 600)}${com.cuerpo.length > 600 ? '…' : ''}\n\n${com.requiere_acuse ? 'Confirma «Enterado» en BandGo: ' : 'Véalo en BandGo: '}${url.origin}/app/#/mensajes`;
  return { correos, whatsapp: per.filter((p) => p.whatsapp).map((p) => ({ nombre: p.nombre, enlace: `https://wa.me/${soloDigitos(p.whatsapp)}?text=${encodeURIComponent(texto)}` })) };
}
const autorDe = (r) => ({ id: r.usuario_id, nombre: r.autor || 'Usuario', foto_url: urlArchivo(r.foto_r2), rol: r.autor_rol || null });
function pubMsg(r, yo) {
  const borrado = !!r.borrado_en;
  return { id: r.id, canal_id: r.canal_id, autor: autorDe(r), mio: r.usuario_id === yo, texto: borrado ? null : r.texto, archivo_url: borrado ? null : urlArchivo(r.archivo_r2), archivo_mime: borrado ? null : r.archivo_mime,
    responde_a: r.responde_a ? { id: r.responde_a, texto: r.r_borrado ? null : (r.r_texto || '').slice(0, 120), autor: r.r_autor || '' } : null, editado: !!r.editado_en, borrado, creado: r.creado };
}
const MSG_SQL = `SELECT x.*, u.nombre AS autor, mi.rol AS autor_rol, mu.foto_r2, r.texto AS r_texto, r.borrado_en AS r_borrado, ru.nombre AS r_autor
  FROM chat_mensajes x JOIN usuarios u ON u.id = x.usuario_id LEFT JOIN miembros mi ON mi.usuario_id = x.usuario_id AND mi.empresa_id = x.empresa_id
  LEFT JOIN musicos mu ON mu.usuario_id = x.usuario_id AND mu.empresa_id = x.empresa_id LEFT JOIN chat_mensajes r ON r.id = x.responde_a LEFT JOIN usuarios ru ON ru.id = r.usuario_id`;

export async function rutasComunicacion(L) {
  const { db, method, mod, id, idRaw, accion, sub, d, ctx, puede, empresa, user, rol, req } = L;
  const E = empresa.id, portal = ROLES_PORTAL.includes(rol);
  const no = (p) => (puede(p) ? null : err('Su rol no tiene permiso para esto', 403));
  const musico = async () => db.prepare('SELECT id, nombre FROM musicos WHERE usuario_id = ? AND empresa_id = ? AND activo = 1').bind(user.id, E).first();

  // ---------- contador de pendientes (para la insignia del menú) ----------
  if (mod === 'mensajes' && idRaw === 'pendientes' && method === 'GET') {
    const c0 = await condicion(L);
    const chat = (await db.prepare(`SELECT COUNT(*) n FROM chat_mensajes x JOIN chat_canales c ON c.id = x.canal_id LEFT JOIN chat_lecturas l ON l.canal_id = c.id AND l.usuario_id = ?
      WHERE c.empresa_id = ? AND c.archivado = 0 AND x.usuario_id != ? AND x.borrado_en IS NULL AND x.id > COALESCE(l.ultimo_id, 0) AND ${c0.sql}`).bind(user.id, E, user.id, ...c0.b).first()).n;
    let avisos = 0, acuses = 0;
    if (portal) { const m = await musico(); if (m) { const r = await db.prepare('SELECT SUM(d.leido_en IS NULL) a, SUM(c.requiere_acuse = 1 AND d.acuse_en IS NULL) b FROM comunicado_destinatarios d JOIN comunicados c ON c.id = d.comunicado_id WHERE d.musico_id = ? AND c.retirado_en IS NULL').bind(m.id).first(); avisos = r.a || 0; acuses = r.b || 0; } }
    return json({ chat, avisos, acuses });
  }

  // ---------- comunicados (oficina) ----------
  if (mod === 'comunicados' && !portal) {
    if (!id && method === 'GET') {
      const e0 = no('comunicados.ver'); if (e0) return e0;
      const rs = (await db.prepare(`SELECT c.*, u.nombre AS por, (SELECT COUNT(*) FROM comunicado_destinatarios d WHERE d.comunicado_id = c.id) AS total,
          (SELECT COUNT(*) FROM comunicado_destinatarios d WHERE d.comunicado_id = c.id AND d.leido_en IS NOT NULL) AS leidos,
          (SELECT COUNT(*) FROM comunicado_destinatarios d WHERE d.comunicado_id = c.id AND d.acuse_en IS NOT NULL) AS acuses
        FROM comunicados c LEFT JOIN usuarios u ON u.id = c.creado_por WHERE c.empresa_id = ? ORDER BY c.retirado_en IS NOT NULL, c.fijado DESC, c.id DESC LIMIT 200`).bind(E).all()).results;
      return json(rs.map((c) => ({ ...c, archivo_url: urlArchivo(c.archivo_r2), archivo_r2: undefined })));
    }
    if (!id && method === 'POST') {
      const e0 = no('comunicados.enviar'); if (e0) return e0;
      const titulo = txt(d.titulo, 120), cuerpo = txt(d.cuerpo, 5000);
      if (!titulo || !cuerpo) return err('Escriba el título y el mensaje');
      const alcance = ['todos', 'banda', 'evento', 'viaje', 'personas'].includes(d.alcance) ? d.alcance : 'todos';
      const alcanceId = ['banda', 'evento', 'viaje'].includes(alcance) ? Number(d.alcance_id) || null : null;
      let alcanceNombre = alcance === 'todos' ? 'Todos los integrantes' : alcance === 'personas' ? 'Personas escogidas' : null;
      if (alcanceId) {
        const t = { banda: "SELECT nombre FROM bandas WHERE id = ? AND empresa_id = ?", evento: "SELECT codigo || ' · ' || nombre AS nombre FROM eventos WHERE id = ? AND empresa_id = ?", viaje: "SELECT codigo || ' · ' || nombre AS nombre FROM viajes WHERE id = ? AND empresa_id = ?" }[alcance];
        const r = await db.prepare(t).bind(alcanceId, E).first(); if (!r) return err('El grupo escogido no es válido');
        alcanceNombre = r.nombre;
      } else if (['banda', 'evento', 'viaje'].includes(alcance)) return err('Escoja la banda, el evento o la gira');
      const ids = await destinatarios(db, E, alcance, alcanceId, d.personas);
      if (!ids.length) return err('Ese grupo no tiene integrantes activos');
      let archivo = null;
      if (d.archivo) { const a = await db.prepare("SELECT clave FROM archivos WHERE clave = ? AND empresa_id = ? AND tipo = 'adjunto'").bind(d.archivo, E).first(); if (!a) return err('El archivo no es válido'); archivo = a.clave; }
      const r = await db.prepare('INSERT INTO comunicados (empresa_id, titulo, cuerpo, importancia, requiere_acuse, alcance, alcance_id, alcance_nombre, archivo_r2, fijado, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
        .bind(E, titulo, cuerpo, d.importancia === 'urgente' ? 'urgente' : 'normal', d.requiere_acuse ? 1 : 0, alcance, alcanceId, alcanceNombre, archivo, d.fijado ? 1 : 0, user.id).first();
      for (let i = 0; i < ids.length; i += 50) await db.batch(ids.slice(i, i + 50).map((m) => db.prepare('INSERT INTO comunicado_destinatarios (comunicado_id, musico_id) VALUES (?, ?)').bind(r.id, m)));
      const av = d.enviar_correo === false ? { correos: 0, whatsapp: [] } : await avisarCorreo(L, r, ids, false);
      await auditar(ctx, 'comunicado_enviado', 'comunicado', r.id, `${titulo} → ${alcanceNombre} (${ids.length})`);
      return json({ ok: true, id: r.id, destinatarios: ids.length, ...av }, 201);
    }
    if (id) {
      const c = await db.prepare('SELECT c.*, u.nombre AS por FROM comunicados c LEFT JOIN usuarios u ON u.id = c.creado_por WHERE c.id = ? AND c.empresa_id = ?').bind(id, E).first();
      if (!c) return err('Comunicado no encontrado', 404);
      if (!accion && method === 'GET') {
        const e0 = no('comunicados.ver'); if (e0) return e0;
        const ds = (await db.prepare('SELECT d.*, m.nombre, m.instrumento, m.whatsapp, m.email, m.usuario_id, m.foto_r2 FROM comunicado_destinatarios d JOIN musicos m ON m.id = d.musico_id WHERE d.comunicado_id = ? ORDER BY d.acuse_en IS NOT NULL, d.leido_en IS NOT NULL, m.nombre').bind(id).all()).results;
        return json({ ...c, archivo_url: urlArchivo(c.archivo_r2), archivo_r2: undefined, destinatarios: ds.map((x) => ({ musico_id: x.musico_id, nombre: x.nombre, instrumento: x.instrumento, foto_url: urlArchivo(x.foto_r2), portal: !!x.usuario_id, leido_en: x.leido_en, acuse_en: x.acuse_en, whatsapp: !!x.whatsapp, email: !!x.email })), enviar: puede('comunicados.enviar') });
      }
      const e0 = no('comunicados.enviar'); if (e0) return e0;
      if (!accion && method === 'PUT') { await db.prepare('UPDATE comunicados SET fijado = ? WHERE id = ?').bind(d.fijado ? 1 : 0, id).run(); return json({ ok: true }); }
      if (accion === 'retirar' && method === 'POST') {
        if (c.retirado_en) return err('Ya estaba retirado', 409);
        await db.prepare("UPDATE comunicados SET retirado_en = datetime('now'), retirado_por = ?, fijado = 0 WHERE id = ?").bind(user.id, id).run();
        await auditar(ctx, 'comunicado_retirado', 'comunicado', id, c.titulo);
        return json({ ok: true });
      }
      if (accion === 'recordar' && method === 'POST') {
        if (c.retirado_en) return err('El comunicado está retirado', 409);
        const ids = (await db.prepare(`SELECT musico_id FROM comunicado_destinatarios WHERE comunicado_id = ? AND ${c.requiere_acuse ? 'acuse_en' : 'leido_en'} IS NULL`).bind(id).all()).results.map((r) => r.musico_id);
        const av = await avisarCorreo(L, c, ids, true);
        await auditar(ctx, 'comunicado_recordado', 'comunicado', id, `${ids.length} pendientes`);
        return json({ ok: true, pendientes: ids.length, ...av });
      }
    }
  }

  // ---------- comunicados (portal del músico) ----------
  if (mod === 'portal' && idRaw === 'avisos') {
    const m = await musico(); if (!m) return err('Su usuario no está enlazado a un integrante de esta empresa.', 404);
    if (method === 'GET' && !accion) {
      const rs = (await db.prepare(`SELECT c.id, c.titulo, c.cuerpo, c.importancia, c.requiere_acuse, c.fijado, c.creado, c.archivo_r2, c.alcance_nombre, u.nombre AS por, d.leido_en, d.acuse_en
        FROM comunicado_destinatarios d JOIN comunicados c ON c.id = d.comunicado_id LEFT JOIN usuarios u ON u.id = c.creado_por WHERE d.musico_id = ? AND c.retirado_en IS NULL ORDER BY c.fijado DESC, c.id DESC LIMIT 100`).bind(m.id).all()).results;
      return json(rs.map((c) => ({ ...c, archivo_url: urlArchivo(c.archivo_r2), archivo_r2: undefined })));
    }
    const cid = Number(accion);
    if (method === 'POST' && cid && ['leido', 'enterado'].includes(sub)) {
      const x = await db.prepare('SELECT d.*, c.requiere_acuse, c.titulo FROM comunicado_destinatarios d JOIN comunicados c ON c.id = d.comunicado_id WHERE d.comunicado_id = ? AND d.musico_id = ? AND c.retirado_en IS NULL').bind(cid, m.id).first();
      if (!x) return err('Comunicado no encontrado', 404);
      if (sub === 'leido') await db.prepare("UPDATE comunicado_destinatarios SET leido_en = COALESCE(leido_en, datetime('now')) WHERE comunicado_id = ? AND musico_id = ?").bind(cid, m.id).run();
      else {
        await db.prepare("UPDATE comunicado_destinatarios SET leido_en = COALESCE(leido_en, datetime('now')), acuse_en = COALESCE(acuse_en, datetime('now')) WHERE comunicado_id = ? AND musico_id = ?").bind(cid, m.id).run();
        await auditar(ctx, 'comunicado_enterado', 'comunicado', cid, m.nombre);
      }
      return json({ ok: true });
    }
  }

  // ---------- chat ----------
  if (mod !== 'chat') return null;
  if (!portal && !puede('chat.usar') && !puede('chat.moderar')) return err('Su rol no tiene permiso para esto', 403);
  const cid = Number(accion) || null; // chat/canales/:cid/… y chat/mensajes/:cid

  // lista de personas con las que se puede abrir un chat directo
  if (idRaw === 'contactos' && method === 'GET') {
    const rs = (await db.prepare(`SELECT u.id, u.nombre, mi.rol, mu.foto_r2, mu.instrumento FROM miembros mi JOIN usuarios u ON u.id = mi.usuario_id LEFT JOIN musicos mu ON mu.usuario_id = u.id AND mu.empresa_id = mi.empresa_id
      WHERE mi.empresa_id = ? AND mi.activo = 1 AND u.id != ? ${portal ? `AND mi.rol IN (${OFICINA_CHAT.map(() => '?').join(',')})` : ''} ORDER BY u.nombre`).bind(E, user.id, ...(portal ? OFICINA_CHAT : [])).all()).results;
    return json(rs.map((r) => ({ id: r.id, nombre: r.nombre, rol: r.rol, instrumento: r.instrumento, foto_url: urlArchivo(r.foto_r2) })));
  }
  if (idRaw === 'canales' && !accion && method === 'GET') {
    await asegurarBandas(db, E);
    const c0 = await condicion(L);
    const rs = (await db.prepare(`SELECT c.*, COALESCE(l.ultimo_id, 0) AS leido,
        (SELECT COUNT(*) FROM chat_mensajes x WHERE x.canal_id = c.id AND x.id > COALESCE(l.ultimo_id, 0) AND x.usuario_id != ? AND x.borrado_en IS NULL) AS sin_leer,
        lm.texto AS u_texto, lm.archivo_r2 AS u_archivo, lm.borrado_en AS u_borrado, lu.nombre AS u_autor, lm.usuario_id AS u_uid
      FROM chat_canales c LEFT JOIN chat_lecturas l ON l.canal_id = c.id AND l.usuario_id = ? LEFT JOIN chat_mensajes lm ON lm.id = c.ultimo_id LEFT JOIN usuarios lu ON lu.id = lm.usuario_id
      WHERE c.empresa_id = ? AND ${c0.sql} ${new URL(req.url).searchParams.get('archivados') === '1' ? '' : 'AND c.archivado = 0'} ORDER BY COALESCE(c.ultimo_en, c.creado) DESC LIMIT 300`).bind(user.id, user.id, E, ...c0.b).all()).results;
    // nombre de los directos: la otra persona
    const dir = rs.filter((c) => c.tipo === 'directo').map((c) => c.id);
    const otros = dir.length ? (await db.prepare(`SELECT m.canal_id, u.nombre, mu.foto_r2 FROM chat_miembros m JOIN usuarios u ON u.id = m.usuario_id LEFT JOIN musicos mu ON mu.usuario_id = u.id AND mu.empresa_id = ? WHERE m.canal_id IN (${dir.map(() => '?').join(',')}) AND m.usuario_id != ?`).bind(E, ...dir, user.id).all()).results : [];
    return json(rs.map((c) => { const o = otros.find((x) => x.canal_id === c.id);
      return { id: c.id, tipo: c.tipo, ref_id: c.ref_id, nombre: c.tipo === 'directo' ? (o?.nombre || 'Conversación') : c.nombre, foto_url: c.tipo === 'directo' ? urlArchivo(o?.foto_r2) : null, solo_oficina: !!c.solo_oficina, archivado: !!c.archivado, sin_leer: c.sin_leer, ultimo_en: c.ultimo_en,
        ultimo: c.ultimo_id ? { autor: c.u_uid === user.id ? 'Usted' : (c.u_autor || '').split(' ')[0], texto: c.u_borrado ? 'Mensaje eliminado' : c.u_texto ? c.u_texto.slice(0, 90) : c.u_archivo ? '📎 Archivo' : '' } : null }; }));
  }
  if (idRaw === 'canales' && !accion && method === 'POST') {
    const tipo = d.tipo;
    if (tipo === 'directo') {
      const otro = Number(d.usuario_id);
      const mi = await db.prepare('SELECT rol FROM miembros WHERE usuario_id = ? AND empresa_id = ? AND activo = 1').bind(otro, E).first();
      if (!mi || otro === user.id) return err('Esa persona no está en la empresa');
      if (portal && !OFICINA_CHAT.includes(mi.rol)) return err('Desde el portal se escribe a la oficina; para hablar con el grupo use el chat de la banda o del evento', 403);
      const clave = `directo:${Math.min(otro, user.id)}:${Math.max(otro, user.id)}`;
      let c = await db.prepare('SELECT id FROM chat_canales WHERE empresa_id = ? AND clave = ?').bind(E, clave).first();
      if (!c) { c = await db.prepare("INSERT INTO chat_canales (empresa_id, tipo, clave, nombre, creado_por) VALUES (?, 'directo', ?, 'Directo', ?) RETURNING id").bind(E, clave, user.id).first();
        await db.batch([db.prepare('INSERT INTO chat_miembros (canal_id, usuario_id) VALUES (?,?)').bind(c.id, user.id), db.prepare('INSERT INTO chat_miembros (canal_id, usuario_id) VALUES (?,?)').bind(c.id, otro)]); }
      return json({ ok: true, id: c.id });
    }
    if (portal) return err('Su rol no tiene permiso para esto', 403);
    if (tipo === 'grupo') {
      const nombre = txt(d.nombre, 60); if (!nombre) return err('Escriba el nombre del grupo');
      const us = [...new Set((Array.isArray(d.usuarios) ? d.usuarios : []).map(Number).filter((n) => n > 0 && n !== user.id))];
      const ok = us.length ? (await db.prepare(`SELECT usuario_id FROM miembros WHERE empresa_id = ? AND activo = 1 AND usuario_id IN (${us.map(() => '?').join(',')})`).bind(E, ...us).all()).results.map((r) => r.usuario_id) : [];
      if (!ok.length) return err('Escoja al menos una persona');
      const c = await db.prepare("INSERT INTO chat_canales (empresa_id, tipo, nombre, creado_por) VALUES (?, 'grupo', ?, ?) RETURNING id").bind(E, nombre, user.id).first();
      await db.batch([user.id, ...ok].map((u) => db.prepare('INSERT INTO chat_miembros (canal_id, usuario_id) VALUES (?,?)').bind(c.id, u)));
      await auditar(ctx, 'chat_grupo_creado', 'chat', c.id, nombre);
      return json({ ok: true, id: c.id }, 201);
    }
    if (tipo === 'evento' || tipo === 'viaje') {
      const ref = Number(d.ref_id);
      const r = await db.prepare(tipo === 'evento' ? "SELECT id, codigo || ' · ' || nombre AS nombre FROM eventos WHERE id = ? AND empresa_id = ?" : "SELECT id, codigo || ' · ' || nombre AS nombre FROM viajes WHERE id = ? AND empresa_id = ?").bind(ref, E).first();
      if (!r) return err('No encontrado', 404);
      await db.prepare('INSERT OR IGNORE INTO chat_canales (empresa_id, tipo, ref_id, clave, nombre, creado_por) VALUES (?,?,?,?,?,?)').bind(E, tipo, ref, `${tipo}:${ref}`, r.nombre, user.id).run();
      const c = await db.prepare('SELECT id FROM chat_canales WHERE empresa_id = ? AND clave = ?').bind(E, `${tipo}:${ref}`).first();
      if (!(await accesoCanal(L, c.id))) return err('Su rol no tiene permiso para esto', 403);
      return json({ ok: true, id: c.id });
    }
    return err('Tipo de conversación no válido');
  }
  if (idRaw === 'canales' && cid) {
    const id = cid;
    const c = await accesoCanal(L, id); if (!c) return err('Conversación no encontrada', 404);
    if (!sub && method === 'PUT') {
      const e0 = no('chat.moderar'); if (e0) return e0;
      await db.prepare('UPDATE chat_canales SET nombre = ?, solo_oficina = ?, archivado = ? WHERE id = ?').bind(c.tipo === 'directo' ? c.nombre : txt(d.nombre, 60) || c.nombre, d.solo_oficina !== undefined ? (d.solo_oficina ? 1 : 0) : c.solo_oficina, d.archivado !== undefined ? (d.archivado ? 1 : 0) : c.archivado, id).run();
      await auditar(ctx, 'chat_canal_editado', 'chat', id, JSON.stringify({ solo_oficina: d.solo_oficina, archivado: d.archivado }));
      return json({ ok: true });
    }
    if (sub === 'mensajes' && method === 'GET') {
      const u = new URL(req.url), antes = Number(u.searchParams.get('antes')) || 0, despues = Number(u.searchParams.get('despues')) || 0;
      const rs = antes
        ? (await db.prepare(`${MSG_SQL} WHERE x.canal_id = ? AND x.id < ? ORDER BY x.id DESC LIMIT 50`).bind(id, antes).all()).results.reverse()
        : despues ? (await db.prepare(`${MSG_SQL} WHERE x.canal_id = ? AND (x.id > ? OR (x.editado_en > datetime('now','-60 seconds') OR x.borrado_en > datetime('now','-60 seconds'))) ORDER BY x.id LIMIT 200`).bind(id, despues).all()).results
        : (await db.prepare(`${MSG_SQL} WHERE x.canal_id = ? ORDER BY x.id DESC LIMIT 50`).bind(id).all()).results.reverse();
      const max = rs.reduce((a, r) => Math.max(a, r.id), 0);
      if (!antes && max) await db.prepare('INSERT INTO chat_lecturas (canal_id, usuario_id, ultimo_id) VALUES (?,?,?) ON CONFLICT(canal_id, usuario_id) DO UPDATE SET ultimo_id = MAX(ultimo_id, excluded.ultimo_id)').bind(id, user.id, max).run();
      let miembros = null;
      if (!despues && !antes) { // cabecera: quiénes están
        const q = { banda: "SELECT DISTINCT u.id, u.nombre FROM banda_miembros x JOIN musicos m ON m.id = x.musico_id JOIN usuarios u ON u.id = m.usuario_id WHERE x.banda_id = ? AND m.activo = 1",
          evento: "SELECT DISTINCT u.id, u.nombre FROM evento_asignaciones x JOIN musicos m ON m.id = x.musico_id JOIN usuarios u ON u.id = m.usuario_id WHERE x.evento_id = ?",
          viaje: "SELECT DISTINCT u.id, u.nombre FROM viaje_personas x JOIN musicos m ON m.id = x.musico_id JOIN usuarios u ON u.id = m.usuario_id WHERE x.viaje_id = ?" }[c.tipo];
        miembros = (await (q ? db.prepare(q).bind(c.ref_id) : db.prepare('SELECT u.id, u.nombre FROM chat_miembros x JOIN usuarios u ON u.id = x.usuario_id WHERE x.canal_id = ?').bind(id)).all()).results;
      }
      return json({ canal: { id: c.id, tipo: c.tipo, ref_id: c.ref_id, nombre: c.nombre, solo_oficina: !!c.solo_oficina, archivado: !!c.archivado, escribir: !c.archivado && !(c.solo_oficina && portal), moderar: puede('chat.moderar') },
        miembros, mensajes: rs.map((r) => pubMsg(r, user.id)), mas: antes || (!despues && rs.length === 50) ? rs.length === 50 : false });
    }
    if (sub === 'mensajes' && method === 'POST') {
      if (c.archivado) return err('La conversación está archivada', 409);
      if (c.solo_oficina && portal) return err('En esta conversación solo escribe la oficina', 403);
      if (await frenarClave(db, `chat:${user.id}`, 30, 60)) return err('Está enviando muy rápido. Espere un momento.', 429);
      const texto = txt(d.texto, 2000);
      let archivo = null, mime = null;
      if (d.archivo) { const a = await db.prepare("SELECT clave, mime FROM archivos WHERE clave = ? AND empresa_id = ? AND tipo = 'adjunto' AND creado_por = ?").bind(d.archivo, E, user.id).first(); if (!a) return err('El archivo no es válido'); archivo = a.clave; mime = a.mime; }
      if (!texto && !archivo) return err('Escriba un mensaje');
      const resp = d.responde_a ? (await db.prepare('SELECT id FROM chat_mensajes WHERE id = ? AND canal_id = ?').bind(Number(d.responde_a), id).first())?.id || null : null;
      const r = await db.prepare('INSERT INTO chat_mensajes (canal_id, empresa_id, usuario_id, texto, archivo_r2, archivo_mime, responde_a) VALUES (?,?,?,?,?,?,?) RETURNING id, creado').bind(id, E, user.id, texto, archivo, mime, resp).first();
      await db.batch([db.prepare('UPDATE chat_canales SET ultimo_id = ?, ultimo_en = ? WHERE id = ?').bind(r.id, r.creado, id),
        db.prepare('INSERT INTO chat_lecturas (canal_id, usuario_id, ultimo_id) VALUES (?,?,?) ON CONFLICT(canal_id, usuario_id) DO UPDATE SET ultimo_id = excluded.ultimo_id').bind(id, user.id, r.id)]);
      const m = await db.prepare(`${MSG_SQL} WHERE x.id = ?`).bind(r.id).first();
      return json(pubMsg(m, user.id), 201);
    }
  }
  if (idRaw === 'mensajes' && cid && (method === 'PUT' || method === 'DELETE')) {
    const id = cid;
    const m = await db.prepare('SELECT * FROM chat_mensajes WHERE id = ? AND empresa_id = ?').bind(id, E).first();
    if (!m || m.borrado_en || !(await accesoCanal(L, m.canal_id))) return err('Mensaje no encontrado', 404);
    const mio = m.usuario_id === user.id, reciente = Date.now() - Date.parse(m.creado.replace(' ', 'T') + 'Z') < 15 * 60000;
    if (method === 'PUT') {
      if (!mio) return err('Solo puede editar sus mensajes', 403);
      if (!reciente) return err('Solo se puede editar durante 15 minutos', 409);
      const texto = txt(d.texto, 2000); if (!texto) return err('Escriba el mensaje');
      await db.prepare("UPDATE chat_mensajes SET texto = ?, editado_en = datetime('now') WHERE id = ?").bind(texto, id).run();
      return json({ ok: true });
    }
    if (!mio && !puede('chat.moderar')) return err('Solo puede borrar sus mensajes', 403);
    await db.prepare("UPDATE chat_mensajes SET borrado_en = datetime('now'), borrado_por = ? WHERE id = ?").bind(user.id, id).run();
    if (!mio) await auditar(ctx, 'chat_mensaje_moderado', 'chat', m.canal_id, `mensaje ${id}`);
    return json({ ok: true });
  }
  return null;
}
