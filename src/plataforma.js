// BandGo · Plataforma (solo superadministrador): empresas, planes, ajustes y errores. Igual que la Plataforma de FoodPOS.
import { json, err, txt, emailOk, cifrar, auditar, fecha, sha256, escHtml, enviarCorreo, correoBase, cfgCorreo } from './nucleo.js';
import { crearEmpresa } from './auth.js';

const rnd = (n) => { const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };

const SECRETAS = ['resend_clave', 'turnstile_secreto'];
const AJUSTES = ['registro_abierto', 'prueba_dias', 'correo_desde', 'turnstile_sitio', ...SECRETAS];

export async function rutasPlataforma({ db, env, url, method, partes, d, ctx }) {
  const [que, idRaw] = partes; const id = Number(idRaw) || null;
  if (que === 'resumen' && method === 'GET') {
    const [e, p, u, m, b, a] = await db.batch([
      db.prepare("SELECT COUNT(*) n FROM empresas WHERE estado = 'activo'"),
      db.prepare("SELECT COUNT(*) n FROM empresas WHERE estado = 'activo' AND plan = 'prueba'"),
      db.prepare('SELECT COUNT(*) n FROM usuarios WHERE superadmin = 0 AND activo = 1'),
      db.prepare("SELECT COUNT(*) n FROM miembros WHERE rol IN ('musico','sonidista') AND activo = 1"),
      db.prepare('SELECT COUNT(*) n FROM bandas WHERE activa = 1'),
      db.prepare('SELECT COALESCE(SUM(bytes),0) n FROM archivos'),
    ]);
    return json({ empresas: e.results[0].n, en_prueba: p.results[0].n, usuarios: u.results[0].n, portal: m.results[0].n, bandas: b.results[0].n, archivos_mb: Math.round(a.results[0].n / 1048576 * 10) / 10 });
  }
  if (que === 'empresas' && method === 'GET') {
    return json((await db.prepare(`SELECT e.id, e.nombre, e.slug, e.pais, e.plan, e.estado, e.prueba_hasta, e.creado,
      (SELECT COUNT(*) FROM bandas b WHERE b.empresa_id = e.id AND b.activa = 1) bandas,
      (SELECT COUNT(*) FROM musicos m WHERE m.empresa_id = e.id AND m.activo = 1) musicos,
      (SELECT COUNT(*) FROM miembros x WHERE x.empresa_id = e.id AND x.activo = 1) usuarios,
      (SELECT COALESCE(SUM(bytes),0) FROM archivos a WHERE a.empresa_id = e.id) bytes,
      (SELECT u.email FROM miembros x JOIN usuarios u ON u.id = x.usuario_id WHERE x.empresa_id = e.id AND x.rol = 'dueno' LIMIT 1) dueno
      FROM empresas e ORDER BY e.creado DESC`).all()).results);
  }
  // la plataforma crea la empresa y le manda al dueño un enlace para crear su contraseña (vale 7 días)
  if (que === 'empresas' && method === 'POST' && !id) {
    const nombre = txt(d.nombre, 80); if (!nombre) return err('Escriba el nombre de la agrupación');
    const email = String(d.dueno_email || '').toLowerCase().trim(); if (!emailOk(email)) return err('Escriba un correo válido para el dueño');
    const duenoNombre = txt(d.dueno_nombre, 80); if (!duenoNombre) return err('Escriba el nombre del dueño');
    const yaSuper = await db.prepare('SELECT 1 FROM usuarios WHERE email = ? AND superadmin = 1').bind(email).first();
    if (yaSuper) return err('Ese correo es el de la plataforma. Use otro correo para el dueño de la empresa.');
    const e = await crearEmpresa(db, { nombre, pais: d.pais, telefono: d.telefono, email });
    if (d.plan && (await db.prepare('SELECT 1 FROM planes WHERE clave = ?').bind(d.plan).first())) await db.prepare('UPDATE empresas SET plan = ? WHERE id = ?').bind(d.plan, e.id).run();
    const t = rnd(24);
    await db.prepare('INSERT INTO invitaciones (token, empresa_id, email, nombre, rol, expira, creado_por) VALUES (?,?,?,?,?,?,?)').bind(await sha256(t), e.id, email, duenoNombre, 'dueno', new Date(Date.now() + 7 * 864e5).toISOString(), ctx.user.id).run();
    const enlace = `${url.origin}/app/#/invitacion/${t}`;
    let enviado = false;
    if ((await cfgCorreo(env, db)).listo) {
      try { await enviarCorreo(env, db, { para: email, asunto: `Su cuenta de BandGo para ${nombre}`, html: correoBase(`Bienvenido a BandGo`, `<p>Hola ${escHtml(duenoNombre.split(' ')[0])}: ya está creada la cuenta de <b>${escHtml(nombre)}</b> en BandGo.</p><p>Toque el botón para crear su contraseña (el enlace vale 7 días).</p><p><a href="${enlace}" style="background:#0F172A;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Crear mi contraseña</a></p>`) }); enviado = true; }
      catch (er) { console.error('empresa nueva', er.message); }
    }
    await auditar({ ...ctx, empresa: { id: e.id } }, 'plataforma_empresa_creada', 'empresa', e.id, `${nombre} · dueño ${email}`);
    return json({ ok: true, id: e.id, enlace, enviado, prueba_hasta: e.prueba_hasta }, 201);
  }
  if (que === 'empresas' && method === 'POST' && id && idRaw && partes[2] === 'invitar') {
    const e = await db.prepare('SELECT * FROM empresas WHERE id = ?').bind(id).first(); if (!e) return err('No encontrada', 404);
    const email = String(d.dueno_email || '').toLowerCase().trim(); if (!emailOk(email)) return err('Escriba un correo válido');
    await db.prepare("DELETE FROM invitaciones WHERE empresa_id = ? AND email = ? AND usado = 0").bind(id, email).run();
    const t = rnd(24);
    await db.prepare('INSERT INTO invitaciones (token, empresa_id, email, nombre, rol, expira, creado_por) VALUES (?,?,?,?,?,?,?)').bind(await sha256(t), id, email, txt(d.dueno_nombre, 80), 'dueno', new Date(Date.now() + 7 * 864e5).toISOString(), ctx.user.id).run();
    await auditar({ ...ctx, empresa: { id } }, 'plataforma_invitacion_dueno', 'empresa', id, email);
    return json({ ok: true, enlace: `${url.origin}/app/#/invitacion/${t}` });
  }
  if (que === 'empresas' && method === 'PUT' && id) {
    const e = await db.prepare('SELECT * FROM empresas WHERE id = ?').bind(id).first(); if (!e) return err('No encontrada', 404);
    const estado = ['activo', 'suspendida', 'archivada'].includes(d.estado) ? d.estado : e.estado;
    const plan = d.plan && await db.prepare('SELECT 1 FROM planes WHERE clave = ?').bind(d.plan).first() ? d.plan : e.plan;
    const hasta = d.prueba_hasta !== undefined ? (fecha(d.prueba_hasta) ? d.prueba_hasta + ' 23:59:59' : null) : e.prueba_hasta;
    await db.prepare('UPDATE empresas SET estado = ?, plan = ?, prueba_hasta = ? WHERE id = ?').bind(estado, plan, hasta, id).run();
    if (estado !== 'activo') await db.prepare('DELETE FROM sesiones WHERE empresa_id = ?').bind(id).run();
    await auditar({ ...ctx, empresa: { id } }, 'plataforma_empresa', 'empresa', id, `estado ${estado} · plan ${plan} · prueba ${hasta || '-'}`);
    return json({ ok: true });
  }
  if (que === 'planes' && method === 'GET') return json((await db.prepare('SELECT * FROM planes ORDER BY orden').all()).results);
  if (que === 'planes' && method === 'PUT' && idRaw) {
    const p = await db.prepare('SELECT * FROM planes WHERE clave = ?').bind(idRaw).first(); if (!p) return err('No encontrado', 404);
    const n = (v, a) => (v === undefined ? a : v === null || v === '' ? null : Math.max(0, Math.round(Number(v)) || 0));
    await db.prepare('UPDATE planes SET nombre = ?, precio_c = ?, bandas = ?, musicos = ?, usuarios = ?, almacenamiento_mb = ?, descripcion = ?, visible = ? WHERE clave = ?')
      .bind(txt(d.nombre, 40) || p.nombre, d.precio !== undefined ? Math.round(Number(d.precio) * 100) || 0 : p.precio_c, n(d.bandas, p.bandas), n(d.musicos, p.musicos), n(d.usuarios, p.usuarios), n(d.almacenamiento_mb, p.almacenamiento_mb) ?? p.almacenamiento_mb, d.descripcion !== undefined ? txt(d.descripcion, 200) : p.descripcion, d.visible !== undefined ? (d.visible ? 1 : 0) : p.visible, idRaw).run();
    await auditar(ctx, 'plataforma_plan', 'plan', null, idRaw);
    return json({ ok: true });
  }
  if (que === 'ajustes' && method === 'GET') {
    const rs = (await db.prepare(`SELECT clave, valor FROM plataforma_config WHERE clave IN (${AJUSTES.map(() => '?').join(',')})`).bind(...AJUSTES).all()).results;
    const o = {}; for (const r of rs) o[r.clave] = SECRETAS.includes(r.clave) ? (r.valor ? 'guardada' : '') : r.valor;
    return json(o);
  }
  if (que === 'ajustes' && method === 'PUT') {
    const st = [];
    for (const k of AJUSTES) {
      if (d[k] === undefined) continue;
      let v = d[k] == null ? '' : String(d[k]).trim().slice(0, 300);
      if (SECRETAS.includes(k)) { if (v === 'guardada') continue; v = v ? await cifrar(v) : ''; }
      if (k === 'registro_abierto') v = d[k] ? '1' : '0';
      if (k === 'prueba_dias') v = String(Math.min(90, Math.max(1, Number(v) || 15)));
      if (k === 'correo_desde' && v && !emailOk(v.replace(/^.*<|>$/g, ''))) return err('El remitente no es un correo válido');
      st.push(db.prepare('INSERT INTO plataforma_config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').bind(k, v));
    }
    if (st.length) await db.batch(st);
    await auditar(ctx, 'plataforma_ajustes', null, null, Object.keys(d).join(', '));
    return json({ ok: true });
  }
  if (que === 'errores' && method === 'GET') return json((await db.prepare('SELECT id, ref, origen, metodo, ruta, empresa, mensaje, creado FROM errores ORDER BY id DESC LIMIT 100').all()).results);
  return err('Ruta no válida', 404);
}
