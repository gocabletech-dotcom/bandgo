// BandGo — SaaS para agrupaciones musicales (Cloudflare Workers + D1 + R2)
// La oficina está en /app; el músico entra al mismo /app y ve su portal. La plataforma (superadmin) también.
import { json, err, body, rnd, txt, soloDigitos, emailOk, moneda, prepararEntorno, conCabeceras, registrarError, auditar, getCookie, sha256, ipDe } from './nucleo.js';
import { rutasPublicas, rutasCuenta, COOKIE, INACTIVO_MS, dosPasosObligatorio } from './auth.js';
import { ROLES, ROLES_OFICINA, ROLES_PORTAL, PERMISOS_CAT, FABRICA, permisosDe } from './permisos.js';
import { rutasPersonal, invitar } from './personal.js';
import { rutasPlataforma } from './plataforma.js';
import { rutasAgenda } from './agenda.js';
import { rutasFinanzas } from './finanzas.js';
import { rutasViajes } from './viajes.js';
import { rutasRider } from './rider.js';
import { rutasReportes, rutasPresupuesto } from './reportes.js';
import { estado2fa } from './nucleo.js';

const LIM_IMG = 1_500_000, LIM_DOC = 4_000_000;
const TIPOS_ARCHIVO = { logo_empresa: 'img', logo_banda: 'img', foto_musico: 'img', documento: 'doc' };
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

async function cuentaEmpresa(db, e) {
  const p = await db.prepare('SELECT * FROM planes WHERE clave = ?').bind(e.plan).first();
  const vencida = e.plan === 'prueba' && e.prueba_hasta && e.prueba_hasta < new Date().toISOString().replace('T', ' ').slice(0, 19);
  return { plan: p ? { clave: p.clave, nombre: p.nombre, bandas: p.bandas, musicos: p.musicos, usuarios: p.usuarios, almacenamiento_mb: p.almacenamiento_mb } : null, prueba_hasta: e.prueba_hasta, limitado: !!vencida };
}

