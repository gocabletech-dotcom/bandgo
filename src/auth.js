// BandGo · entrar, registrarse, recuperar la contraseña, dos pasos e invitaciones.
// Es el mismo flujo de FoodPOS (login con frenos, Turnstile, 2FA con reto de 5 minutos, enlace de recuperación de 30 minutos),
// adaptado a usuarios que pueden pertenecer a varias empresas.
import {
  json, err, body, rnd, txt, soloDigitos, slugify, emailOk, correoReal, escHtml, hashPass, claveDebil, sha256, safeEq,
  cifrar, descifrar, b32enc, pasoTotp, estado2fa, verificar2fa, codigosRespaldo, cfgTurnstile, turnstileOk, cfgCorreo,
  enviarCorreo, correoBase, avisoSeguridad, equipoDe, frenar, frenarClave, cuentaClave, ipDe, MSG_FRENO, auditar,
  getCookie, SESSION_DAYS, TERMINOS_VERSION, SOPORTE_EMAIL,
} from './nucleo.js';
import { ROLES, ROLES_OFICINA, ROLES_2FA } from './permisos.js';

export const COOKIE = 'bg_session';
const COOKIE_EQ = 'bg_eq';
// una sesión sin uso vence: oficina 4 horas, portal del músico 14 días (lo usa en el teléfono)
export const INACTIVO_MS = { oficina: 4 * 3600e3, portal: 14 * 86400e3 };
// La verificación en dos pasos es opcional (recomendada). Para exigirla a la plataforma: variable DOS_PASOS_OBLIGATORIO = 1.
export const dosPasosObligatorio = (env, u) => !!u.superadmin && env.DOS_PASOS_OBLIGATORIO === '1';

export async function crearUsuario(db, d) {
  const salt = rnd(16);
  return db.prepare('INSERT INTO usuarios (email, nombre, telefono, pass_hash, pass_salt, superadmin) VALUES (?,?,?,?,?,?) RETURNING id, email, nombre')
    .bind(String(d.email).toLowerCase().trim(), txt(d.nombre, 80), soloDigitos(d.telefono) || null, await hashPass(String(d.password), salt), salt, d.superadmin ? 1 : 0).first();
}
async function slugLibre(db, nombre) {
  const base = slugify(nombre); let s = base, i = 1;
  while (await db.prepare('SELECT 1 FROM empresas WHERE slug = ?').bind(s).first()) s = `${base}-${++i}`;
  return s;
}
export async function crearEmpresa(db, d) {
  const dias = Number((await db.prepare("SELECT valor FROM plataforma_config WHERE clave = 'prueba_dias'").first())?.valor || 15);
  const pais = ['DO', 'US', 'PR', 'ES'].includes(d.pais) ? d.pais : 'DO';
  const zona = { DO: 'America/Santo_Domingo', US: 'America/New_York', PR: 'America/Puerto_Rico', ES: 'Europe/Madrid' }[pais];
  const monedaBase = pais === 'ES' ? 'EUR' : 'USD';
  return db.prepare("INSERT INTO empresas (nombre, slug, pais, moneda_base, zona_horaria, telefono, email, plan, prueba_hasta, terminos_version, terminos_en) VALUES (?,?,?,?,?,?,?, 'prueba', datetime('now', ?), ?, datetime('now')) RETURNING *")
    .bind(txt(d.nombre, 80), await slugLibre(db, d.nombre), pais, monedaBase, zona, soloDigitos(d.telefono) || null, d.email || null, `+${dias} days`, TERMINOS_VERSION).first();
}
async function empresaInicial(db, uid) {
  return db.prepare("SELECT m.empresa_id FROM miembros m JOIN empresas e ON e.id = m.empresa_id WHERE m.usuario_id = ? AND m.activo = 1 AND e.estado = 'activo' ORDER BY m.creado LIMIT 1").bind(uid).first();
}
export async function iniciarSesion(db, url, usuarioId, empresaId, extra = {}, otrasCookies = []) {
  const token = rnd(32), ahora = new Date().toISOString();
  await db.batch([db.prepare('DELETE FROM sesiones WHERE expira < ?').bind(ahora),
    db.prepare('INSERT INTO sesiones (token, usuario_id, empresa_id, expira, uso, cookie) VALUES (?,?,?,?,?,?)').bind(await sha256(token), usuarioId, empresaId ?? null, new Date(Date.now() + SESSION_DAYS * 864e5).toISOString(), ahora, COOKIE)]);
  const h = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  h.append('set-cookie', `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${url.protocol === 'https:' ? '; Secure' : ''}`);
  for (const c of otrasCookies.filter(Boolean)) h.append('set-cookie', c);
  return new Response(JSON.stringify({ ok: true, ...extra }), { status: 200, headers: h });
}
// recuerda este navegador; si es nuevo (y ya tenía otros), avisa por correo
async function equipoConocido(env, ectx, db, req, u, rol) {
  if (!u.superadmin && !ROLES_2FA.includes(rol)) return null;
  let c = getCookie(req, COOKIE_EQ), cookie = null;
  if (!c || c.length < 20) { c = rnd(24); cookie = `${COOKIE_EQ}=${c}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${400 * 86400}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`; }
  const h = await sha256(c);
  if (await db.prepare('SELECT 1 FROM equipos_usuario WHERE usuario_id = ? AND huella = ?').bind(u.id, h).first()) { ectx?.waitUntil?.(db.prepare("UPDATE equipos_usuario SET visto = datetime('now') WHERE usuario_id = ? AND huella = ?").bind(u.id, h).run().catch(() => {})); return cookie; }
  const antes = (await db.prepare('SELECT COUNT(*) n FROM equipos_usuario WHERE usuario_id = ?').bind(u.id).first()).n;
  await db.prepare("INSERT OR IGNORE INTO equipos_usuario (usuario_id, huella, nombre, visto) VALUES (?,?,?,datetime('now'))").bind(u.id, h, equipoDe(req).nombre).run();
  if (antes > 0) avisoSeguridad(env, ectx, db, req, u.email, 'Nuevo inicio de sesión', `<p>Alguien entró a su cuenta de BandGo (<b>${escHtml(u.email)}</b>) desde un equipo que no habíamos visto antes.</p>`);
  return cookie;
}

