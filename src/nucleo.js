// BandGo · núcleo compartido. Copiado de FoodPOS (worker.js v65–v99) y adaptado a BandGo.
// Contraseñas PBKDF2 · revisión contra filtraciones · cifrado AES-GCM · dos pasos (TOTP) · frenos · correo (Resend) · auditoría · errores.
export const SESSION_DAYS = 7;
export const TERMINOS_VERSION = '1.0';
export const SOPORTE_EMAIL = 'soporte@bandgo.app'; // [CORREO DE SOPORTE · cámbielo cuando tenga el dominio]
export const enc = new TextEncoder();

// ---------- utilidades ----------
export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});
export const err = (msg, status = 400, extra = {}) => json({ error: msg, ...extra }, status);
export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const escHtml = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const rnd = (n = 32) => hex(crypto.getRandomValues(new Uint8Array(n)));
export const txt = (v, max = 200) => (v == null || v === '' ? null : String(v).trim().slice(0, max) || null);
export const soloDigitos = (t) => String(t || '').replace(/\D/g, '');
export const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'empresa';
export const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || ''));
export const correoReal = (e) => emailOk(e) && !/\.bandgo\.local$/i.test(e || '');
export const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
// dinero: se recibe «1,250.50» o 1250.5 y se guarda en centavos enteros
export const aCentavos = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[,\s]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : null; };
export const MONEDAS = ['USD', 'DOP', 'EUR'];
export const moneda = (m, def = 'USD') => (MONEDAS.includes(String(m || '').toUpperCase()) ? String(m).toUpperCase() : def);
export async function body(req) { try { return await req.json(); } catch { return {}; } }
export function getCookie(req, name) { const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)')); return m ? m[1] : null; }

// ---------- contraseñas (PBKDF2 · 100.000 vueltas) ----------
export async function hashPass(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
let PWNED_BASE = 'https://api.pwnedpasswords.com';
export const CLAVE_MIN = 10;
// contraseñas nuevas: 10 caracteres o más, nada obvio y que no aparezca en filtraciones (Have I Been Pwned por k-anonimato)
export async function claveDebil(pw) {
  const c = String(pw || '');
  if (c.length < CLAVE_MIN) return `La contraseña debe tener al menos ${CLAVE_MIN} caracteres. Lo más fácil: una frase corta que solo usted conozca.`;
  if (c.length > 200) return 'La contraseña es demasiado larga';
  if (/^(.)\1+$/.test(c) || /^(0123456789|1234567890|abcdefghij|qwertyuiop|contraseña|password)/i.test(c)) return 'Esa contraseña es muy fácil de adivinar. Use una frase corta que solo usted conozca.';
  try {
    const h = hex(new Uint8Array(await crypto.subtle.digest('SHA-1', enc.encode(c)))).toUpperCase();
    const r = await fetch(`${PWNED_BASE}/range/${h.slice(0, 5)}`, { headers: { 'add-padding': 'true' }, signal: AbortSignal.timeout(3000) });
    if (r.ok) { const fin = h.slice(5); for (const l of (await r.text()).split('\n')) { const [suf, n] = l.trim().split(':'); if (suf === fin && Number(n) > 0) return 'Esa contraseña apareció en filtraciones de otras páginas. Use otra distinta.'; } }
  } catch {}
  return null;
}
export async function sha256(t) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(t))); }
export function safeEq(a, b) { a = String(a || ''); b = String(b || ''); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

// ---------- datos sensibles cifrados (AES-GCM) con la llave maestra BANDGO_LLAVE (secreto del Worker) ----------
let LLAVE_ENV = null, LLAVE_CACHE = null;
export function prepararEntorno(env) {
  LLAVE_ENV = env.BANDGO_LLAVE || null;
  PWNED_BASE = env.PWNED_API || 'https://api.pwnedpasswords.com';
}
const CIFRADO = 'enc:v1:';
async function llaveMaestra() {
  const k = LLAVE_ENV; if (!k || String(k).length < 32) return null;
  if (LLAVE_CACHE && LLAVE_CACHE.k === k) return LLAVE_CACHE.c;
  const c = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(String(k))), 'AES-GCM', false, ['encrypt', 'decrypt']);
  LLAVE_CACHE = { k, c }; return c;
}
export const hayLlave = async () => !!(await llaveMaestra());
export async function cifrar(t) {
  if (t == null || t === '' || String(t).startsWith(CIFRADO)) return t ?? null;
  const c = await llaveMaestra(); if (!c) throw Object.assign(new Error('Falta la llave maestra BANDGO_LLAVE: no se guardan datos sensibles sin cifrar'), { publico: true });
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, c, enc.encode(String(t))));
  const b = new Uint8Array(12 + ct.length); b.set(iv); b.set(ct, 12);
  let bin = ''; for (const x of b) bin += String.fromCharCode(x);
  return CIFRADO + btoa(bin);
}
export async function descifrar(t) {
  if (typeof t !== 'string' || !t.startsWith(CIFRADO)) return t;
  try {
    const c = await llaveMaestra(); if (!c) return '';
    const b = Uint8Array.from(atob(t.slice(CIFRADO.length)), (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, c, b.slice(12)));
  } catch { console.error('No se pudo descifrar (¿cambió BANDGO_LLAVE?)'); return ''; }
}
export const mascara = (fin) => (fin ? '•••• ' + fin : '');
export async function cfgPlataforma(db, claves) {
  const rs = (await db.prepare(`SELECT clave, valor FROM plataforma_config WHERE clave IN (${claves.map(() => '?').join(',')})`).bind(...claves).all()).results;
  const o = {}; for (const r of rs) o[r.clave] = await descifrar(r.valor); return o;
}
export const SECRETOS_CFG = ['resend_clave', 'turnstile_secreto'];

