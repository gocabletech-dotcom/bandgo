// BandGo · funciones con pago y gastos guardados, «qué puede hacer cada rol», perfil de músico de la oficina
// y el portal del cliente (sus eventos, contratos para ver y firmar, depósitos y saldo, flyer y datos del evento).
'use strict';
const FUN_T = { manager: 'Manager', booking: 'Booking', administracion: 'Administración', direccion: 'Dirección musical', otra: 'Otra función' };
const APL_T = { banda: 'En cada evento de la banda', propios: 'Solo en los eventos donde es el booking o manager', toca: 'Solo cuando está en el equipo del evento' };

// ---------- qué puede hacer cada rol: etiqueta que al tocarla se despliega ----------
let rolesInfo = null;
const cargarRoles = async () => (rolesInfo ||= await api('roles-info').catch(() => ({})));
const rolChip = (rol, nombre) => `<button type="button" class="rol-chip" data-rol-info="${esc(rol)}" aria-expanded="false" title="Ver qué puede hacer">${esc(nombre || rol)} <span aria-hidden="true">▾</span></button>`;
function htmlRol(r) { return r ? `<div class="rol-det"><p style="margin:0 0 6px">${esc(r.resumen)}</p>${r.permisos.length ? `<ul style="margin:0;padding-left:18px;columns:2 220px;font-size:13px;line-height:1.6">${r.permisos.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p class="mut peq" style="margin:0">Sin permisos en la oficina.</p>'}</div>` : ''; }
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-rol-info]'); if (!b) return;
  e.preventDefault(); const I = await cargarRoles(), r = I[b.dataset.rolInfo];
  const abierto = b.nextElementSibling?.classList.contains('rol-pop');
  $$('.rol-pop').forEach((x) => x.remove()); $$('[data-rol-info]').forEach((x) => x.setAttribute('aria-expanded', 'false'));
  if (abierto || !r) return;
  b.setAttribute('aria-expanded', 'true');
  b.insertAdjacentHTML('afterend', `<div class="rol-pop card" role="region" aria-label="Qué puede hacer ${esc(r.nombre)}"><b>${esc(r.nombre)}</b>${htmlRol(r)}</div>`);
});
async function detalleRolEn(sel, destino) { const I = await cargarRoles(); const ver = () => (destino.innerHTML = `<details open class="rol-det-box"><summary><b>Qué puede hacer: ${esc(I[sel.value]?.nombre || '')}</b></summary>${htmlRol(I[sel.value])}</details>`); sel.addEventListener('change', ver); ver(); }