// ---------- rutas públicas (sin sesión). Devuelve null si la ruta no es de aquí ----------
export async function rutasPublicas({ req, env, url, ectx, db, mod, idRaw, method }) {
  if (mod === 'publico' && method === 'GET') {
    const r = (await db.prepare("SELECT clave, valor FROM plataforma_config WHERE clave IN ('registro_abierto','turnstile_sitio')").all()).results;
    const c = Object.fromEntries(r.map((x) => [x.clave, x.valor])), co = await cfgCorreo(env, db);
    const planes = (await db.prepare('SELECT clave, nombre, precio_c, bandas, musicos, usuarios, descripcion FROM planes WHERE visible = 1 ORDER BY orden').all()).results;
    return json({ registro_abierto: c.registro_abierto === '1', turnstile: c.turnstile_sitio || null, verifica_correo: co.listo, recuperar: co.listo, planes, soporte: SOPORTE_EMAIL });
  }
  if (mod === 'setup') {
    const n = (await db.prepare('SELECT COUNT(*) n FROM usuarios WHERE superadmin = 1').first()).n;
    if (method === 'GET') return json({ necesita_setup: n === 0 });
    if (method === 'POST') {
      if (n > 0) return err('La plataforma ya fue configurada', 403);
      const d = await body(req);
      if (!txt(d.nombre) || !emailOk(d.email) || !d.password) return err('Nombre, correo y contraseña requeridos');
      { const dbl = await claveDebil(d.password); if (dbl) return err(dbl); }
      const u = await crearUsuario(db, { ...d, superadmin: true });
      await auditar({ db, user: u, req }, 'setup_plataforma', 'usuario', u.id, u.email);
      return json({ ok: true }, 201);
    }
  }
  if (mod === 'registro' && method === 'POST') {
    if ((await db.prepare("SELECT valor FROM plataforma_config WHERE clave = 'registro_abierto'").first())?.valor !== '1') return err(`El registro está cerrado. Escríbanos a ${SOPORTE_EMAIL}.`, 403);
    const d = await body(req);
    if (!txt(d.empresa) || !txt(d.nombre) || !d.email || !d.password) return err('Complete todos los campos');
    if (!d.acepta) return err('Debe aceptar los Términos y condiciones y la Política de privacidad');
    { const dbl = await claveDebil(d.password); if (dbl) return err(dbl); }
    const email = String(d.email).toLowerCase().trim().slice(0, 200);
    if (!emailOk(email)) return err('Correo no válido');
    if (await db.prepare('SELECT 1 FROM usuarios WHERE email = ?').bind(email).first()) return err('Ese correo ya tiene una cuenta. Inicie sesión.');
    const CO = await cfgCorreo(env, db), codigo = soloDigitos(d.codigo).slice(0, 6);
    if (CO.listo && codigo) {
      const f = await db.prepare('SELECT codigo, expira, intentos FROM codigos_correo WHERE email = ?').bind(email).first();
      if (!f || f.expira < new Date().toISOString()) return json({ error: 'El código venció o no existe. Toque «Enviar otro código».', codigo_vencido: true }, 400);
      if (f.intentos >= 5) return json({ error: 'Demasiados códigos equivocados. Toque «Enviar otro código».', codigo_vencido: true }, 429);
      if (!safeEq(f.codigo, await sha256(email + ':' + codigo))) { await db.prepare('UPDATE codigos_correo SET intentos = intentos + 1 WHERE email = ?').bind(email).run(); return err(`Código equivocado. Revise el correo que le mandamos a ${email}.`); }
      await db.prepare('DELETE FROM codigos_correo WHERE email = ?').bind(email).run();
    } else {
      const TS = await cfgTurnstile(db);
      if (TS.secreto && !(await turnstileOk(env, req, TS.secreto, d.turnstile))) return json({ error: 'Confirme que no es un robot.', turnstile: TS.sitio }, 403);
      if (CO.listo) {
        if (await frenar(db, req, 'regcodigo', 6, 3600) || await frenarClave(db, `regcodigo:${email}`, 4, 3600)) return err(`Ya se mandaron varios códigos. Espere una hora o escríbanos a ${SOPORTE_EMAIL}.`, 429);
        const n = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
        await db.prepare('INSERT INTO codigos_correo (email, codigo, expira, intentos) VALUES (?,?,?,0) ON CONFLICT(email) DO UPDATE SET codigo = excluded.codigo, expira = excluded.expira, intentos = 0').bind(email, await sha256(email + ':' + n), new Date(Date.now() + 20 * 60000).toISOString()).run();
        try { await enviarCorreo(env, db, { para: email, asunto: `${n} es su código de BandGo`, html: correoBase('Confirme su correo', `<p>Hola ${escHtml(String(d.nombre).slice(0, 80))}: para crear <b>${escHtml(String(d.empresa).slice(0, 80))}</b> en BandGo escriba este código:</p><p style="font-size:30px;font-weight:700;letter-spacing:6px">${n}</p><p>Vence en 20 minutos.</p>`) }); }
        catch (e) { console.error('registro correo', e.message); return err('No se pudo mandar el código a ese correo. Revíselo o intente de nuevo en unos minutos.', 502); }
        return json({ codigo_enviado: true, email });
      }
    }
    if (await frenar(db, req, 'registro', 3, 3600)) return err(`Ya se crearon varias empresas desde esta conexión. Espere una hora o escríbanos a ${SOPORTE_EMAIL}.`, 429);
    const emp = await crearEmpresa(db, { nombre: d.empresa, pais: d.pais, telefono: d.telefono, email });
    const u = await crearUsuario(db, { nombre: d.nombre, email, password: d.password, telefono: d.telefono });
    await db.prepare("INSERT INTO miembros (usuario_id, empresa_id, rol) VALUES (?, ?, 'dueno')").bind(u.id, emp.id).run();
    await auditar({ db, empresa: emp, user: u, req }, 'registro', 'empresa', emp.id, `${emp.nombre} · aceptó términos v${TERMINOS_VERSION}${CO.listo ? ' · correo verificado' : ''}`);
    return iniciarSesion(db, url, u.id, emp.id, { empresa: emp.slug }, [await equipoConocido(env, ectx, db, req, u, 'dueno')]);
  }
  if (mod === 'login' && method === 'POST') {
    const d = await body(req), email = String(d.email || '').toLowerCase().trim().slice(0, 200), ip = ipDe(req);
    // se frena la CONEXIÓN que falla, no la cuenta (así nadie puede dejar fuera al dueño)
    if (await frenar(db, req, 'login', 30, 600)) return err(MSG_FRENO, 429);
    if (ip !== null && (await cuentaClave(db, `loginf:${ip}:${email}`, 900)) >= 5) return err('Demasiados intentos fallidos con ese correo desde esta conexión. Espere 15 minutos.', 429);
    { const TS = await cfgTurnstile(db);
      if (TS.secreto && ip !== null && (await cuentaClave(db, `loginf:${ip}:${email}`, 900)) >= 3 && !(await turnstileOk(env, req, TS.secreto, d.turnstile)))
        return json({ error: 'Confirme que no es un robot y vuelva a tocar Entrar.', turnstile: TS.sitio }, 403); }
    const u = await db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').bind(email).first();
    if (!u || !safeEq(await hashPass(String(d.password || ''), u.pass_salt), u.pass_hash)) {
      let fallos = 0;
      if (ip !== null) { await frenarClave(db, `loginf:${ip}:${email}`, 5, 900); await frenarClave(db, `loginfe:${email}`, 1e9, 3600); fallos = await cuentaClave(db, `loginfe:${email}`, 3600); }
      await new Promise((r) => setTimeout(r, Math.min(400 + fallos * 250, 4000)));
      return err('Correo o contraseña incorrectos', 401);
    }
    const emp = u.superadmin ? null : await empresaInicial(db, u.id);
    if (!u.superadmin && !emp) return err(`Su cuenta no tiene una empresa activa. Escríbanos a ${SOPORTE_EMAIL}.`, 403);
    const rol = emp ? (await db.prepare('SELECT rol FROM miembros WHERE usuario_id = ? AND empresa_id = ?').bind(u.id, emp.empresa_id).first()).rol : null;
    if (await estado2fa(db, u.id)) {
      const reto = rnd(24);
      await db.batch([db.prepare('DELETE FROM retos_2fa WHERE expira < ?').bind(new Date().toISOString()),
        db.prepare('INSERT INTO retos_2fa (token, usuario_id, cookie, expira) VALUES (?,?,?,?)').bind(await sha256(reto), u.id, COOKIE, new Date(Date.now() + 5 * 60e3).toISOString())]);
      return json({ dos_pasos: true, reto });
    }
    return iniciarSesion(db, url, u.id, emp ? emp.empresa_id : null, {}, [await equipoConocido(env, ectx, db, req, u, rol)]);
  }
  if (mod === 'login2' && method === 'POST') {
    if (await frenar(db, req, 'login2', 20, 600)) return err(MSG_FRENO, 429);
    const d = await body(req), h = await sha256(String(d.reto || ''));
    const r = await db.prepare('SELECT * FROM retos_2fa WHERE token = ? AND expira > ?').bind(h, new Date().toISOString()).first();
    if (!r) return err('Pasaron más de 5 minutos. Vuelva a escribir su correo y contraseña.', 401);
    if (r.intentos >= 5) { await db.prepare('DELETE FROM retos_2fa WHERE token = ?').bind(h).run(); return err('Demasiados códigos equivocados. Vuelva a escribir su correo y contraseña.', 429); }
    const u = await db.prepare('SELECT * FROM usuarios WHERE id = ? AND activo = 1').bind(r.usuario_id).first();
    const ok = u && await verificar2fa(db, u.id, d.codigo);
    if (!ok) { await db.prepare('UPDATE retos_2fa SET intentos = intentos + 1 WHERE token = ?').bind(h).run(); await new Promise((z) => setTimeout(z, 400)); return err('Código incorrecto', 401); }
    await db.prepare('DELETE FROM retos_2fa WHERE token = ?').bind(h).run();
    const quedan = ok === 'respaldo' ? JSON.parse((await db.prepare('SELECT respaldo FROM usuario_2fa WHERE usuario_id = ?').bind(u.id).first()).respaldo || '[]').length : null;
    if (ok === 'respaldo') avisoSeguridad(env, ectx, db, req, u.email, 'Se usó un código de respaldo', `<p>Se entró a su cuenta con un <b>código de respaldo</b>. Le quedan ${quedan}.</p>`);
    const emp = u.superadmin ? null : await empresaInicial(db, u.id);
    const rol = emp ? (await db.prepare('SELECT rol FROM miembros WHERE usuario_id = ? AND empresa_id = ?').bind(u.id, emp.empresa_id).first()).rol : null;
    return iniciarSesion(db, url, u.id, emp ? emp.empresa_id : null, quedan != null ? { respaldo_quedan: quedan } : {}, [await equipoConocido(env, ectx, db, req, u, rol)]);
  }
  // ¿olvidó su contraseña? Enlace de 30 minutos. La respuesta es la misma exista o no la cuenta.
  if (mod === 'recuperar' && method === 'POST' && !idRaw) {
    const d = await body(req), email = String(d.email || '').toLowerCase().trim().slice(0, 200);
    if (!(await cfgCorreo(env, db)).listo) return err(`La recuperación por correo todavía no está activa. Escríbanos a ${SOPORTE_EMAIL}.`, 503);
    if (!emailOk(email)) return err('Correo no válido');
    { const TS = await cfgTurnstile(db); if (TS.secreto && !(await turnstileOk(env, req, TS.secreto, d.turnstile))) return json({ error: 'Confirme que no es un robot.', turnstile: TS.sitio }, 403); }
    if (await frenar(db, req, 'recuperar', 5, 3600)) return err(MSG_FRENO, 429);
    const respuesta = { ok: true, mensaje: `Si ${email} tiene una cuenta en BandGo, le llegó un correo con un enlace para crear una contraseña nueva. Vence en 30 minutos. Revise también «Spam».` };
    if (await frenarClave(db, `recuperar:${email}`, 3, 3600)) return json(respuesta);
    const u = await db.prepare('SELECT id, nombre, email FROM usuarios WHERE email = ? AND activo = 1').bind(email).first();
    if (!u || !correoReal(u.email)) { await new Promise((z) => setTimeout(z, 300)); return json(respuesta); }
    const t = rnd(32);
    await db.batch([db.prepare('DELETE FROM recuperaciones WHERE usuario_id = ? OR expira < ?').bind(u.id, new Date().toISOString()),
      db.prepare('INSERT INTO recuperaciones (token, usuario_id, expira) VALUES (?,?,?)').bind(await sha256(t), u.id, new Date(Date.now() + 30 * 60e3).toISOString())]);
    const enlace = `${url.origin}/app/#/recuperar/${t}`;
    try { await enviarCorreo(env, db, { para: u.email, asunto: 'Cambiar su contraseña · BandGo', html: correoBase('Cambiar su contraseña', `<p>Hola ${escHtml(String(u.nombre || '').split(' ')[0])}: alguien pidió cambiar la contraseña de su cuenta. Si fue usted, toque el botón (vence en 30 minutos):</p><p><a href="${enlace}" style="background:#0F172A;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Crear contraseña nueva</a></p><p style="color:#64748B">Si no fue usted, ignore este correo: su contraseña no cambia.</p>`) }); }
    catch (e) { console.error('recuperar', e.message); }
    return json(respuesta);
  }
  if (mod === 'recuperar' && method === 'POST' && idRaw === 'cambiar') {
    if (await frenar(db, req, 'recuperarc', 20, 3600)) return err(MSG_FRENO, 429);
    const d = await body(req), h = await sha256(String(d.token || ''));
    const r = await db.prepare('SELECT * FROM recuperaciones WHERE token = ?').bind(h).first();
    if (!r || r.usado || r.expira < new Date().toISOString()) return err('El enlace venció o ya se usó. Pida otro en «¿Olvidó su contraseña?».', 400);
    { const dbl = await claveDebil(d.nueva); if (dbl) return err(dbl); }
    const u = await db.prepare('SELECT id, email FROM usuarios WHERE id = ? AND activo = 1').bind(r.usuario_id).first(); if (!u) return err('La cuenta no está activa', 400);
    const salt = rnd(16);
    await db.batch([db.prepare('UPDATE usuarios SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(await hashPass(String(d.nueva), salt), salt, u.id),
      db.prepare('UPDATE recuperaciones SET usado = 1 WHERE token = ?').bind(h), db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(u.id), db.prepare('DELETE FROM retos_2fa WHERE usuario_id = ?').bind(u.id)]);
    await auditar({ db, user: { id: u.id }, req }, 'clave_recuperada', 'usuario', u.id, u.email);
    avisoSeguridad(env, ectx, db, req, u.email, 'Su contraseña cambió', '<p>La contraseña de su cuenta de BandGo se cambió con el enlace de «¿Olvidó su contraseña?». Se cerró la sesión en todos los equipos.</p>');
    return json({ ok: true });
  }
  // invitaciones (oficina o portal del músico): ver de qué es y aceptarla creando la contraseña
  if (mod === 'invitacion' && idRaw) {
    if (await frenar(db, req, 'invitacion', 30, 600)) return err(MSG_FRENO, 429);
    const h = await sha256(idRaw);
    const inv = await db.prepare('SELECT i.*, e.nombre AS empresa FROM invitaciones i JOIN empresas e ON e.id = i.empresa_id WHERE i.token = ?').bind(h).first();
    if (!inv || inv.usado || inv.expira < new Date().toISOString()) return err('Esta invitación venció o ya se usó. Pida una nueva a la oficina.', 404);
    const existe = await db.prepare('SELECT id, nombre FROM usuarios WHERE email = ?').bind(inv.email).first();
    if (method === 'GET') return json({ empresa: inv.empresa, email: inv.email, nombre: inv.nombre, rol: ROLES[inv.rol], ya_tiene_cuenta: !!existe });
    if (method !== 'POST') return err('Ruta no válida', 404);
    const d = await body(req);
    let uid;
    if (existe) {
      const u = await db.prepare('SELECT * FROM usuarios WHERE id = ?').bind(existe.id).first();
      if (!safeEq(await hashPass(String(d.password || ''), u.pass_salt), u.pass_hash)) { await new Promise((z) => setTimeout(z, 400)); return err('La contraseña de su cuenta no es correcta', 401); }
      uid = u.id;
    } else {
      { const dbl = await claveDebil(d.password); if (dbl) return err(dbl); }
      uid = (await crearUsuario(db, { nombre: txt(d.nombre, 80) || inv.nombre || inv.email, email: inv.email, password: d.password, telefono: d.telefono })).id;
    }
    await db.batch([
      db.prepare('INSERT INTO miembros (usuario_id, empresa_id, rol) VALUES (?,?,?) ON CONFLICT(usuario_id, empresa_id) DO UPDATE SET rol = excluded.rol, activo = 1').bind(uid, inv.empresa_id, inv.rol),
      db.prepare('UPDATE invitaciones SET usado = 1 WHERE token = ?').bind(h),
      ...(inv.musico_id ? [db.prepare('UPDATE musicos SET usuario_id = ? WHERE id = ? AND empresa_id = ?').bind(uid, inv.musico_id, inv.empresa_id)] : []),
    ]);
    await auditar({ db, empresa: { id: inv.empresa_id }, user: { id: uid }, req }, 'invitacion_aceptada', 'usuario', uid, `${inv.email} · ${inv.rol}`);
    return iniciarSesion(db, url, uid, inv.empresa_id);
  }
  return null;
}

// ---------- rutas de la propia cuenta (con sesión) ----------
export async function rutasCuenta({ req, env, ectx, db, mod, idRaw, method, user, token, empresa }) {
  if (mod === 'logout' && method === 'POST') {
    await db.prepare('DELETE FROM sesiones WHERE token = ?').bind(token).run();
    return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0` });
  }
  if (mod === 'empresa-activa' && method === 'POST') {
    const d = await body(req);
    const m = await db.prepare("SELECT m.empresa_id FROM miembros m JOIN empresas e ON e.id = m.empresa_id WHERE m.usuario_id = ? AND m.empresa_id = ? AND m.activo = 1 AND e.estado = 'activo'").bind(user.id, Number(d.empresa_id) || 0).first();
    if (!m) return err('No pertenece a esa empresa', 403);
    await db.prepare('UPDATE sesiones SET empresa_id = ? WHERE token = ?').bind(m.empresa_id, token).run();
    return json({ ok: true });
  }
  if (mod === 'clave' && method === 'PUT') {
    const d = await body(req), u = await db.prepare('SELECT * FROM usuarios WHERE id = ?').bind(user.id).first();
    if (!safeEq(await hashPass(String(d.actual || ''), u.pass_salt), u.pass_hash)) return err('La contraseña actual no es correcta');
    { const dbl = await claveDebil(d.nueva); if (dbl) return err(dbl); }
    const salt = rnd(16);
    await db.batch([db.prepare('UPDATE usuarios SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(await hashPass(d.nueva, salt), salt, u.id),
      db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token != ?').bind(u.id, token)]);
    avisoSeguridad(env, ectx, db, req, user.email, 'Su contraseña cambió', '<p>Se cambió la contraseña de su cuenta de BandGo. Se cerró la sesión en los demás equipos.</p>');
    return json({ ok: true });
  }
  if (mod === 'sesiones') {
    if (method === 'GET') { const n = await db.prepare('SELECT COUNT(*) n FROM sesiones WHERE usuario_id = ? AND expira > ?').bind(user.id, new Date().toISOString()).first();
      return json({ abiertas: n.n, equipos: (await db.prepare('SELECT nombre, creado, visto FROM equipos_usuario WHERE usuario_id = ? ORDER BY COALESCE(visto, creado) DESC LIMIT 8').bind(user.id).all()).results }); }
    if (method === 'POST' && idRaw === 'cerrar-otras') { const r = await db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token != ?').bind(user.id, token).run(); return json({ ok: true, cerradas: r.meta.changes }); }
  }
  if (mod === 'dos-pasos') {
    if (!user.superadmin && !ROLES_2FA.includes(user.rol)) return err('La verificación en dos pasos es para la plataforma, el dueño, el administrador y el manager', 403);
    const d = method === 'GET' ? {} : await body(req), f = await db.prepare('SELECT * FROM usuario_2fa WHERE usuario_id = ?').bind(user.id).first();
    const pass = async () => { const u = await db.prepare('SELECT pass_hash, pass_salt FROM usuarios WHERE id = ?').bind(user.id).first(); return safeEq(await hashPass(String(d.password || ''), u.pass_salt), u.pass_hash); };
    if (method === 'GET') return json({ activo: !!(f && f.activo), obligatorio: dosPasosObligatorio(env, user), respaldo_quedan: f && f.activo ? JSON.parse(f.respaldo || '[]').length : null });
    if (method === 'POST' && idRaw === 'iniciar') {
      if (f && f.activo) return err('Ya está activa. Para cambiar de teléfono, desactívela primero.');
      if (!(await pass())) return err('La contraseña no es correcta', 401);
      const sec = b32enc(crypto.getRandomValues(new Uint8Array(20)));
      await db.prepare('INSERT INTO usuario_2fa (usuario_id, secreto, activo) VALUES (?,?,0) ON CONFLICT(usuario_id) DO UPDATE SET secreto = excluded.secreto, activo = 0, respaldo = NULL, ultimo_paso = NULL').bind(user.id, await cifrar(sec)).run();
      return json({ secreto: sec.match(/.{1,4}/g).join(' '), uri: `otpauth://totp/BandGo:${encodeURIComponent(user.email)}?secret=${sec}&issuer=BandGo&digits=6&period=30` });
    }
    if (method === 'POST' && idRaw === 'activar') {
      if (!f || f.activo) return err('Empiece de nuevo la configuración');
      const paso = await pasoTotp(await descifrar(f.secreto), d.codigo, null);
      if (!paso) return err('Código incorrecto. Revise que la hora del teléfono esté en automático y escriba el código que se ve ahora.');
      await db.prepare("UPDATE usuario_2fa SET activo = 1, ultimo_paso = ?, activado = datetime('now') WHERE usuario_id = ?").bind(paso, user.id).run();
      const codigos = await codigosRespaldo(db, user.id);
      await db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token != ?').bind(user.id, token).run();
      await auditar({ db, empresa, user, req }, 'dos_pasos_activo', 'usuario', user.id, user.email);
      return json({ ok: true, codigos });
    }
    if (method === 'POST' && idRaw === 'desactivar') {
      if (dosPasosObligatorio(env, user)) return err('En la plataforma la verificación en dos pasos es obligatoria.', 403);
      if (!f || !f.activo) return json({ ok: true });
      if (!(await pass()) || !(await verificar2fa(db, user.id, d.codigo))) return err('La contraseña o el código no son correctos', 401);
      await db.prepare('DELETE FROM usuario_2fa WHERE usuario_id = ?').bind(user.id).run();
      await auditar({ db, empresa, user, req }, 'dos_pasos_quitado', 'usuario', user.id, user.email);
      avisoSeguridad(env, ectx, db, req, user.email, 'Se apagó la verificación en dos pasos', '<p>Se <b>apagó</b> la verificación en dos pasos de su cuenta de BandGo.</p>');
      return json({ ok: true });
    }
    return err('Ruta no válida', 404);
  }
  return null;
}