// ---------- dos pasos (TOTP, RFC 6238) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32enc(bytes) { let bits = 0, v = 0, o = ''; for (const b of bytes) { v = (v << 8) | b; bits += 8; while (bits >= 5) { o += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) o += B32[(v << (5 - bits)) & 31]; return o; }
function b32dec(t) { let bits = 0, v = 0; const o = []; for (const ch of String(t).toUpperCase().replace(/[^A-Z2-7]/g, '')) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(o); }
export async function codigoTotp(llave, paso) {
  const msg = new Uint8Array(8); let x = paso; for (let i = 7; i >= 0; i--) { msg[i] = x & 255; x = Math.floor(x / 256); }
  const k = await crypto.subtle.importKey('raw', llave, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg)), o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
export async function pasoTotp(secreto32, codigo, ultimo) {
  const c = String(codigo || '').replace(/\D/g, ''); if (c.length !== 6) return 0;
  const llave = b32dec(secreto32), p = Math.floor(Date.now() / 30000);
  for (const d of [0, -1, 1]) { const q = p + d; if (ultimo && q <= ultimo) continue; if (safeEq(await codigoTotp(llave, q), c)) return q; }
  return 0;
}
export const b32 = { dec: b32dec };
export async function estado2fa(db, uid) { const r = await db.prepare('SELECT activo FROM usuario_2fa WHERE usuario_id = ?').bind(uid).first(); return !!(r && r.activo); }
export async function verificar2fa(db, uid, codigo) {
  const f = await db.prepare('SELECT * FROM usuario_2fa WHERE usuario_id = ? AND activo = 1').bind(uid).first(); if (!f) return false;
  const paso = await pasoTotp(await descifrar(f.secreto), codigo, f.ultimo_paso);
  if (paso) { await db.prepare('UPDATE usuario_2fa SET ultimo_paso = ? WHERE usuario_id = ?').bind(paso, uid).run(); return true; }
  const limpio = String(codigo || '').toLowerCase().replace(/[^0-9a-f]/g, ''); if (limpio.length !== 8) return false;
  const lista = JSON.parse(f.respaldo || '[]'), h = await sha256(limpio), i = lista.indexOf(h); if (i < 0) return false;
  lista.splice(i, 1); await db.prepare('UPDATE usuario_2fa SET respaldo = ? WHERE usuario_id = ?').bind(JSON.stringify(lista), uid).run();
  return 'respaldo';
}
export async function codigosRespaldo(db, uid) {
  const cs = Array.from({ length: 10 }, () => rnd(4)), hs = await Promise.all(cs.map((c) => sha256(c)));
  await db.prepare('UPDATE usuario_2fa SET respaldo = ? WHERE usuario_id = ?').bind(JSON.stringify(hs), uid).run();
  return cs.map((c) => c.slice(0, 4) + '-' + c.slice(4));
}

