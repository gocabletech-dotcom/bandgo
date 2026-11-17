// BandGo · Fase 2 en la app: calendario, eventos (expediente), contratos, clientes, ensayos y la agenda del músico.
'use strict';
const ESTADOS = { cotizacion: 'Cotización', negociacion: 'Negociación', pendiente: 'Pendiente de confirmación', confirmado: 'Confirmado', anticipo: 'Anticipo recibido', pendiente_pago: 'Pendiente de pago', realizado: 'Evento realizado', en_cuadre: 'En proceso de cuadre', liquidado: 'Liquidado', cancelado: 'Cancelado' };
const ESTADOS_MAN = Object.keys(ESTADOS).filter((k) => !['en_cuadre', 'liquidado'].includes(k));
const COLOR_EST = { cotizacion: 'gr', negociacion: 'adv', pendiente: 'az', confirmado: 'ok', anticipo: 'ok', pendiente_pago: 'adv', realizado: 'gr', en_cuadre: 'mor', liquidado: 'gr', cancelado: 'mal' };
const EST_CLASE = { ok: 'ok', av: 'adv', adv: 'adv', az: 'gr', gr: 'gr', mor: 'mor', mal: 'mal' };
const estTxt = (e) => `<span class="est ${EST_CLASE[COLOR_EST[e]] || 'gr'}">${esc(ESTADOS[e] || e)}</span>`;
const hoyISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const sumar = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const diaTxt = (d, o = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(d + 'T12:00:00').toLocaleDateString('es-DO', o);
const horaTxt = (a, b) => [a, b].filter(Boolean).join('–');
const CUBRE = [['vuelo', 'Vuelos'], ['hospedaje', 'Hospedaje'], ['transporte', 'Transporte terrestre'], ['dietas', 'Dietas'], ['sonido', 'Sonido y luces']];
const QUIEN = [['', '—'], ['empresa', 'Empresa / artista'], ['cliente', 'Cliente / promotor'], ['booking', 'Booking'], ['otro', 'Otro'], ['no_aplica', 'No aplica']];
const val = (el) => Object.fromEntries($$('[name]', el).filter((i) => i.type !== 'checkbox').map((i) => [i.name, i.value]));

// ventana de conflictos: muestra bloqueos, choques y traslados; si el rol puede, deja autorizar la excepción
function verConflictos(ag, { titulo = 'Revise la agenda', permitir, alAutorizar } = {}) {
  const li = (t, l) => (l.length ? `<div><b>${t}</b><ul class="conf">${l.join('')}</ul></div>` : '');
  const cuerpo = li('Fechas bloqueadas', ag.bloqueos.map((b) => `<li>${esc(b.detalle)} · ${esc(b.desde)} → ${esc(b.hasta)}${b.motivo ? ' · ' + esc(b.motivo) : ''}</li>`))
    + li('Choques de horario', ag.choques.map((c) => `<li><b>${esc(c.musico)}</b> ya está en ${esc(c.titulo)}${c.hora ? ' (' + esc(c.hora) + ')' : ''}</li>`))
    + li('Traslados a revisar', (ag.traslados || []).map((x) => `<li><b>${esc(x.musico)}</b> tiene ${esc(x.titulo)} el ${esc(x.fecha)} en ${esc(x.lugar)}</li>`));
  const m = modal(titulo, cuerpo || '<div class="aviso ok">Sin conflictos.</div>', { pie: `<button class="btn" data-cerrar>Volver</button>${alAutorizar && permitir ? '<button class="btn mor" id="autz">Autorizar excepción y guardar</button>' : ''}` });
  if ($('#autz', m.el)) $('#autz', m.el).onclick = (ev) => trabajando(ev.target, async () => { await alAutorizar(); m.cerrar(); });
  if (alAutorizar && !permitir) $('.modal-c', m.el).insertAdjacentHTML('beforeend', '<div class="aviso adv">Solo un manager o el dueño puede autorizar la excepción.</div>');
}
async function guardarConConflictos(fn) {
  try { return await fn(false); }
  catch (e) {
    if ((e.estado === 409 || e.estado === 403) && e.datos && e.datos.agenda) { verConflictos(e.datos.agenda, { titulo: e.message, permitir: puede('eventos.excepcion'), alAutorizar: () => fn(true) }); return null; }
    throw e;
  }
}
function avisoEnviado(a, titulo = 'Aviso a los músicos') {
  if (!a) return;
  modal(titulo, `<div class="aviso ${a.correos ? 'ok' : 'mor'}">Citados: ${a.citados}. ${a.correos ? `Se mandó correo a ${a.correos}.` : 'Los correos no están activados: los músicos lo ven en su portal.'}</div>
    ${a.whatsapp.length ? `<p class="mut" style="margin:0">Avíseles también por WhatsApp (toque cada uno):</p><div style="display:flex;flex-direction:column;gap:6px">${a.whatsapp.map((w) => `<a class="btn chico" style="justify-content:flex-start" target="_blank" rel="noopener" href="${esc(w.enlace)}">WhatsApp · ${esc(w.nombre)}</a>`).join('')}</div>` : ''}`, { pie: '<button class="btn prim" data-cerrar>Listo</button>' });
}

// ---------- resumen: próximas actividades ----------
async function proximas(el) {
  try {
    const r = await api(`calendario?desde=${hoyISO()}&hasta=${sumar(hoyISO(), 30)}`);
    const L = [...r.eventos.filter((e) => e.estado !== 'cancelado').map((e) => ({ f: e.fecha, h: e.hora_show, t: e.nombre, d: [e.ciudad, e.banda].filter(Boolean).join(' · '), est: estTxt(e.estado), href: '#/eventos/' + e.id })),
      ...r.ensayos.filter((s) => s.estado !== 'cancelado').map((s) => ({ f: s.fecha, h: s.hora_inicio, t: 'Ensayo · ' + s.titulo, d: [s.banda, `${s.van}/${s.citados} confirmados`].filter(Boolean).join(' · '), est: `<span class="est mor">${s.estado === 'borrador' ? 'Borrador' : 'Ensayo'}</span>`, href: '#/ensayos/' + s.id }))]
      .sort((a, b) => (a.f + (a.h || '')).localeCompare(b.f + (b.h || ''))).slice(0, 8);
    el.innerHTML = `<div class="card-h"><h2>Próximas actividades</h2><a href="#/calendario" class="peq">Ver calendario</a></div>${L.length ? `<div class="desliza"><table class="tabla"><tbody>${L.map((x) => `<tr><td class="mono peq" style="white-space:nowrap">${esc(diaTxt(x.f))}${x.h ? '<br>' + esc(x.h) : ''}</td><td><a href="${x.href}" style="color:var(--tinta);text-decoration:none;font-weight:600">${esc(x.t)}</a><div class="mut peq">${esc(x.d)}</div></td><td>${x.est}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Nada en los próximos 30 días.</div>'}`;
  } catch (e) { el.innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`; }
}

// ---------- calendario ----------
async function vCalendario(c, mes) {
  const hoy = hoyISO(), base = /^\d{4}-\d{2}$/.test(mes || '') ? mes : hoy.slice(0, 7);
  const primero = base + '-01', dow = (new Date(primero + 'T12:00:00').getDay() + 6) % 7, ini = sumar(primero, -dow), fin = sumar(ini, 41);
  const B = puede('bandas.ver') ? (await api('bandas')).filter((b) => b.activa) : [];
  let banda = sessionStorage.getItem('bg_cal_banda') || '';
  const pintarCal = async () => {
    const r = await api(`calendario?desde=${ini}&hasta=${fin}${banda ? '&banda=' + banda : ''}`);
    const porDia = {};
    const meter = (f, x) => (porDia[f] = porDia[f] || []).push(x);
    r.eventos.forEach((e) => meter(e.fecha, { k: 'e', o: e, html: `<a class="chip c-${COLOR_EST[e.estado]}" href="#/eventos/${e.id}" title="${esc(e.nombre)}">${esc((e.hora_show ? e.hora_show + ' ' : '') + e.nombre)}</a>` }));
    r.ensayos.forEach((s) => meter(s.fecha, { k: 's', o: s, html: `<a class="chip ${s.estado === 'cancelado' ? 'c-mal' : 'c-mor'}" href="#/ensayos/${s.id}" title="${esc(s.titulo)}">${esc((s.hora_inicio ? s.hora_inicio + ' ' : '') + (s.estado === 'borrador' ? '(borrador) ' : '') + s.titulo)}</a>` }));
    (r.viajes || []).forEach((t) => meter(t.fecha, { k: 'v', o: t, html: `<a class="chip c-via" href="#/viajes/${t.viaje_id || ''}" title="${esc(t.compania || '')}">${esc((t.hora ? t.hora + ' ' : '') + '✈ ' + [t.origen_ciudad || t.origen, t.destino_ciudad || t.destino].filter(Boolean).join('→'))}</a>` }));
    const bloq = (f) => r.bloqueos.filter((b) => b.desde <= f && b.hasta >= f);
    const celdas = Array.from({ length: 42 }, (_, i) => sumar(ini, i));
    $('#calg').innerHTML = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => `<div class="dsem">${d}</div>`).join('') + celdas.map((f) => { const bl = bloq(f);
      return `<div class="dia${f.slice(0, 7) !== base ? ' otro' : ''}${bl.length ? ' bloq' : ''}" data-f="${f}" role="button" tabindex="0" aria-label="${esc(diaTxt(f, { weekday: 'long', day: 'numeric', month: 'long' }))}"><span class="num${f === hoy ? ' hoy' : ''}">${Number(f.slice(8))}</span>
        ${bl.length ? `<span class="chip c-bl">Bloqueo · ${esc(bl.map((b) => b.alcance === 'global' ? 'todos' : b.pais || b.banda || b.musico).join(', '))}</span>` : ''}${(porDia[f] || []).slice(0, 3).map((x) => x.html).join('')}${(porDia[f] || []).length > 3 ? `<span class="peq mut">+${porDia[f].length - 3} más</span>` : ''}</div>`; }).join('');
    const verDia = (f) => {
      $$('#calg .dia').forEach((d) => d.classList.toggle('sel', d.dataset.f === f));
      const items = porDia[f] || [], bl = bloq(f);
      $('#detdia').innerHTML = `<h2>${esc(diaTxt(f, { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>
        ${bl.map((b) => `<div class="aviso adv"><b>Bloqueado</b> · ${esc(b.alcance === 'global' ? 'toda la empresa' : b.pais || b.banda || b.musico)}${b.motivo ? '<br>' + esc(b.motivo) : ''}${puede('bloqueos.editar') ? `<br><button class="btn chico" data-qb="${b.id}" style="margin-top:6px">Habilitar otra vez</button>` : ''}</div>`).join('')}
        ${items.map((x) => x.k === 'v' ? `<a class="card" style="padding:12px 14px;text-decoration:none;color:inherit;border-left:3px solid #0E7490" href="${x.o.viaje_id ? '#/viajes/' + x.o.viaje_id : '#/eventos/' + x.o.evento_id + '/logistica'}"><b>✈ ${esc([x.o.origen_ciudad || x.o.origen, x.o.destino_ciudad || x.o.destino].filter(Boolean).join(' → '))}</b><div class="mut peq">${esc([x.o.hora, x.o.compania, x.o.numero, x.o.viaje].filter(Boolean).join(' · '))}</div></a>`
          : x.k === 'e' ? `<a class="card" style="padding:12px 14px;text-decoration:none;color:inherit" href="#/eventos/${x.o.id}"><b>${esc(x.o.nombre)}</b><div class="mut peq">${esc([horaTxt(x.o.hora_llegada, x.o.hora_fin), x.o.ciudad, x.o.banda].filter(Boolean).join(' · '))}</div><div style="margin-top:6px">${estTxt(x.o.estado)}${x.o.precio != null ? ` <span class="mono peq">${esc(dinero(x.o.precio, x.o.moneda))}</span>` : ''}</div></a>`
          : `<a class="card" style="padding:12px 14px;text-decoration:none;color:inherit" href="#/ensayos/${x.o.id}"><b>Ensayo · ${esc(x.o.titulo)}</b><div class="mut peq">${esc([horaTxt(x.o.hora_inicio, x.o.hora_fin), x.o.lugar, x.o.banda].filter(Boolean).join(' · '))}</div><div style="margin-top:6px"><span class="est mor">${x.o.van}/${x.o.citados} confirmados</span></div></a>`).join('') || (bl.length ? '' : '<p class="mut" style="margin:0">Libre.</p>')}
        <div style="display:flex;gap:8px;flex-wrap:wrap">${puede('eventos.crear') ? `<a class="btn prim chico" href="#/eventos/nuevo/${f}">+ Evento</a>` : ''}${puede('ensayos.editar') ? `<a class="btn chico" href="#/ensayos/nuevo/${f}">+ Ensayo</a>` : ''}${puede('bloqueos.editar') ? `<button class="btn chico" id="blq">Bloquear</button>` : ''}</div>`;
      $$('[data-qb]').forEach((b) => (b.onclick = () => trabajando(b, async () => { await api('bloqueos/' + b.dataset.qb, { method: 'DELETE' }); toast('Fechas habilitadas'); pintarCal(); })));
      if ($('#blq')) $('#blq').onclick = () => bloquear(f, pintarCal);
    };
    $$('#calg .dia').forEach((d) => { d.onclick = (ev) => { if (!ev.target.closest('a')) verDia(d.dataset.f); }; d.onkeydown = (ev) => { if (ev.key === 'Enter') verDia(d.dataset.f); }; });
    verDia(base === hoy.slice(0, 7) ? hoy : primero);
  };
  const ant = new Date(primero + 'T12:00:00'); ant.setMonth(ant.getMonth() - 1); const sig = new Date(primero + 'T12:00:00'); sig.setMonth(sig.getMonth() + 1);
  const ym = (d) => d.toISOString().slice(0, 7);
  c.innerHTML = `<div class="cab"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h1>${esc((() => { const t = new Date(primero + 'T12:00:00').toLocaleDateString('es-DO', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); })())}</h1>
      <a class="btn chico" href="#/calendario/${ym(ant)}" aria-label="Mes anterior">‹</a><a class="btn chico" href="#/calendario/${ym(sig)}" aria-label="Mes siguiente">›</a><a class="btn chico" href="#/calendario">Hoy</a></div>
    <div class="acc"><select id="fb" aria-label="Filtrar banda" style="height:40px;border:1px solid var(--borde2);border-radius:8px;padding:0 10px"><option value="">Todas las bandas</option>${B.map((b) => `<option value="${b.id}"${String(b.id) === banda ? ' selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select>
      ${puede('bloqueos.editar') ? '<button class="btn" id="bq">Bloquear fechas</button>' : ''}${puede('ensayos.editar') ? '<a class="btn" href="#/ensayos/nuevo">+ Ensayo</a>' : ''}${puede('eventos.crear') ? '<a class="btn prim" href="#/eventos/nuevo">+ Evento</a>' : ''}</div></div>
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start"><div class="card sin" style="flex:999 1 640px;min-width:0"><div class="cal" id="calg"></div></div>
      <aside class="card" id="detdia" style="flex:1 1 280px;display:flex;flex-direction:column;gap:10px"></aside></div>
    <div style="display:flex;flex-wrap:wrap;gap:14px" class="peq">${['confirmado', 'negociacion', 'pendiente', 'cotizacion', 'cancelado'].map((k) => `<span class="chip c-${COLOR_EST[k]}" style="display:inline-block">${ESTADOS[k]}</span>`).join('')}<span class="chip c-mor" style="display:inline-block">Ensayo</span><span class="chip c-via" style="display:inline-block">✈ Viaje</span><span class="mut">Rayado = fechas bloqueadas</span></div>`;
  $('#fb').onchange = (e) => { banda = e.target.value; sessionStorage.setItem('bg_cal_banda', banda); pintarCal(); };
  if ($('#bq')) $('#bq').onclick = () => bloquear(hoy, pintarCal);
  await pintarCal();
}
async function bloquear(desde, luego) {
  const [B, M] = await Promise.all([api('bandas'), api('musicos')]);
  const md = modal('Bloquear fechas', `<p class="mut" style="margin:0">Un bloqueo de país no bloquea a las demás bandas en otros países. Se puede autorizar una excepción después.</p>
    <div class="fila"><label class="campo">Desde<input type="date" name="desde" value="${esc(desde)}"></label><label class="campo">Hasta<input type="date" name="hasta" value="${esc(desde)}"></label></div>
    <label class="campo">¿Qué se bloquea?<select name="alcance"><option value="global">Toda la empresa</option><option value="pais">Un país</option><option value="banda">Una banda</option><option value="musico">Un integrante</option></select></label>
    <label class="campo" data-a="pais" hidden>País<input name="pais" placeholder="España"></label>
    <label class="campo" data-a="banda" hidden>Banda<select name="banda_id">${B.filter((b) => b.activa).map((b) => `<option value="${b.id}">${esc(b.nombre)}</option>`).join('')}</select></label>
    <label class="campo" data-a="musico" hidden>Integrante<select name="musico_id">${M.filter((m) => m.activo).map((m) => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('')}</select></label>
    <div class="fila"><label class="campo">Motivo<input name="motivo" placeholder="Exclusividad, vacaciones…"></label><label class="campo">Se cae solo el (opcional)<input type="date" name="vence"></label></div>`, { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="gb">Bloquear</button>' });
  const al = $('[name=alcance]', md.el); al.onchange = () => $$('[data-a]', md.el).forEach((x) => (x.hidden = x.dataset.a !== al.value));
  $('#gb', md.el).onclick = (ev) => trabajando(ev.target, async () => { await api('bloqueos', { method: 'POST', body: val(md.el) }); md.cerrar(); toast('Fechas bloqueadas'); luego && luego(); });
}

// ---------- eventos ----------
async function vEventos(c, a, b) {
  if (a === 'nuevo') return formEvento(c, null, b);
  if (a && /^\d+$/.test(a)) return b === 'editar' ? formEvento(c, await api('eventos/' + a)) : fichaEvento(c, Number(a), b);
  let pas = false, est = '';
  c.innerHTML = `<div class="cab"><h1>Conciertos y eventos</h1><div class="acc">${puede('eventos.crear') ? '<a class="btn prim" href="#/eventos/nuevo">+ Evento</a>' : ''}</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn chico prim" data-p="0">Próximos</button><button class="btn chico" data-p="1">Pasados</button>
      <select id="fe" aria-label="Estado" style="height:32px;border:1px solid var(--borde2);border-radius:8px;padding:0 8px"><option value="">Todos los estados</option>${Object.entries(ESTADOS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
    <div class="card sin" id="le"></div>`;
  const cargar = async () => { const r = await api(`eventos?pasados=${pas ? 1 : 0}${est ? '&estado=' + est : ''}`);
    $('#le').innerHTML = r.eventos.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Fecha</th><th>Evento</th><th>Cliente</th><th>Banda</th><th>Booking</th><th>Precio</th><th>Estado</th></tr></thead><tbody>${r.eventos.map((e) => `<tr><td class="mono peq" style="white-space:nowrap">${esc(diaTxt(e.fecha))}</td><td><a href="#/eventos/${e.id}" style="color:var(--tinta);font-weight:600;text-decoration:none">${esc(e.nombre)}</a><div class="mut peq">${esc(e.codigo)} · ${e.tipo === 'publico' ? 'Público' : 'Privado'}${e.ciudad ? ' · ' + esc(e.ciudad) : ''}</div></td><td>${esc(e.cliente || '—')}</td><td>${e.banda ? `<span class="tag">${esc(e.banda)}</span>` : '—'}</td><td class="peq">${esc(e.booking || '—')}</td><td class="mono">${e.precio != null ? esc(dinero(e.precio, e.moneda)) : '<span class="mut">—</span>'}</td><td>${estTxt(e.estado)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">No hay eventos aquí.</div>'; };
  $$('[data-p]').forEach((bt) => (bt.onclick = () => { pas = bt.dataset.p === '1'; $$('[data-p]').forEach((x) => x.classList.toggle('prim', x === bt)); cargar(); }));
  $('#fe').onchange = (e) => { est = e.target.value; cargar(); };
  await cargar();
}
async function formEvento(c, e, fechaIni) {
  if (!puede(e ? 'eventos.editar' : 'eventos.crear') || (e && !e.puede_editar)) { c.innerHTML = '<div class="aviso mal">No puede editar este evento.</div>'; return; }
  const [B, CL, U] = await Promise.all([api('bandas'), puede('clientes.ver') ? api('clientes') : [], puede('usuarios.ver') ? api('usuarios') : { usuarios: [] }]);
  const resp = U.usuarios.filter((u) => u.activo && ['dueno', 'admin', 'manager', 'booking'].includes(u.rol));
  const sel = (n, ops, v) => `<select name="${n}"><option value="">—</option>${ops.map(([k, t]) => `<option value="${k}"${String(v ?? '') === String(k) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const cu = e?.cubre || {};
  c.innerHTML = `<div class="cab"><div><div class="mut peq"><a href="#/eventos">Eventos</a> /</div><h1>${e ? 'Editar ' + esc(e.codigo) : 'Nueva contratación'}</h1></div></div>
    <form class="card" id="f" style="display:flex;flex-direction:column;gap:16px;max-width:980px">
      <div class="fila3"><label class="campo" style="grid-column:span 2">Nombre del evento<input name="nombre" required value="${esc(e?.nombre || '')}" placeholder="Gala aniversario, festival…"></label>
        <label class="campo">Tipo<select name="tipo"><option value="privado">Privado</option><option value="publico"${e?.tipo === 'publico' ? ' selected' : ''}>Público</option></select></label></div>
      <div class="fila3"><label class="campo">Fecha<input type="date" name="fecha" required value="${esc(e?.fecha || fechaIni || '')}"></label>
        <label class="campo">Estado<select name="estado">${ESTADOS_MAN.map((k) => `<option value="${k}"${(e?.estado || 'cotizacion') === k ? ' selected' : ''}>${ESTADOS[k]}</option>`).join('')}</select></label>
        <label class="campo">Banda${sel('banda_id', B.filter((b) => b.activa).map((b) => [b.id, b.nombre]), e?.banda_id)}<small>${e ? 'El equipo se cambia en la pestaña Equipo.' : 'Se asignan sus integrantes.'}</small></label></div>
      <div class="fila3"><label class="campo">Cliente${sel('cliente_id', CL.filter((x) => x.activo).map((x) => [x.id, x.nombre]), e?.cliente_id)}${puede('clientes.editar') ? '<small><a href="#" id="nc">+ Cliente nuevo</a></small>' : ''}</label>
        <label class="campo">Booking${ME.rol === 'booking' ? `<input disabled value="${esc(e?.booking || ME.usuario.nombre)}">` : sel('booking_id', resp.map((u) => [u.id, u.nombre]), e?.booking_id)}</label>
        <label class="campo">Manager${sel('manager_id', resp.filter((u) => u.rol !== 'booking').map((u) => [u.id, u.nombre]), e?.manager_id)}</label></div>
      <div class="fila3"><label class="campo">Lugar<input name="lugar" value="${esc(e?.lugar || '')}"></label><label class="campo">Ciudad<input name="ciudad" value="${esc(e?.ciudad || '')}"></label><label class="campo">País<input name="pais" list="paises" value="${esc(e?.pais || '')}"><datalist id="paises"><option>República Dominicana</option><option>Estados Unidos</option><option>Puerto Rico</option><option>España</option></datalist></label></div>
      <label class="campo">Dirección<input name="direccion" value="${esc(e?.direccion || '')}"></label>
      <div class="grid4" style="grid-template-columns:repeat(5,minmax(0,1fr))">${[['hora_llegada', 'Llegada'], ['hora_montaje', 'Montaje'], ['hora_soundcheck', 'Sound check'], ['hora_show', 'Presentación'], ['hora_fin', 'Final']].map(([k, t]) => `<label class="campo">${t}<input type="time" name="${k}" value="${esc(e?.[k] || '')}"></label>`).join('')}</div>
      ${!e || e.montos ? `<div class="fila3"><label class="campo">Precio contratado<input name="precio" inputmode="decimal" value="${e?.precio ?? ''}"><small>El contrato crea versiones con el precio final.</small></label><label class="campo">Moneda<select name="moneda">${['USD', 'DOP', 'EUR'].map((m) => `<option${(e?.moneda || (/(dominicana|^rd$)/i.test(e?.pais || '') ? 'DOP' : /espa/i.test(e?.pais || '') ? 'EUR' : ME.empresa.moneda_base)) === m ? ' selected' : ''}>${m}</option>`).join('')}</select><small>RD: DOP · EE. UU. y América: USD · Europa: EUR</small></label><span></span></div>` : ''}
      <div class="campo">¿Quién cubre cada cosa?<div class="desliza"><table class="tabla" style="font-weight:400"><tbody>${CUBRE.map(([k, t]) => `<tr><td style="padding-left:0">${t}</td><td><select data-cq="${k}" aria-label="${t}: quién paga" style="height:36px;border:1px solid var(--borde2);border-radius:8px;padding:0 8px">${QUIEN.map(([v, x]) => `<option value="${v}"${cu[k]?.quien === v ? ' selected' : ''}>${x}</option>`).join('')}</select></td><td style="padding-right:0"><input data-cf="${k}" placeholder="Pago directo, reembolso…" value="${esc(cu[k]?.forma || '')}" aria-label="${t}: forma" style="height:36px;border:1px solid var(--borde2);border-radius:8px;padding:0 8px;width:100%"></td></tr>`).join('')}</tbody></table></div></div>
      <label class="campo">Notas operativas<textarea name="notas" rows="3">${esc(e?.notas || '')}</textarea></label>
      <div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="btn" id="rev">Revisar disponibilidad</button><a class="btn" href="#/eventos${e ? '/' + e.id : ''}">Cancelar</a><button class="btn prim">Guardar</button></div></form>`;
  const datos = () => { const d = val($('#f')); d.cubre = Object.fromEntries(CUBRE.map(([k]) => [k, { quien: $(`[data-cq=${k}]`).value, forma: $(`[data-cf=${k}]`).value }]).filter(([, v]) => v.quien)); if (ME.rol === 'booking') delete d.booking_id; return d; };
  if ($('#nc')) $('#nc').onclick = (ev) => { ev.preventDefault(); formCliente(null, (id, nombre) => { const s = $('[name=cliente_id]'); s.insertAdjacentHTML('beforeend', `<option value="${id}" selected>${esc(nombre)}</option>`); }); };
  $('#rev').onclick = (ev) => trabajando(ev.target, async () => { const d = datos(); const ag = await api('disponibilidad', { method: 'POST', body: { fecha: d.fecha, inicio: d.hora_llegada || d.hora_soundcheck || d.hora_show, fin: d.hora_fin, banda_id: d.banda_id, pais: d.pais, evento_id: e?.id } }); verConflictos(ag, { titulo: 'Disponibilidad ' + d.fecha }); });
  $('#f').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button.prim', ev.target), () => guardarConConflictos(async (excepcion) => {
    const d = { ...datos(), excepcion };
    const r = e ? await api('eventos/' + e.id, { method: 'PUT', body: d }) : await api('eventos', { method: 'POST', body: d });
    toast('Guardado'); location.hash = '#/eventos/' + (e ? e.id : r.id); return r;
  })); };
}
async function fichaEvento(c, id, pest) {
  const e = await api('eventos/' + id);
  const finVer = puede('finanzas.ver') || (e.booking_id === ME.usuario.id);
  const tabs = [['resumen', 'Resumen'], ['equipo', `Equipo · ${e.equipo.length}`], ...(e.contratos ? [['contrato', 'Contrato']] : []), ...(finVer ? [['finanzas', 'Finanzas']] : []), ...(puede('nomina.ver') || finVer ? [['nomina', 'Nómina']] : []), ...(finVer ? [['cuadre', 'Cuadre']] : []), ...(puede('viajes.ver') ? [['logistica', 'Logística']] : []), ...(puede('rider.ver') || e.puede_editar ? [['tecnico', 'Técnico']] : []), ['historial', 'Historial']];
  const act = tabs.some((t) => t[0] === pest) ? pest : 'resumen';
  const ag = e.agenda, problemas = ag.bloqueos.length + ag.choques.length + ag.traslados.length;
  c.innerHTML = `<div class="mut peq"><a href="#/eventos">Eventos</a> / ${esc(e.codigo)}</div>
    <div class="card" style="display:flex;flex-wrap:wrap;gap:18px;align-items:center"><div style="flex:1;min-width:260px;display:flex;flex-direction:column;gap:6px"><h1>${esc(e.nombre)}</h1>
      <div class="mut">${esc(diaTxt(e.fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))} · ${esc([e.lugar, e.ciudad, e.pais].filter(Boolean).join(', '))} · ${e.tipo === 'publico' ? 'Público' : 'Privado'}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${estTxt(e.estado)}${e.banda ? `<span class="tag">${esc(e.banda)}</span>` : ''}${e.booking ? `<span class="tag gris">Booking: ${esc(e.booking)}</span>` : ''}${e.manager ? `<span class="tag gris">Manager: ${esc(e.manager)}</span>` : ''}</div></div>
      <div class="acc no-print" style="display:flex;gap:8px;flex-wrap:wrap">${e.puede_editar && !['en_cuadre', 'liquidado'].includes(e.estado) ? `<select id="cest" aria-label="Cambiar estado" style="height:40px;border:1px solid var(--borde2);border-radius:8px;padding:0 10px">${ESTADOS_MAN.map((k) => `<option value="${k}"${e.estado === k ? ' selected' : ''}>${ESTADOS[k]}</option>`).join('')}</select><a class="btn" href="#/eventos/${id}/editar">Editar</a>` : ''}</div></div>
    ${problemas ? `<div class="aviso adv" style="cursor:pointer" id="vag"><b>Agenda:</b> ${ag.bloqueos.length ? ag.bloqueos.length + ' bloqueo(s) · ' : ''}${ag.choques.length ? ag.choques.length + ' choque(s) · ' : ''}${ag.traslados.length ? ag.traslados.length + ' traslado(s) a revisar · ' : ''}ver detalle</div>` : ''}
    <div class="pestanas" role="tablist">${tabs.map(([k, t]) => `<button role="tab" class="${k === act ? 'act' : ''}" data-t="${k}">${esc(t)}</button>`).join('')}</div><div id="pc"></div>`;
  $$('.pestanas button').forEach((bt) => (bt.onclick = () => { location.hash = `#/eventos/${id}/${bt.dataset.t}`; }));
  if ($('#vag')) $('#vag').onclick = () => verConflictos(ag, { titulo: 'Agenda de este evento' });
  if ($('#cest')) $('#cest').onchange = (ev) => trabajando(null, async () => { await api('eventos/' + id, { method: 'PUT', body: { estado: ev.target.value } }); toast('Estado: ' + ESTADOS[ev.target.value]); fichaEvento(c, id, act); });
  const pc = $('#pc');
  if (act === 'resumen') {
    const hs = [['Llegada', e.hora_llegada], ['Montaje', e.hora_montaje], ['Sound check', e.hora_soundcheck], ['Presentación', e.hora_show], ['Final', e.hora_fin]].filter((x) => x[1]);
    const ultimo = e.contratos && e.contratos.find((x) => x.estado !== 'anulado');
    pc.innerHTML = `<div class="grid3"><div class="card"><h2>Horario${e.zona_horaria ? ` <span class="mut peq">(${esc(e.zona_horaria)})</span>` : ''}</h2><div class="horario" style="margin-top:12px">${hs.map(([t, h]) => `<div><b>${esc(h)}</b>${esc(t)}</div>`).join('') || '<span class="mut">Sin horario todavía.</span>'}</div></div>
      <div class="card"><h2>Cliente</h2>${e.cliente ? `<p style="margin:10px 0 0"><a href="#/clientes/${e.cliente_id}" style="font-weight:600">${esc(e.cliente)}</a></p>` : '<p class="mut">Sin cliente.</p>'}${e.direccion ? `<p class="mut peq">${esc(e.direccion)}</p>` : ''}</div>
      <div class="card" style="background:var(--tinta);color:#fff;border-color:var(--tinta)"><h2>Dinero del evento</h2>${e.montos ? `<div style="font-family:var(--f-tit);font-size:30px;font-weight:700;margin-top:10px;color:#C77DFF">${e.precio != null ? esc(dinero(e.precio, e.moneda)) : '—'}</div><div class="peq" style="color:#CBD5E1;margin-top:6px">${ultimo ? `Contrato v${ultimo.version} · ${esc(ultimo.estado)}${ultimo.anticipo ? ' · anticipo ' + esc(dinero(ultimo.anticipo, ultimo.moneda)) : ''}` : 'Sin contrato todavía'}</div><div class="peq" style="color:#94A3B8;margin-top:10px">Cobros, gastos y cuadre: Fase 3.</div>` : '<p style="color:#CBD5E1">Su rol no ve los importes de este evento.</p>'}</div></div>
      <div class="grid2"><div class="card"><h2>¿Quién cubre cada cosa?</h2><table class="tabla" style="margin-top:8px"><tbody>${CUBRE.map(([k, t]) => `<tr><td style="padding-left:0">${t}</td><td>${esc((QUIEN.find((q) => q[0] === e.cubre[k]?.quien) || ['', '—'])[1])}</td><td class="mut peq" style="padding-right:0">${esc(e.cubre[k]?.forma || '')}</td></tr>`).join('')}</tbody></table></div>
      <div class="card"><h2>Notas</h2><p style="white-space:pre-line;margin:8px 0 0" class="${e.notas ? '' : 'mut'}">${esc(e.notas || 'Sin notas.')}</p></div></div>`;
  }
  if (act === 'equipo') {
    pc.innerHTML = `<div class="card sin"><div class="card-h"><h2>Integrantes asignados</h2>${e.puede_editar ? '<button class="btn prim chico" id="ceq">Cambiar equipo</button>' : ''}</div>
      ${e.equipo.length ? `<div class="desliza"><table class="tabla"><tbody>${e.equipo.map((m) => `<tr><td><a href="#/integrantes/${m.id}" style="display:flex;gap:10px;align-items:center;color:var(--tinta);text-decoration:none">${fotoAv(m.foto_url, m.nombre)}<span><b>${esc(m.nombre)}</b><br><span class="mut peq">${esc(m.instrumento || m.tipo)}</span></span></a></td><td>${esc(m.funcion || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Nadie asignado todavía.</div>'}</div>`;
    if ($('#ceq')) $('#ceq').onclick = async () => {
      const M = (await api('musicos')).filter((m) => m.activo), en = new Map(e.equipo.map((m) => [m.id, m]));
      const md = modal('Equipo del evento', `<div style="display:flex;flex-direction:column;gap:8px;max-height:56vh;overflow:auto">${M.map((m) => `<label style="display:grid;grid-template-columns:auto auto 1fr 150px;gap:10px;align-items:center;padding:8px;border:1px solid var(--borde);border-radius:10px"><input type="checkbox" data-id="${m.id}" ${en.has(m.id) ? 'checked' : ''}>${fotoAv(m.foto_url, m.nombre)}<span><b>${esc(m.nombre)}</b><br><span class="mut peq">${esc(m.instrumento || '')} ${m.bandas.map((b) => '· ' + b.nombre).join(' ')}</span></span><input data-f="${m.id}" placeholder="Función / sustituto" value="${esc(en.get(m.id)?.funcion || '')}" style="height:36px;border:1px solid var(--borde2);border-radius:8px;padding:0 8px"></label>`).join('')}</div>`, { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="geq">Guardar</button>', ancho: 720 });
      $('#geq', md.el).onclick = (ev) => trabajando(ev.target, () => guardarConConflictos(async (excepcion) => { await api(`eventos/${id}/equipo`, { method: 'PUT', body: { excepcion, musicos: $$('input[data-id]:checked', md.el).map((i) => ({ id: Number(i.dataset.id), funcion: $(`[data-f="${i.dataset.id}"]`, md.el).value })) } }); md.cerrar(); toast('Equipo guardado'); fichaEvento(c, id, 'equipo'); return true; }));
    };
  }
  if (act === 'contrato') {
    const puedeHacer = puede('contratos.editar') && e.puede_editar && e.montos;
    pc.innerHTML = `<div class="card sin"><div class="card-h"><div><h2>Contrato</h2><div class="mut peq">Cada cambio crea una versión nueva. Las anteriores quedan guardadas.</div></div>${puedeHacer ? '<button class="btn prim chico" id="nv">Nueva versión</button>' : ''}</div>
      ${e.contratos.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Versión</th><th>Precio</th><th>Anticipo</th><th>Estado</th><th>Hecha por</th><th></th></tr></thead><tbody>${e.contratos.map((k) => `<tr style="${k.estado === 'anulado' ? 'opacity:.55' : ''}"><td><b>v${k.version}</b><div class="mut peq">${esc(fechaTxt(k.creado))}</div></td><td class="mono">${esc(dinero(k.precio, k.moneda))}</td><td class="mono">${k.anticipo != null ? esc(dinero(k.anticipo, k.moneda)) : '—'}</td><td><span class="est ${k.estado === 'firmado' ? 'ok' : k.estado === 'anulado' ? 'mal' : k.estado === 'enviado' ? 'mor' : 'gr'}">${esc(k.estado)}</span></td><td class="peq">${esc(k.por || '')}</td>
        <td style="white-space:nowrap"><a class="btn chico" href="#/contrato/${k.id}">Ver / PDF</a>${k.firmado_url ? ` <a class="btn chico" target="_blank" rel="noopener" href="${esc(k.firmado_url)}">Firmado</a>` : ''}${puedeHacer && ['borrador', 'enviado'].includes(k.estado) ? `${k.estado === 'borrador' ? ` <button class="btn chico" data-env="${k.id}">Marcar enviado</button>` : ''} <button class="btn chico mor" data-fir="${k.id}">Marcar firmado</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Todavía no hay contrato.</div>'}</div>`;
    if ($('#nv')) $('#nv').onclick = () => { const u = e.contratos.find((x) => x.estado !== 'anulado');
      const md = modal('Nueva versión del contrato', `<div class="fila3"><label class="campo">Precio<input name="precio" inputmode="decimal" value="${u?.precio ?? e.precio ?? ''}"></label><label class="campo">Moneda<select name="moneda">${['USD', 'DOP', 'EUR'].map((m) => `<option${(u?.moneda || e.moneda) === m ? ' selected' : ''}>${m}</option>`).join('')}</select></label><label class="campo">Anticipo<input name="anticipo" inputmode="decimal" value="${u?.anticipo ?? ''}"></label></div>
        <div class="fila"><label class="campo">Anticipo antes del<input type="date" name="anticipo_vence"></label><label class="campo">Saldo antes del<input type="date" name="saldo_vence" value="${esc(e.fecha)}"></label></div>
        <label class="campo">Condiciones especiales<textarea name="condiciones" rows="6" placeholder="Duración de las tandas, cancelación, exclusividad, rider técnico…"></textarea></label>
        ${e.cliente ? '' : '<div class="aviso adv">Agregue primero el cliente al evento (Editar).</div>'}`, { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="gv">Crear versión</button>', ancho: 680 });
      $('#gv', md.el).onclick = (ev) => trabajando(ev.target, async () => { const r = await api(`eventos/${id}/contratos`, { method: 'POST', body: val(md.el) }); md.cerrar(); toast('Contrato v' + r.version + ' creado'); fichaEvento(c, id, 'contrato'); }); };
    $$('[data-env]').forEach((b) => (b.onclick = () => trabajando(b, async () => { await api(`contratos/${b.dataset.env}/estado`, { method: 'PUT', body: { estado: 'enviado' } }); fichaEvento(c, id, 'contrato'); })));
    $$('[data-fir]').forEach((b) => (b.onclick = () => { let archivo = null;
      const md = modal('Contrato firmado', `<p style="margin:0">Adjunte el contrato firmado (foto o PDF). Al marcarlo firmado, el evento pasa a <b>Confirmado</b>.</p><div class="subir"><button type="button" class="btn chico" id="sa">Subir contrato firmado</button><span class="mut peq" id="sat">Opcional, pero recomendado</span></div>`, { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn mor" id="gf">Marcar firmado</button>' });
      $('#sa', md.el).onclick = async () => { const r = await elegirArchivo('documento'); if (r) { archivo = r.clave; $('#sat', md.el).textContent = 'Archivo listo'; } };
      $('#gf', md.el).onclick = (ev) => trabajando(ev.target, async () => { await api(`contratos/${b.dataset.fir}/estado`, { method: 'PUT', body: { estado: 'firmado', archivo } }); md.cerrar(); toast('Contrato firmado'); fichaEvento(c, id, 'contrato'); }); }));
  }
  if (act === 'finanzas') return tabFinanzas(pc, e);
  if (act === 'nomina') return tabNomina(pc, e);
  if (act === 'cuadre') return tabCuadre(pc, e);
  if (act === 'logistica') return tabLogistica(pc, e);
  if (act === 'tecnico') return tabTecnico(pc, e);
  if (act === 'historial') pc.innerHTML = `<div class="card sin"><div class="desliza"><table class="tabla"><tbody>${e.historial.map((h) => `<tr><td class="mono peq" style="white-space:nowrap">${esc(new Date(h.creado.replace(' ', 'T') + 'Z').toLocaleString('es-DO'))}</td><td>${esc(h.por || '')}</td><td>${esc(h.cambio)}</td></tr>`).join('') || '<tr><td class="vacio">Sin cambios.</td></tr>'}</tbody></table></div></div>`;
}
// hoja del contrato para imprimir o guardar como PDF
async function vContrato(c, id) {
  const k = await api('contratos/' + id), D = k.datos, ev = D.evento, cl = D.cliente;
  const filas = (L) => L.filter((x) => x[1]).map(([t, v]) => `<tr><td style="width:34%;color:#64748B">${t}</td><td><b>${esc(v)}</b></td></tr>`).join('');
  c.innerHTML = `<div class="cab no-print"><div class="mut peq"><a href="#/eventos/${k.evento_id}/contrato">Volver al evento</a></div><div class="acc"><button class="btn prim" onclick="window.print()">Imprimir o guardar PDF</button></div></div>
    <div class="contrato-hoja">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:2px solid #0F172A;padding-bottom:14px">
        <div style="display:flex;gap:12px;align-items:center">${D.empresa.logo_url ? `<img src="${esc(D.empresa.logo_url)}" alt="" style="height:56px;max-width:140px;object-fit:contain">` : ''}<div><b style="font-size:18px">${esc(D.empresa.nombre)}</b><div style="color:#64748B;font-size:12px">${esc([D.empresa.telefono, D.empresa.email].filter(Boolean).join(' · '))}</div></div></div>
        <div style="text-align:right">${D.banda?.logo_url ? `<img src="${esc(D.banda.logo_url)}" alt="" style="height:44px;max-width:120px;object-fit:contain"><br>` : ''}<span style="font-family:var(--f-mono);font-size:12px">${esc(ev.codigo)} · v${k.version}${k.estado === 'anulado' ? ' · ANULADO' : ''}</span></div></div>
      <h1 style="margin:20px 0 4px">Contrato de presentación artística</h1><p style="color:#64748B;margin:0 0 18px">Versión ${k.version} · ${esc(fechaTxt(k.creado))}</p>
      <h3>Contratante</h3><table>${filas([['Nombre', cl.nombre], ['Nombre comercial', cl.nombre_comercial], ['Identificación fiscal', cl.fiscal], ['Dirección', [cl.direccion, cl.ciudad, cl.pais].filter(Boolean).join(', ')], ['Teléfono', cl.telefono], ['Correo', cl.email], ['Persona que contrata', cl.contacto]])}</table>
      <h3 style="margin-top:18px">Presentación</h3><table>${filas([['Evento', ev.nombre], ['Agrupación', D.banda?.nombre], ['Tipo', ev.tipo === 'publico' ? 'Público' : 'Privado'], ['Fecha', diaTxt(ev.fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })], ['Lugar', [ev.lugar, ev.direccion, ev.ciudad, ev.pais].filter(Boolean).join(', ')], ['Llegada', ev.hora_llegada], ['Sound check', ev.hora_soundcheck], ['Presentación', ev.hora_show], ['Final', ev.hora_fin]])}</table>
      <h3 style="margin-top:18px">Honorarios</h3><table>${filas([['Precio total', dinero(k.precio, k.moneda)], ['Anticipo', k.anticipo != null ? dinero(k.anticipo, k.moneda) + (k.anticipo_vence ? ' antes del ' + fechaTxt(k.anticipo_vence) : '') : null], ['Saldo', k.anticipo != null ? dinero(k.precio - k.anticipo, k.moneda) + (k.saldo_vence ? ' antes del ' + fechaTxt(k.saldo_vence) : '') : null]])}</table>
      ${Object.keys(ev.cubre || {}).length ? `<h3 style="margin-top:18px">Logística a cargo de cada parte</h3><table>${filas(CUBRE.filter(([x]) => ev.cubre[x]).map(([x, t]) => [t, (QUIEN.find((q) => q[0] === ev.cubre[x].quien) || ['', ''])[1] + (ev.cubre[x].forma ? ' · ' + ev.cubre[x].forma : '')]))}</table>` : ''}
      ${k.condiciones ? `<h3 style="margin-top:18px">Condiciones</h3><p style="white-space:pre-line">${esc(k.condiciones)}</p>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:64px"><div style="border-top:1px solid #0F172A;padding-top:6px;text-align:center">Por ${esc(D.empresa.nombre)}</div><div style="border-top:1px solid #0F172A;padding-top:6px;text-align:center">Por ${esc(cl.nombre)}</div></div>
      <p style="color:#94A3B8;font-size:11px;margin-top:28px">Generado con BandGo · ${esc(ev.codigo)} versión ${k.version}. Cualquier cambio crea una nueva versión.</p></div>`;
}

// ---------- clientes ----------
function formCliente(cl, alGuardar) {
  const v = (k) => esc(cl?.[k] || '');
  const md = modal(cl ? 'Editar cliente' : 'Cliente nuevo', `<div class="fila"><label class="campo">Nombre (persona o empresa)<input name="nombre" value="${v('nombre')}" required></label><label class="campo">Nombre comercial<input name="nombre_comercial" value="${v('nombre_comercial')}"></label></div>
    <div class="fila3"><label class="campo">Tipo<select name="tipo"><option value="empresa">Empresa</option><option value="persona"${cl?.tipo === 'persona' ? ' selected' : ''}>Persona</option></select></label><label class="campo">Teléfono<input name="telefono" value="${v('telefono')}"></label><label class="campo">WhatsApp<input name="whatsapp" value="${v('whatsapp')}"></label></div>
    <div class="fila"><label class="campo">Correo<input type="email" name="email" value="${v('email')}"></label><label class="campo">RNC / identificación fiscal<input name="fiscal" value="${v('fiscal')}"></label></div>
    <div class="fila3"><label class="campo">País<input name="pais" value="${v('pais')}"></label><label class="campo">Ciudad<input name="ciudad" value="${v('ciudad')}"></label><label class="campo">Dirección<input name="direccion" value="${v('direccion')}"></label></div>
    <div class="fila"><label class="campo">Persona que contrata / contacto el día<input name="contacto_nombre" value="${v('contacto_nombre')}"></label><label class="campo">Teléfono del contacto<input name="contacto_telefono" value="${v('contacto_telefono')}"></label></div>
    <label class="campo">Notas<textarea name="notas" rows="2">${v('notas')}</textarea></label>`, { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="gc">Guardar</button>', ancho: 760 });
  $('#gc', md.el).onclick = (ev) => trabajando(ev.target, async () => { const d = val(md.el); const r = cl ? await api('clientes/' + cl.id, { method: 'PUT', body: d }) : await api('clientes', { method: 'POST', body: d }); md.cerrar(); toast('Cliente guardado'); alGuardar && alGuardar(cl ? cl.id : r.id, d.nombre); });
}
async function vClientes(c, a) {
  if (a && /^\d+$/.test(a)) {
    const cl = await api('clientes/' + a);
    c.innerHTML = `<div class="cab"><div><div class="mut peq"><a href="#/clientes">Clientes</a> /</div><h1>${esc(cl.nombre)}</h1><div class="mut">${esc([cl.nombre_comercial, cl.fiscal].filter(Boolean).join(' · '))}</div></div><div class="acc">${puede('clientes.editar') ? '<button class="btn" id="ec">Editar</button>' : ''}${puede('eventos.crear') ? '<a class="btn prim" href="#/eventos/nuevo">+ Evento</a>' : ''}</div></div>
      <div class="card" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px">${[['Teléfono', cl.telefono], ['WhatsApp', cl.whatsapp], ['Correo', cl.email], ['Dirección', [cl.direccion, cl.ciudad, cl.pais].filter(Boolean).join(', ')], ['Contacto', [cl.contacto_nombre, cl.contacto_telefono].filter(Boolean).join(' · ')], ['Notas', cl.notas]].map(([t, v]) => `<div><div class="mut peq">${t}</div><b>${esc(v || '—')}</b></div>`).join('')}</div>
      <div class="card sin"><div class="card-h"><h2>Historial de contrataciones · ${cl.eventos.length}</h2></div>${cl.eventos.length ? `<div class="desliza"><table class="tabla"><tbody>${cl.eventos.map((e) => `<tr><td class="mono peq">${esc(e.fecha)}</td><td><a href="#/eventos/${e.id}">${esc(e.nombre)}</a></td><td>${esc(e.banda || '')}</td><td class="mono">${e.precio != null ? esc(dinero(e.precio, e.moneda)) : '—'}</td><td>${estTxt(e.estado)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Sin eventos.</div>'}</div>`;
    if ($('#ec')) $('#ec').onclick = () => formCliente(cl, () => vClientes(c, a));
    return;
  }
  const L = await api('clientes');
  c.innerHTML = `<div class="cab"><h1>Clientes</h1><div class="acc">${puede('clientes.editar') ? '<button class="btn prim" id="nc">+ Cliente</button>' : ''}</div></div>
    <div class="card sin">${L.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Cliente</th><th>Contacto</th><th>Lugar</th><th>Eventos</th><th>Último</th></tr></thead><tbody>${L.map((x) => `<tr style="${x.activo ? '' : 'opacity:.55'}"><td><a href="#/clientes/${x.id}" style="color:var(--tinta);font-weight:600;text-decoration:none">${esc(x.nombre)}</a><div class="mut peq">${esc(x.nombre_comercial || '')}</div></td><td class="peq">${esc([x.telefono, x.email].filter(Boolean).join(' · '))}</td><td class="peq">${esc([x.ciudad, x.pais].filter(Boolean).join(', '))}</td><td>${x.eventos}</td><td class="mono peq">${esc(x.ultimo || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Todavía no hay clientes.</div>'}</div>`;
  if ($('#nc')) $('#nc').onclick = () => formCliente(null, () => vClientes(c));
}

// ---------- ensayos ----------
async function vEnsayos(c, a, b) {
  if (a === 'nuevo') return formEnsayo(c, null, b);
  if (a && /^\d+$/.test(a)) return b === 'editar' ? formEnsayo(c, await api('ensayos/' + a)) : fichaEnsayo(c, Number(a));
  let pas = false;
  c.innerHTML = `<div class="cab"><h1>Ensayos</h1><div class="acc">${puede('ensayos.editar') ? '<a class="btn prim" href="#/ensayos/nuevo">+ Ensayo</a>' : ''}</div></div>
    <div style="display:flex;gap:8px"><button class="btn chico prim" data-p="0">Próximos</button><button class="btn chico" data-p="1">Pasados</button></div><div class="card sin" id="ls"></div>`;
  const cargar = async () => { const L = await api('ensayos?pasados=' + (pas ? 1 : 0));
    $('#ls').innerHTML = L.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Fecha</th><th>Ensayo</th><th>Banda</th><th>Asistencia</th><th>Estado</th></tr></thead><tbody>${L.map((s) => `<tr><td class="mono peq" style="white-space:nowrap">${esc(diaTxt(s.fecha))}<br>${esc(horaTxt(s.hora_inicio, s.hora_fin))}</td><td><a href="#/ensayos/${s.id}" style="color:var(--tinta);font-weight:600;text-decoration:none">${esc(s.titulo)}</a><div class="mut peq">${esc(s.lugar || '')}${s.serie ? ' · semanal' : ''}</div></td><td>${s.banda ? `<span class="tag">${esc(s.banda)}</span>` : '—'}</td>
      <td class="peq"><span class="est ok">${s.van} van</span> · <span class="est mal">${s.no_van} no</span> · <span class="est adv">${s.talvez} tal vez</span> · <span class="est gr">${s.pendientes} sin responder</span></td><td><span class="est ${s.estado === 'publicado' ? 'mor' : s.estado === 'cancelado' ? 'mal' : 'gr'}">${s.estado === 'publicado' ? 'Publicado' : s.estado === 'cancelado' ? 'Cancelado' : 'Borrador'}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">No hay ensayos aquí.</div>'; };
  $$('[data-p]').forEach((bt) => (bt.onclick = () => { pas = bt.dataset.p === '1'; $$('[data-p]').forEach((x) => x.classList.toggle('prim', x === bt)); cargar(); }));
  await cargar();
}
async function formEnsayo(c, s, fechaIni) {
  if (!puede('ensayos.editar')) { c.innerHTML = '<div class="aviso mal">Su rol no crea ensayos.</div>'; return; }
  const [B, M] = await Promise.all([api('bandas'), api('musicos')]);
  const activos = M.filter((m) => m.activo);
  let citados = new Set(s ? s.citados.map((m) => m.id) : []);
  const rep = s ? s.repertorio.map((x) => ({ ...x })) : [];
  c.innerHTML = `<div class="cab"><div><div class="mut peq"><a href="#/ensayos">Ensayos</a> /</div><h1>${s ? 'Editar ensayo' : 'Nuevo ensayo'}</h1></div></div>
    <form id="f" style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start"><div class="card" style="flex:999 1 560px;min-width:0;display:flex;flex-direction:column;gap:16px">
      <div class="fila"><label class="campo">Banda<select name="banda_id" ${s ? 'disabled' : ''}><option value="">—</option>${B.filter((b) => b.activa).map((b) => `<option value="${b.id}"${s?.banda_id === b.id ? ' selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select></label><label class="campo">Título<input name="titulo" required value="${esc(s?.titulo || 'Ensayo general')}"></label></div>
      <div class="fila3"><label class="campo">Fecha<input type="date" name="fecha" required value="${esc(s?.fecha || fechaIni || '')}"></label><label class="campo">Inicio<input type="time" name="hora_inicio" value="${esc(s?.hora_inicio || '19:00')}"></label><label class="campo">Fin<input type="time" name="hora_fin" value="${esc(s?.hora_fin || '22:00')}"></label></div>
      <div class="fila"><label class="campo">Lugar<input name="lugar" value="${esc(s?.lugar || '')}"></label><label class="campo">Dirección<input name="direccion" value="${esc(s?.direccion || '')}"></label></div>
      ${s ? '' : '<div class="aviso mor" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label class="chk"><input type="checkbox" id="rep"> Repetir cada semana</label><span>durante</span><select id="sem" style="height:34px;border:1px solid var(--borde2);border-radius:8px">' + [2, 4, 6, 8, 12].map((n) => `<option>${n}</option>`).join('') + '</select><span>semanas</span></div>'}
      <div class="campo"><div style="display:flex;justify-content:space-between;align-items:center">Integrantes citados <span class="mut peq" id="nc"></span></div><div class="grid3" id="cit" style="font-weight:500"></div></div>
      <div class="campo">Repertorio<div id="rp" style="display:flex;flex-direction:column;gap:8px"></div><div><button type="button" class="btn chico" id="addr">+ Canción</button></div></div>
      <label class="campo">Nota para los músicos<textarea name="notas" rows="2">${esc(s?.notas || '')}</textarea></label></div>
      <aside class="card" style="flex:1 1 280px;display:flex;flex-direction:column;gap:12px"><h2>${s ? 'Guardar cambios' : 'Guardar'}</h2>
        ${s ? (s.estado === 'publicado' ? '<p class="mut" style="margin:0">Ya está publicado: si cambia la fecha, la hora o el lugar, se avisa otra vez a los músicos.</p>' : '') : `<label class="chk"><input type="checkbox" id="pub" ${puede('ensayos.publicar') ? '' : 'disabled'}> Publicar y avisar ahora</label><p class="mut peq" style="margin:0">Si no, queda en borrador y los músicos todavía no lo ven.</p>`}
        <button class="btn prim bloque">${s ? 'Guardar' : 'Crear ensayo'}</button><a class="btn" href="#/ensayos${s ? '/' + s.id : ''}">Cancelar</a></aside></form>`;
  const pintarCit = () => { $('#cit').innerHTML = activos.map((m) => `<label class="chk" style="padding:8px 10px;border:1px solid var(--borde);border-radius:10px"><input type="checkbox" value="${m.id}" ${citados.has(m.id) ? 'checked' : ''}>${fotoAv(m.foto_url, m.nombre)}<span>${esc(m.nombre)}<br><span class="mut peq">${esc(m.instrumento || '')}</span></span></label>`).join('') || '<span class="mut">No hay integrantes.</span>'; $('#nc').textContent = citados.size + ' citados';
    $$('#cit input').forEach((i) => (i.onchange = () => { i.checked ? citados.add(Number(i.value)) : citados.delete(Number(i.value)); $('#nc').textContent = citados.size + ' citados'; })); };
  const pintarRep = () => { $('#rp').innerHTML = rep.map((x, i) => `<div style="display:grid;grid-template-columns:28px 1fr 1fr 1fr auto;gap:8px;align-items:center"><b class="mut">${i + 1}</b><input data-i="${i}" data-k="titulo" placeholder="Canción" value="${esc(x.titulo || '')}" style="height:38px;border:1px solid var(--borde2);border-radius:8px;padding:0 8px"><input data-i="${i}" data-k="detalle" placeholder="Tono, duración…" value="${esc(x.detalle || '')}" style="height:38px;border:1px solid var(--borde2);border-radius:8px;padding:0 8px"><input data-i="${i}" data-k="enlace" placeholder="Enlace (audio, video, partitura)" value="${esc(x.enlace || '')}" style="height:38px;border:1px solid var(--borde2);border-radius:8px;padding:0 8px"><button type="button" class="btn chico" data-q="${i}" aria-label="Quitar">×</button></div>`).join('');
    $$('#rp input').forEach((i) => (i.oninput = () => (rep[i.dataset.i][i.dataset.k] = i.value))); $$('#rp [data-q]').forEach((bt) => (bt.onclick = () => { rep.splice(Number(bt.dataset.q), 1); pintarRep(); })); };
  $('#addr').onclick = () => { rep.push({ titulo: '' }); pintarRep(); };
  const sb = $('[name=banda_id]'); if (!s) sb.onchange = () => { const id = Number(sb.value); citados = new Set(activos.filter((m) => m.bandas.some((b) => b.id === id)).map((m) => m.id)); pintarCit(); };
  pintarCit(); pintarRep();
  $('#f').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button.prim', ev.target), async () => {
    const d = { ...val(ev.target), citados: [...citados], repertorio: rep.filter((x) => x.titulo) };
    if (s) { delete d.banda_id; const r = await api('ensayos/' + s.id, { method: 'PUT', body: d }); toast('Guardado'); if (r.aviso) avisoEnviado(r.aviso, 'Se avisó del cambio'); location.hash = '#/ensayos/' + s.id; return; }
    if ($('#rep').checked) d.repetir_semanas = Number($('#sem').value);
    const r = await api('ensayos', { method: 'POST', body: d });
    if (r.advertencias.length) verConflictos({ bloqueos: r.advertencias.flatMap((x) => x.bloqueos), choques: r.advertencias.flatMap((x) => x.choques.map((ch) => ({ ...ch, titulo: ch.titulo + ' (' + x.fecha + ')' }))), traslados: [] }, { titulo: 'Ensayo creado, pero revise estos choques' });
    if ($('#pub').checked) { const p = await api(`ensayos/${r.ids[0]}/publicar`, { method: 'POST', body: { serie: true } }); avisoEnviado(p.aviso, `Publicado (${p.publicados})`); }
    else toast(r.ids.length > 1 ? `${r.ids.length} ensayos creados en borrador` : 'Ensayo creado en borrador');
    location.hash = '#/ensayos/' + r.ids[0];
  }); };
}
async function fichaEnsayo(c, id) {
  const s = await api('ensayos/' + id);
  const cuenta = (r) => s.citados.filter((m) => m.respuesta === r).length;
  const R = { voy: ['ok', 'Voy'], no: ['mal', 'No voy'], talvez: ['adv', 'Tal vez'], pendiente: ['gr', 'Sin responder'] };
  const ed = puede('ensayos.editar') && s.estado !== 'cancelado';
  c.innerHTML = `<div class="mut peq"><a href="#/ensayos">Ensayos</a> /</div>
    <div class="card" style="display:flex;flex-wrap:wrap;gap:16px;align-items:center"><div style="flex:1;min-width:260px"><h1>${esc(s.titulo)}</h1><div class="mut" style="margin-top:4px">${esc(diaTxt(s.fecha, { weekday: 'long', day: 'numeric', month: 'long' }))} · ${esc(horaTxt(s.hora_inicio, s.hora_fin))}${s.lugar ? ' · ' + esc(s.lugar) : ''}</div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><span class="est ${s.estado === 'publicado' ? 'mor' : s.estado === 'cancelado' ? 'mal' : 'gr'}">${s.estado === 'publicado' ? 'Publicado' : s.estado === 'cancelado' ? 'Cancelado' : 'Borrador (los músicos no lo ven)'}</span>${s.banda ? `<span class="tag">${esc(s.banda)}</span>` : ''}${s.serie.length > 1 ? `<span class="tag gris">Serie de ${s.serie.length} semanas</span>` : ''}</div></div>
      <div class="acc" style="display:flex;gap:8px;flex-wrap:wrap">${ed ? `<a class="btn" href="#/ensayos/${id}/editar">Editar</a><button class="btn peligro" id="can">Cancelar ensayo</button>` : ''}${s.estado === 'borrador' && puede('ensayos.publicar') ? `<button class="btn mor" id="pub">Publicar y avisar${s.serie.length > 1 ? ' (toda la serie)' : ''}</button>` : ''}${s.estado === 'publicado' && puede('ensayos.publicar') && cuenta('pendiente') ? `<button class="btn" id="rec">Recordar a los ${cuenta('pendiente')} que faltan</button>` : ''}</div></div>
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start"><div class="card sin" style="flex:999 1 560px;min-width:0"><div class="card-h"><h2>Asistencia</h2><div style="display:flex;gap:12px;flex-wrap:wrap" class="peq">${Object.entries(R).map(([k, [cl, t]]) => `<span class="est ${cl}">${cuenta(k)} ${t}</span>`).join('')}</div></div>
      <div class="desliza"><table class="tabla"><thead><tr><th>Integrante</th><th>Respuesta</th><th>Motivo</th>${ed ? '<th>¿Llegó?</th>' : ''}</tr></thead><tbody>${s.citados.map((m) => `<tr><td><span style="display:flex;gap:10px;align-items:center">${fotoAv(m.foto_url, m.nombre)}<span><b>${esc(m.nombre)}</b><br><span class="mut peq">${esc(m.instrumento || '')}</span></span></span></td><td><span class="est ${R[m.respuesta][0]}">${R[m.respuesta][1]}</span></td><td class="peq">${esc(m.motivo || '')}</td>${ed ? `<td><select data-as="${m.id}" aria-label="Asistencia de ${esc(m.nombre)}" style="height:32px;border:1px solid var(--borde2);border-radius:8px"><option value="">—</option><option value="1"${m.asistio === 1 ? ' selected' : ''}>Llegó</option><option value="0"${m.asistio === 0 ? ' selected' : ''}>No llegó</option></select></td>` : ''}</tr>`).join('') || '<tr><td class="vacio">Nadie citado.</td></tr>'}</tbody></table></div></div>
      <aside style="flex:1 1 300px;display:flex;flex-direction:column;gap:14px"><div class="card"><h2>Repertorio</h2>${s.repertorio.length ? `<ol style="margin:10px 0 0;padding-left:20px;line-height:1.7">${s.repertorio.map((x) => `<li><b>${esc(x.titulo)}</b>${x.detalle ? ` <span class="mut">· ${esc(x.detalle)}</span>` : ''}${x.enlace ? ` · <a href="${esc(x.enlace)}" target="_blank" rel="noopener">abrir</a>` : ''}</li>`).join('')}</ol>` : '<p class="mut" style="margin:8px 0 0">Sin repertorio.</p>'}</div>
        ${s.notas ? `<div class="card"><h2>Nota</h2><p style="white-space:pre-line;margin:8px 0 0">${esc(s.notas)}</p></div>` : ''}
        ${s.serie.length > 1 ? `<div class="card"><h2>Fechas de la serie</h2><div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${s.serie.map((x) => `<a href="#/ensayos/${x.id}" class="peq" style="${x.id === id ? 'font-weight:700' : ''}">${esc(diaTxt(x.fecha))} · ${esc(x.estado)}</a>`).join('')}</div></div>` : ''}</aside></div>`;
  if ($('#pub')) $('#pub').onclick = (ev) => trabajando(ev.target, async () => { const r = await api(`ensayos/${id}/publicar`, { method: 'POST', body: { serie: true } }); avisoEnviado(r.aviso, `Publicado (${r.publicados})`); fichaEnsayo(c, id); });
  if ($('#rec')) $('#rec').onclick = (ev) => trabajando(ev.target, async () => { const r = await api(`ensayos/${id}/recordar`, { method: 'POST' }); avisoEnviado(r.aviso, 'Recordatorio'); });
  if ($('#can')) $('#can').onclick = (ev) => { if (confirm('¿Cancelar este ensayo? Se avisa a los músicos.')) trabajando(ev.target, async () => { const r = await api(`ensayos/${id}/cancelar`, { method: 'POST' }); if (r.aviso) avisoEnviado(r.aviso, 'Ensayo cancelado'); fichaEnsayo(c, id); }); };
  $$('[data-as]').forEach((sl) => (sl.onchange = async () => { try { await api(`ensayos/${id}/asistencia`, { method: 'PUT', body: { musico_id: Number(sl.dataset.as), asistio: sl.value === '' ? null : sl.value === '1' } }); toast('Asistencia anotada'); } catch (e) { falla(e); } }));
}

// ---------- portal del músico: agenda ----------
async function portalProximo(el) {
  try {
    const A = await api('portal/agenda'), hoy = hoyISO();
    const pend = A.ensayos.filter((s) => s.estado === 'publicado' && s.respuesta === 'pendiente' && s.fecha >= hoy);
    const prox = [...A.eventos.map((e) => ({ f: e.fecha, h: e.hora_llegada || e.hora_show, t: e.nombre, d: [e.lugar, e.ciudad].filter(Boolean).join(', '), k: 'e' })), ...A.ensayos.filter((s) => s.estado === 'publicado').map((s) => ({ f: s.fecha, h: s.hora_inicio, t: 'Ensayo · ' + s.titulo, d: s.lugar, k: 's' }))].filter((x) => x.f >= hoy).sort((a, b) => (a.f + (a.h || '')).localeCompare(b.f + (b.h || '')));
    el.innerHTML = `${pend.map((s) => `<a href="#/agenda" class="aviso mor" style="display:block;text-decoration:none"><b>Ensayo ${esc(diaTxt(s.fecha))} · ${esc(s.hora_inicio || '')}</b><br>${esc(s.titulo)} · ¿Va a ir? Toque para confirmar</a>`).join('')}
      ${prox[0] ? `<div class="card" style="margin-top:12px"><div class="peq mut" style="font-weight:700;letter-spacing:1px">PRÓXIMA ACTIVIDAD</div><div style="font-family:var(--f-tit);font-size:20px;font-weight:700;margin-top:6px">${esc(prox[0].t)}</div><div class="mut" style="margin-top:4px">${esc(diaTxt(prox[0].f, { weekday: 'long', day: 'numeric', month: 'long' }))}${prox[0].h ? ' · ' + esc(prox[0].h) : ''}<br>${esc(prox[0].d || '')}</div><a href="#/agenda" class="btn chico" style="margin-top:10px">Ver mi agenda</a></div>` : '<div class="card mut" style="margin-top:12px">No tiene actividades próximas.</div>'}`;
  } catch (e) { el.innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`; }
}
async function portalAgenda(pc) {
  const A = await api('portal/agenda'), hoy = hoyISO();
  const L = [...A.eventos.map((e) => ({ ...e, k: 'e', orden: e.fecha + (e.hora_llegada || e.hora_show || '') })), ...A.ensayos.map((s) => ({ ...s, k: 's', orden: s.fecha + (s.hora_inicio || '') }))].filter((x) => x.fecha >= hoy).sort((a, b) => a.orden.localeCompare(b.orden));
  const RC = { voy: ['#047857', '#ECFDF5'], talvez: ['#B45309', '#FFFBEB'], no: ['#B91C1C', '#FEF2F2'] };
  pc.innerHTML = L.length ? L.map((x) => x.k === 'e'
    ? `<div class="card" style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between;gap:8px"><span class="peq mut" style="font-weight:700">${esc(diaTxt(x.fecha, { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase())}</span>${estTxt(x.estado)}</div><b style="font-size:16px">${esc(x.nombre)}</b><div class="mut peq">${esc([x.lugar, x.direccion, x.ciudad, x.pais].filter(Boolean).join(', '))}</div>
        <div class="horario" style="gap:4px;margin-top:4px">${[['Llegada', x.hora_llegada], ['Sound check', x.hora_soundcheck], ['Presentación', x.hora_show]].filter((h) => h[1]).map(([t, h]) => `<div><b>${esc(h)}</b>${t}</div>`).join('')}</div>${x.banda ? `<span class="tag" style="align-self:flex-start">${esc(x.banda)}</span>` : ''}</div>`
    : `<div class="card" style="display:flex;flex-direction:column;gap:8px;${x.estado === 'cancelado' ? 'opacity:.6' : ''}"><div style="display:flex;justify-content:space-between;gap:8px"><span class="peq" style="font-weight:700;color:#6A02D4">ENSAYO · ${esc(diaTxt(x.fecha, { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase())}</span>${x.estado === 'cancelado' ? '<span class="est mal">Cancelado</span>' : ''}</div><b style="font-size:16px">${esc(x.titulo)}</b><div class="mut peq">${esc(horaTxt(x.hora_inicio, x.hora_fin))}${x.lugar ? ' · ' + esc(x.lugar) : ''}${x.direccion ? ' · ' + esc(x.direccion) : ''}</div>
        ${x.notas ? `<div class="peq" style="background:var(--fondo);padding:8px 10px;border-radius:8px">«${esc(x.notas)}»</div>` : ''}${x.repertorio.length ? `<details><summary class="peq" style="cursor:pointer;font-weight:600">Repertorio (${x.repertorio.length})</summary><ol class="peq" style="padding-left:18px;margin:6px 0 0">${x.repertorio.map((r) => `<li>${esc(r.titulo)}${r.detalle ? ' · ' + esc(r.detalle) : ''}${r.enlace ? ` · <a href="${esc(r.enlace)}" target="_blank" rel="noopener">abrir</a>` : ''}</li>`).join('')}</ol></details>` : ''}
        ${x.estado === 'publicado' ? `<div class="resp" data-e="${x.id}">${[['voy', 'Voy'], ['talvez', 'Tal vez'], ['no', 'No voy']].map(([k, t]) => `<button type="button" data-r="${k}" aria-pressed="${x.respuesta === k}" style="border-color:${RC[k][0]};background:${x.respuesta === k ? RC[k][0] : RC[k][1]};color:${x.respuesta === k ? '#fff' : RC[k][0]}">${t}</button>`).join('')}</div>${x.motivo ? `<div class="peq mut">Su motivo: ${esc(x.motivo)}</div>` : ''}` : ''}</div>`).join('') : '<div class="card mut">No tiene presentaciones ni ensayos próximos.</div>';
  $$('.resp').forEach((g) => $$('button', g).forEach((bt) => (bt.onclick = async () => {
    let motivo = null;
    if (bt.dataset.r !== 'voy') { motivo = prompt('Cuéntele a la oficina el motivo:'); if (!motivo) return; }
    try { await api(`portal/ensayos/${g.dataset.e}/responder`, { method: 'POST', body: { respuesta: bt.dataset.r, motivo } }); toast('Respuesta enviada. La oficina ya la ve.'); portalAgenda(pc); } catch (e) { falla(e); }
  })));
}
