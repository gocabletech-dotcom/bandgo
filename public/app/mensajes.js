// BandGo · Fase 7 en la app: comunicados (avisos con «Enterado») y chat por banda, evento, gira, directos y grupos.
// El chat se actualiza consultando cada pocos segundos mientras la conversación está abierta.
'use strict';
const ALC_TXT = { todos: 'Todos los integrantes', banda: 'Una banda', evento: 'El equipo de un evento', viaje: 'La delegación de una gira', personas: 'Personas escogidas' };
const TIPO_CANAL = { banda: 'Banda', evento: 'Evento', viaje: 'Gira', directo: 'Directo', grupo: 'Grupo' };
const horaCorta = (s) => { const d = new Date(String(s).replace(' ', 'T') + 'Z'); return d.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' }); };
const diaChat = (s) => { const d = new Date(String(s).replace(' ', 'T') + 'Z'), hoy = new Date(), ay = new Date(Date.now() - 864e5);
  return d.toDateString() === hoy.toDateString() ? 'Hoy' : d.toDateString() === ay.toDateString() ? 'Ayer' : d.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' }); };
const fechaHora = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const textoChat = (t) => esc(t || '').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g, '<br>');

// ---------- insignias de pendientes (menú de la oficina y pestaña del portal) ----------
let relojPend = null;
async function revisarPendientes() {
  if (typeof ME === 'undefined' || !ME || ME.plataforma || !ME.usuario || document.hidden) return;
  try {
    const p = await api('mensajes/pendientes');
    const pon = (sel, n) => $$(sel).forEach((el) => { let b = $('.insignia', el); if (!n) { b?.remove(); return; } if (!b) { b = document.createElement('span'); b.className = 'insignia'; el.append(b); } b.textContent = n > 99 ? '99+' : n; });
    pon('a.lat-i[href="#/chat"]', p.chat);
    pon('.p-tabs a[href="#/mensajes"] .i', p.chat + p.avisos);
  } catch {}
}
function arrancarPendientes() { clearInterval(relojPend); revisarPendientes(); relojPend = setInterval(revisarPendientes, 45000); }
window.addEventListener('hashchange', () => setTimeout(revisarPendientes, 600));
document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarPendientes(); });

// botones «Chat del evento» / «Chat de la gira» en cualquier pantalla
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-abrir-chat]'); if (!b) return;
  e.preventDefault(); const [tipo, ref] = b.dataset.abrirChat.split(':');
  try { const r = await api('chat/canales', { method: 'POST', body: { tipo, ref_id: Number(ref) } }); location.hash = '#/chat/' + r.id; } catch (er) { toast(er.message, true); }
});