async function api(req, env, url, ectx) {
  const db = env.DB;
  const partes = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const [mod, idRaw, accion, sub] = partes;
  const id = idRaw && /^\d+$/.test(idRaw) ? Number(idRaw) : null;
  const method = req.method;

  if (mod === 'ping') return json({ ok: true, t: Date.now() });
  if (mod === 'version') return json({ version: env.BANDGO_VERSION || 'desconocida' });
  const pub = await rutasPublicas({ req, env, url, ectx, db, mod, idRaw, method });
  if (pub) return pub;

  // --- sesión ---
  const t = getCookie(req, COOKIE); if (!t) return err('No autenticado', 401);
  const s = await db.prepare('SELECT s.token, s.uso, s.empresa_id, u.id, u.email, u.nombre, u.superadmin FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ? AND s.expira > ? AND u.activo = 1').bind(await sha256(t), new Date().toISOString()).first();
  if (!s) return err('No autenticado', 401);
  const user = { id: s.id, email: s.email, nombre: s.nombre, superadmin: !!s.superadmin }, token = s.token;
  let empresa = null, rol = null;
  if (!user.superadmin && s.empresa_id) {
    empresa = await db.prepare('SELECT * FROM empresas WHERE id = ?').bind(s.empresa_id).first();
    const m = empresa && await db.prepare('SELECT rol FROM miembros WHERE usuario_id = ? AND empresa_id = ? AND activo = 1').bind(user.id, empresa.id).first();
    if (!empresa || !m) { await db.prepare('DELETE FROM sesiones WHERE token = ?').bind(token).run(); return err('Ya no tiene acceso a esta empresa', 401); }
    if (empresa.estado !== 'activo') return err('Esta empresa está suspendida. Escríbanos a soporte.', 403);
    rol = m.rol;
  }
  user.rol = rol;
  const limite = ROLES_PORTAL.includes(rol) ? INACTIVO_MS.portal : INACTIVO_MS.oficina;
  const usoMs = s.uso ? Date.parse(s.uso) : null;
  if (usoMs && Date.now() - usoMs > limite) { await db.prepare('DELETE FROM sesiones WHERE token = ?').bind(token).run(); return err('Su sesión venció por inactividad. Vuelva a entrar.', 401); }
  if (!usoMs || Date.now() - usoMs > 60e3) ectx?.waitUntil?.(db.prepare('UPDATE sesiones SET uso = ? WHERE token = ?').bind(new Date().toISOString(), token).run().catch(() => {}));
  if (method !== 'GET' && req.headers.get('x-requested-with') !== 'bg') return err('Solicitud rechazada', 403);

  const cuenta = await rutasCuenta({ req, env, ectx, db, mod, idRaw, method, user, token, empresa });
  if (cuenta) return cuenta;
  const ctx = { db, user, empresa, req };
  const d = method === 'GET' || method === 'DELETE' ? {} : await body(req);

  if (user.superadmin) {
    if (mod === 'me') return json({ usuario: user, plataforma: true, dos_pasos: await estado2fa(db, user.id), dos_pasos_obligatorio: dosPasosObligatorio(env, user) });
    if (mod === 'plataforma') {
      if (dosPasosObligatorio(env, user) && !(await estado2fa(db, user.id))) return err('Active primero la verificación en dos pasos en Mi cuenta.', 403, { codigo: 'requiere_2fa' });
      return rutasPlataforma({ db, method, partes: partes.slice(1), d, ctx });
    }
    return err('La plataforma no opera empresas. Entre con un usuario de la empresa.', 403);
  }
  if (!empresa) return err('Sin empresa activa', 403);

  const permisos = await permisosDe(db, empresa.id, rol);
  const puede = (p) => permisos.has(p);
  const est = await cuentaEmpresa(db, empresa);
  // prueba terminada: puede ver todo, pero no hacer cambios hasta tener plan
  if (est.limitado && method !== 'GET' && !['me', 'empresa-activa'].includes(mod)) return err('Su prueba gratis terminó. Escríbanos para activar un plan y seguir haciendo cambios.', 402, { codigo: 'prueba_vencida' });

  if (mod === 'me' && method === 'GET') {
    const empresas = (await db.prepare("SELECT e.id, e.nombre, m.rol FROM miembros m JOIN empresas e ON e.id = m.empresa_id WHERE m.usuario_id = ? AND m.activo = 1 AND e.estado = 'activo' ORDER BY e.nombre").bind(user.id).all()).results;
    return json({ usuario: user, rol, rol_nombre: ROLES[rol], portal: ROLES_PORTAL.includes(rol), permisos: [...permisos], dos_pasos: await estado2fa(db, user.id),
      empresa: { id: empresa.id, nombre: empresa.nombre, pais: empresa.pais, moneda_base: empresa.moneda_base, zona_horaria: empresa.zona_horaria, logo_url: empresa.logo_r2 ? '/api/archivo/' + encodeURIComponent(empresa.logo_r2) : null, ...est }, empresas });
  }

  // --- empresa ---
  if (mod === 'empresa') {
    if (method === 'GET') { if (!puede('empresa.ver')) return err('Sin permiso', 403); return json({ ...empresa, logo_url: empresa.logo_r2 ? '/api/archivo/' + encodeURIComponent(empresa.logo_r2) : null, ...est }); }
    if (method === 'PUT') {
      if (!puede('empresa.editar')) return err('Su rol no tiene permiso para esto', 403);
      if (d.nombre !== undefined && !txt(d.nombre)) return err('Escriba el nombre de la empresa');
      if (d.email && !emailOk(d.email)) return err('Correo no válido');
      let logo = empresa.logo_r2;
      if (d.logo === null) logo = null; else if (d.logo) { const a = await db.prepare("SELECT clave FROM archivos WHERE clave = ? AND empresa_id = ? AND tipo = 'logo_empresa'").bind(d.logo, empresa.id).first(); if (!a) return err('El logo no es válido'); logo = a.clave; }
      await db.prepare('UPDATE empresas SET nombre = ?, pais = ?, moneda_base = ?, zona_horaria = ?, telefono = ?, email = ?, logo_r2 = ? WHERE id = ?')
        .bind(txt(d.nombre, 80) ?? empresa.nombre, ['DO', 'US', 'PR', 'ES'].includes(d.pais) ? d.pais : empresa.pais, d.moneda_base ? moneda(d.moneda_base) : empresa.moneda_base, txt(d.zona_horaria, 60) ?? empresa.zona_horaria, d.telefono !== undefined ? soloDigitos(d.telefono) || null : empresa.telefono, d.email !== undefined ? txt(d.email, 120) : empresa.email, logo, empresa.id).run();
      await auditar(ctx, 'empresa_editada', 'empresa', empresa.id, txt(d.nombre, 80) || empresa.nombre);
      return json({ ok: true });
    }
  }

  // --- usuarios de la empresa (oficina y portal) ---
  const L = { db, req, url, env, ectx, method, mod, id, idRaw, accion, sub, d, ctx, puede, empresa, user, rol };
  if (mod === 'usuarios') {
    if (method === 'GET') {
      if (!puede('usuarios.ver')) return err('Sin permiso', 403);
      const us = (await db.prepare('SELECT u.id, u.nombre, u.email, u.visto_en, m.rol, m.activo, (SELECT 1 FROM usuario_2fa f WHERE f.usuario_id = u.id AND f.activo = 1) AS dos_pasos FROM miembros m JOIN usuarios u ON u.id = m.usuario_id WHERE m.empresa_id = ? ORDER BY m.activo DESC, u.nombre').bind(empresa.id).all()).results;
      const inv = (await db.prepare("SELECT email, nombre, rol, expira FROM invitaciones WHERE empresa_id = ? AND usado = 0 AND expira > ? ORDER BY creado DESC").bind(empresa.id, new Date().toISOString()).all()).results;
      return json({ usuarios: us.map((u) => ({ ...u, rol_nombre: ROLES[u.rol], dos_pasos: !!u.dos_pasos })), invitaciones: inv.map((i) => ({ ...i, rol_nombre: ROLES[i.rol] })), roles: ROLES });
    }
    if (method === 'POST' && !id) {
      if (!puede('usuarios.invitar')) return err('Su rol no tiene permiso para esto', 403);
      const email = String(d.email || '').toLowerCase().trim();
      if (!emailOk(email)) return err('Correo no válido');
      if (!ROLES[d.rol] || d.rol === 'dueno') return err('Escoja un rol');
      if (['admin'].includes(d.rol) && rol !== 'dueno') return err('Solo el dueño puede invitar administradores', 403);
      const p = await db.prepare('SELECT usuarios FROM planes WHERE clave = ?').bind(empresa.plan).first();
      if (p && p.usuarios != null) { const n = (await db.prepare("SELECT COUNT(*) n FROM miembros WHERE empresa_id = ? AND activo = 1 AND rol NOT IN ('musico','sonidista')").bind(empresa.id).first()).n; if (n >= p.usuarios && !ROLES_PORTAL.includes(d.rol)) return err(`Su plan permite ${p.usuarios} usuarios de oficina.`, 402); }
      if (await db.prepare('SELECT 1 FROM miembros m JOIN usuarios u ON u.id = m.usuario_id WHERE m.empresa_id = ? AND u.email = ? AND m.activo = 1').bind(empresa.id, email).first()) return err('Esa persona ya tiene acceso');
      return invitar(L, { email, nombre: txt(d.nombre, 80), rol: d.rol });
    }
    if (method === 'PUT' && id) {
      if (!puede('usuarios.editar')) return err('Su rol no tiene permiso para esto', 403);
      const m = await db.prepare('SELECT * FROM miembros WHERE usuario_id = ? AND empresa_id = ?').bind(id, empresa.id).first(); if (!m) return err('No encontrado', 404);
      if (m.rol === 'dueno') return err('El acceso del dueño no se cambia desde aquí', 403);
      if (id === user.id) return err('No puede cambiar su propio acceso', 403);
      if ((d.rol === 'admin' || m.rol === 'admin') && rol !== 'dueno') return err('Solo el dueño puede cambiar administradores', 403);
      const nuevoRol = ROLES[d.rol] && d.rol !== 'dueno' ? d.rol : m.rol, activo = d.activo !== undefined ? (d.activo ? 1 : 0) : m.activo;
      await db.prepare('UPDATE miembros SET rol = ?, activo = ? WHERE usuario_id = ? AND empresa_id = ?').bind(nuevoRol, activo, id, empresa.id).run();
      if (!activo || nuevoRol !== m.rol) await db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND empresa_id = ?').bind(id, empresa.id).run();
      await auditar(ctx, 'usuario_acceso', 'usuario', id, `${m.rol} → ${nuevoRol} · ${activo ? 'activo' : 'sin acceso'}`);
      return json({ ok: true });
    }
  }
  if (mod === 'permisos') {
    if (method === 'GET') {
      if (!puede('usuarios.ver')) return err('Sin permiso', 403);
      const roles = ['admin', 'manager', 'booking'], o = {};
      for (const r of roles) o[r] = [...(await permisosDe(db, empresa.id, r))];
      return json({ catalogo: PERMISOS_CAT, roles: Object.fromEntries(roles.map((r) => [r, ROLES[r]])), permisos: o, fabrica: FABRICA });
    }
    if (method === 'PUT') {
      if (!puede('permisos.editar')) return err('Solo el dueño puede cambiar los permisos', 403);
      if (!['admin', 'manager', 'booking'].includes(d.rol) || !PERMISOS_CAT[d.permiso]) return err('Datos no válidos');
      const def = (FABRICA[d.rol] || []).includes(d.permiso);
      if (!!d.permitido === def) await db.prepare('DELETE FROM rol_permisos WHERE empresa_id = ? AND rol = ? AND permiso = ?').bind(empresa.id, d.rol, d.permiso).run();
      else await db.prepare('INSERT INTO rol_permisos (empresa_id, rol, permiso, permitido) VALUES (?,?,?,?) ON CONFLICT(empresa_id, rol, permiso) DO UPDATE SET permitido = excluded.permitido').bind(empresa.id, d.rol, d.permiso, d.permitido ? 1 : 0).run();
      await auditar(ctx, 'permiso_cambiado', 'rol', null, `${d.rol} ${d.permitido ? '+' : '-'}${d.permiso}`);
      return json({ ok: true });
    }
  }

  // --- archivos privados en R2 ---
  if (mod === 'archivos' && method === 'POST') {
    const tipo = d.tipo, clase = TIPOS_ARCHIVO[tipo]; if (!clase) return err('Tipo de archivo no válido');
    const yo = ROLES_PORTAL.includes(rol);
    const ok = { logo_empresa: puede('empresa.editar'), logo_banda: puede('bandas.editar') || puede('bandas.crear'), foto_musico: puede('musicos.editar') || puede('musicos.crear') || yo, documento: puede('documentos.editar') || yo || puede('finanzas.registrar') || puede('gastos.generales') || puede('nomina.pagar') || puede('viajes.editar') }[tipo];
    if (!ok) return err('Su rol no tiene permiso para subir este archivo', 403);
    const m = /^data:([a-z/+.-]+);base64,(.+)$/i.exec(String(d.datos || '')); if (!m) return err('Archivo no válido');
    const mime = m[1].toLowerCase(), ext = MIME_EXT[mime];
    if (!ext || (clase === 'img' && mime === 'application/pdf')) return err(clase === 'img' ? 'Solo imágenes JPG, PNG o WEBP' : 'Solo imágenes o PDF');
    let bytes; try { bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)); } catch { return err('Archivo no válido'); }
    if (bytes.length > (clase === 'img' ? LIM_IMG : LIM_DOC)) return err(`El archivo es muy grande (máximo ${clase === 'img' ? '1.5' : '4'} MB)`);
    const p = await db.prepare('SELECT almacenamiento_mb FROM planes WHERE clave = ?').bind(empresa.plan).first();
    const usado = (await db.prepare('SELECT COALESCE(SUM(bytes),0) n FROM archivos WHERE empresa_id = ?').bind(empresa.id).first()).n;
    if (p && usado + bytes.length > p.almacenamiento_mb * 1048576) return err('Se llenó el espacio de archivos de su plan', 402);
    const clave = `e/${empresa.id}/${tipo}/${rnd(16)}.${ext}`;
    await env.ARCHIVOS.put(clave, bytes, { httpMetadata: { contentType: mime } });
    await db.prepare('INSERT INTO archivos (clave, empresa_id, tipo, mime, bytes, creado_por) VALUES (?,?,?,?,?,?)').bind(clave, empresa.id, tipo, mime, bytes.length, user.id).run();
    return json({ ok: true, clave, url: '/api/archivo/' + encodeURIComponent(clave) }, 201);
  }
  if (mod === 'archivo' && method === 'GET' && idRaw) {
    const clave = decodeURIComponent(idRaw);
    const a = await db.prepare('SELECT * FROM archivos WHERE clave = ? AND empresa_id = ?').bind(clave, empresa.id).first();
    if (!a) return err('No encontrado', 404);
    let ok = a.tipo === 'logo_empresa' || a.tipo === 'logo_banda';
    if (!ok && a.tipo === 'foto_musico') ok = puede('musicos.ver') || !!(await db.prepare('SELECT 1 FROM musicos WHERE foto_r2 = ? AND usuario_id = ? AND empresa_id = ?').bind(clave, user.id, empresa.id).first()) || !!(await db.prepare('SELECT 1 FROM musicos m JOIN banda_miembros x ON x.musico_id = m.id JOIN banda_miembros y ON y.banda_id = x.banda_id JOIN musicos yo ON yo.id = y.musico_id WHERE m.foto_r2 = ? AND yo.usuario_id = ? AND m.empresa_id = ?').bind(clave, user.id, empresa.id).first()) || a.creado_por === user.id;
    if (!ok && a.tipo === 'documento') {
      const esDoc = !!(await db.prepare('SELECT 1 FROM documentos_viaje WHERE archivo_r2 = ? AND empresa_id = ?').bind(clave, empresa.id).first());
      ok = (esDoc && puede('documentos.descargar')) || !!(await db.prepare('SELECT 1 FROM documentos_viaje dv JOIN musicos m ON m.id = dv.musico_id WHERE dv.archivo_r2 = ? AND m.usuario_id = ?').bind(clave, user.id).first()) || a.creado_por === user.id;
      // comprobantes de cobros, gastos y pagos
      if (!ok) { const mv = await db.prepare('SELECT m.tipo, m.musico_id, e.booking_id FROM movimientos m LEFT JOIN eventos e ON e.id = m.evento_id WHERE m.comprobante_r2 = ? AND m.empresa_id = ?').bind(clave, empresa.id).first();
        if (mv) ok = puede('finanzas.ver') || (mv.booking_id === user.id && puede('finanzas.registrar')) || (mv.tipo === 'nomina' && (puede('nomina.ver') || !!(await db.prepare('SELECT 1 FROM musicos WHERE id = ? AND usuario_id = ?').bind(mv.musico_id, user.id).first()))); }
      // boletos y reservas de viaje: la oficina con permiso, o el pasajero / huésped
      if (!ok) { const vj = await db.prepare('SELECT 1 FROM tramos WHERE archivo_r2 = ? AND empresa_id = ? UNION ALL SELECT 1 FROM hoteles WHERE archivo_r2 = ? AND empresa_id = ? UNION ALL SELECT 1 FROM tramo_pasajeros p JOIN tramos t ON t.id = p.tramo_id WHERE p.archivo_r2 = ? AND t.empresa_id = ?').bind(clave, empresa.id, clave, empresa.id, clave, empresa.id).first();
        if (vj) ok = puede('viajes.ver') || !!(await db.prepare('SELECT 1 FROM tramo_pasajeros p JOIN tramos t ON t.id = p.tramo_id JOIN musicos m ON m.id = p.musico_id WHERE m.usuario_id = ? AND (p.archivo_r2 = ? OR (t.archivo_r2 = ? AND p.archivo_r2 IS NULL))').bind(user.id, clave, clave).first()); }
      if (ok && esDoc) await auditar(ctx, 'documento_descargado', 'archivo', null, clave);
    }
    if (!ok) return err('Sin permiso', 403);
    const o = await env.ARCHIVOS.get(clave); if (!o) return err('No encontrado', 404);
    return new Response(o.body, { headers: { 'content-type': a.mime, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-disposition': a.mime === 'application/pdf' ? 'inline' : 'inline' } });
  }

  if (mod === 'resumen' && method === 'GET') {
    const [b, m, mp, doc, us] = await db.batch([
      db.prepare('SELECT COUNT(*) n FROM bandas WHERE empresa_id = ? AND activa = 1').bind(empresa.id),
      db.prepare('SELECT COUNT(*) n FROM musicos WHERE empresa_id = ? AND activo = 1').bind(empresa.id),
      db.prepare('SELECT COUNT(*) n FROM musicos WHERE empresa_id = ? AND activo = 1 AND usuario_id IS NOT NULL').bind(empresa.id),
      db.prepare("SELECT COUNT(*) n FROM documentos_viaje dv JOIN musicos x ON x.id = dv.musico_id WHERE dv.empresa_id = ? AND x.activo = 1 AND dv.vence <= date('now', '+90 days')").bind(empresa.id),
      db.prepare('SELECT COUNT(*) n FROM miembros WHERE empresa_id = ? AND activo = 1').bind(empresa.id),
    ]);
    return json({ bandas: b.results[0].n, musicos: m.results[0].n, con_portal: mp.results[0].n, docs_por_vencer: puede('documentos.ver') ? doc.results[0].n : null, usuarios: us.results[0].n, ...est });
  }
  if (mod === 'auditoria' && method === 'GET') {
    if (!puede('auditoria.ver')) return err('Sin permiso', 403);
    return json((await db.prepare('SELECT a.accion, a.recurso, a.recurso_id, a.detalle, a.creado, u.nombre AS usuario FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id WHERE a.empresa_id = ? ORDER BY a.id DESC LIMIT 200').bind(empresa.id).all()).results);
  }

  const rp = (await rutasReportes(L)) || (await rutasPresupuesto(L));
  if (rp) return rp;
  const rr = await rutasRider(L);
  if (rr) return rr;
  const rv = await rutasViajes(L);
  if (rv) return rv;
  const ra = await rutasAgenda(L);
  if (ra) return ra;
  const rf = await rutasFinanzas(L);
  if (rf) return rf;
  const r = await rutasPersonal(L);
  if (r) return r;
  return err('Ruta no válida', 404);
}

const HANDLER = {
  async fetch(req, env, ectx) {
    prepararEntorno(env);
    const url = new URL(req.url), p = url.pathname;
    try {
      if (p.startsWith('/api/')) return conCabeceras(await api(req, env, url, ectx));
      if (p === '/app') return Response.redirect(url.origin + '/app/', 301);
      return conCabeceras(await env.ASSETS.fetch(req));
    } catch (e) {
      const ref = rnd(4).toUpperCase();
      console.error('error ' + ref, e && e.stack ? e.stack : e);
      if (e && e.publico) return conCabeceras(err(e.message, e.estado || 400));
      const t = registrarError(env, { ref, origen: 'web', metodo: req.method, ruta: p, empresa: '', e }); if (ectx && ectx.waitUntil) ectx.waitUntil(t); else await t;
      return conCabeceras(err(`Ocurrió un error inesperado (referencia ${ref}). Si se repite, envíe ese número a soporte.`, 500));
    }
  },
  // cron cada hora: limpieza
  async scheduled(ev, env) {
    try {
      const db = env.DB, ahora = new Date().toISOString();
      await db.batch([
        db.prepare('DELETE FROM frenos WHERE desde < ?').bind(Math.floor(Date.now() / 1000) - 86400),
        db.prepare('DELETE FROM codigos_correo WHERE expira < ?').bind(ahora),
        db.prepare('DELETE FROM sesiones WHERE expira < ?').bind(ahora),
        db.prepare('DELETE FROM retos_2fa WHERE expira < ?').bind(ahora),
        db.prepare("DELETE FROM errores WHERE creado < datetime('now','-30 days')"),
      ]);
    } catch (e) { console.error('cron', e); }
  },
};
export default HANDLER;