// ---------- anti-robot (Cloudflare Turnstile) ----------
export async function cfgTurnstile(db) { const r = await cfgPlataforma(db, ['turnstile_sitio', 'turnstile_secreto']); return { sitio: r.turnstile_sitio || null, secreto: r.turnstile_secreto || null }; }
export async function turnstileOk(env, req, secreto, token) {
  if (!secreto) return true;
  if (!token) return false;
  try {
    const f = new URLSearchParams({ secret: secreto, response: String(token).slice(0, 2048) });
    const r = await fetch(((env && env.TURNSTILE_API) || 'https://challenges.cloudflare.com') + '/turnstile/v0/siteverify', { method: 'POST', body: f, signal: AbortSignal.timeout(10000) });
    return !!(await r.json()).success;
  } catch { return false; }
}

// ---------- correos (Resend) ----------
export async function cfgCorreo(env, db) {
  const r = await cfgPlataforma(db, ['resend_clave', 'correo_desde']);
  const clave = r.resend_clave || (env && env.RESEND_KEY) || '', desde = r.correo_desde || (env && env.CORREO_DESDE) || '';
  return { clave, desde, listo: !!(clave && desde) };
}
export async function enviarCorreo(env, db, { para, asunto, html, responder }) {
  const c = await cfgCorreo(env, db); if (!c.listo) { const e = new Error('El envío de correos no está activado'); e.codigo = 'sin_correo'; throw e; }
  const r = await fetch(((env && env.RESEND_API) || 'https://api.resend.com') + '/emails', { method: 'POST', headers: { authorization: 'Bearer ' + c.clave, 'content-type': 'application/json' }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ from: c.desde, to: [para], reply_to: responder || undefined, subject: asunto, html }) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Resend respondió ${r.status}: ${j.message || ''}`); }
  return (await r.json().catch(() => ({}))).id || null;
}
export function correoBase(titulo, cuerpo) {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0F172A"><div style="background:#000;padding:14px 18px;border-radius:10px 10px 0 0;color:#fff;font-weight:700;font-size:18px">Band<span style="color:#B45CFF">Go</span></div><div style="border:1px solid #E2E8F0;border-top:0;padding:18px;border-radius:0 0 10px 10px"><h2 style="margin:0 0 12px">${titulo}</h2>${cuerpo}</div><p style="color:#64748B;font-size:12px;margin-top:16px">BandGo · la oficina de tu agrupación</p></div>`;
}
export function equipoDe(req) {
  const ua = req.headers.get('user-agent') || '', cf = req.cf || {};
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const so = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return { nombre: `${nav}${so ? ' en ' + so : ''}`, lugar: [cf.city, cf.region, cf.country].filter(Boolean).join(', ') };
}
export function avisoSeguridad(env, ectx, db, req, email, titulo, cuerpo) {
  if (!correoReal(email)) return;
  const eq = equipoDe(req), origen = new URL(req.url).origin, cuando = new Date().toLocaleString('es-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
  const html = correoBase(titulo, `${cuerpo}<table style="font-size:14px;color:#334155;margin:12px 0"><tr><td style="padding-right:12px">Cuándo</td><td><b>${escHtml(cuando)}</b> (hora de Nueva York)</td></tr><tr><td>Equipo</td><td><b>${escHtml(eq.nombre)}</b></td></tr>${eq.lugar ? `<tr><td>Lugar aproximado</td><td><b>${escHtml(eq.lugar)}</b></td></tr>` : ''}</table>
    <p>Si fue usted, no tiene que hacer nada. <b>Si NO fue usted</b>, cambie su contraseña ahora: <a href="${origen}/app/#/olvide">${origen}/app/#/olvide</a>.</p>`);
  const t = enviarCorreo(env, db, { para: email, asunto: titulo + ' · BandGo', html }).catch((e) => { if (e.codigo !== 'sin_correo') console.error('aviso', e.message); });
  if (ectx && ectx.waitUntil) ectx.waitUntil(t); return t;
}

// ---------- frenos por conexión ----------
export function ipDe(req) {
  const h = new URL(req.url).hostname;
  if (h === 'localhost' || h === '127.0.0.1') return req.headers.get('x-bg-ip') || null; // en local no se frena, salvo que la prueba lo pida
  return req.headers.get('cf-connecting-ip') || 'sin-ip';
}
export const MSG_FRENO = 'Demasiados intentos desde esta conexión. Espere unos minutos y vuelva a intentar.';
export async function frenarClave(db, clave, max, seg) {
  const ahora = Math.floor(Date.now() / 1000), corte = ahora - seg;
  const r = await db.prepare('INSERT INTO frenos (clave, desde, n) VALUES (?, ?, 1) ON CONFLICT(clave) DO UPDATE SET n = CASE WHEN desde < ? THEN 1 ELSE n + 1 END, desde = CASE WHEN desde < ? THEN ? ELSE desde END RETURNING n')
    .bind(clave, ahora, corte, corte, ahora).first().catch(() => null);
  return !!(r && r.n > max);
}
export async function cuentaClave(db, clave, seg) {
  const r = await db.prepare('SELECT n FROM frenos WHERE clave = ? AND desde >= ?').bind(clave, Math.floor(Date.now() / 1000) - seg).first().catch(() => null);
  return r ? r.n : 0;
}
export async function frenar(db, req, tipo, max, seg, extra) {
  const ip = ipDe(req); if (ip === null) return false;
  return frenarClave(db, `${tipo}:${extra != null ? extra : ip}`, max, seg);
}

// ---------- cabeceras de seguridad ----------
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
export function conCabeceras(resp) {
  if (!resp || resp.status === 101) return resp;
  const r = new Response(resp.body, resp), h = r.headers;
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('strict-transport-security', 'max-age=31536000');
  h.set('permissions-policy', 'geolocation=(), camera=(self), microphone=(), payment=(), usb=()');
  if ((h.get('content-type') || '').includes('text/html')) { h.set('content-security-policy', CSP); h.set('x-frame-options', 'SAMEORIGIN'); }
  return r;
}

// ---------- auditoría y errores ----------
export async function auditar(ctx, accion, recurso = null, recursoId = null, detalle = null) {
  try {
    await ctx.db.prepare('INSERT INTO auditoria (empresa_id, usuario_id, accion, recurso, recurso_id, detalle, ip) VALUES (?,?,?,?,?,?,?)')
      .bind(ctx.empresa?.id ?? null, ctx.user?.id ?? null, accion, recurso, recursoId, detalle ? String(detalle).slice(0, 500) : null, ctx.req ? ipDe(ctx.req) : null).run();
  } catch (e) { console.error('auditoria', e); }
}
export async function registrarError(env, { ref, origen, metodo, ruta, empresa, e }) {
  try {
    const db = env.DB;
    await db.prepare('INSERT INTO errores (ref, origen, metodo, ruta, empresa, mensaje, pila) VALUES (?,?,?,?,?,?,?)').bind(ref, origen || 'web', metodo || null, String(ruta || '').slice(0, 300), String(empresa || '').slice(0, 120), String((e && e.message) || e || '').slice(0, 500), String((e && e.stack) || '').slice(0, 3000)).run();
    const n = (await db.prepare("SELECT COUNT(*) n FROM errores WHERE creado >= datetime('now', '-10 minutes')").first()).n;
    if (n < 5 || await frenarClave(db, 'aviso_errores', 1, 3600)) return;
    const para = (await db.prepare('SELECT email FROM usuarios WHERE superadmin = 1 AND activo = 1').all()).results.map((u) => u.email);
    for (const x of para) await enviarCorreo(env, db, { para: x, asunto: `BandGo: ${n} errores en 10 minutos`, html: correoBase('Hay errores en BandGo', `<p>Se registraron ${n} errores en los últimos 10 minutos. Véalos en Plataforma → Errores.</p>`) }).catch(() => {});
  } catch (er) { console.error('registrarError', er); }
}