// ---------- comunicados (oficina) ----------
async function vComunicados(c, a) {
  if (a && /^\d+$/.test(a)) return fichaComunicado(c, Number(a));
  const L = await api('comunicados');
  c.innerHTML = `<div class="cab"><div><h1>Comunicados</h1><div class="mut">Avisos oficiales a los músicos. Queda quién lo leyó y quién confirmó «Enterado».</div></div>${puede('comunicados.enviar') ? '<div class="acc"><button class="btn prim" id="nc">+ Comunicado</button></div>' : ''}</div>
    <div style="display:flex;flex-direction:column;gap:10px">${L.length ? L.map((x) => `<a class="card" href="#/comunicados/${x.id}" style="display:flex;gap:14px;align-items:flex-start;text-decoration:none;color:inherit;${x.retirado_en ? 'opacity:.55' : ''}">
      <span style="width:42px;height:42px;border-radius:12px;display:grid;place-items:center;flex:none;background:${x.importancia === 'urgente' ? 'var(--rojo-c)' : 'var(--morado-c)'};color:${x.importancia === 'urgente' ? 'var(--rojo)' : '#6A02D4'}">${ico('mega', 20)}</span>
      <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px"><span style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b>${esc(x.titulo)}</b>${x.fijado ? '<span class="tag">Fijado</span>' : ''}${x.importancia === 'urgente' ? '<span class="est mal">Urgente</span>' : ''}${x.retirado_en ? '<span class="est gr">Retirado</span>' : ''}</span>
        <span class="mut peq" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.cuerpo)}</span><span class="peq">${esc(x.alcance_nombre || '')} · ${esc(fechaHora(x.creado))}${x.por ? ' · ' + esc(x.por) : ''}</span></span>
      <span style="text-align:right;flex:none" class="peq"><b class="mono">${x.leidos}/${x.total}</b> leyeron${x.requiere_acuse ? `<br><b class="mono">${x.acuses}/${x.total}</b> enterados` : ''}</span></a>`).join('') : '<div class="card vacio">Todavía no hay comunicados.</div>'}</div>`;
  if ($('#nc')) $('#nc').onclick = () => formComunicado();
}
async function formComunicado() {
  const [B, Ev, V, M] = await Promise.all([puede('bandas.ver') ? api('bandas') : [], api(`calendario?desde=${sumar(hoyISO(), -7)}&hasta=${sumar(hoyISO(), 180)}`).catch(() => ({ eventos: [] })), puede('viajes.ver') ? api('viajes').catch(() => []) : [], api('musicos')]);
  let adj = null;
  const md = modal('Nuevo comunicado', `<label class="campo">Título<input name="titulo" maxlength="120" required placeholder="Cambio de hora de la prueba de sonido"></label>
    <label class="campo">Mensaje<textarea name="cuerpo" rows="6" maxlength="5000" required></textarea></label>
    <div class="fila"><label class="campo">Para<select name="alcance">${Object.entries(ALC_TXT).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
      <label class="campo" data-a="banda" hidden>Banda<select name="banda">${B.filter((b) => b.activa).map((b) => `<option value="${b.id}">${esc(b.nombre)}</option>`).join('')}</select></label>
      <label class="campo" data-a="evento" hidden>Evento<select name="evento">${Ev.eventos.filter((e) => e.estado !== 'cancelado').map((e) => `<option value="${e.id}">${esc(e.fecha + ' · ' + e.nombre)}</option>`).join('')}</select></label>
      <label class="campo" data-a="viaje" hidden>Gira<select name="viaje">${V.map((v) => `<option value="${v.id}">${esc(v.codigo + ' · ' + v.nombre)}</option>`).join('')}</select></label></div>
    <div data-a="personas" hidden style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;max-height:200px;overflow:auto;border:1px solid var(--borde);border-radius:10px;padding:10px">${M.filter((m) => m.activo).map((m) => `<label class="chk"><input type="checkbox" data-p="${m.id}"> ${esc(m.nombre)}</label>`).join('')}</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap"><label class="chk"><input type="checkbox" name="importancia"> Urgente</label><label class="chk"><input type="checkbox" name="requiere_acuse" checked> Pedir «Enterado»</label><label class="chk"><input type="checkbox" name="fijado"> Fijar arriba</label><label class="chk"><input type="checkbox" name="enviar_correo" checked> Mandar también por correo</label></div>
    <div class="subir"><button type="button" class="btn chico" id="adj">${ico('doc')} Adjuntar foto o PDF</button><span class="mut peq" id="adjt">Opcional</span></div>`,
  { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="env">Enviar</button>', ancho: 680 });
  const al = $('[name=alcance]', md.el), ver = () => $$('[data-a]', md.el).forEach((x) => (x.hidden = x.dataset.a !== al.value)); al.onchange = ver; ver();
  $('#adj', md.el).onclick = async () => { const r = await elegirArchivo('adjunto'); if (r) { adj = r.clave; $('#adjt', md.el).textContent = 'Archivo listo'; } };
  $('#env', md.el).onclick = (ev) => trabajando(ev.target, async () => {
    const v = (n) => $(`[name=${n}]`, md.el), a = al.value;
    const body = { titulo: v('titulo').value, cuerpo: v('cuerpo').value, alcance: a, alcance_id: a === 'banda' ? v('banda').value : a === 'evento' ? v('evento').value : a === 'viaje' ? v('viaje').value : null,
      personas: $$('[data-p]', md.el).filter((x) => x.checked).map((x) => Number(x.dataset.p)), importancia: v('importancia').checked ? 'urgente' : 'normal', requiere_acuse: v('requiere_acuse').checked, fijado: v('fijado').checked, enviar_correo: v('enviar_correo').checked, ...(adj ? { archivo: adj } : {}) };
    const r = await api('comunicados', { method: 'POST', body }); md.cerrar();
    avisoEnviado({ ...r, citados: r.destinatarios }, 'Comunicado enviado'); location.hash = '#/comunicados/' + r.id;
  });
}
async function fichaComunicado(c, id) {
  const x = await api('comunicados/' + id);
  const n = x.destinatarios.length, le = x.destinatarios.filter((d) => d.leido_en).length, en = x.destinatarios.filter((d) => d.acuse_en).length;
  c.innerHTML = `<div class="mut peq"><a href="#/comunicados">Comunicados</a></div>
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start"><article class="card" style="flex:999 1 480px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">${x.importancia === 'urgente' ? '<span class="est mal">Urgente</span>' : ''}${x.fijado ? '<span class="tag">Fijado</span>' : ''}${x.retirado_en ? `<span class="est gr">Retirado ${esc(fechaHora(x.retirado_en))}</span>` : ''}<span class="tag gris">${esc(x.alcance_nombre || '')}</span></div>
      <h1>${esc(x.titulo)}</h1><div style="white-space:pre-wrap;line-height:1.6">${esc(x.cuerpo)}</div>${x.archivo_url ? `<a class="btn chico" style="align-self:flex-start" target="_blank" rel="noopener" href="${esc(x.archivo_url)}">Ver adjunto</a>` : ''}
      <div class="mut peq">Enviado ${esc(fechaHora(x.creado))}${x.por ? ' por ' + esc(x.por) : ''}</div>
      ${x.enviar && !x.retirado_en ? `<div style="display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--borde);padding-top:12px"><button class="btn mor" id="rec">Recordar a los que faltan</button><button class="btn" id="fij">${x.fijado ? 'Quitar de arriba' : 'Fijar arriba'}</button><button class="btn peligro" id="ret">Retirar</button></div>` : ''}</article>
      <aside class="card sin" style="flex:1 1 320px"><div class="card-h"><h2>Destinatarios</h2><span class="peq"><b>${le}/${n}</b> leyeron${x.requiere_acuse ? ` · <b>${en}/${n}</b> enterados` : ''}</span></div>
        <div style="height:8px;margin:0 24px 8px;border-radius:99px;background:var(--suave);overflow:hidden"><div style="height:100%;width:${n ? Math.round(((x.requiere_acuse ? en : le) / n) * 100) : 0}%;background:var(--morado)"></div></div>
        ${x.destinatarios.map((d) => `<div style="display:flex;gap:10px;align-items:center;padding:8px 24px;border-top:1px solid var(--suave)">${fotoAv(d.foto_url, d.nombre)}<span style="flex:1"><b>${esc(d.nombre)}</b><br><span class="peq mut">${d.portal ? '' : 'Sin acceso al portal · '}${d.acuse_en ? 'Enterado ' + esc(fechaHora(d.acuse_en)) : d.leido_en ? 'Leído ' + esc(fechaHora(d.leido_en)) : 'Pendiente'}</span></span>
          ${d.acuse_en ? '<span class="est ok">Enterado</span>' : d.leido_en ? `<span class="est ${x.requiere_acuse ? 'adv' : 'ok'}">Leído</span>` : '<span class="est gr">Pendiente</span>'}</div>`).join('')}</aside></div>`;
  if ($('#rec')) $('#rec').onclick = (ev) => trabajando(ev.target, async () => { const r = await api(`comunicados/${id}/recordar`, { method: 'POST' }); avisoEnviado({ ...r, citados: r.pendientes }, 'Recordatorio'); });
  if ($('#fij')) $('#fij').onclick = (ev) => trabajando(ev.target, async () => { await api('comunicados/' + id, { method: 'PUT', body: { fijado: !x.fijado } }); fichaComunicado(c, id); });
  if ($('#ret')) $('#ret').onclick = (ev) => { if (confirm('El comunicado deja de verse en el portal de los músicos. Queda guardado en el historial. ¿Retirar?')) trabajando(ev.target, async () => { await api(`comunicados/${id}/retirar`, { method: 'POST' }); toast('Retirado'); fichaComunicado(c, id); }); };
}

// ---------- chat ----------
let relojChat = null, relojLista = null;
const pararChat = () => { clearInterval(relojChat); clearInterval(relojLista); relojChat = relojLista = null; };
window.addEventListener('hashchange', pararChat);

function htmlLista(L, act, base) {
  return L.length ? L.map((x) => `<a href="${base}${x.id}" class="chat-item${x.id === act ? ' act' : ''}" data-nombre="${esc(x.nombre.toLowerCase())}">
      <span class="chat-av">${x.tipo === 'directo' ? fotoAv(x.foto_url, x.nombre) : `<span class="av" style="background:${x.tipo === 'banda' ? 'var(--morado-c)' : x.tipo === 'evento' ? '#FEF3C7' : x.tipo === 'viaje' ? '#ECFEFF' : 'var(--suave)'};color:var(--tinta)">${ico(x.tipo === 'banda' ? 'band' : x.tipo === 'evento' ? 'star' : x.tipo === 'viaje' ? 'plane' : 'users', 16)}</span>`}</span>
      <span style="flex:1;min-width:0"><span style="display:flex;justify-content:space-between;gap:6px"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.nombre)}</b><span class="peq mut" style="flex:none">${x.ultimo_en ? esc(horaCorta(x.ultimo_en)) : ''}</span></span>
        <span style="display:flex;justify-content:space-between;gap:6px"><span class="peq mut" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.ultimo ? esc(x.ultimo.autor + ': ' + x.ultimo.texto) : esc(TIPO_CANAL[x.tipo]) + (x.solo_oficina ? ' · anuncios' : '')}</span>${x.sin_leer ? `<span class="insignia">${x.sin_leer}</span>` : ''}</span></span></a>`).join('') : '<div class="vacio peq">Todavía no hay conversaciones.</div>';
}
// la conversación abierta: mensajes, envío, respuestas, adjuntos, edición y consultas periódicas
async function abrirConversacion(el, id, { volver } = {}) {
  const D = await api(`chat/canales/${id}/mensajes`);
  const C = D.canal, msgs = new Map(D.mensajes.map((m) => [m.id, m]));
  let ultimo = D.mensajes.reduce((a, m) => Math.max(a, m.id), 0), primero = D.mensajes[0]?.id || 0, mas = D.mas, resp = null, adj = null;
  el.innerHTML = `<header class="chat-cab">${volver ? `<a href="${volver}" class="btn chico" aria-label="Volver">‹</a>` : ''}<span style="flex:1;min-width:0"><b>${esc(C.tipo === 'directo' ? ($('.chat-item.act b')?.textContent || 'Conversación') : C.nombre)}</b><br><span class="peq mut">${esc(TIPO_CANAL[C.tipo])}${D.miembros ? ' · ' + D.miembros.length + ' con acceso al portal' : ''}${C.solo_oficina ? ' · solo la oficina escribe' : ''}</span></span>
      ${C.moderar && C.tipo !== 'directo' ? '<button class="btn chico" id="cfg">Ajustes</button>' : ''}</header>
    <div class="chat-msgs" id="cm" aria-live="polite">${mas ? '<button class="btn chico" id="ant" style="align-self:center">Cargar anteriores</button>' : ''}</div>
    ${C.escribir ? `<div class="chat-resp" id="cr" hidden></div><form class="chat-pie" id="cf"><button type="button" class="btn chico" id="ca" aria-label="Adjuntar foto o PDF">${ico('doc')}</button><textarea id="ct" rows="1" maxlength="2000" placeholder="Escriba un mensaje…" aria-label="Mensaje"></textarea><button class="btn prim" aria-label="Enviar">Enviar</button></form>`
      : `<div class="chat-pie mut peq" style="justify-content:center">${C.archivado ? 'Conversación archivada.' : 'En esta conversación solo escribe la oficina.'}</div>`}`;
  const cm = $('#cm', el);
  const burbuja = (m) => `<div class="msg${m.mio ? ' mio' : ''}" data-id="${m.id}">${m.mio ? '' : `<span class="msg-av">${fotoAv(m.autor.foto_url, m.autor.nombre)}</span>`}<div class="msg-b">
      ${m.mio ? '' : `<div class="msg-n">${esc(m.autor.nombre)}${['dueno', 'admin', 'manager', 'booking'].includes(m.autor.rol) ? ' <span class="tag" style="font-size:10px;padding:0 6px">Oficina</span>' : ''}</div>`}
      ${m.responde_a ? `<div class="msg-cita"><b>${esc(m.responde_a.autor)}</b><br>${m.responde_a.texto == null ? '<i>Mensaje eliminado</i>' : esc(m.responde_a.texto)}</div>` : ''}
      ${m.borrado ? '<i class="mut">Mensaje eliminado</i>' : `${m.archivo_url ? (String(m.archivo_mime).startsWith('image/') ? `<a href="${esc(m.archivo_url)}" target="_blank" rel="noopener"><img src="${esc(m.archivo_url)}" alt="Foto enviada" style="max-width:240px;max-height:240px;border-radius:10px;display:block"></a>` : `<a class="btn chico" href="${esc(m.archivo_url)}" target="_blank" rel="noopener">${ico('doc')} Ver PDF</a>`) : ''}${m.texto ? `<div>${textoChat(m.texto)}</div>` : ''}`}
      <div class="msg-h">${m.editado && !m.borrado ? 'editado · ' : ''}${esc(horaCorta(m.creado))}${!m.borrado ? ` <span class="msg-acc">${C.escribir ? `<button data-r="${m.id}">Responder</button>` : ''}${m.mio && Date.now() - Date.parse(m.creado.replace(' ', 'T') + 'Z') < 14 * 60000 ? `<button data-e="${m.id}">Editar</button>` : ''}${m.mio || C.moderar ? `<button data-b="${m.id}">Borrar</button>` : ''}</span>` : ''}</div></div></div>`;
  const pintar = (bajar) => {
    const lista = [...msgs.values()].sort((a, b) => a.id - b.id); let dia = '';
    const cerca = cm.scrollHeight - cm.scrollTop - cm.clientHeight < 80;
    cm.innerHTML = (mas ? '<button class="btn chico" id="ant" style="align-self:center">Cargar anteriores</button>' : '') + (lista.length ? lista.map((m) => { const d = diaChat(m.creado), sep = d !== dia ? `<div class="chat-dia">${esc(d)}</div>` : ''; dia = d; return sep + burbuja(m); }).join('') : '<div class="vacio peq">Escriba el primer mensaje.</div>');
    if (bajar || cerca) cm.scrollTop = cm.scrollHeight;
    if ($('#ant', cm)) $('#ant', cm).onclick = async () => { const r = await api(`chat/canales/${id}/mensajes?antes=${primero}`); const h = cm.scrollHeight; r.mensajes.forEach((m) => msgs.set(m.id, m)); primero = r.mensajes[0]?.id || primero; mas = r.mas; pintar(); cm.scrollTop = cm.scrollHeight - h; };
    $$('[data-r]', cm).forEach((b) => (b.onclick = () => { resp = msgs.get(Number(b.dataset.r)); const cr = $('#cr', el); cr.hidden = false; cr.innerHTML = `<span>Respondiendo a <b>${esc(resp.autor.nombre)}</b>: ${esc((resp.texto || '').slice(0, 80))}</span><button type="button" class="btn chico" aria-label="Cancelar respuesta">×</button>`; $('button', cr).onclick = () => { resp = null; cr.hidden = true; }; $('#ct', el).focus(); }));
    $$('[data-e]', cm).forEach((b) => (b.onclick = async () => { const m = msgs.get(Number(b.dataset.e)); const t = prompt('Editar mensaje:', m.texto || ''); if (!t || t === m.texto) return; try { await api('chat/mensajes/' + m.id, { method: 'PUT', body: { texto: t } }); m.texto = t; m.editado = true; pintar(); } catch (e) { toast(e.message, true); } }));
    $$('[data-b]', cm).forEach((b) => (b.onclick = async () => { const m = msgs.get(Number(b.dataset.b)); if (!confirm(m.mio ? '¿Borrar su mensaje?' : '¿Ocultar este mensaje? Queda constancia en la bitácora.')) return; try { await api('chat/mensajes/' + m.id, { method: 'DELETE' }); m.borrado = true; m.texto = null; m.archivo_url = null; pintar(); } catch (e) { toast(e.message, true); } }));
  };
  pintar(true);
  const traer = async () => { if (document.hidden) return; try { const r = await api(`chat/canales/${id}/mensajes?despues=${ultimo}`); let nuevos = false; for (const m of r.mensajes) { if (!msgs.has(m.id) || JSON.stringify(msgs.get(m.id)) !== JSON.stringify(m)) nuevos = true; msgs.set(m.id, m); ultimo = Math.max(ultimo, m.id); } if (nuevos) pintar(); } catch {} };
  clearInterval(relojChat); relojChat = setInterval(traer, 4000);
  if (C.escribir) {
    const ta = $('#ct', el);
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
    ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); $('#cf', el).requestSubmit(); } };
    $('#ca', el).onclick = async () => { const r = await elegirArchivo('adjunto'); if (r) { adj = r.clave; $('#ca', el).classList.add('prim'); toast('Archivo listo: escriba algo (opcional) y toque Enviar'); } };
    $('#cf', el).onsubmit = async (e) => { e.preventDefault(); const t = ta.value.trim(); if (!t && !adj) return;
      const b = $('button.prim', e.target); b.disabled = true;
      try { const m = await api(`chat/canales/${id}/mensajes`, { method: 'POST', body: { texto: t, ...(adj ? { archivo: adj } : {}), ...(resp ? { responde_a: resp.id } : {}) } });
        msgs.set(m.id, m); ultimo = Math.max(ultimo, m.id); ta.value = ''; ta.style.height = ''; adj = null; $('#ca', el).classList.remove('prim'); resp = null; $('#cr', el).hidden = true; pintar(true); }
      catch (er) { toast(er.message, true); } finally { b.disabled = false; ta.focus(); } };
  }
  if ($('#cfg', el)) $('#cfg', el).onclick = () => { const md = modal('Ajustes de la conversación', `<label class="campo">Nombre<input name="nombre" value="${esc(C.nombre)}"></label><label class="chk"><input type="checkbox" name="solo_oficina" ${C.solo_oficina ? 'checked' : ''}> Solo la oficina escribe (canal de anuncios)</label><label class="chk"><input type="checkbox" name="archivado" ${C.archivado ? 'checked' : ''}> Archivar (nadie escribe y sale de la lista)</label>`, { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="gc">Guardar</button>' });
    $('#gc', md.el).onclick = (ev) => trabajando(ev.target, async () => { await api('chat/canales/' + id, { method: 'PUT', body: { nombre: $('[name=nombre]', md.el).value, solo_oficina: $('[name=solo_oficina]', md.el).checked, archivado: $('[name=archivado]', md.el).checked } }); md.cerrar(); abrirConversacion(el, id, { volver }); }); };
}
async function nuevoChat(base) {
  const U = await api('chat/contactos');
  const grupo = !ME.portal;
  const md = modal(ME.portal ? 'Escribir a la oficina' : 'Nueva conversación', `${grupo ? '<div class="segm" style="display:flex;gap:6px"><button type="button" class="btn chico prim" data-m="d">Directo</button><button type="button" class="btn chico" data-m="g">Grupo</button></div><label class="campo" id="gn" hidden>Nombre del grupo<input name="nombre" placeholder="Logística gira Florida"></label>' : ''}
    <input id="bq" placeholder="Buscar persona…" style="height:40px;border:1px solid var(--borde2);border-radius:8px;padding:0 10px">
    <div id="lu" style="display:flex;flex-direction:column;gap:4px;max-height:320px;overflow:auto">${U.map((u) => `<label class="chk chat-pers" data-n="${esc(u.nombre.toLowerCase())}" style="padding:6px 4px"><input type="${grupo ? 'checkbox' : 'radio'}" name="u" value="${u.id}"> ${fotoAv(u.foto_url, u.nombre)} ${esc(u.nombre)} <span class="mut peq">${esc(u.instrumento || ({ dueno: 'Artista / propietario', admin: 'Administración', manager: 'Manager', booking: 'Booking', musico: 'Músico', sonidista: 'Sonidista' }[u.rol] || ''))}</span></label>`).join('') || '<span class="mut">No hay personas disponibles.</span>'}</div>`,
  { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="ab">Abrir</button>' });
  let modo = 'd';
  $$('[data-m]', md.el).forEach((b) => (b.onclick = () => { modo = b.dataset.m; $$('[data-m]', md.el).forEach((x) => x.classList.toggle('prim', x === b)); $('#gn', md.el).hidden = modo !== 'g'; }));
  $('#bq', md.el).oninput = (e) => $$('.chat-pers', md.el).forEach((l) => (l.hidden = !l.dataset.n.includes(e.target.value.toLowerCase())));
  $('#ab', md.el).onclick = (ev) => trabajando(ev.target, async () => {
    const sel = $$('[name=u]', md.el).filter((x) => x.checked).map((x) => Number(x.value)); if (!sel.length) throw new Error('Escoja a una persona');
    const r = modo === 'g' ? await api('chat/canales', { method: 'POST', body: { tipo: 'grupo', nombre: $('[name=nombre]', md.el).value, usuarios: sel } }) : await api('chat/canales', { method: 'POST', body: { tipo: 'directo', usuario_id: sel[0] } });
    md.cerrar(); location.hash = base + r.id; });
}
// pantalla del chat de la oficina: lista a la izquierda, conversación a la derecha (en el celular, una a la vez)
async function vChat(c, a) {
  const act = Number(a) || null;
  c.innerHTML = `<div class="chat${act ? ' con-conv' : ''}"><aside class="chat-lista card sin"><div class="chat-lcab"><h2 style="margin:0">Chat</h2><button class="btn chico prim" id="nv">+ Nueva</button></div><input id="fb" placeholder="Buscar…" aria-label="Buscar conversación" style="margin:0 12px 8px;height:38px;border:1px solid var(--borde2);border-radius:8px;padding:0 10px"><div id="ls"></div></aside>
    <section class="chat-conv card sin" id="cv">${act ? '' : '<div class="vacio">Escoja una conversación o empiece una nueva. Las de cada banda ya están creadas; las de un evento o una gira se abren desde su ficha.</div>'}</section></div>`;
  const lista = async () => { const L = await api('chat/canales'); $('#ls').innerHTML = htmlLista(L, act, '#/chat/'); const f = $('#fb').value.toLowerCase(); if (f) $$('.chat-item').forEach((x) => (x.hidden = !x.dataset.nombre.includes(f))); };
  await lista();
  $('#fb').oninput = (e) => $$('.chat-item').forEach((x) => (x.hidden = !x.dataset.nombre.includes(e.target.value.toLowerCase())));
  $('#nv').onclick = () => nuevoChat('#/chat/');
  if (act) await abrirConversacion($('#cv'), act, { volver: '#/chat' });
  relojLista = setInterval(() => { if (!document.hidden) lista().catch(() => {}); }, 15000);
}

// ---------- portal del músico: avisos y chat ----------
async function portalMensajes(pc, a, b) {
  if (a === 'chat' && b) { pc.innerHTML = '<div class="card sin chat-conv solo" id="cv"></div>'; return abrirConversacion($('#cv'), Number(b), { volver: '#/mensajes/chat' }); }
  const sec = a === 'chat' ? 'chat' : 'avisos';
  pc.innerHTML = `<div role="tablist" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#fff;border:1px solid var(--borde);border-radius:12px;padding:4px;box-shadow:0 6px 20px rgba(15,23,42,.08)">${[['avisos', 'Avisos'], ['chat', 'Chat']].map(([k, t]) => `<a href="#/mensajes${k === 'chat' ? '/chat' : ''}" role="tab" style="text-align:center;padding:9px;border-radius:9px;font-weight:600;font-size:14px;text-decoration:none;${sec === k ? 'background:var(--tinta);color:#fff' : 'color:var(--texto2)'}">${t}</a>`).join('')}</div><div id="mz" style="display:flex;flex-direction:column;gap:12px"></div>`;
  const el = $('#mz');
  if (sec === 'chat') {
    const L = await api('chat/canales');
    el.innerHTML = `<div class="card sin">${htmlLista(L, null, '#/mensajes/chat/')}</div><button class="btn bloque" id="nv">Escribir a la oficina</button>`;
    $('#nv').onclick = () => nuevoChat('#/mensajes/chat/');
    return;
  }
  const L = await api('portal/avisos');
  el.innerHTML = L.length ? L.map((x) => `<article class="card" style="display:flex;flex-direction:column;gap:8px;${x.importancia === 'urgente' && !x.acuse_en ? 'border-color:var(--rojo)' : ''}">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${x.importancia === 'urgente' ? '<span class="est mal">Urgente</span>' : ''}${x.fijado ? '<span class="tag">Fijado</span>' : ''}${!x.leido_en ? '<span class="tag">Nuevo</span>' : ''}<span class="peq mut" style="margin-left:auto">${esc(fechaHora(x.creado))}</span></div>
      <b style="font-size:17px">${esc(x.titulo)}</b><div style="white-space:pre-wrap;line-height:1.55">${esc(x.cuerpo)}</div>${x.archivo_url ? `<a class="btn chico" style="align-self:flex-start" target="_blank" rel="noopener" href="${esc(x.archivo_url)}">Ver adjunto</a>` : ''}
      <div class="peq mut">${esc(x.por || 'La oficina')} · ${esc(x.alcance_nombre || '')}</div>
      ${x.requiere_acuse ? (x.acuse_en ? `<span class="est ok">Usted confirmó «Enterado» · ${esc(fechaHora(x.acuse_en))}</span>` : `<button class="btn prim" data-ent="${x.id}">Enterado</button>`) : ''}</article>`).join('') : '<div class="card mut">No tiene avisos.</div>';
  $$('[data-ent]', el).forEach((bt) => (bt.onclick = () => trabajando(bt, async () => { await api(`portal/avisos/${bt.dataset.ent}/enterado`, { method: 'POST' }); toast('Gracias, quedó confirmado'); portalMensajes(pc); revisarPendientes(); })));
  // marcar como leídos los que se mostraron
  const nuevos = L.filter((x) => !x.leido_en);
  if (nuevos.length) { await Promise.all(nuevos.map((x) => api(`portal/avisos/${x.id}/leido`, { method: 'POST' }).catch(() => {}))); revisarPendientes(); }
}
