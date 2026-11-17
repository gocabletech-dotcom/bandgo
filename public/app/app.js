// BandGo · app web (oficina, portal del músico y plataforma). JavaScript sin compilar, igual que FoodPOS.
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iniciales = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const fechaTxt = (f) => (f ? new Date(f.length === 10 ? f + 'T12:00:00' : f.replace(' ', 'T') + (f.includes('Z') ? '' : 'Z')).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const dinero = (v, m) => (v == null ? '—' : `${m || ''} ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`.trim());
let PUB = {}, ME = null;

// ---------- API ----------
async function api(ruta, o = {}) {
  const r = await fetch('/api/' + ruta, { method: o.method || 'GET', headers: { 'content-type': 'application/json', 'x-requested-with': 'bg' }, body: o.body ? JSON.stringify(o.body) : undefined, credentials: 'same-origin' });
  let j = {}; try { j = await r.json(); } catch {}
  if (r.status === 401 && !o.publico) { ME = null; if (!location.hash.startsWith('#/recuperar') && !location.hash.startsWith('#/invitacion')) { location.hash = '#/login'; } }
  if (!r.ok) { const e = new Error(j.error || 'Error ' + r.status); e.estado = r.status; e.datos = j; throw e; }
  return j;
}
function toast(t, mal) { const d = document.createElement('div'); d.className = 'toast' + (mal ? ' mal' : ''); d.textContent = t; $('#toasts').append(d); setTimeout(() => d.remove(), 4200); }
const falla = (e) => toast(e.message || String(e), true);
// envía un formulario: deshabilita el botón mientras trabaja
async function trabajando(btn, fn) { const t = btn ? btn.innerHTML : ''; if (btn) { btn.disabled = true; btn.textContent = 'Un momento…'; } try { return await fn(); } catch (e) { falla(e); } finally { if (btn) { btn.disabled = false; btn.innerHTML = t; } } }
const datosDe = (form) => Object.fromEntries(new FormData(form));

function modal(titulo, cuerpo, { pie = '', ancho } = {}) {
  const v = document.createElement('div'); v.className = 'velo';
  v.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"${ancho ? ` style="max-width:${ancho}px"` : ''}><div class="modal-h"><h2>${esc(titulo)}</h2><button class="x" aria-label="Cerrar">×</button></div><div class="modal-c">${cuerpo}</div>${pie ? `<div class="modal-p">${pie}</div>` : ''}</div>`;
  const cerrar = () => v.remove();
  v.addEventListener('click', (e) => { if (e.target === v || e.target.closest('.x') || e.target.closest('[data-cerrar]')) cerrar(); });
  document.body.append(v); const f = $('input,select,textarea', v); if (f) f.focus();
  return { el: v, cerrar };
}

// ---------- íconos (trazos) ----------
const IC = {
  home: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  brief: 'M3 7h18v13H3zM8 7V4h8v3', file: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6', pct: 'M19 5L5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  band: 'M12 3a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zM5 11a7 7 0 0 0 14 0M12 18v3', users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  money: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', wallet: 'M3 7h18v12H3zM3 7l2-3h12l2 3M16 13h2', check: 'M9 11l3 3 8-8M20 12v7H4V5h11',
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6', plane: 'M10 14L3 11l1-2 8 1 5-6a2 2 0 0 1 3 3l-6 5 1 8-2 1-3-7', map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  rider: 'M6 4h12v16H6zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 7h.01', chat: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1', key: 'M15 7a4 4 0 1 1-3.9 5H3v3H0M15 7h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', doc: 'M4 4h16v16H4zM8 9h8M8 13h5', menu: 'M3 6h18M3 12h18M3 18h18',
  out: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9', cam: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
};
const ico = (k, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${IC[k] || ''}"></path></svg>`;
const fotoAv = (url, nombre, cls = '') => (url ? `<img class="av ${cls}" src="${esc(url)}" alt="">` : `<span class="av ${cls}">${esc(iniciales(nombre))}</span>`);
const logoBanda = (b, cls = '') => (b.logo_url ? `<img class="logo-b ${cls}" src="${esc(b.logo_url)}" alt="Logo de ${esc(b.nombre)}">` : `<span class="logo-b ${cls}">${esc(iniciales(b.nombre))}</span>`);
const marca = '<img class="marca" src="/logo.png" alt="BandGo">';

// ---------- subir imágenes y documentos (se reducen en el navegador antes de subir) ----------
function leerComo(file) { return new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(file); }); }
async function reducir(file, max, mime) {
  const url = await leerComo(file); const img = new Image(); img.src = url; await img.decode();
  const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(mime, 0.85);
}
function elegirArchivo(tipo) {
  return new Promise((ok) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = tipo === 'documento' ? 'image/*,application/pdf' : 'image/*';
    i.onchange = async () => {
      const f = i.files[0]; if (!f) return ok(null);
      try {
        let datos;
        if (f.type === 'application/pdf') { if (f.size > 4e6) throw new Error('El PDF es muy grande (máximo 4 MB)'); datos = await leerComo(f); }
        else datos = await reducir(f, tipo === 'documento' ? 1800 : tipo === 'foto_musico' ? 600 : 700, tipo.startsWith('logo') && f.type === 'image/png' ? 'image/png' : 'image/jpeg');
        ok(await api('archivos', { method: 'POST', body: { tipo, datos } }));
      } catch (e) { falla(e); ok(null); }
    };
    i.click();
  });
}

// ---------- rutas ----------
window.addEventListener('hashchange', () => pintar());
async function arrancar() {
  try { PUB = await api('publico', { publico: true }); } catch { PUB = {}; }
  pintar();
}
async function pintar() {
  const h = location.hash.replace(/^#\/?/, ''), [r0, r1, r2, r3] = h.split('/');
  if (r0 === 'recuperar' && r1) return vistaRecuperar(r1);
  if (r0 === 'invitacion' && r1) return vistaInvitacion(r1);
  if (r0 === 'registro') return vistaRegistro();
  if (r0 === 'olvide') return vistaOlvide();
  if (r0 === 'setup') return vistaSetup();
  if (!ME) { try { ME = await api('me', { publico: true }); } catch { ME = null; } }
  if (!ME) {
    try { const s = await api('setup', { publico: true }); if (s.necesita_setup) return vistaSetup(); } catch {}
    return vistaLogin();
  }
  if (r0 === 'login') { location.hash = '#/'; return; }
  if (ME.plataforma) return plataforma(r0 || 'resumen', r1);
  if (ME.portal) return portal(r0 || 'inicio', r1, r2);
  return oficina(r0 || 'inicio', r1, r2, r3);
}
async function salir() { try { await api('logout', { method: 'POST' }); } catch {} ME = null; location.hash = '#/login'; pintar(); }

// ---------- pantallas de entrada ----------
function entrada(form) {
  $('#root').innerHTML = `<div class="entrada"><div class="entrada-arte">${marca.replace('class="marca"', 'class="marca" style="height:64px"')}
    <div class="lema">Del booking a la liquidación, <span>sin papeles sueltos.</span></div>
    <p style="color:#CBD5E1;font-size:16px;max-width:520px;line-height:1.5;margin:0">Calendario, ensayos, giras, nómina por evento y el cuadre que aprueba el artista.</p></div>
    <div class="entrada-form">${form}</div></div>`;
}
function vistaLogin() {
  entrada(`<form id="f"><div><h1>Iniciar sesión</h1><p class="mut" style="margin:6px 0 0">Entre con el correo de su empresa o de su perfil de músico.</p></div>
    <label class="campo">Correo<input type="email" name="email" autocomplete="username" required></label>
    <label class="campo">Contraseña<input type="password" name="password" autocomplete="current-password" required></label>
    <div style="display:flex;justify-content:flex-end;font-size:14px"><a href="#/olvide">¿Olvidó su contraseña?</a></div>
    <button class="btn prim bloque">Entrar</button>
    ${PUB.registro_abierto ? '<div class="sep">o</div><a class="btn bloque" href="#/registro">Crear cuenta de empresa · 15 días gratis</a>' : ''}
    <p class="mut peq" style="text-align:center;margin:0">${esc(PUB.soporte || '')}</p></form>`);
  $('#f').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button', ev.target), async () => {
    const r = await api('login', { method: 'POST', body: datosDe(ev.target), publico: true });
    if (r.dos_pasos) return pedir2fa(r.reto);
    ME = null; location.hash = '#/'; pintar();
  }); };
}
function pedir2fa(reto) {
  const m = modal('Verificación en dos pasos', `<p class="mut" style="margin:0">Escriba el código de 6 números de su app (o uno de respaldo).</p><label class="campo">Código<input name="codigo" inputmode="numeric" autocomplete="one-time-code"></label>`, { pie: '<button class="btn prim" id="ok2">Confirmar</button>' });
  $('#ok2', m.el).onclick = (ev) => trabajando(ev.target, async () => { const r = await api('login2', { method: 'POST', body: { reto, codigo: $('input', m.el).value }, publico: true }); m.cerrar(); if (r.respaldo_quedan != null) toast(`Le quedan ${r.respaldo_quedan} códigos de respaldo`); ME = null; location.hash = '#/'; pintar(); });
}
function vistaRegistro() {
  entrada(`<form id="f"><div><h1>Crear cuenta</h1><p class="mut" style="margin:6px 0 0">15 días gratis con todo. Sin tarjeta.</p></div>
    <label class="campo">Nombre de la agrupación o empresa<input name="empresa" required placeholder="Ej.: Los Estelares"></label>
    <label class="campo">Su nombre<input name="nombre" required autocomplete="name"></label>
    <div class="fila"><label class="campo">País<select name="pais"><option value="DO">República Dominicana</option><option value="US">Estados Unidos</option><option value="PR">Puerto Rico</option><option value="ES">España</option></select></label>
    <label class="campo">Teléfono<input name="telefono" inputmode="tel"></label></div>
    <label class="campo">Correo<input type="email" name="email" required autocomplete="email"></label>
    <label class="campo">Contraseña<input type="password" name="password" required autocomplete="new-password"><small>Mínimo 10 caracteres. Una frase corta que solo usted conozca.</small></label>
    <label class="campo" id="cod" hidden>Código que le mandamos al correo<input name="codigo" inputmode="numeric"></label>
    <label class="chk"><input type="checkbox" name="acepta" value="1" required> Acepto los Términos y condiciones y la Política de privacidad</label>
    <button class="btn prim bloque">Crear mi cuenta</button><a href="#/login" style="text-align:center">Ya tengo cuenta</a></form>`);
  $('#f').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button', ev.target), async () => {
    const r = await api('registro', { method: 'POST', body: { ...datosDe(ev.target), acepta: true }, publico: true });
    if (r.codigo_enviado) { $('#cod').hidden = false; $('#cod input').focus(); toast('Le mandamos un código a ' + r.email); return; }
    ME = null; location.hash = '#/'; pintar();
  }); };
}
function vistaOlvide() {
  entrada(`<form id="f"><h1>¿Olvidó su contraseña?</h1><p class="mut" style="margin:0">Le mandamos un enlace para crear una nueva. Vence en 30 minutos.</p>
    <label class="campo">Correo<input type="email" name="email" required></label><button class="btn prim bloque">Enviar enlace</button><a href="#/login" style="text-align:center">Volver</a></form>`);
  $('#f').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button', ev.target), async () => { const r = await api('recuperar', { method: 'POST', body: datosDe(ev.target), publico: true }); ev.target.innerHTML = `<h1>Revise su correo</h1><div class="aviso ok">${esc(r.mensaje)}</div><a class="btn bloque" href="#/login">Volver a entrar</a>`; }); };
}
function vistaRecuperar(token) {
  entrada(`<form id="f"><h1>Contraseña nueva</h1><label class="campo">Contraseña nueva<input type="password" name="nueva" required autocomplete="new-password"><small>Mínimo 10 caracteres.</small></label><button class="btn prim bloque">Guardar</button></form>`);
  $('#f').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button', ev.target), async () => { await api('recuperar/cambiar', { method: 'POST', body: { token, nueva: ev.target.nueva.value }, publico: true }); toast('Listo. Entre con su contraseña nueva.'); location.hash = '#/login'; }); };
}
async function vistaInvitacion(token) {
  let inv; try { inv = await api('invitacion/' + token, { publico: true }); } catch (e) { entrada(`<div class="caja"><h1>Invitación</h1><div class="aviso mal">${esc(e.message)}</div><a class="btn bloque" href="#/login">Ir a entrar</a></div>`); return; }
  entrada(`<form id="f"><div><h1>${esc(inv.empresa)}</h1><p class="mut" style="margin:6px 0 0">Le dieron acceso a BandGo como <b>${esc(inv.rol)}</b> con el correo <b>${esc(inv.email)}</b>.</p></div>
    ${inv.ya_tiene_cuenta ? '<label class="campo">Contraseña de su cuenta de BandGo<input type="password" name="password" required></label>' : `<label class="campo">Su nombre<input name="nombre" value="${esc(inv.nombre || '')}" required></label><label class="campo">Cree su contraseña<input type="password" name="password" required autocomplete="new-password"><small>Mínimo 10 caracteres.</small></label>`}
    <button class="btn prim bloque">${inv.ya_tiene_cuenta ? 'Unirme' : 'Crear mi acceso'}</button></form>`);
  $('#f').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button', ev.target), async () => { await api('invitacion/' + token, { method: 'POST', body: datosDe(ev.target), publico: true }); ME = null; location.hash = '#/'; pintar(); }); };
}
function vistaSetup() {
  entrada(`<form id="f"><h1>Configurar la plataforma</h1><p class="mut" style="margin:0">Cree el usuario superadministrador de BandGo. Esto se hace una sola vez.</p>
    <label class="campo">Nombre<input name="nombre" required></label><label class="campo">Correo<input type="email" name="email" required></label>
    <label class="campo">Contraseña<input type="password" name="password" required autocomplete="new-password"></label><button class="btn prim bloque">Crear</button></form>`);
  $('#f').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button', ev.target), async () => { await api('setup', { method: 'POST', body: datosDe(ev.target), publico: true }); toast('Listo. Entre con ese correo.'); location.hash = '#/login'; pintar(); }); };
}