// ---------- funciones con pago y gastos guardados ----------
async function vFunciones(c, tab) {
  const act = tab === 'gastos' ? 'gastos' : 'funciones';
  c.innerHTML = `<div class="cab"><div><h1>Funciones y gastos guardados</h1><div class="mut">Quién cobra aparte por ser manager, booking, administración o dirección musical, y los gastos con precio que se cargan a la nómina.</div></div></div>
    <div class="pestanas" role="tablist"><button role="tab" data-t="funciones" class="${act === 'funciones' ? 'act' : ''}">Funciones con pago</button><button role="tab" data-t="gastos" class="${act === 'gastos' ? 'act' : ''}">Gastos guardados</button></div><div id="pc" style="display:flex;flex-direction:column;gap:12px"></div>`;
  $$('[data-t]').forEach((b) => (b.onclick = () => { location.hash = '#/funciones/' + b.dataset.t; }));
  const pc = $('#pc'), ed = puede('nomina.editar');
  if (act === 'funciones') {
    const F = await api('funciones');
    pc.innerHTML = `<div class="aviso mor">Una persona puede tener varias: por ejemplo, un trompetista que es también manager (10 % del contrato) y director musical (1,500 fijos). Al armar la nómina, lo fijo de un músico se suma a su pago y lo que es por % (o de alguien que no toca) sale como comisión aparte.</div>
      ${ed ? '<div><button class="btn prim" id="nf">+ Función con pago</button></div>' : ''}
      <div class="card sin">${F.funciones.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Persona</th><th>Función</th><th>Cobra</th><th>Cuándo</th><th>Banda</th><th></th></tr></thead><tbody>${F.funciones.map((f) => `<tr style="${f.activo ? '' : 'opacity:.5'}">
        <td><b>${esc(f.musico || f.usuario || '—')}</b><div class="mut peq">${f.musico ? 'Integrante' + (f.instrumento ? ' · ' + esc(f.instrumento) : '') : 'Usuario de la oficina'}</div></td><td><span class="tag">${esc(f.funcion_nombre)}</span></td>
        <td class="mono">${f.modo === 'fijo' ? esc(dinero(f.monto, f.moneda)) + ' fijo' : `${f.porcentaje} % de lo ${f.base === 'cobrado' ? 'cobrado' : 'contratado'}`}</td><td class="peq">${esc(f.aplica_nombre)}</td><td>${f.banda ? esc(f.banda) : '<span class="mut">Todas</span>'}</td>
        <td style="white-space:nowrap">${ed && f.activo ? `<button class="btn chico" data-e="${f.id}">Cambiar</button> <button class="btn chico peligro" data-q="${f.id}">Quitar</button>` : f.activo ? '' : '<span class="est gr">Quitada</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Todavía no hay funciones con pago.</div>'}</div>`;
    if ($('#nf')) $('#nf').onclick = () => formFuncion(null, () => vFunciones(c, 'funciones'));
    $$('[data-e]').forEach((b) => (b.onclick = () => formFuncion(F.funciones.find((x) => x.id === Number(b.dataset.e)), () => vFunciones(c, 'funciones'))));
    $$('[data-q]').forEach((b) => (b.onclick = () => { if (confirm('¿Quitar esta función? Lo que ya está en nóminas y comisiones no cambia.')) trabajando(b, async () => { await api('funciones/' + b.dataset.q, { method: 'DELETE' }); vFunciones(c, 'funciones'); }); }));
  } else {
    const G = await api('gastos-guardados');
    pc.innerHTML = `<div class="aviso mor">Guarde aquí los gastos que se repiten (transporte, combustible, dieta…) con su precio. En la nómina se agregan con un toque y el importe se puede cambiar para ese evento sin tocar el precio guardado. «Siempre» los agrega solos al armar cada nómina.</div>
      ${ed ? '<div><button class="btn prim" id="ng">+ Gasto guardado</button></div>' : ''}
      <div class="card sin">${G.gastos.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Gasto</th><th>Categoría</th><th>Precio</th><th>Siempre</th><th></th></tr></thead><tbody>${G.gastos.map((g) => `<tr><td><b>${esc(g.nombre)}</b></td><td class="peq">${esc(g.categoria)}</td><td class="mono">${esc(dinero(g.monto, g.moneda))}</td><td>${g.siempre ? '<span class="est ok">Sí</span>' : '<span class="mut">No</span>'}</td>
        <td style="white-space:nowrap">${ed ? `<button class="btn chico" data-e="${g.id}">Cambiar</button> <button class="btn chico peligro" data-q="${g.id}">Quitar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Todavía no hay gastos guardados.</div>'}</div>`;
    const form = (g) => { const md = modal(g ? 'Cambiar gasto guardado' : 'Nuevo gasto guardado', `<label class="campo">Nombre<input name="nombre" value="${esc(g?.nombre || '')}" placeholder="Transporte guagua" required></label>
        <label class="campo">Categoría<select name="categoria">${G.categorias.map((x) => `<option${x === (g?.categoria || 'Transporte terrestre y combustible') ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <div class="fila"><label class="campo">Precio<input name="monto" inputmode="decimal" value="${g?.monto ?? ''}" required></label><label class="campo">Moneda<select name="moneda">${['USD', 'DOP', 'EUR'].map((m) => `<option${m === (g?.moneda || ME.empresa.moneda_base || 'USD') ? ' selected' : ''}>${m}</option>`).join('')}</select></label></div>
        <label class="chk"><input type="checkbox" name="siempre" ${g?.siempre ? 'checked' : ''}> Agregarlo siempre al armar la nómina</label>`, { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="ok">Guardar</button>' });
      $('#ok', md.el).onclick = (ev) => trabajando(ev.target, async () => { const d = Object.fromEntries($$('[name]', md.el).map((i) => [i.name, i.type === 'checkbox' ? i.checked : i.value])); await api('gastos-guardados' + (g ? '/' + g.id : ''), { method: g ? 'PUT' : 'POST', body: d }); md.cerrar(); toast('Guardado'); vFunciones(c, 'gastos'); }); };
    if ($('#ng')) $('#ng').onclick = () => form(null);
    $$('[data-e]').forEach((b) => (b.onclick = () => form(G.gastos.find((x) => x.id === Number(b.dataset.e)))));
    $$('[data-q]').forEach((b) => (b.onclick = () => { if (confirm('¿Quitar este gasto guardado? Las nóminas ya armadas no cambian.')) trabajando(b, async () => { await api('gastos-guardados/' + b.dataset.q, { method: 'DELETE' }); vFunciones(c, 'gastos'); }); }));
  }
}
async function formFuncion(f, listo, pre = {}) {
  const [M, U, B] = await Promise.all([api('musicos'), puede('usuarios.ver') ? api('usuarios').then((r) => r.usuarios) : [], puede('bandas.ver') ? api('bandas') : []]);
  const of = U.filter((u) => u.activo && ['dueno', 'admin', 'manager', 'booking'].includes(u.rol));
  const persona = f ? (f.musico_id ? 'm' + f.musico_id : 'u' + f.usuario_id) : pre.musico_id ? 'm' + pre.musico_id : '';
  const md = modal(f ? 'Cambiar función con pago' : 'Nueva función con pago', `<label class="campo">Persona<select name="persona" required><option value="">— Escoja —</option><optgroup label="Integrantes (cobran en la nómina)">${M.filter((m) => m.activo).map((m) => `<option value="m${m.id}"${persona === 'm' + m.id ? ' selected' : ''}>${esc(m.nombre)}${m.instrumento ? ' · ' + esc(m.instrumento) : ''}</option>`).join('')}</optgroup>
      ${of.length ? `<optgroup label="Oficina (no tocan: cobran como comisión)">${of.map((u) => `<option value="u${u.id}"${persona === 'u' + u.id ? ' selected' : ''}>${esc(u.nombre)} · ${esc(u.rol_nombre)}</option>`).join('')}</optgroup>` : ''}</select></label>
    <div class="fila"><label class="campo">Función<select name="funcion">${Object.entries(FUN_T).map(([k, t]) => `<option value="${k}"${(f?.funcion || pre.funcion || 'manager') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label><label class="campo">Nombre en la nómina (opcional)<input name="nombre" value="${esc(f?.nombre || '')}" placeholder="Dirección musical"></label></div>
    <div class="fila"><label class="campo">Cómo cobra<select name="modo"><option value="fijo">Cantidad fija por evento</option><option value="porcentaje"${f?.modo === 'porcentaje' ? ' selected' : ''}>Porcentaje (comisión)</option></select></label><span></span></div>
    <div class="fila" data-m="fijo"><label class="campo">Importe<input name="monto" inputmode="decimal" value="${f?.monto ?? ''}"></label><label class="campo">Moneda<select name="moneda">${['USD', 'DOP', 'EUR'].map((m) => `<option${m === (f?.moneda || ME.empresa.moneda_base || 'USD') ? ' selected' : ''}>${m}</option>`).join('')}</select></label></div>
    <div class="fila" data-m="porcentaje"><label class="campo">Porcentaje<input name="porcentaje" inputmode="decimal" value="${f?.porcentaje ?? ''}" placeholder="10"></label><label class="campo">Sobre<select name="base"><option value="contrato">Lo contratado</option><option value="cobrado"${f?.base === 'cobrado' ? ' selected' : ''}>Lo cobrado</option></select></label></div>
    <div class="fila"><label class="campo">Cuándo cobra<select name="aplica">${Object.entries(APL_T).map(([k, t]) => `<option value="${k}"${(f?.aplica || '') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo">Banda<select name="banda_id"><option value="">Todas</option>${B.filter((b) => b.activa).map((b) => `<option value="${b.id}"${b.id === f?.banda_id ? ' selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select></label></div>`,
  { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="ok">Guardar</button>', ancho: 640 });
  const mo = $('[name=modo]', md.el), fu = $('[name=funcion]', md.el), ap = $('[name=aplica]', md.el);
  const ver = () => $$('[data-m]', md.el).forEach((x) => (x.hidden = x.dataset.m !== mo.value)); mo.onchange = ver; ver();
  if (!f) { const sug = () => (ap.value = fu.value === 'booking' ? 'propios' : fu.value === 'manager' ? 'banda' : 'toca'); fu.onchange = sug; sug(); }
  $('#ok', md.el).onclick = (ev) => trabajando(ev.target, async () => {
    const d = Object.fromEntries($$('[name]', md.el).map((i) => [i.name, i.value])); const p = d.persona;
    if (!p) throw new Error('Escoja a la persona');
    d.musico_id = p[0] === 'm' ? Number(p.slice(1)) : null; d.usuario_id = p[0] === 'u' ? Number(p.slice(1)) : null;
    await api('funciones' + (f ? '/' + f.id : ''), { method: f ? 'PUT' : 'POST', body: d }); md.cerrar(); toast('Guardado'); listo(); });
}
// sección en la ficha del integrante
async function seccionFunciones(el, m) {
  const F = await api('funciones?musico=' + m.id).catch(() => null); if (!F) return;
  const act = F.funciones.filter((f) => f.activo);
  el.innerHTML = `<div class="card" style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:0">Otras funciones y pagos extra</h2>${puede('nomina.editar') ? '<button class="btn chico" id="af">+ Función</button>' : ''}</div>
    ${act.length ? act.map((f) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--suave)"><span><span class="tag">${esc(f.funcion_nombre)}</span> <span class="peq mut">${esc(f.aplica_nombre)}${f.banda ? ' · ' + esc(f.banda) : ''}</span></span><b class="mono">${f.modo === 'fijo' ? esc(dinero(f.monto, f.moneda)) : f.porcentaje + ' %'}</b></div>`).join('') : '<p class="mut peq" style="margin:0">Solo cobra como músico. Si además es manager, booking, administra o dirige, agréguelo aquí.</p>'}
    <a class="peq" href="#/funciones">Ver todas las funciones</a></div>`;
  if ($('#af', el)) $('#af', el).onclick = () => formFuncion(null, () => seccionFunciones(el, m), { musico_id: m.id });
}

// ---------- perfil de músico de alguien de la oficina ----------
async function vMiMusico(c, a) {
  const tabs = [['pagos', 'Mis pagos'], ['agenda', 'Mi agenda'], ['itinerario', 'Mi itinerario']];
  const act = tabs.some((t) => t[0] === a) ? a : 'pagos';
  c.innerHTML = `<div class="cab"><div><h1>Mi perfil de músico</h1><div class="mut">Usted es ${esc(ME.rol_nombre)} y también toca como ${esc(ME.mi_musico.nombre)}. Aquí ve lo suyo como integrante.</div></div></div>
    <div class="pestanas" role="tablist">${tabs.map(([k, t]) => `<button role="tab" data-t="${k}" class="${k === act ? 'act' : ''}">${t}</button>`).join('')}</div><div id="pc" style="display:flex;flex-direction:column;gap:12px;max-width:760px"></div>`;
  $$('[data-t]').forEach((b) => (b.onclick = () => { location.hash = '#/mi-musico/' + b.dataset.t; }));
  const pc = $('#pc');
  if (act === 'pagos') return portalPagos(pc);
  if (act === 'agenda') return portalAgenda(pc);
  return portalItinerario(pc);
}

// ---------- portal del cliente ----------
async function clientePortal(sec, a) {
  const I = await api('cliente/inicio');
  const tabs = [['inicio', 'Mis eventos', 'cal'], ['mensajes', 'Ayuda', 'chat'], ['perfil', 'Mi cuenta', 'users']];
  $('#root').innerHTML = `<div class="p-app"><header class="p-cab"><div style="display:flex;align-items:center;gap:10px">${I.empresa.logo_url ? `<img src="${esc(I.empresa.logo_url)}" alt="" style="height:38px;max-width:110px;object-fit:contain;border-radius:8px;background:#fff">` : marca}<div><div style="font-weight:700">${esc(I.empresa.nombre)}</div><div class="peq" style="color:#CBD5E1">Portal de clientes · ${esc(I.cliente.nombre)}</div></div></div></header>
    <main class="p-cuerpo" id="pc" style="display:flex;flex-direction:column;gap:12px"></main>
    <nav class="p-tabs" aria-label="Menú del portal" style="grid-template-columns:repeat(${tabs.length},minmax(0,1fr))">${tabs.map(([k, t, i]) => `<a href="#/${k}" class="${(['evento', 'contrato'].includes(sec) ? 'inicio' : sec) === k ? 'act' : ''}"><span class="i">${ico(i, 20)}</span>${t}</a>`).join('')}</nav></div>`;
  const pc = $('#pc');
  if (sec === 'evento' && a) return clienteEvento(pc, Number(a), I);
  if (sec === 'contrato' && a) return clienteContrato(pc, Number(a));
  if (sec === 'mensajes') {
    pc.innerHTML = `<div class="card" style="display:flex;flex-direction:column;gap:10px"><h2 style="margin:0">¿Necesita algo?</h2><p class="mut" style="margin:0">Escríbale a ${esc(I.empresa.nombre)}.</p>
      ${I.empresa.telefono ? `<a class="btn" style="background:#047857;border-color:#047857;color:#fff" target="_blank" rel="noopener" href="https://wa.me/${esc(String(I.empresa.telefono).replace(/\D/g, ''))}">WhatsApp ${esc(I.empresa.telefono)}</a>` : ''}${I.empresa.email ? `<a class="btn" href="mailto:${esc(I.empresa.email)}">${esc(I.empresa.email)}</a>` : ''}</div>`;
    return;
  }
  if (sec === 'perfil') {
    pc.innerHTML = `<div class="card" style="display:flex;flex-direction:column;gap:10px"><b>${esc(ME.usuario.nombre)}</b><span class="mut">${esc(ME.usuario.email)}</span><a class="btn bloque" href="#/clave">Cambiar contraseña</a><button class="btn bloque" id="sl">Cerrar sesión</button></div>`;
    $('#sl').onclick = async () => { await api('logout', { method: 'POST' }); location.hash = ''; location.reload(); };
    return;
  }
  if (sec === 'clave') return typeof vCuenta === 'function' ? vCuenta(pc) : null;
  const evs = I.eventos;
  pc.innerHTML = evs.length ? evs.map((e) => { const pct = e.precio ? Math.min(100, Math.round((e.cobrado / e.precio) * 100)) : 0; const firmar = e.contrato && e.contrato.estado === 'enviado';
    return `<a class="card" href="#/evento/${e.id}" style="display:flex;flex-direction:column;gap:8px;text-decoration:none;color:inherit;${firmar ? 'border-color:#7C02F7' : ''}">
      <div style="display:flex;gap:12px">${e.flyer_url ? `<img src="${esc(e.flyer_url)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:10px;flex:none">` : ''}<div style="flex:1;min-width:0"><div class="peq mut" style="font-weight:700">${esc(diaTxt(e.fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}${e.hora_show ? ' · ' + esc(e.hora_show) : ''}</div>
        <b style="font-size:17px">${esc(e.nombre)}</b><div class="peq">${esc([e.banda, e.lugar].filter(Boolean).join(' · '))}</div></div></div>
      <div style="height:8px;border-radius:99px;background:var(--suave);overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--verde)"></div></div>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap" class="peq"><span>Pagado <b class="mono">${esc(dinero(e.cobrado, e.moneda))}</b></span><span>Falta <b class="mono" style="color:${e.saldo ? 'var(--ambar)' : 'var(--verde)'}">${esc(dinero(e.saldo, e.moneda))}</b></span></div>
      ${firmar ? '<span class="btn prim chico" style="align-self:flex-start">Revisar y firmar el contrato</span>' : e.contrato?.estado === 'firmado' ? '<span class="est ok" style="align-self:flex-start">Contrato firmado</span>' : ''}</a>`; }).join('')
    : '<div class="card mut">Todavía no tiene eventos con nosotros.</div>';
}
async function clienteEvento(pc, id, I) {
  const e = await api('cliente/eventos/' + id); let flyer = null;
  pc.innerHTML = `<a href="#/inicio" class="btn chico" style="align-self:flex-start">‹ Mis eventos</a>
    <div class="card" style="display:flex;flex-direction:column;gap:6px"><span class="peq mut" style="font-weight:700">${esc(diaTxt(e.fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</span><h2 style="margin:0">${esc(e.nombre)}</h2><span class="peq">${esc(e.banda || '')} · ${esc(e.estado_nombre)}</span></div>
    ${e.contrato ? `<div class="card" style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span><b>Contrato · versión ${e.contrato.version}</b><br><span class="peq mut">${e.contrato.estado === 'firmado' ? 'Firmado por ' + esc(e.contrato.firma_nombre || '') : 'Listo para revisar y firmar'}</span></span><a class="btn ${e.contrato.estado === 'enviado' ? 'prim' : ''}" href="#/contrato/${e.contrato.id}">${e.contrato.estado === 'enviado' ? 'Revisar y firmar' : 'Ver contrato'}</a></div>` : '<div class="card mut peq">El contrato todavía no está listo.</div>'}
    <div class="card" style="display:flex;flex-direction:column;gap:8px"><h2 style="margin:0">Pagos</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px" class="peq"><div><span class="mut">Total</span><br><b class="mono">${esc(dinero(e.precio, e.moneda))}</b></div><div><span class="mut">Pagado</span><br><b class="mono" style="color:var(--verde)">${esc(dinero(e.cobrado, e.moneda))}</b></div><div><span class="mut">Falta</span><br><b class="mono" style="color:var(--ambar)">${esc(dinero(e.saldo, e.moneda))}</b></div></div>
      ${e.pagos.map((p) => `<div class="peq" style="display:flex;justify-content:space-between;border-top:1px solid var(--suave);padding-top:6px"><span>${esc(p.tipo)} · ${esc(p.fecha)}</span><b class="mono">${esc(dinero(p.monto, p.moneda))}</b></div>`).join('') || '<span class="mut peq">Todavía no hay pagos registrados.</span>'}</div>
    <form class="card" id="fe" style="display:flex;flex-direction:column;gap:12px"><h2 style="margin:0">Datos del evento</h2>${e.editable ? '<p class="mut peq" style="margin:0">Puede completar o corregir el local, la dirección, las horas y subir el flyer. La oficina ve cada cambio.</p>' : '<div class="aviso adv">Este evento ya no se puede cambiar desde aquí. Escríbale a la oficina.</div>'}
      <label class="campo">Nombre del local (discoteca, salón…)<input name="lugar" value="${esc(e.lugar || '')}" ${e.editable ? '' : 'disabled'}></label>
      ${e.es_us ? `<label class="campo">Calle y número<input name="direccion" value="${esc(e.direccion || '')}" ${e.editable ? '' : 'disabled'}></label><div class="fila"><label class="campo">Ciudad<input name="ciudad" value="${esc(e.ciudad || '')}" ${e.editable ? '' : 'disabled'}></label><label class="campo">Estado<select name="estado_us" ${e.editable ? '' : 'disabled'}><option value="">—</option>${I.estados_us.map((k) => `<option${k === e.estado_us ? ' selected' : ''}>${k}</option>`).join('')}</select></label><label class="campo">ZIP<input name="codigo_postal" inputmode="numeric" value="${esc(e.codigo_postal || '')}" ${e.editable ? '' : 'disabled'}></label></div>`
        : `<label class="campo">Dirección completa<input name="direccion" value="${esc(e.direccion || '')}" ${e.editable ? '' : 'disabled'}></label><label class="campo">Ciudad<input name="ciudad" value="${esc(e.ciudad || '')}" ${e.editable ? '' : 'disabled'}></label>`}
      <div class="fila"><label class="campo">Empieza<input type="time" name="hora_show" value="${esc(e.hora_show || '')}" ${e.editable ? '' : 'disabled'}></label><label class="campo">Termina<input type="time" name="hora_fin" value="${esc(e.hora_fin || '')}" ${e.editable ? '' : 'disabled'}></label></div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${e.flyer_url ? `<img src="${esc(e.flyer_url)}" alt="Flyer del evento" id="fp" style="max-width:160px;max-height:200px;border-radius:10px">` : '<span class="mut peq" id="fp">Sin flyer</span>'}${e.editable ? '<button type="button" class="btn chico" id="sf">Subir el flyer o post</button>' : ''}</div>
      ${e.editable ? '<button class="btn prim">Guardar</button>' : ''}</form>`;
  if (!e.editable) return;
  $('#sf').onclick = async () => { const r = await elegirArchivo('flyer'); if (r) { flyer = r.clave; $('#fp').outerHTML = `<img src="${esc(r.url || '')}" alt="Flyer nuevo" id="fp" style="max-width:160px;max-height:200px;border-radius:10px">`; toast('Flyer listo: toque Guardar'); } };
  $('#fe').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button.prim', ev.target), async () => { const d = Object.fromEntries($$('[name]', ev.target).map((i) => [i.name, i.value])); if (flyer) d.flyer = flyer; const r = await api('cliente/eventos/' + id, { method: 'PUT', body: d }); toast(r.cambios ? 'Guardado. La oficina ya lo ve.' : 'No hubo cambios'); clienteEvento(pc, id, I); }); };
}
async function clienteContrato(pc, id) {
  const k = await api('cliente/contratos/' + id);
  pc.innerHTML = `<a href="#/evento/${k.evento_id}" class="btn chico" style="align-self:flex-start">‹ Volver al evento</a><div class="card" style="padding:12px;overflow:auto">${htmlContrato(k)}</div>
    ${k.estado === 'enviado' ? `<form class="card" id="ff" style="display:flex;flex-direction:column;gap:10px"><h2 style="margin:0">Firmar el contrato</h2>
      <label class="campo">Su nombre completo<input name="nombre" value="${esc(ME.usuario.nombre)}" required autocomplete="name"></label>
      <div><div class="peq" style="font-weight:600;margin-bottom:4px">Dibuje su firma</div><canvas id="cv" width="600" height="180" style="width:100%;height:150px;border:1px dashed var(--borde2);border-radius:10px;background:#fff;touch-action:none" aria-label="Espacio para dibujar la firma"></canvas><button type="button" class="btn chico" id="lim">Borrar y volver a firmar</button></div>
      <label class="chk"><input type="checkbox" name="acepto"> Leí el contrato completo y acepto sus condiciones.</label>
      <button class="btn prim">Firmar</button><p class="mut peq" style="margin:0">Se guarda su firma, la fecha, la hora y una huella del contrato. Si después cambia algo, se crea una versión nueva.</p></form>`
      : `<div class="card"><span class="est ok">Firmado</span> ${k.firma ? `por <b>${esc(k.firma.nombre)}</b> el ${esc(String(k.firma.en).slice(0, 16))} UTC` : ''}<div style="margin-top:8px"><button class="btn" onclick="window.print()">Imprimir o guardar PDF</button></div></div>`}`;
  if (k.estado !== 'enviado') return;
  const cv = $('#cv'), cx = cv.getContext('2d'); let pinto = false, trazos = 0;
  cx.lineWidth = 3; cx.lineCap = 'round'; cx.strokeStyle = '#0F172A';
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
  cv.onpointerdown = (e) => { pinto = true; cv.setPointerCapture(e.pointerId); const [x, y] = pt(e); cx.beginPath(); cx.moveTo(x, y); };
  cv.onpointermove = (e) => { if (!pinto) return; const [x, y] = pt(e); cx.lineTo(x, y); cx.stroke(); trazos++; };
  cv.onpointerup = cv.onpointercancel = () => (pinto = false);
  $('#lim').onclick = () => { cx.clearRect(0, 0, cv.width, cv.height); trazos = 0; };
  $('#ff').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button.prim', ev.target), async () => {
    if (trazos < 8) throw new Error('Dibuje su firma en el recuadro');
    if (!ev.target.acepto.checked) throw new Error('Marque que leyó y acepta el contrato');
    const up = await api('archivos', { method: 'POST', body: { tipo: 'firma', datos: cv.toDataURL('image/png') } });
    await api(`cliente/contratos/${id}/firmar`, { method: 'POST', body: { nombre: ev.target.nombre.value, firma: up.clave, acepto: true } });
    toast('¡Contrato firmado!'); clienteContrato(pc, id); }); };
}