// ---------- oficina ----------
const puede = (p) => ME && ME.permisos && ME.permisos.includes(p);
const MENU = [
  { g: 'Principal', i: [['inicio', 'Resumen general', 'home'], ['calendario', 'Calendario', 'cal', 0, 'eventos.ver'], ['ensayos', 'Ensayos', 'music', 0, 'ensayos.ver']] },
  { g: 'Booking', i: [['eventos', 'Conciertos y eventos', 'star', 0, 'eventos.ver'], ['clientes', 'Clientes', 'brief', 0, 'clientes.ver'], ['comisiones', 'Comisiones', 'pct', 0, 'comisiones.ver']] },
  { g: 'Equipo', i: [['bandas', 'Bandas', 'band', 0, 'bandas.ver'], ['integrantes', 'Integrantes', 'users', 0, 'musicos.ver']] },
  { g: 'Finanzas', i: [['finanzas', 'Finanzas y caja', 'money', 0, 'finanzas.ver'], ['nominas', 'Nóminas', 'wallet', 0, 'nomina.ver'], ['cuadres', 'Cuadres', 'check', 0, 'finanzas.ver'], ['gastos', 'Gastos generales', 'receipt', 0, 'gastos.generales']] },
  { g: 'Operación', i: [['viajes', 'Giras y viajes', 'plane', 0, 'viajes.ver'], ['itinerarios', 'Itinerarios', 'map', 0, 'viajes.ver'], ['rider', 'Rider técnico', 'rider', 0, 'rider.ver']] },
  { g: 'Comunicación', i: [['comunicados', 'Comunicados y chat', 'chat', 7]] },
  { g: 'Análisis', i: [['reportes', 'Reportes', 'chart', 0, 'reportes.ver'], ['auditoria', 'Bitácora', 'list', 0, 'auditoria.ver']] },
  { g: 'Configuración', i: [['empresa', 'Empresa', 'gear', 0, 'empresa.ver'], ['usuarios', 'Usuarios y permisos', 'shield', 0, 'usuarios.ver'], ['cuenta', 'Mi cuenta', 'key']] },
];
const TITULOS = { reportes: 'Reportes', rider: 'Rider técnico', viajes: 'Giras y viajes', itinerarios: 'Itinerarios', finanzas: 'Finanzas y caja', nominas: 'Nóminas', cuadres: 'Cuadres', gastos: 'Gastos generales', comisiones: 'Comisiones', recibo: 'Recibo', calendario: 'Calendario', ensayos: 'Ensayos', eventos: 'Conciertos y eventos', clientes: 'Clientes', contrato: 'Contrato', inicio: 'Resumen general', bandas: 'Bandas', integrantes: 'Integrantes', empresa: 'Empresa', usuarios: 'Usuarios y permisos', cuenta: 'Mi cuenta', auditoria: 'Bitácora' };
function marco(seccion, titulo) {
  const E = ME.empresa;
  const nav = MENU.map((g) => { const items = g.i.filter((x) => !x[4] || puede(x[4])); if (!items.length) return '';
    return `<div class="lat-g">${esc(g.g)}</div>` + items.map(([k, t, ic, fase]) => fase
      ? `<span class="lat-i fut" title="Llega en la fase ${fase}">${ico(ic)}<span>${esc(t)}</span><span class="fase">F${fase}</span></span>`
      : `<a class="lat-i${k === seccion ? ' act' : ''}" href="#/${k}">${ico(ic)}<span>${esc(t)}</span></a>`).join(''); }).join('');
  $('#root').innerHTML = `<div class="app"><nav class="lateral" id="lat" aria-label="Navegación principal">
      <div class="lat-marca">${marca}<span>BandGo</span></div>
      <div class="lat-emp">${E.logo_url ? `<img class="logo-b ch" src="${esc(E.logo_url)}" alt="">` : `<span class="logo-b ch">${esc(iniciales(E.nombre))}</span>`}
        <div style="min-width:0"><div class="peq mut">Empresa activa</div>${ME.empresas.length > 1 ? `<select id="cambiaEmp" aria-label="Cambiar de empresa">${ME.empresas.map((x) => `<option value="${x.id}"${x.id === E.id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>` : `<div style="font-family:var(--f-tit);font-weight:600;font-size:16px">${esc(E.nombre)}</div>`}</div></div>
      <div class="lat-nav">${nav}</div>
      <div class="lat-pie"><button class="btn chico" style="width:100%" id="salir">${ico('out')} Cerrar sesión</button></div></nav>
    <div class="principal"><header class="superior"><div class="ruta"><button class="btn chico menu-btn" id="abrirMenu" aria-label="Abrir menú">${ico('menu')}</button><span class="mut">${esc(E.nombre)}</span><span class="mut">/</span><b>${esc(titulo)}</b></div>
      <div class="usr"><span class="av" style="background:var(--tinta);color:#fff">${esc(iniciales(ME.usuario.nombre))}</span><span class="n"><b>${esc(ME.usuario.nombre)}</b><span>${esc(ME.rol_nombre)}</span></span></div></header>
      ${E.limitado ? '<div class="aviso adv" style="margin:16px 32px 0">Su prueba gratis terminó. Puede ver todo, pero para hacer cambios hay que activar un plan. Escríbanos a ' + esc(PUB.soporte || '') + '.</div>' : ''}
      <main class="contenido" id="c"></main></div></div>`;
  $('#salir').onclick = salir;
  $('#abrirMenu').onclick = () => $('#lat').classList.toggle('abierto');
  const ce = $('#cambiaEmp'); if (ce) ce.onchange = async () => { try { await api('empresa-activa', { method: 'POST', body: { empresa_id: Number(ce.value) } }); ME = null; location.hash = '#/'; pintar(); } catch (e) { falla(e); } };
  return $('#c');
}
async function oficina(sec, a, b, x) {
  const V = { reportes: vReportes, rider: vRider, viajes: vViajes, itinerarios: vItinerarios, finanzas: vFinanzas, nominas: vNominas, cuadres: vCuadres, gastos: vGastos, comisiones: vComisiones, recibo: vRecibo, calendario: vCalendario, ensayos: vEnsayos, eventos: vEventos, clientes: vClientes, contrato: vContrato, inicio: vInicio, bandas: vBandas, integrantes: vIntegrantes, empresa: vEmpresa, usuarios: vUsuarios, cuenta: vCuenta, auditoria: vAuditoria }[sec];
  if (!V) { location.hash = '#/'; return; }
  const c = marco(sec, TITULOS[sec]);
  try { await V(c, a, b, x); } catch (e) { c.innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`; }
}

async function vInicio(c) {
  const [r, al] = await Promise.all([api('resumen'), api('alertas')]);
  const prueba = r.plan && r.plan.clave === 'prueba' && r.prueba_hasta ? Math.max(0, Math.ceil((Date.parse(r.prueba_hasta.replace(' ', 'T') + 'Z') - Date.now()) / 864e5)) : null;
  c.innerHTML = `<div class="cab"><div><h1>Hola, ${esc(ME.usuario.nombre.split(' ')[0])}</h1><div class="mut" style="margin-top:4px">${esc(ME.empresa.nombre)} · ${esc(ME.rol_nombre)}</div></div>
    <div class="acc">${puede('musicos.crear') ? '<a class="btn" href="#/integrantes/nuevo">+ Integrante</a>' : ''}${puede('bandas.crear') ? '<a class="btn prim" href="#/bandas/nueva">+ Banda</a>' : ''}</div></div>
    ${prueba != null ? `<div class="aviso mor">Está en la prueba gratis: le quedan <b>${prueba} días</b>. Plan de prueba: hasta ${r.plan.bandas} bandas y ${r.plan.musicos} integrantes.</div>` : ''}
    <section class="kpis">
      <div class="card kpi"><div class="t">Bandas activas</div><div class="v">${r.bandas}</div><div class="s"><a href="#/bandas">Ver bandas</a></div></div>
      <div class="card kpi"><div class="t">Integrantes</div><div class="v">${r.musicos}</div><div class="s">${r.con_portal} con acceso a su portal</div></div>
      <div class="card kpi"><div class="t">Documentos por vencer (90 días)</div><div class="v">${r.docs_por_vencer ?? '—'}</div><div class="s">Pasaportes y visas</div></div>
      <div class="card kpi"><div class="t">Usuarios con acceso</div><div class="v">${r.usuarios}</div><div class="s">Oficina y portal</div></div>
    </section>
    <div class="grid2">
      <div class="card sin"><div class="card-h"><h2>Alertas de documentos</h2><span class="tag">180 · 90 · 60 · 30 días</span></div>
        ${al.length ? `<div class="desliza"><table class="tabla"><tbody>${al.map((x) => `<tr><td><a href="#/integrantes/${x.musico_id}" style="color:var(--tinta);font-weight:600;text-decoration:none">${esc(x.titulo)}</a></td><td class="mono peq">${esc(fechaTxt(x.vence))}</td><td><span class="est ${x.nivel === 'vencido' ? 'mal' : x.nivel === 'urgente' ? 'mal' : 'adv'}">${x.dias < 0 ? 'Vencido' : 'En ' + x.dias + ' días'}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Ningún documento vence en los próximos 180 días.</div>'}</div>
      <div class="card sin" id="prox"><div class="card-h"><h2>Próximas actividades</h2><a href="#/calendario" class="peq">Ver calendario</a></div><div class="vacio">Cargando…</div></div>
    </div>`;
  if (puede('eventos.ver') || puede('ensayos.ver')) proximas($('#prox')); else $('#prox').remove();
}

// ---------- bandas ----------
async function vBandas(c, a) {
  if (a === 'nueva') return formBanda(c, null);
  if (a && /^\d+$/.test(a)) return fichaBanda(c, Number(a));
  const L = await api('bandas');
  c.innerHTML = `<div class="cab"><h1>Bandas</h1><div class="acc">${puede('bandas.crear') ? '<a class="btn prim" href="#/bandas/nueva">+ Banda</a>' : ''}</div></div>
    ${L.length ? `<div class="grid3">${L.map((b) => `<a class="card" href="#/bandas/${b.id}" style="display:flex;gap:16px;align-items:center;text-decoration:none;color:inherit;${b.activa ? '' : 'opacity:.6'}">${logoBanda(b)}
      <div style="min-width:0"><div style="font-weight:700;font-size:16px">${esc(b.nombre)}</div><div class="mut peq" style="margin:2px 0 8px">${b.integrantes} integrantes · ${esc(b.moneda)}${b.pais ? ' · ' + esc(b.pais) : ''}</div>${b.categoria ? `<span class="tag">${esc(b.categoria)}</span>` : ''}${b.activa ? '' : ' <span class="tag gris">Archivada</span>'}</div></a>`).join('')}</div>`
      : `<div class="card vacio">Todavía no hay bandas. ${puede('bandas.crear') ? '<a href="#/bandas/nueva">Cree la primera</a>.' : ''}</div>`}`;
}
async function formBanda(c, b) {
  if (!puede(b ? 'bandas.editar' : 'bandas.crear')) { c.innerHTML = '<div class="aviso mal">Su rol no puede hacer esto.</div>'; return; }
  let logo = null;
  c.innerHTML = `<div class="cab"><div><div class="mut peq"><a href="#/bandas">Bandas</a> /</div><h1>${b ? 'Editar banda' : 'Nueva banda'}</h1></div></div>
    <form class="card" id="f" style="display:flex;flex-direction:column;gap:16px;max-width:760px">
      <div class="subir"><span id="lg">${logoBanda(b || { nombre: '?' })}</span><div><button type="button" class="btn chico" id="subeLogo">${ico('cam')} ${b && b.logo_url ? 'Cambiar logo' : 'Subir logo'}</button><div class="mut peq" style="margin-top:6px">JPG o PNG. Sale en contratos, recibos, rider e itinerario.</div></div></div>
      <label class="campo">Nombre<input name="nombre" required value="${esc(b?.nombre || '')}"></label>
      <div class="fila3"><label class="campo">Categoría<input name="categoria" list="cats" value="${esc(b?.categoria || '')}" placeholder="Banda RD, Banda USA…"><datalist id="cats"><option value="Banda RD"><option value="Banda USA"></datalist></label>
        <label class="campo">País base<input name="pais" value="${esc(b?.pais || '')}"></label>
        <label class="campo">Moneda<select name="moneda">${['USD', 'DOP', 'EUR'].map((m) => `<option${(b?.moneda || ME.empresa.moneda_base) === m ? ' selected' : ''}>${m}</option>`).join('')}</select></label></div>
      <label class="campo">Notas<textarea name="notas" rows="3">${esc(b?.notas || '')}</textarea></label>
      <div style="display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap">${b && puede('bandas.eliminar') ? `<button type="button" class="btn peligro" id="arch">${b.activa ? 'Archivar banda' : 'Volver a activar'}</button>` : '<span></span>'}<div style="display:flex;gap:10px"><a class="btn" href="#/bandas${b ? '/' + b.id : ''}">Cancelar</a><button class="btn prim">Guardar</button></div></div>
    </form>`;
  $('#subeLogo').onclick = async () => { const r = await elegirArchivo('logo_banda'); if (r) { logo = r.clave; $('#lg').innerHTML = `<img class="logo-b" src="${esc(r.url)}" alt="">`; } };
  if ($('#arch')) $('#arch').onclick = (ev) => trabajando(ev.target, async () => { await api('bandas/' + b.id, { method: 'PUT', body: { activa: !b.activa } }); location.hash = '#/bandas'; });
  $('#f').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button.prim', ev.target), async () => {
    const d = { ...datosDe(ev.target), ...(logo ? { logo } : {}) };
    const r = b ? await api('bandas/' + b.id, { method: 'PUT', body: d }) : await api('bandas', { method: 'POST', body: d });
    toast('Guardado'); location.hash = '#/bandas/' + (b ? b.id : r.id);
  }); };
}
async function fichaBanda(c, id) {
  const b = await api('bandas/' + id);
  if (location.hash.endsWith('/editar')) return formBanda(c, b);
  c.innerHTML = `<div class="cab"><div style="display:flex;gap:16px;align-items:center">${logoBanda(b)}<div><div class="mut peq"><a href="#/bandas">Bandas</a> /</div><h1>${esc(b.nombre)}</h1><div style="margin-top:6px;display:flex;gap:6px">${b.categoria ? `<span class="tag">${esc(b.categoria)}</span>` : ''}<span class="tag gris">${esc(b.moneda)}</span>${b.activa ? '' : '<span class="tag gris">Archivada</span>'}</div></div></div>
    <div class="acc">${puede('bandas.editar') ? `<button class="btn" id="edit">Editar</button><button class="btn prim" id="miem">Integrantes de la banda</button>` : ''}</div></div>
    <div class="card sin"><div class="card-h"><h2>Integrantes · ${b.integrantes.length}</h2></div>
      ${b.integrantes.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Integrante</th><th>Función en la banda</th><th>Tarifa en esta banda</th></tr></thead><tbody>${b.integrantes.map((m) => `<tr><td><a href="#/integrantes/${m.id}" style="display:flex;gap:10px;align-items:center;color:var(--tinta);text-decoration:none">${fotoAv(m.foto_url, m.nombre)}<span><b>${esc(m.nombre)}</b><br><span class="mut peq">${esc(m.instrumento || '')}</span></span></a></td><td>${esc(m.funcion || '—')}</td><td class="mono">${m.tarifa != null ? esc(dinero(m.tarifa, m.moneda || b.moneda)) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Sin integrantes todavía.</div>'}</div>
    ${b.notas ? `<div class="card"><h2>Notas</h2><p style="white-space:pre-line;margin:8px 0 0">${esc(b.notas)}</p></div>` : ''}`;
  if ($('#edit')) $('#edit').onclick = () => formBanda(c, b);
  if ($('#miem')) $('#miem').onclick = async () => {
    const todos = (await api('musicos')).filter((m) => m.activo);
    const en = new Map(b.integrantes.map((m) => [m.id, m]));
    const m = modal('Integrantes de ' + b.nombre, `<p class="mut" style="margin:0">Marque quién toca en esta banda. La tarifa aquí es la de esta banda (si es distinta a la suya base).</p>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:52vh;overflow:auto">${todos.map((x) => { const y = en.get(x.id); return `<div style="display:grid;grid-template-columns:auto 1fr 140px 110px;gap:10px;align-items:center;padding:8px;border:1px solid var(--borde);border-radius:10px">
        <input type="checkbox" data-id="${x.id}" ${y ? 'checked' : ''} aria-label="${esc(x.nombre)}"><span style="display:flex;gap:8px;align-items:center">${fotoAv(x.foto_url, x.nombre)}<span><b>${esc(x.nombre)}</b><br><span class="mut peq">${esc(x.instrumento || '')}</span></span></span>
        <input placeholder="Función" data-f="${x.id}" value="${esc(y?.funcion || '')}" style="height:36px;border:1px solid var(--borde2);border-radius:8px;padding:0 8px" aria-label="Función">
        <input placeholder="Tarifa" data-t="${x.id}" inputmode="decimal" value="${y?.tarifa ?? ''}" style="height:36px;border:1px solid var(--borde2);border-radius:8px;padding:0 8px" aria-label="Tarifa"></div>`; }).join('') || '<div class="vacio">Primero agregue integrantes.</div>'}</div>`, { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="gm">Guardar</button>', ancho: 760 });
    $('#gm', m.el).onclick = (ev) => trabajando(ev.target, async () => {
      const musicos = $$('input[type=checkbox]:checked', m.el).map((i) => ({ id: Number(i.dataset.id), funcion: $(`[data-f="${i.dataset.id}"]`, m.el).value, tarifa: $(`[data-t="${i.dataset.id}"]`, m.el).value, moneda: b.moneda }));
      await api(`bandas/${id}/integrantes`, { method: 'PUT', body: { musicos } }); m.cerrar(); toast('Guardado'); fichaBanda(c, id);
    });
  };
}

// ---------- integrantes ----------
async function vIntegrantes(c, a, b) {
  if (a === 'nuevo') return formMusico(c, null);
  if (a && /^\d+$/.test(a)) return fichaMusico(c, Number(a), b);
  const [L, B] = await Promise.all([api('musicos'), api('bandas')]);
  let filtro = 'todos', q = '';
  c.innerHTML = `<div class="cab"><h1>Integrantes</h1><div class="acc">${puede('musicos.crear') ? '<a class="btn prim" href="#/integrantes/nuevo">+ Integrante</a>' : ''}</div></div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center"><div style="display:flex;gap:6px;flex-wrap:wrap" id="fil">
      <button class="btn chico prim" data-f="todos">Todos</button>${B.filter((x) => x.activa).map((x) => `<button class="btn chico" data-f="b${x.id}">${esc(x.nombre)}</button>`).join('')}${puede('documentos.ver') ? '<button class="btn chico" data-f="docs">Documentos por vencer</button>' : ''}<button class="btn chico" data-f="baja">De baja</button></div>
      <input id="q" placeholder="Buscar nombre o instrumento" aria-label="Buscar integrante" style="height:38px;border:1px solid var(--borde2);border-radius:8px;padding:0 12px;min-width:240px"></div>
    <div class="grid4" id="lista"></div>`;
  const dibujar = () => {
    const V = L.filter((m) => (filtro === 'baja' ? !m.activo : m.activo) && (filtro === 'todos' || filtro === 'baja' || (filtro === 'docs' ? m.alerta_doc || m.sin_pasaporte : m.bandas.some((x) => 'b' + x.id === filtro))) && (!q || (m.nombre + ' ' + (m.instrumento || '')).toLowerCase().includes(q)));
    $('#lista').innerHTML = V.length ? V.map((m) => `<a class="card" href="#/integrantes/${m.id}" style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;text-decoration:none;color:inherit">${fotoAv(m.foto_url, m.nombre, 'g')}
      <div><div style="font-weight:700;font-size:15px">${esc(m.nombre)}</div><div class="mut peq">${esc(m.instrumento || (m.tipo === 'sonidista' ? 'Sonidista' : ''))}</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">${m.bandas.map((x) => `<span class="tag">${esc(x.nombre)}</span>`).join('')}</div>
      ${m.alerta_doc ? `<span class="est ${m.alerta_doc.nivel === 'aviso' ? 'adv' : 'mal'}">${m.alerta_doc.dias < 0 ? 'Documento vencido' : 'Documento vence en ' + m.alerta_doc.dias + ' días'}</span>` : m.sin_pasaporte ? '<span class="est gr">Falta el pasaporte</span>' : m.sin_pasaporte === false ? '<span class="est ok">Documentos al día</span>' : ''}
      <span class="peq ${m.portal ? '' : 'mut'}">${m.portal ? 'Con acceso al portal' : 'Sin acceso al portal'}</span></a>`).join('') : '<div class="card vacio" style="grid-column:1/-1">No hay integrantes aquí.</div>';
  };
  $('#fil').onclick = (e) => { const bt = e.target.closest('button'); if (!bt) return; filtro = bt.dataset.f; $$('#fil button').forEach((x) => x.classList.toggle('prim', x === bt)); dibujar(); };
  $('#q').oninput = (e) => { q = e.target.value.toLowerCase().trim(); dibujar(); };
  dibujar();
}
async function formMusico(c, m) {
  if (!puede(m ? 'musicos.editar' : 'musicos.crear')) { c.innerHTML = '<div class="aviso mal">Su rol no puede hacer esto.</div>'; return; }
  const B = (await api('bandas')).filter((x) => x.activa); let foto = null;
  const en = new Set((m?.bandas || []).map((x) => x.id));
  c.innerHTML = `<div class="cab"><div><div class="mut peq"><a href="#/integrantes">Integrantes</a> /</div><h1>${m ? 'Editar integrante' : 'Nuevo integrante'}</h1></div></div>
    <form class="card" id="f" style="display:flex;flex-direction:column;gap:16px;max-width:900px">
      <div class="subir"><span id="ft">${fotoAv(m?.foto_url, m?.nombre || '?', 'g')}</span><div><button type="button" class="btn chico" id="subeFoto">${ico('cam')} ${m?.foto_url ? 'Cambiar foto' : 'Subir foto de perfil'}</button><div class="mut peq" style="margin-top:6px">Se ve en la nómina, el itinerario, el chat y el stage plot.</div></div></div>
      <div class="fila3"><label class="campo">Nombre completo<input name="nombre" required value="${esc(m?.nombre || '')}"></label>
        <label class="campo">Instrumento o función<input name="instrumento" value="${esc(m?.instrumento || '')}" placeholder="Trompeta, voz, bajo…"></label>
        <label class="campo">Tipo<select name="tipo">${[['musico', 'Músico'], ['sonidista', 'Sonidista'], ['tecnico', 'Técnico / crew']].map(([v, t]) => `<option value="${v}"${(m?.tipo || 'musico') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <div class="fila3"><label class="campo">Correo<input type="email" name="email" value="${esc(m?.email || '')}"><small>Para darle acceso a su portal.</small></label>
        <label class="campo">Teléfono<input name="telefono" inputmode="tel" value="${esc(m?.telefono || '')}"></label>
        <label class="campo">WhatsApp<input name="whatsapp" inputmode="tel" value="${esc(m?.whatsapp || '')}"></label></div>
      <div class="fila3"><label class="campo">Fecha de nacimiento<input type="date" name="nacimiento" value="${esc(m?.nacimiento || '')}"></label>
        <label class="campo">País de residencia<input name="pais_residencia" value="${esc(m?.pais_residencia || '')}"></label>
        <label class="campo">Dirección<input name="direccion" value="${esc(m?.direccion || '')}"></label></div>
      <div class="fila3"><label class="campo">Contacto de emergencia<input name="emergencia_nombre" value="${esc(m?.emergencia_nombre || '')}"></label>
        <label class="campo">Teléfono de emergencia<input name="emergencia_telefono" inputmode="tel" value="${esc(m?.emergencia_telefono || '')}"></label>
        <div class="fila" style="gap:8px"><label class="campo">Tarifa base<input name="tarifa" inputmode="decimal" value="${m?.tarifa ?? ''}"></label><label class="campo">Moneda<select name="tarifa_moneda">${['USD', 'DOP', 'EUR'].map((x) => `<option${(m?.tarifa_moneda || ME.empresa.moneda_base) === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label></div></div>
      <div class="campo">Bandas<div style="display:flex;flex-wrap:wrap;gap:14px;font-weight:500">${B.map((x) => `<label class="chk"><input type="checkbox" name="b" value="${x.id}" ${en.has(x.id) ? 'checked' : ''}> ${esc(x.nombre)}</label>`).join('') || '<span class="mut">Todavía no hay bandas.</span>'}</div></div>
      <label class="campo">Notas<textarea name="notas" rows="2">${esc(m?.notas || '')}</textarea></label>
      <div style="display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap">${m && puede('musicos.eliminar') ? `<button type="button" class="btn peligro" id="baja">${m.activo ? 'Dar de baja' : 'Volver a activar'}</button>` : '<span></span>'}<div style="display:flex;gap:10px"><a class="btn" href="#/integrantes${m ? '/' + m.id : ''}">Cancelar</a><button class="btn prim">Guardar</button></div></div>
    </form>`;
  $('#subeFoto').onclick = async () => { const r = await elegirArchivo('foto_musico'); if (r) { foto = r.clave; $('#ft').innerHTML = `<img class="av g" src="${esc(r.url)}" alt="">`; } };
  if ($('#baja')) $('#baja').onclick = (ev) => trabajando(ev.target, async () => { await api('musicos/' + m.id, { method: 'PUT', body: { activo: !m.activo } }); location.hash = '#/integrantes'; });
  $('#f').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button.prim', ev.target), async () => {
    const d = datosDe(ev.target); delete d.b; d.bandas = $$('input[name=b]:checked', ev.target).map((i) => Number(i.value)); if (foto) d.foto = foto;
    const r = m ? await api('musicos/' + m.id, { method: 'PUT', body: d }) : await api('musicos', { method: 'POST', body: d });
    toast('Guardado'); location.hash = '#/integrantes/' + (m ? m.id : r.id);
  }); };
}
async function fichaMusico(c, id, pest) {
  const m = await api('musicos/' + id);
  if (pest === 'editar') return formMusico(c, m);
  const tabs = [['datos', 'Datos'], ...(m.documentos ? [['documentos', 'Pasaporte y visas']] : []), ...(m.cuenta_pago !== undefined && puede('pagos.ver') ? [['pago', 'Datos de pago']] : [])];
  const act = tabs.some((t) => t[0] === pest) ? pest : 'datos';
  c.innerHTML = `<div class="cab"><div style="display:flex;gap:16px;align-items:center">${fotoAv(m.foto_url, m.nombre, 'g')}<div><div class="mut peq"><a href="#/integrantes">Integrantes</a> /</div><h1>${esc(m.nombre)}</h1>
      <div class="mut" style="margin-top:4px">${esc(m.instrumento || '')}${m.activo ? '' : ' · <b>De baja</b>'}</div><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${m.bandas.map((x) => `<span class="tag">${esc(x.nombre)}</span>`).join('')}</div></div></div>
    <div class="acc">${puede('musicos.editar') ? `<a class="btn" href="#/integrantes/${id}/editar">Editar</a>` : ''}${puede('usuarios.invitar') && !m.portal ? '<button class="btn mor" id="inv">Dar acceso al portal</button>' : m.portal ? '<span class="est ok">Tiene acceso a su portal</span>' : ''}</div></div>
    <div class="pestanas" role="tablist">${tabs.map(([k, t]) => `<button role="tab" class="${k === act ? 'act' : ''}" data-t="${k}">${t}</button>`).join('')}</div><div id="pc"></div>`;
  $$('.pestanas button').forEach((bt) => (bt.onclick = () => { location.hash = `#/integrantes/${id}/${bt.dataset.t}`; }));
  if ($('#inv')) $('#inv').onclick = (ev) => trabajando(ev.target, async () => {
    const r = await api(`musicos/${id}/invitar`, { method: 'POST' });
    modal('Acceso al portal', `${r.enviado ? `<div class="aviso ok">Le mandamos la invitación a ${esc(m.email)}.</div>` : '<div class="aviso adv">Los correos no están activados en la plataforma. Mándele este enlace por WhatsApp:</div>'}<label class="campo">Enlace (vence en 7 días)<input readonly value="${esc(r.enlace)}" onclick="this.select()"></label>`, { pie: `${m.whatsapp ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${esc(m.whatsapp)}?text=${encodeURIComponent('Hola ' + m.nombre.split(' ')[0] + ', este es tu acceso a BandGo: ' + r.enlace)}">Enviar por WhatsApp</a>` : ''}<button class="btn prim" data-cerrar>Listo</button>` });
  });
  const pc = $('#pc');
  if (act === 'datos') {
    const f = (t, v) => `<div><div class="mut peq">${t}</div><div style="font-weight:600;margin-top:2px">${esc(v || '—')}</div></div>`;
    pc.innerHTML = `<div class="card" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px">${f('Correo', m.email)}${f('Teléfono', m.telefono)}${f('WhatsApp', m.whatsapp)}${m.direccion !== undefined ? f('Nacimiento', m.nacimiento ? fechaTxt(m.nacimiento) : '') + f('País de residencia', m.pais_residencia) + f('Dirección', m.direccion) + f('Emergencia', [m.emergencia_nombre, m.emergencia_telefono].filter(Boolean).join(' · ')) : ''}${f('Tarifa base', m.tarifa != null ? dinero(m.tarifa, m.tarifa_moneda) : '')}${f('Tipo', { musico: 'Músico', sonidista: 'Sonidista', tecnico: 'Técnico / crew' }[m.tipo])}</div>
      ${m.notas ? `<div class="card"><h2>Notas</h2><p style="white-space:pre-line;margin:8px 0 0">${esc(m.notas)}</p></div>` : ''}`;
  }
  if (act === 'documentos') pintarDocs(pc, m.documentos, puede('documentos.editar'), (d, docId) => api(`musicos/${id}/documentos${docId ? '/' + docId : ''}`, { method: docId ? 'PUT' : 'POST', body: d }), (docId) => api(`musicos/${id}/documentos/${docId}`, { method: 'DELETE' }), () => fichaMusico(c, id, 'documentos'));
  if (act === 'pago') pintarPago(pc, m.cuenta_pago, puede('pagos.editar'), (d) => api(`musicos/${id}/cuenta-pago`, { method: 'PUT', body: d }), () => fichaMusico(c, id, 'pago'));
}
// pasaportes y visas (oficina y portal)
function pintarDocs(pc, docs, editar, guardar, borrar, recargar) {
  const nivel = (a) => (!a ? '<span class="est ok">Vigente</span>' : a.dias < 0 ? '<span class="est mal">Vencido</span>' : `<span class="est ${a.nivel === 'aviso' ? 'adv' : 'mal'}">Vence en ${a.dias} días</span>`);
  pc.innerHTML = `<div class="card sin"><div class="card-h"><div><h2>Pasaporte y visas</h2><div class="mut peq">Los números se guardan cifrados. Avisos a 180, 90, 60 y 30 días.</div></div>${editar ? '<button class="btn prim chico" id="nd">+ Documento</button>' : ''}</div>
    ${docs.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Documento</th><th>Número</th><th>Emisión</th><th>Vence</th><th>Estado</th><th></th></tr></thead><tbody>${docs.map((x) => `<tr><td><b>${x.tipo === 'visa' ? 'Visa' : 'Pasaporte'}</b> <span class="mut">${esc([x.clase, x.pais].filter(Boolean).join(' · '))}</span></td><td class="mono">${esc(x.numero || '—')}</td><td class="mono peq">${esc(fechaTxt(x.emision))}</td><td class="mono peq">${esc(fechaTxt(x.vence))}</td><td>${nivel(x.alerta)}</td>
      <td style="white-space:nowrap">${x.archivo_url ? `<a class="btn chico" href="${esc(x.archivo_url)}" target="_blank" rel="noopener">Ver archivo</a> ` : x.tiene_archivo ? '<span class="mut peq">Archivo guardado</span> ' : ''}${editar ? `<button class="btn chico" data-e="${x.id}">Editar</button>${borrar ? ` <button class="btn chico peligro" data-b="${x.id}">Quitar</button>` : ''}` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Sin documentos registrados.</div>'}</div>`;
  const form = (x) => {
    let archivo = null;
    const md = modal(x ? 'Editar documento' : 'Agregar documento', `<div class="fila"><label class="campo">Tipo<select name="tipo"><option value="pasaporte"${x?.tipo === 'pasaporte' ? ' selected' : ''}>Pasaporte</option><option value="visa"${x?.tipo === 'visa' ? ' selected' : ''}>Visa</option></select></label>
      <label class="campo">País<input name="pais" value="${esc(x?.pais || '')}" placeholder="País emisor o de la visa"></label></div>
      <div class="fila"><label class="campo">Número<input name="numero" autocomplete="off" placeholder="${x ? 'Déjelo vacío para no cambiarlo' : ''}"></label><label class="campo">Tipo de visa<input name="clase" value="${esc(x?.clase || '')}" placeholder="B1/B2, Schengen…"></label></div>
      <div class="fila"><label class="campo">Emisión<input type="date" name="emision" value="${esc(x?.emision || '')}"></label><label class="campo">Vence<input type="date" name="vence" required value="${esc(x?.vence || '')}"></label></div>
      <div class="subir"><button type="button" class="btn chico" id="sa">${ico('doc')} Subir foto o PDF del documento</button><span class="mut peq" id="sat">${x?.tiene_archivo ? 'Ya tiene un archivo guardado' : 'Opcional'}</span></div>`, { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="gd">Guardar</button>' });
    $('#sa', md.el).onclick = async () => { const r = await elegirArchivo('documento'); if (r) { archivo = r.clave; $('#sat', md.el).textContent = 'Archivo listo para guardar'; } };
    $('#gd', md.el).onclick = (ev) => trabajando(ev.target, async () => {
      const d = Object.fromEntries($$('input[name],select[name]', md.el).map((i) => [i.name, i.value])); if (archivo) d.archivo = archivo;
      await guardar(d, x?.id); md.cerrar(); toast('Guardado'); recargar();
    });
  };
  if ($('#nd', pc)) $('#nd', pc).onclick = () => form(null);
  $$('[data-e]', pc).forEach((b) => (b.onclick = () => form(docs.find((x) => x.id === Number(b.dataset.e)))));
  $$('[data-b]', pc).forEach((b) => (b.onclick = () => { if (confirm('¿Quitar este documento?')) trabajando(b, async () => { await borrar(Number(b.dataset.b)); recargar(); }); }));
}
function pintarPago(pc, cp, editar, guardar, recargar) {
  pc.innerHTML = `<div class="card" style="display:flex;flex-direction:column;gap:14px;max-width:760px"><div><h2>Datos de pago</h2><div class="mut peq" style="margin-top:4px">Se guardan cifrados y se muestran enmascarados. Nunca pedimos contraseñas bancarias.</div></div>
    ${cp ? `<div class="fila3"><div><div class="mut peq">Banco</div><b>${esc(cp.banco || '—')}</b></div><div><div class="mut peq">Cuenta</div><b class="mono">${esc(cp.numero || '—')}</b> <span class="mut peq">${esc(cp.tipo_cuenta || '')}</span></div><div><div class="mut peq">Zelle</div><b>${esc(cp.zelle || '—')}</b></div></div><div class="mut peq">Titular: ${esc(cp.titular || '—')} · actualizado ${esc(fechaTxt(cp.actualizado))}</div>` : '<div class="mut">Sin datos de pago.</div>'}
    ${editar ? '<div><button class="btn prim chico" id="ep">Cambiar datos de pago</button></div>' : ''}</div>`;
  if ($('#ep', pc)) $('#ep', pc).onclick = () => {
    const md = modal('Datos de pago', `<div class="fila"><label class="campo">Banco<input name="banco" value="${esc(cp?.banco || '')}"></label><label class="campo">Titular<input name="titular" value="${esc(cp?.titular || '')}"></label></div>
      <div class="fila"><label class="campo">Número de cuenta<input name="numero" autocomplete="off" placeholder="${cp ? 'Vacío = no cambiarlo' : ''}"></label><label class="campo">Tipo<select name="tipo_cuenta"><option>Ahorros</option><option${cp?.tipo_cuenta === 'Corriente' ? ' selected' : ''}>Corriente</option></select></label></div>
      <label class="campo">Zelle (correo o teléfono)<input name="zelle" placeholder="${cp?.zelle ? 'Vacío = no cambiarlo' : ''}"></label>`, { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="gp">Guardar</button>' });
    $('#gp', md.el).onclick = (ev) => trabajando(ev.target, async () => { const d = Object.fromEntries($$('input[name],select[name]', md.el).map((i) => [i.name, i.value])); if (!d.zelle) delete d.zelle; await guardar(d); md.cerrar(); toast('Guardado'); recargar(); });
  };
}

// ---------- empresa, usuarios, cuenta, bitácora ----------
async function vEmpresa(c) {
  const e = await api('empresa'); let logo = null; const ed = puede('empresa.editar');
  c.innerHTML = `<div class="cab"><h1>Empresa</h1></div><form class="card" id="f" style="display:flex;flex-direction:column;gap:16px;max-width:820px">
    <div class="subir"><span id="lg">${e.logo_url ? `<img class="logo-b" src="${esc(e.logo_url)}" alt="">` : `<span class="logo-b">${esc(iniciales(e.nombre))}</span>`}</span>${ed ? `<button type="button" class="btn chico" id="sl">${ico('cam')} Logo de la empresa</button>` : ''}</div>
    <div class="fila"><label class="campo">Nombre<input name="nombre" value="${esc(e.nombre)}" ${ed ? '' : 'disabled'}></label><label class="campo">Correo<input name="email" type="email" value="${esc(e.email || '')}" ${ed ? '' : 'disabled'}></label></div>
    <div class="fila3"><label class="campo">País<select name="pais" ${ed ? '' : 'disabled'}>${[['DO', 'República Dominicana'], ['US', 'Estados Unidos'], ['PR', 'Puerto Rico'], ['ES', 'España']].map(([v, t]) => `<option value="${v}"${e.pais === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo">Moneda de los reportes<select name="moneda_base" ${ed ? '' : 'disabled'}>${['USD', 'DOP', 'EUR'].map((m) => `<option${e.moneda_base === m ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="campo">Zona horaria<input name="zona_horaria" value="${esc(e.zona_horaria)}" ${ed ? '' : 'disabled'}></label></div>
    <label class="campo">Teléfono<input name="telefono" value="${esc(e.telefono || '')}" ${ed ? '' : 'disabled'}></label>
    <div class="aviso mor">Plan: <b>${esc(e.plan ? e.plan.nombre : '')}</b>${e.prueba_hasta && e.plan?.clave === 'prueba' ? ' · prueba hasta ' + esc(fechaTxt(e.prueba_hasta)) : ''}</div>
    ${ed ? '<div><button class="btn prim">Guardar</button></div>' : ''}</form>`;
  if ($('#sl')) $('#sl').onclick = async () => { const r = await elegirArchivo('logo_empresa'); if (r) { logo = r.clave; $('#lg').innerHTML = `<img class="logo-b" src="${esc(r.url)}" alt="">`; } };
  $('#f').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button.prim', ev.target), async () => { await api('empresa', { method: 'PUT', body: { ...datosDe(ev.target), ...(logo ? { logo } : {}) } }); toast('Guardado'); ME = null; pintar(); }); };
}
async function vUsuarios(c) {
  const [U, P] = await Promise.all([api('usuarios'), api('permisos')]);
  const oficina = U.usuarios.filter((u) => !['musico', 'sonidista'].includes(u.rol)), portal = U.usuarios.filter((u) => ['musico', 'sonidista'].includes(u.rol));
  const fila = (u) => `<tr><td><b>${esc(u.nombre)}</b><br><span class="mut peq">${esc(u.email)}</span></td><td><span class="tag${u.rol === 'dueno' ? '' : ' gris'}">${esc(u.rol_nombre)}</span></td><td>${u.dos_pasos ? '<span class="est ok">Dos pasos</span>' : '<span class="est gr">Solo contraseña</span>'}</td><td class="mono peq">${u.visto_en ? esc(fechaTxt(u.visto_en)) : '—'}</td>
    <td>${u.activo ? '<span class="est ok">Activo</span>' : '<span class="est mal">Sin acceso</span>'}</td><td>${puede('usuarios.editar') && u.rol !== 'dueno' && u.id !== ME.usuario.id ? `<button class="btn chico" data-u="${u.id}">Cambiar</button>` : ''}</td></tr>`;
  c.innerHTML = `<div class="cab"><h1>Usuarios y permisos</h1><div class="acc">${puede('usuarios.invitar') ? '<button class="btn prim" id="inv">+ Invitar a la oficina</button>' : ''}</div></div>
    <div class="card sin"><div class="card-h"><h2>Oficina</h2></div><div class="desliza"><table class="tabla"><thead><tr><th>Persona</th><th>Rol</th><th>Seguridad</th><th>Último uso</th><th>Estado</th><th></th></tr></thead><tbody>${oficina.map(fila).join('')}</tbody></table></div></div>
    <div class="card sin"><div class="card-h"><h2>Portal de músicos y sonidistas · ${portal.length}</h2><span class="mut peq">El acceso se da desde la ficha de cada integrante</span></div>${portal.length ? `<div class="desliza"><table class="tabla"><tbody>${portal.map(fila).join('')}</tbody></table></div>` : '<div class="vacio">Nadie tiene acceso al portal todavía.</div>'}</div>
    ${U.invitaciones.length ? `<div class="card sin"><div class="card-h"><h2>Invitaciones pendientes</h2></div><div class="desliza"><table class="tabla"><tbody>${U.invitaciones.map((i) => `<tr><td>${esc(i.nombre || '')} <span class="mut">${esc(i.email)}</span></td><td><span class="tag gris">${esc(i.rol_nombre)}</span></td><td class="mut peq">Vence ${esc(fechaTxt(i.expira))}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="card sin"><div class="card-h"><div><h2>Qué puede hacer cada rol</h2><div class="mut peq">${puede('permisos.editar') ? 'Marque o desmarque. El dueño siempre puede todo.' : 'Solo el dueño puede cambiar esto.'}</div></div></div>
      <div class="desliza"><table class="tabla"><thead><tr><th>Permiso</th>${Object.values(P.roles).map((r) => `<th style="text-align:center">${esc(r)}</th>`).join('')}</tr></thead><tbody>${Object.entries(P.catalogo).map(([k, t]) => `<tr><td>${esc(t)}<br><span class="mono peq mut">${esc(k)}</span></td>${Object.keys(P.roles).map((r) => `<td style="text-align:center"><input type="checkbox" data-r="${r}" data-p="${k}" ${P.permisos[r].includes(k) ? 'checked' : ''} ${puede('permisos.editar') ? '' : 'disabled'} aria-label="${esc(P.roles[r] + ': ' + t)}"></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  $$('input[data-r]').forEach((i) => (i.onchange = async () => { try { await api('permisos', { method: 'PUT', body: { rol: i.dataset.r, permiso: i.dataset.p, permitido: i.checked } }); toast('Permiso guardado'); } catch (e) { i.checked = !i.checked; falla(e); } }));
  if ($('#inv')) $('#inv').onclick = () => {
    const md = modal('Invitar a la oficina', `<label class="campo">Nombre<input name="nombre"></label><label class="campo">Correo<input type="email" name="email" required></label>
      <label class="campo">Rol<select name="rol">${['admin', 'manager', 'booking'].filter((r) => r !== 'admin' || ME.rol === 'dueno').map((r) => `<option value="${r}">${esc(U.roles[r])}</option>`).join('')}</select></label>`, { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="gi">Invitar</button>' });
    $('#gi', md.el).onclick = (ev) => trabajando(ev.target, async () => { const d = Object.fromEntries($$('input[name],select[name]', md.el).map((i) => [i.name, i.value])); const r = await api('usuarios', { method: 'POST', body: d }); md.cerrar();
      modal('Invitación creada', `${r.enviado ? '<div class="aviso ok">Le mandamos la invitación por correo.</div>' : '<div class="aviso adv">Los correos no están activados. Pásele este enlace:</div>'}<label class="campo">Enlace (vence en 7 días)<input readonly value="${esc(r.enlace)}" onclick="this.select()"></label>`, { pie: '<button class="btn prim" data-cerrar>Listo</button>' }); vUsuarios(c); });
  };
  $$('[data-u]').forEach((b) => (b.onclick = () => { const u = U.usuarios.find((x) => x.id === Number(b.dataset.u));
    const md = modal('Acceso de ' + u.nombre, `<label class="campo">Rol<select name="rol">${Object.entries(U.roles).filter(([k]) => k !== 'dueno' && (k !== 'admin' || ME.rol === 'dueno')).map(([k, t]) => `<option value="${k}"${u.rol === k ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label><label class="chk"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}> Tiene acceso</label>`, { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="gu">Guardar</button>' });
    $('#gu', md.el).onclick = (ev) => trabajando(ev.target, async () => { await api('usuarios/' + u.id, { method: 'PUT', body: { rol: $('select', md.el).value, activo: $('input[name=activo]', md.el).checked } }); md.cerrar(); toast('Guardado'); vUsuarios(c); }); }));
}
async function vCuenta(c) {
  let dp = null; try { dp = await api('dos-pasos'); } catch {}
  c.innerHTML = `<div class="cab"><h1>Mi cuenta</h1></div><div class="grid2">
    <form class="card" id="fc" style="display:flex;flex-direction:column;gap:14px"><h2>Cambiar contraseña</h2><label class="campo">Contraseña actual<input type="password" name="actual" required autocomplete="current-password"></label><label class="campo">Nueva<input type="password" name="nueva" required autocomplete="new-password"><small>Mínimo 10 caracteres. Se cierra la sesión en los demás equipos.</small></label><div><button class="btn prim">Cambiar</button></div></form>
    <div class="card" style="display:flex;flex-direction:column;gap:14px"><h2>Verificación en dos pasos</h2>${dp ? (dp.activo ? `<div class="aviso ok">Activa. Le quedan ${dp.respaldo_quedan} códigos de respaldo.</div>${dp.obligatorio ? '' : '<div><button class="btn peligro chico" id="d2">Desactivar</button></div>'}` : `<p class="mut" style="margin:0">Pide un código de su teléfono (Google Authenticator, Authy…) además de la contraseña.${dp.obligatorio ? ' <b>Es obligatoria para usted.</b>' : ''}</p><div><button class="btn mor" id="a2">Activar</button></div>`) : '<p class="mut" style="margin:0">Para su rol no hace falta.</p>'}</div></div>`;
  $('#fc').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button', ev.target), async () => { await api('clave', { method: 'PUT', body: datosDe(ev.target) }); ev.target.reset(); toast('Contraseña cambiada'); }); };
  if ($('#a2')) $('#a2').onclick = () => {
    const md = modal('Activar dos pasos', '<label class="campo">Su contraseña<input type="password" name="password"></label>', { pie: '<button class="btn prim" id="s1">Seguir</button>' });
    $('#s1', md.el).onclick = (ev) => trabajando(ev.target, async () => { const r = await api('dos-pasos/iniciar', { method: 'POST', body: { password: $('input', md.el).value } });
      $('.modal-c', md.el).innerHTML = `<p style="margin:0">1. En su app de autenticación, agregue una cuenta con esta clave:</p><div class="mono" style="font-size:18px;padding:12px;background:var(--suave);border-radius:8px;text-align:center">${esc(r.secreto)}</div><p class="mut peq" style="margin:0">O abra este enlace en el teléfono: <a href="${esc(r.uri)}">agregar a la app</a></p><label class="campo">2. Escriba el código que muestra<input name="codigo" inputmode="numeric"></label>`;
      $('.modal-p', md.el).innerHTML = '<button class="btn prim" id="s2">Activar</button>';
      $('#s2', md.el).onclick = (e2) => trabajando(e2.target, async () => { const x = await api('dos-pasos/activar', { method: 'POST', body: { codigo: $('input', md.el).value } });
        $('.modal-c', md.el).innerHTML = `<div class="aviso ok">Activada. Guarde estos códigos de respaldo (cada uno sirve una vez):</div><div class="mono" style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;font-size:15px">${x.codigos.map((k) => `<span>${esc(k)}</span>`).join('')}</div>`;
        $('.modal-p', md.el).innerHTML = '<button class="btn prim" data-cerrar>Ya los guardé</button>'; ME = null; }); });
  };
  if ($('#d2')) $('#d2').onclick = () => { const md = modal('Desactivar dos pasos', '<label class="campo">Contraseña<input type="password" name="password"></label><label class="campo">Código de la app<input name="codigo" inputmode="numeric"></label>', { pie: '<button class="btn peligro" id="s3">Desactivar</button>' });
    $('#s3', md.el).onclick = (ev) => trabajando(ev.target, async () => { await api('dos-pasos/desactivar', { method: 'POST', body: Object.fromEntries($$('input', md.el).map((i) => [i.name, i.value])) }); md.cerrar(); vCuenta(c); }); };
}
async function vAuditoria(c) {
  const L = await api('auditoria');
  c.innerHTML = `<div class="cab"><h1>Bitácora</h1><span class="mut">Las últimas 200 acciones. No se puede editar ni borrar.</span></div><div class="card sin"><div class="desliza"><table class="tabla"><thead><tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>${L.map((a) => `<tr><td class="mono peq">${esc(new Date(a.creado.replace(' ', 'T') + 'Z').toLocaleString('es-DO'))}</td><td>${esc(a.usuario || '—')}</td><td><span class="tag gris">${esc(a.accion)}</span></td><td class="mut">${esc(a.detalle || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="vacio">Sin acciones.</td></tr>'}</tbody></table></div></div>`;
}

// ---------- portal del músico (móvil) ----------
async function portal(sec, arg, arg2) {
  let P; try { P = await api('portal'); } catch (e) { $('#root').innerHTML = `<div class="portal"><div class="p-cab">${marca}</div><div class="p-cuerpo" style="margin-top:16px"><div class="aviso adv">${esc(e.message)}</div><button class="btn" id="sl">Cerrar sesión</button></div></div>`; $('#sl').onclick = salir; return; }
  const m = P.musico;
  const tecnico = ME.rol === 'sonidista' || ['sonidista', 'tecnico'].includes(m.tipo);
  const tabs = [['inicio', 'Inicio', 'home'], ['agenda', 'Agenda', 'cal'], ...(tecnico ? [['tecnico', 'Técnico', 'rider']] : []), ['documentos', 'Documentos', 'doc'], ['pago', 'Pagos', 'wallet'], ['perfil', 'Perfil', 'users']];
  $('#root').innerHTML = `<div class="portal"><div class="p-cab">${fotoAv(m.foto_url, m.nombre, 'm')}<div style="flex:1"><div class="peq" style="color:#CBD5E1">Hola,</div><div style="font-family:var(--f-tit);font-size:21px;font-weight:700">${esc(m.nombre)}</div></div><span class="tag" style="background:var(--morado);color:#fff">${esc(P.empresa.nombre)}</span></div>
    <div class="p-cuerpo" id="pc"></div><nav class="p-tabs" aria-label="Menú del portal" style="grid-template-columns:repeat(${tabs.length},minmax(0,1fr))">${tabs.map(([k, t, i]) => `<a href="#/${k}" class="${k === sec ? 'act' : ''}"><span class="i">${ico(i, 20)}</span>${t}</a>`).join('')}</nav></div>`;
  const pc = $('#pc');
  if (sec === 'inicio') {
    const docs = P.documentos.filter((d) => d.alerta);
    pc.innerHTML = `<div class="card" style="display:flex;flex-direction:column;gap:8px;box-shadow:0 6px 20px rgba(15,23,42,.1)"><div class="peq mut" style="font-weight:700;letter-spacing:1px">MIS BANDAS</div>${P.bandas.map((b) => `<div style="display:flex;gap:10px;align-items:center">${logoBanda(b, 'ch')}<b>${esc(b.nombre)}</b>${b.funcion ? `<span class="mut peq">· ${esc(b.funcion)}</span>` : ''}</div>`).join('') || '<span class="mut">Aún no está en una banda.</span>'}</div>
      ${docs.length ? docs.map((d) => `<div class="aviso ${d.alerta.nivel === 'aviso' ? 'adv' : 'mal'}"><b>${d.tipo === 'visa' ? 'Visa' : 'Pasaporte'} ${esc(d.pais || '')}</b>: ${d.alerta.dias < 0 ? 'vencido' : 'vence en ' + d.alerta.dias + ' días'}. <a href="#/documentos">Actualizar</a></div>`).join('') : '<div class="aviso ok">Sus documentos de viaje están al día.</div>'}
      <div id="pv"></div><div id="pa"></div>`;
    portalProximoViaje($('#pv')); portalProximo($('#pa'));
  }
  if (sec === 'agenda') {
    pc.innerHTML = `<div class="segm" role="tablist" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#fff;border:1px solid var(--borde);border-radius:12px;padding:4px;box-shadow:0 6px 20px rgba(15,23,42,.08)">${[['', 'Presentaciones y ensayos'], ['itinerario', 'Mi itinerario']].map(([k, t]) => `<a href="#/agenda${k ? '/' + k : ''}" role="tab" style="text-align:center;padding:9px;border-radius:9px;font-weight:600;font-size:14px;text-decoration:none;${(arg || '') === k ? 'background:var(--tinta);color:#fff' : 'color:var(--texto2)'}">${t}</a>`).join('')}</div><div id="ag" style="display:flex;flex-direction:column;gap:12px"></div>`;
    return arg === 'itinerario' ? portalItinerario($('#ag')) : portalAgenda($('#ag'));
  }
  if (sec === 'recibo' && arg) return vRecibo(pc, arg);
  if (sec === 'tecnico' && tecnico) return portalTecnico(pc, arg, arg2);
  if (sec === 'documentos') pintarDocs(pc, P.documentos, true, (d, id) => api('portal/documentos' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body: d }), null, () => portal('documentos'));
  if (sec === 'pago') { pc.innerHTML = '<div id="mp" style="display:flex;flex-direction:column;gap:12px"></div><div id="dp"></div>'; await portalPagos($('#mp')); pintarPago($('#dp'), P.cuenta_pago, true, (d) => api('portal/cuenta-pago', { method: 'PUT', body: d }), () => portal('pago')); return; }
  if (sec === 'perfil') {
    let foto = null;
    pc.innerHTML = `<form class="card" id="f" style="display:flex;flex-direction:column;gap:14px"><div class="subir"><span id="ft">${fotoAv(m.foto_url, m.nombre, 'g')}</span><button type="button" class="btn chico" id="sf">${ico('cam')} Cambiar mi foto</button></div>
      <label class="campo">Teléfono<input name="telefono" inputmode="tel" value="${esc(m.telefono || '')}"></label><label class="campo">WhatsApp<input name="whatsapp" inputmode="tel" value="${esc(m.whatsapp || '')}"></label>
      <label class="campo">Fecha de nacimiento<input type="date" name="nacimiento" value="${esc(m.nacimiento || '')}"></label><label class="campo">Dirección<input name="direccion" value="${esc(m.direccion || '')}"></label><label class="campo">País de residencia<input name="pais_residencia" value="${esc(m.pais_residencia || '')}"></label>
      <label class="campo">Contacto de emergencia<input name="emergencia_nombre" value="${esc(m.emergencia_nombre || '')}"></label><label class="campo">Teléfono de emergencia<input name="emergencia_telefono" inputmode="tel" value="${esc(m.emergencia_telefono || '')}"></label>
      <button class="btn prim bloque">Guardar</button><button type="button" class="btn bloque" id="sl">Cerrar sesión</button></form>`;
    $('#sf').onclick = async () => { const r = await elegirArchivo('foto_musico'); if (r) { foto = r.clave; $('#ft').innerHTML = `<img class="av g" src="${esc(r.url)}" alt="">`; } };
    $('#sl').onclick = salir;
    $('#f').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button.prim', ev.target), async () => { await api('portal/perfil', { method: 'PUT', body: { ...datosDe(ev.target), ...(foto ? { foto } : {}) } }); toast('Guardado'); portal('perfil'); }); };
  }
}

// ---------- plataforma (superadmin) ----------
async function plataforma(sec) {
  const items = [['resumen', 'Empresas', 'home'], ['planes', 'Planes', 'list'], ['ajustes', 'Ajustes', 'gear'], ['errores', 'Errores', 'shield'], ['cuenta', 'Mi cuenta', 'key']];
  $('#root').innerHTML = `<div class="app"><nav class="lateral" id="lat" style="background:#020617;border-color:#020617" aria-label="Plataforma"><div class="lat-marca" style="border-color:#1E293B">${marca}<span style="color:#fff">BandGo</span></div><div class="lat-g" style="color:#C77DFF">PLATAFORMA</div><div class="lat-nav">${items.map(([k, t, i]) => `<a class="lat-i" style="${k === sec ? 'background:rgba(155,31,245,.18);color:#E9D5FF' : 'color:#CBD5E1'}" href="#/${k}">${ico(i)}<span>${t}</span></a>`).join('')}</div><div class="lat-pie" style="border-color:#1E293B"><button class="btn chico" style="width:100%" id="salir">Cerrar sesión</button></div></nav>
    <div class="principal"><header class="superior"><div class="ruta"><button class="btn chico menu-btn" id="abrirMenu" aria-label="Abrir menú">${ico('menu')}</button><span class="mut">Plataforma</span><span class="mut">/</span><b>${esc((items.find((x) => x[0] === sec) || items[0])[1])}</b></div><div class="usr"><span class="n"><b>${esc(ME.usuario.nombre)}</b><span>Superadministrador</span></span></div></header><main class="contenido" id="c"></main></div></div>`;
  $('#salir').onclick = salir; $('#abrirMenu').onclick = () => $('#lat').classList.toggle('abierto');
  const c = $('#c');
  if (ME.dos_pasos_obligatorio && !ME.dos_pasos && sec !== 'cuenta') { c.innerHTML = '<div class="aviso adv">Active primero la verificación en dos pasos. <a href="#/cuenta">Ir a Mi cuenta</a></div>'; return; }
  try {
    if (sec === 'cuenta') return vCuenta(c);
    if (sec === 'resumen') {
      const [r, E, PL] = await Promise.all([api('plataforma/resumen'), api('plataforma/empresas'), api('plataforma/planes')]);
      c.innerHTML = `<h1>Empresas</h1><section class="kpis"><div class="card kpi"><div class="t">Empresas activas</div><div class="v">${r.empresas}</div><div class="s">${r.en_prueba} en prueba</div></div><div class="card kpi"><div class="t">Usuarios</div><div class="v">${r.usuarios}</div><div class="s">${r.portal} en el portal de músicos</div></div><div class="card kpi"><div class="t">Bandas</div><div class="v">${r.bandas}</div></div><div class="card kpi"><div class="t">Archivos en R2</div><div class="v">${r.archivos_mb} MB</div><div class="s">10 GB gratis en R2</div></div></section>
        <div class="card sin"><div class="desliza"><table class="tabla"><thead><tr><th>Empresa</th><th>Dueño</th><th>Plan</th><th>Bandas</th><th>Integrantes</th><th>Archivos</th><th>Estado</th><th></th></tr></thead><tbody>${E.map((e) => `<tr><td><b>${esc(e.nombre)}</b><br><span class="mut peq">${esc(e.pais)} · desde ${esc(fechaTxt(e.creado))}</span></td><td class="peq">${esc(e.dueno || '—')}</td><td><span class="tag${e.plan === 'prueba' ? ' gris' : ''}">${esc(e.plan)}</span>${e.plan === 'prueba' && e.prueba_hasta ? `<br><span class="mut peq">hasta ${esc(fechaTxt(e.prueba_hasta))}</span>` : ''}</td><td>${e.bandas}</td><td>${e.musicos}</td><td class="mono peq">${(e.bytes / 1048576).toFixed(1)} MB</td><td><span class="est ${e.estado === 'activo' ? 'ok' : 'mal'}">${esc(e.estado)}</span></td><td><button class="btn chico" data-e="${e.id}">Administrar</button></td></tr>`).join('') || '<tr><td colspan="8" class="vacio">Sin empresas.</td></tr>'}</tbody></table></div></div>`;
      $$('[data-e]').forEach((b) => (b.onclick = () => { const e = E.find((x) => x.id === Number(b.dataset.e));
        const md = modal('Administrar ' + e.nombre, `<div class="fila"><label class="campo">Estado<select name="estado">${['activo', 'suspendida', 'archivada'].map((s) => `<option${e.estado === s ? ' selected' : ''}>${s}</option>`).join('')}</select></label><label class="campo">Plan<select name="plan">${PL.map((p) => `<option value="${p.clave}"${e.plan === p.clave ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label></div><label class="campo">Prueba hasta<input type="date" name="prueba_hasta" value="${esc((e.prueba_hasta || '').slice(0, 10))}"></label>`, { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="ge">Guardar</button>' });
        $('#ge', md.el).onclick = (ev) => trabajando(ev.target, async () => { await api('plataforma/empresas/' + e.id, { method: 'PUT', body: Object.fromEntries($$('[name]', md.el).map((i) => [i.name, i.value])) }); md.cerrar(); plataforma('resumen'); }); }));
    }
    if (sec === 'planes') {
      const PL = await api('plataforma/planes');
      c.innerHTML = `<h1>Planes</h1><p class="mut" style="margin:0">Vacío = sin límite. Los precios se cobrarán con Stripe en una fase siguiente.</p><div class="grid2">${PL.map((p) => `<form class="card" data-p="${p.clave}" style="display:flex;flex-direction:column;gap:12px"><div style="display:flex;justify-content:space-between"><h2>${esc(p.nombre)}</h2><span class="tag gris mono">${esc(p.clave)}</span></div>
        <div class="fila"><label class="campo">Nombre<input name="nombre" value="${esc(p.nombre)}"></label><label class="campo">Precio USD/mes<input name="precio" inputmode="decimal" value="${p.precio_c / 100}"></label></div>
        <div class="fila3"><label class="campo">Bandas<input name="bandas" value="${p.bandas ?? ''}"></label><label class="campo">Integrantes<input name="musicos" value="${p.musicos ?? ''}"></label><label class="campo">Usuarios oficina<input name="usuarios" value="${p.usuarios ?? ''}"></label></div>
        <div class="fila"><label class="campo">Archivos (MB)<input name="almacenamiento_mb" value="${p.almacenamiento_mb}"></label><label class="chk" style="align-self:end"><input type="checkbox" name="visible" ${p.visible ? 'checked' : ''}> Visible al público</label></div>
        <label class="campo">Descripción<input name="descripcion" value="${esc(p.descripcion || '')}"></label><div><button class="btn prim chico">Guardar</button></div></form>`).join('')}</div>`;
      $$('form[data-p]').forEach((f) => (f.onsubmit = (ev) => { ev.preventDefault(); trabajando($('button', f), async () => { const d = datosDe(f); d.visible = f.visible.checked; await api('plataforma/planes/' + f.dataset.p, { method: 'PUT', body: d }); toast('Guardado'); }); }));
    }
    if (sec === 'ajustes') {
      const A = await api('plataforma/ajustes');
      c.innerHTML = `<h1>Ajustes</h1><form class="card" id="f" style="display:flex;flex-direction:column;gap:14px;max-width:760px">
        <label class="chk"><input type="checkbox" name="registro_abierto" ${A.registro_abierto === '1' ? 'checked' : ''}> Registro abierto al público</label>
        <label class="campo">Días de prueba gratis<input name="prueba_dias" value="${esc(A.prueba_dias || '15')}"></label>
        <h2 style="margin-top:6px">Correos (Resend)</h2><label class="campo">Remitente<input name="correo_desde" value="${esc(A.correo_desde || '')}" placeholder="BandGo &lt;no-responder@sudominio.com&gt;"></label>
        <label class="campo">Clave de Resend<input name="resend_clave" type="password" value="${esc(A.resend_clave || '')}" autocomplete="off"><small>Se guarda cifrada.</small></label>
        <h2 style="margin-top:6px">Anti-robot (Cloudflare Turnstile)</h2><div class="fila"><label class="campo">Clave del sitio<input name="turnstile_sitio" value="${esc(A.turnstile_sitio || '')}"></label><label class="campo">Clave secreta<input name="turnstile_secreto" type="password" value="${esc(A.turnstile_secreto || '')}" autocomplete="off"></label></div>
        <div><button class="btn prim">Guardar</button></div></form>`;
      $('#f').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button.prim', ev.target), async () => { const d = datosDe(ev.target); d.registro_abierto = ev.target.registro_abierto.checked; await api('plataforma/ajustes', { method: 'PUT', body: d }); toast('Guardado'); }); };
    }
    if (sec === 'errores') {
      const L = await api('plataforma/errores');
      c.innerHTML = `<h1>Errores</h1><div class="card sin"><div class="desliza"><table class="tabla"><thead><tr><th>Cuándo</th><th>Ref.</th><th>Ruta</th><th>Mensaje</th></tr></thead><tbody>${L.map((e) => `<tr><td class="mono peq">${esc(e.creado)}</td><td class="mono">${esc(e.ref)}</td><td class="peq">${esc((e.metodo || '') + ' ' + (e.ruta || ''))}</td><td class="peq">${esc(e.mensaje)}</td></tr>`).join('') || '<tr><td colspan="4" class="vacio">Sin errores.</td></tr>'}</tbody></table></div></div>`;
    }
  } catch (e) { c.innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`; }
}

window.addEventListener('DOMContentLoaded', arrancar);
