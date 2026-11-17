// BandGo · Fase 4 en la app: giras y viajes, traslados, hoteles, actividades, itinerario consolidado y «mi itinerario» del músico.
'use strict';
const TIPOS_T = { vuelo: 'Vuelo', autobus: 'Autobús', tren: 'Tren', privado: 'Vehículo privado', alquilado: 'Vehículo alquilado', otro: 'Otro' };
const EST_VIAJE = { planificando: ['gr', 'Planificando'], confirmado: ['ok', 'Confirmada'], en_curso: ['mor', 'En curso'], terminado: ['gr', 'Terminada'], cancelado: ['mal', 'Cancelada'] };
const CUBRE_T = { empresa: 'Empresa / artista', cliente: 'Cliente / promotor', booking: 'Booking', otro: 'Otro' };
const PARA_T = { todos: 'Toda la delegación', tecnico: 'Solo sonidistas y técnicos', oficina: 'Solo la oficina' };
const ZONAS = ['America/Santo_Domingo', 'America/Puerto_Rico', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Mexico_City', 'America/Panama', 'America/Bogota', 'America/Lima', 'America/Caracas',
  'America/Guatemala', 'America/Costa_Rica', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo', 'Europe/Madrid', 'Europe/London', 'Europe/Paris', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Zurich'];
const zonaTxt = (z) => (z ? 'hora de ' + z.split('/').pop().replace(/_/g, ' ') : '');
const zonaSel = (n, v) => `<select name="${n}"><option value="">—</option>${ZONAS.map((z) => `<option value="${z}"${z === v ? ' selected' : ''}>${esc(z.split('/').pop().replace(/_/g, ' '))}</option>`).join('')}</select>`;
const durTxt = (m) => (m == null ? '' : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`);
const mapa = (q) => (q ? `<a class="peq" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}">Ver en el mapa</a>` : '');
const optsV = (o, v) => Object.entries(o).map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('');
const v$ = (v) => (v == null ? '' : esc(v));

// ---------- itinerario por días (lo usan la oficina y el portal) ----------
function htmlItinerario(dias, { oficina = false, editar = false } = {}) {
  if (!dias.length) return '<div class="card vacio">Todavía no hay nada en el itinerario.</div>';
  const fila = (i) => {
    const lin = [];
    let icono = 'check', titulo = esc(i.titulo), horaV = i.hora || '';
    if (i.tipo === 'tramo') {
      icono = i.subtipo === 'vuelo' ? 'plane' : 'map';
      lin.push(`<b>Sale</b> ${esc(i.sale.lugar || '')}${i.sale.terminal ? ' · terminal ' + esc(i.sale.terminal) : ''}${i.tz ? ` <span class="mut">(${esc(zonaTxt(i.tz))})</span>` : ''}`);
      lin.push(`<b>Llega</b> ${i.llega.hora ? esc(i.llega.hora) + ' ' : ''}${i.llega.fecha !== i.fecha ? '(' + esc(diaTxt(i.llega.fecha)) + ') ' : ''}${esc(i.llega.lugar || '')}${i.llega.tz ? ` <span class="mut">(${esc(zonaTxt(i.llega.tz))})</span>` : ''}${i.duracion ? ` · ${durTxt(i.duracion)}` : ''}`);
      const d = [i.compania, i.numero, i.reserva ? 'Reserva ' + i.reserva : null, i.asiento ? 'Asiento ' + i.asiento : null].filter(Boolean);
      if (d.length) lin.push(esc(d.join(' · ')));
      if (i.equipaje) lin.push('Equipaje: ' + esc(i.equipaje));
    } else if (i.tipo === 'hotel_entrada' || i.tipo === 'hotel_salida') {
      icono = 'home';
      lin.push(esc(i.lugar || '') + ' ' + mapa(i.lugar || i.nombre));
      const d = [i.reserva ? 'Reserva ' + i.reserva : null, i.habitacion ? 'Habitación ' + i.habitacion : null, i.telefono ? 'Tel. ' + i.telefono : null, i.tipo === 'hotel_entrada' ? `Hasta el ${diaTxt(i.salida)}` : null].filter(Boolean);
      if (d.length) lin.push(esc(d.join(' · ')));
    } else if (i.tipo === 'evento') {
      icono = 'star';
      lin.push(`${esc(i.lugar || '')} ${mapa(i.lugar)}${i.hora_fin ? ' · termina ' + esc(i.hora_fin) : ''}`);
    } else {
      lin.push([esc(i.lugar || ''), mapa(i.lugar)].filter(Boolean).join(' ') + (i.hora_fin ? ' · hasta ' + esc(i.hora_fin) : ''));
      if (i.para !== 'todos') titulo += ` <span class="tag ${i.para === 'oficina' ? 'gris' : ''}">${esc(PARA_T[i.para])}</span>`;
    }
    if (i.notas) lin.push(`<span class="mut">«${esc(i.notas)}»</span>`);
    if (i.contacto) lin.push('Contacto: ' + esc(i.contacto));
    if (oficina) {
      if (i.contacto_privado) lin.push(`<span style="color:#6A02D4">Privado: ${esc(i.contacto_privado)}</span>`);
      if (Array.isArray(i.personas) && i.personas.length && i.tipo !== 'hotel_salida') lin.push(`<span class="mut">${i.tipo === 'tramo' ? 'Pasajeros' : 'Huéspedes'}: ${esc(i.personas.map((p) => p.nombre.split(' ')[0] + (p.asiento ? ' ' + p.asiento : p.habitacion ? ' (' + p.habitacion + ')' : '')).join(', '))}</span>`);
      if (i.costo != null && i.tipo !== 'hotel_salida') lin.push(`<span class="mono peq">${esc(dinero(i.costo, i.moneda))}${i.cubierto_por ? ' · paga ' + esc(CUBRE_T[i.cubierto_por]) : ''}${i.movimiento_id ? ' · <span class="est ok">gasto registrado</span>' : ''}</span>`);
      if (i.evento && i.tipo !== 'evento') lin.push(`<a class="peq" href="#/eventos/${i.evento_id}/logistica">${esc(i.evento)}</a>`);
    }
    const ed = editar && i.tipo !== 'evento' && i.tipo !== 'hotel_salida' ? `<button class="btn chico" data-ed="${i.tipo === 'tramo' ? 't' : i.tipo === 'actividad' ? 'a' : 'h'}:${i.id}">Cambiar</button>` : '';
    const arch = i.archivo_url && i.tipo !== 'hotel_salida' ? `<a class="btn chico" target="_blank" rel="noopener" href="${esc(i.archivo_url)}">${i.tipo === 'tramo' ? 'Boleto' : 'Reserva'}</a>` : '';
    return `<div class="itfila" style="display:grid;gap:10px;padding:12px 0;border-top:1px solid var(--suave);align-items:start">
      <div class="mono" style="font-weight:700;font-size:14px;padding-top:6px">${esc(horaV) || '<span class="mut">—</span>'}</div>
      <div style="width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:${i.tipo === 'evento' ? 'var(--morado-c)' : i.tipo === 'tramo' ? '#ECFEFF' : 'var(--suave)'};color:${i.tipo === 'evento' ? '#6A02D4' : i.tipo === 'tramo' ? '#0E7490' : 'var(--texto2)'}">${ico(icono, 18)}</div>
      <div style="min-width:0;display:flex;flex-direction:column;gap:3px"><b>${titulo}</b>${lin.map((l) => `<div class="peq">${l}</div>`).join('')}</div>
      <div class="no-print" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${arch}${ed}</div></div>`;
  };
  return dias.map((d) => `<section class="card" style="padding:14px 20px 6px"><h3 style="margin:0 0 4px;font-family:var(--f-tit)">${esc((() => { const t = diaTxt(d.fecha, { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); })())}</h3>${d.items.map(fila).join('')}</section>`).join('');
}

// ---------- formularios (modales) ----------
async function candidatos(ctx) {
  if (ctx.personas?.length) return ctx.personas.map((p) => ({ id: p.musico_id, nombre: p.nombre, extra: p.instrumento }));
  return (await api('musicos')).filter((m) => m.activo).map((m) => ({ id: m.id, nombre: m.nombre, extra: m.instrumento }));
}
function listaPersonas(gente, marcados, campo, ph) {
  return `<div style="display:flex;justify-content:space-between;align-items:center"><b class="peq">${campo === 'asiento' ? 'Pasajeros' : 'Huéspedes'}</b><button type="button" class="btn chico" data-todos>Marcar todos</button></div>
    <div style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto;border:1px solid var(--borde);border-radius:10px;padding:10px">${gente.map((g) => { const m = marcados.find((x) => x.musico_id === g.id);
      return `<div style="display:grid;grid-template-columns:1fr 110px;gap:8px;align-items:center"><label class="chk"><input type="checkbox" data-per="${g.id}" ${m ? 'checked' : ''}> ${esc(g.nombre)} <span class="mut peq">${esc(g.extra || '')}</span></label><input data-ex="${g.id}" placeholder="${ph}" value="${v$(m?.[campo])}" style="height:34px;border:1px solid var(--borde2);border-radius:8px;padding:0 8px"></div>`; }).join('') || '<span class="mut">No hay integrantes en la delegación.</span>'}</div>`;
}
const leerPersonas = (el, campo) => $$('[data-per]', el).filter((c) => c.checked).map((c) => ({ musico_id: Number(c.dataset.per), [campo]: $(`[data-ex="${c.dataset.per}"]`, el).value }));
const camposCosto = (x, M) => `<div class="fila"><label class="campo">¿Quién lo paga?<select name="cubierto_por"><option value="">—</option>${optsV(CUBRE_T, x.cubierto_por)}</select></label><label class="campo">Costo<input name="costo" inputmode="decimal" value="${v$(x.costo)}"></label><label class="campo">Moneda<select name="moneda">${['USD', 'DOP', 'EUR'].map((m) => `<option${m === (x.moneda || M) ? ' selected' : ''}>${m}</option>`).join('')}</select></label></div>`;
function eventosSel(ctx, v) { return ctx.eventos?.length ? `<label class="campo">Evento relacionado (para el gasto)<select name="evento_id"><option value="">— Ninguno —</option>${ctx.eventos.map((e) => `<option value="${e.id}"${Number(v) === e.id ? ' selected' : ''}>${esc(e.codigo + ' · ' + e.nombre)}</option>`).join('')}</select></label>` : ''; }

async function guardarItem(ruta, id, body, md, listo) { await api(ruta + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body }); md.cerrar(); toast('Guardado'); listo(); }
function botonesPie(id) { return `${id ? '<button class="btn peligro" id="qi" style="margin-right:auto">Quitar</button>' : ''}<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="gi">Guardar</button>`; }
function enlazarPie(md, ruta, id, armar, listo) {
  $('#gi', md.el).onclick = (ev) => trabajando(ev.target, async () => guardarItem(ruta, id, await armar(), md, listo));
  if ($('#qi', md.el)) $('#qi', md.el).onclick = (ev) => { if (confirm('¿Quitar del itinerario?')) trabajando(ev.target, async () => { await api(`${ruta}/${id}`, { method: 'DELETE' }); md.cerrar(); toast('Quitado'); listo(); }); };
}
// ctx: { viaje_id, evento_id, personas, eventos, moneda, item }
async function formTramo(ctx, x = {}, listo) {
  const gente = await candidatos(ctx); let boleto;
  const md = modal(x.id ? 'Cambiar traslado' : 'Nuevo traslado', `<div class="fila"><label class="campo">Medio<select name="tipo">${optsV(TIPOS_T, x.subtipo || 'vuelo')}</select></label><label class="campo">Compañía<input name="compania" value="${v$(x.compania)}" placeholder="Aerolínea, empresa de autobús…"></label><label class="campo">Número<input name="numero" value="${v$(x.numero)}" placeholder="B6 1234"></label></div>
    <fieldset style="border:1px solid var(--borde);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px"><legend class="peq" style="font-weight:700;padding:0 6px">Salida</legend>
      <div class="fila"><label class="campo">Fecha<input type="date" name="sale_fecha" required value="${v$(x.sale?.fecha || ctx.fecha)}"></label><label class="campo">Hora<input type="time" name="sale_hora" value="${v$(x.sale?.hora)}"></label><label class="campo">Zona horaria${zonaSel('sale_tz', x.sale?.tz)}</label></div>
      <div class="fila"><label class="campo">Aeropuerto / terminal / dirección<input name="origen" value="${v$(x._t?.origen)}" placeholder="SDQ"></label><label class="campo">Ciudad<input name="origen_ciudad" value="${v$(x._t?.origen_ciudad)}"></label><label class="campo">País<input name="origen_pais" value="${v$(x._t?.origen_pais)}"></label></div>
      <label class="campo">Terminal<input name="terminal" value="${v$(x.sale?.terminal)}"></label></fieldset>
    <fieldset style="border:1px solid var(--borde);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px"><legend class="peq" style="font-weight:700;padding:0 6px">Llegada</legend>
      <div class="fila"><label class="campo">Fecha<input type="date" name="llega_fecha" value="${v$(x.llega?.fecha)}"></label><label class="campo">Hora<input type="time" name="llega_hora" value="${v$(x.llega?.hora)}"></label><label class="campo">Zona horaria${zonaSel('llega_tz', x.llega?.tz)}</label></div>
      <div class="fila"><label class="campo">Aeropuerto / terminal / dirección<input name="destino" value="${v$(x._t?.destino)}" placeholder="MIA"></label><label class="campo">Ciudad<input name="destino_ciudad" value="${v$(x._t?.destino_ciudad)}"></label><label class="campo">País<input name="destino_pais" value="${v$(x._t?.destino_pais)}"></label></div></fieldset>
    <div class="fila"><label class="campo">Código de reserva<input name="reserva" value="${v$(x.reserva)}"></label><label class="campo">Equipaje<input name="equipaje" value="${v$(x.equipaje)}" placeholder="1 maleta de 23 kg + instrumento"></label></div>
    <div class="fila"><label class="campo">Contacto (lo ven los pasajeros)<input name="contacto" value="${v$(x.contacto)}" placeholder="Chofer: Pedro 305-555-0101"></label><label class="campo">Contacto privado (solo oficina)<input name="contacto_privado" value="${v$(x.contacto_privado)}"></label></div>
    ${camposCosto(x, ctx.moneda)}${eventosSel(ctx, x.evento_id)}<label class="campo">Notas<input name="notas" value="${v$(x.notas)}"></label>
    <div class="subir"><button type="button" class="btn chico" id="bol">${ico('doc')} Adjuntar boleto o reserva</button><span class="mut peq" id="bolt">${x.archivo_url ? 'Ya tiene archivo' : 'PDF o foto'}</span></div>
    ${listaPersonas(gente, Array.isArray(x.personas) ? x.personas : [], 'asiento', 'Asiento')}`, { pie: botonesPie(x.id), ancho: 760 });
  $('[data-todos]', md.el).onclick = () => $$('[data-per]', md.el).forEach((c) => (c.checked = true));
  $('#bol', md.el).onclick = async () => { const r = await elegirArchivo('documento'); if (r) { boleto = r.clave; $('#bolt', md.el).textContent = 'Archivo listo'; } };
  $('[name=sale_fecha]', md.el).onchange = (e) => { const l = $('[name=llega_fecha]', md.el); if (!l.value) l.value = e.target.value; };
  enlazarPie(md, 'tramos', x.id, () => ({ ...Object.fromEntries($$('[name]', md.el).map((i) => [i.name, i.value])), viaje_id: ctx.viaje_id, evento_id: $('[name=evento_id]', md.el)?.value || ctx.evento_id || null, pasajeros: leerPersonas(md.el, 'asiento'), ...(boleto ? { archivo: boleto } : {}) }), listo);
}
async function formHotel(ctx, x = {}, listo) {
  const gente = await candidatos(ctx); let res;
  const md = modal(x.id ? 'Cambiar hotel' : 'Nuevo hotel', `<div class="fila"><label class="campo">Hotel<input name="nombre" required value="${v$(x.nombre)}"></label><label class="campo">Teléfono<input name="telefono" value="${v$(x.telefono)}"></label></div>
    <label class="campo">Dirección<input name="direccion" value="${v$(x.direccion)}"></label><div class="fila"><label class="campo">Ciudad<input name="ciudad" value="${v$(x._h?.ciudad)}"></label><label class="campo">País<input name="pais" value="${v$(x._h?.pais)}"></label></div>
    <div class="fila"><label class="campo">Entrada<input type="date" name="entrada" required value="${v$(x.entrada || ctx.fecha)}"></label><label class="campo">Hora<input type="time" name="entrada_hora" value="${v$(x.entrada_hora)}"></label><label class="campo">Salida<input type="date" name="salida" required value="${v$(x.salida)}"></label><label class="campo">Hora<input type="time" name="salida_hora" value="${v$(x.salida_hora)}"></label></div>
    <div class="fila"><label class="campo">Número de reserva<input name="reserva" value="${v$(x.reserva)}"></label><label class="campo">Habitaciones<input name="habitaciones" inputmode="numeric" value="${v$(x.habitaciones)}"></label></div>
    <div class="fila"><label class="campo">Contacto (lo ven los huéspedes)<input name="contacto" value="${v$(x.contacto)}"></label><label class="campo">Contacto privado (solo oficina)<input name="contacto_privado" value="${v$(x.contacto_privado)}"></label></div>
    ${camposCosto(x, ctx.moneda)}${eventosSel(ctx, x.evento_id)}<label class="campo">Notas<input name="notas" value="${v$(x.notas)}"></label>
    <div class="subir"><button type="button" class="btn chico" id="res">${ico('doc')} Adjuntar reserva o comprobante</button><span class="mut peq" id="rest">${x.archivo_url ? 'Ya tiene archivo' : 'PDF o foto'}</span></div>
    ${listaPersonas(gente, Array.isArray(x.personas) ? x.personas : [], 'habitacion', 'Habitación')}`, { pie: botonesPie(x.id), ancho: 760 });
  $('[data-todos]', md.el).onclick = () => $$('[data-per]', md.el).forEach((c) => (c.checked = true));
  $('#res', md.el).onclick = async () => { const r = await elegirArchivo('documento'); if (r) { res = r.clave; $('#rest', md.el).textContent = 'Archivo listo'; } };
  enlazarPie(md, 'hoteles', x.id, () => ({ ...Object.fromEntries($$('[name]', md.el).map((i) => [i.name, i.value])), viaje_id: ctx.viaje_id, evento_id: $('[name=evento_id]', md.el)?.value || ctx.evento_id || null, huespedes: leerPersonas(md.el, 'habitacion'), ...(res ? { archivo: res } : {}) }), listo);
}
function formActividad(ctx, x = {}, listo) {
  const md = modal(x.id ? 'Cambiar actividad' : 'Nueva actividad', `<label class="campo">Qué es<input name="titulo" required value="${v$(x.titulo)}" placeholder="Recogida en el hotel, entrevista, cena…"></label>
    <div class="fila"><label class="campo">Fecha<input type="date" name="fecha" required value="${v$(x.fecha || ctx.fecha)}"></label><label class="campo">Desde<input type="time" name="hora" value="${v$(x.hora)}"></label><label class="campo">Hasta<input type="time" name="hora_fin" value="${v$(x.hora_fin)}"></label></div>
    <div class="fila"><label class="campo">Lugar<input name="lugar" value="${v$(x._a?.lugar ?? x.lugar)}"></label><label class="campo">Dirección<input name="direccion" value="${v$(x.direccion)}"></label></div>
    <label class="campo">¿Quién lo ve?<select name="para">${optsV(PARA_T, x.para || 'todos')}</select></label>${eventosSel(ctx, x.evento_id)}<label class="campo">Notas<textarea name="notas" rows="2">${v$(x.notas)}</textarea></label>`, { pie: botonesPie(x.id), ancho: 640 });
  enlazarPie(md, 'actividades', x.id, () => ({ ...Object.fromEntries($$('[name]', md.el).map((i) => [i.name, i.value])), viaje_id: ctx.viaje_id, evento_id: $('[name=evento_id]', md.el)?.value || ctx.evento_id || null }), listo);
}
// abre el formulario correcto para un renglón del itinerario
async function editarItem(clave, items, ctx, listo) {
  const [k, id] = clave.split(':'); const n = Number(id);
  if (k === 't') { const x = items.find((i) => i.tipo === 'tramo' && i.id === n); return formTramo(ctx, { ...x, _t: x.orig || {} }, listo); }
  if (k === 'h') { const x = items.find((i) => i.tipo === 'hotel_entrada' && i.id === n); return formHotel(ctx, { ...x, _h: x.orig || {} }, listo); }
  const x = items.find((i) => i.tipo === 'actividad' && i.id === n);
  return formActividad(ctx, { ...x, _a: { lugar: x.lugar_solo } }, listo);
}
// registra el costo de un traslado u hotel como gasto del evento (Fase 3) y los enlaza
async function registrarGasto(i, listo) {
  const cat = i.tipo === 'tramo' ? (i.subtipo === 'vuelo' ? 'Vuelos y equipaje' : 'Transporte terrestre y combustible') : 'Hospedaje';
  const r = await api(`eventos/${i.evento_id}/movimientos`, { method: 'POST', body: { tipo: 'gasto', categoria: cat, monto: i.costo, moneda: i.moneda, cubierto_por: i.cubierto_por || 'empresa', descripcion: i.titulo.replace(/^(Entrada al hotel · )/, ''), receptor: i.compania || i.nombre || '' } });
  await api(`${i.tipo === 'tramo' ? 'tramos' : 'hoteles'}/${i.id}`, { method: 'PUT', body: { movimiento_id: r.id } });
  toast('Gasto ' + r.codigo + ' registrado en el evento'); listo();
}
function enlazarItinerario(el, dias, ctx, listo) {
  const items = dias.flatMap((d) => d.items);
  $$('[data-ed]', el).forEach((b) => (b.onclick = () => editarItem(b.dataset.ed, items, ctx, listo)));
}
function listaGastables(items) {
  return items.filter((i) => (i.tipo === 'tramo' || i.tipo === 'hotel_entrada') && i.costo && i.evento_id && !i.movimiento_id && i.cubierto_por !== 'cliente');
}

// ---------- páginas ----------
async function vViajes(c, a, b) {
  if (a === 'nueva') return formViaje(c, null);
  if (a && /^\d+$/.test(a)) return b === 'editar' ? formViaje(c, await api('viajes/' + a)) : fichaViaje(c, Number(a), b);
  let todos = false;
  const pintar = async () => {
    const L = await api('viajes' + (todos ? '?todos=1' : ''));
    $('#lv').innerHTML = L.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Gira</th><th>Fechas</th><th>Banda</th><th>Eventos</th><th>Delegación</th><th>Traslados / hoteles</th><th>Estado</th></tr></thead><tbody>${L.map((v) => `<tr>
      <td><a href="#/viajes/${v.id}" style="font-weight:600;color:var(--tinta);text-decoration:none">${esc(v.nombre)}</a><div class="mut peq">${esc(v.codigo)}${v.responsable ? ' · ' + esc(v.responsable) : ''}</div></td>
      <td class="mono peq">${esc(v.desde || '—')}<br>${esc(v.hasta || '')}</td><td>${v.banda ? `<span class="tag">${esc(v.banda)}</span>` : '—'}</td><td>${v.eventos}</td><td>${v.personas}</td><td>${v.tramos} · ${v.hoteles}</td>
      <td><span class="est ${EST_VIAJE[v.estado][0]}">${EST_VIAJE[v.estado][1]}</span><div class="peq" style="margin-top:4px">${v.cambios_sin_avisar ? '<span class="est adv">Cambios sin avisar</span>' : v.publicado_en ? '<span class="est ok">Publicada</span>' : '<span class="est gr">Sin publicar</span>'}</div></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="vacio">No hay giras. Cree una para agrupar eventos, vuelos, hoteles y la delegación.</div>';
  };
  c.innerHTML = `<div class="cab"><h1>Giras y viajes</h1><div class="acc"><a class="btn" href="#/itinerarios">Itinerario consolidado</a>${puede('viajes.editar') ? '<a class="btn prim" href="#/viajes/nueva">+ Gira</a>' : ''}</div></div>
    <div style="display:flex;gap:8px"><button class="btn chico prim" data-p="0">Próximas y en curso</button><button class="btn chico" data-p="1">Todas</button></div><div class="card sin" id="lv"></div>`;
  $$('[data-p]').forEach((bt) => (bt.onclick = () => { todos = bt.dataset.p === '1'; $$('[data-p]').forEach((x) => x.classList.toggle('prim', x === bt)); pintar(); }));
  await pintar();
}
async function formViaje(c, v) {
  const [B, Ev, M, U] = await Promise.all([puede('bandas.ver') ? api('bandas') : [], api(`calendario?desde=${sumar(hoyISO(), -30)}&hasta=${sumar(hoyISO(), 365)}`), api('musicos'), puede('usuarios.ver') ? api('usuarios').then((r) => r.usuarios) : []]);
  const evs = Ev.eventos.filter((e) => e.estado !== 'cancelado' && (!e.viaje_id || e.viaje_id === v?.id));
  const enGira = new Set((v?.eventos || []).map((e) => e.id)), per = new Set((v?.personas || []).map((p) => p.musico_id));
  c.innerHTML = `<div class="mut peq"><a href="#/viajes">Giras</a> / ${v ? esc(v.codigo) : 'Nueva'}</div><form class="card" id="fv" style="display:flex;flex-direction:column;gap:14px;max-width:900px"><h1>${v ? 'Editar gira' : 'Nueva gira'}</h1>
    <div class="fila"><label class="campo">Nombre<input name="nombre" required value="${v$(v?.nombre)}" placeholder="Gira Florida diciembre"></label><label class="campo">Banda<select name="banda_id"><option value="">—</option>${B.filter((b) => b.activa).map((b) => `<option value="${b.id}"${b.id === v?.banda_id ? ' selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select></label></div>
    <div class="fila"><label class="campo">Desde<input type="date" name="desde" value="${v$(v?.desde)}"></label><label class="campo">Hasta<input type="date" name="hasta" value="${v$(v?.hasta)}"></label><label class="campo">Estado<select name="estado">${Object.entries(EST_VIAJE).map(([k, x]) => `<option value="${k}"${k === (v?.estado || 'planificando') ? ' selected' : ''}>${x[1]}</option>`).join('')}</select></label>
      ${U.length ? `<label class="campo">Responsable<select name="responsable_id">${U.filter((u) => u.activo && ['dueno', 'admin', 'manager', 'booking'].includes(u.rol)).map((u) => `<option value="${u.id}"${u.id === (v?.responsable_id || ME.usuario.id) ? ' selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select></label>` : ''}</div>
    <div><b>Eventos de la gira</b><div class="mut peq">Al escogerlos, su equipo pasa a la delegación (si la deja vacía).</div><div style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto;border:1px solid var(--borde);border-radius:10px;padding:10px;margin-top:8px">
      ${evs.map((e) => `<label class="chk"><input type="checkbox" data-ev="${e.id}" ${enGira.has(e.id) ? 'checked' : ''}> <span class="mono peq">${esc(e.fecha)}</span> ${esc(e.codigo)} · ${esc(e.nombre)} <span class="mut peq">${esc([e.ciudad, e.pais].filter(Boolean).join(', '))}</span></label>`).join('') || '<span class="mut">No hay eventos próximos.</span>'}</div></div>
    <div><b>Delegación (quiénes viajan)</b><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;max-height:260px;overflow:auto;border:1px solid var(--borde);border-radius:10px;padding:10px;margin-top:8px">
      ${M.filter((m) => m.activo).map((m) => `<label class="chk"><input type="checkbox" data-pe="${m.id}" ${per.has(m.id) ? 'checked' : ''}> ${esc(m.nombre)} <span class="mut peq">${esc(m.instrumento || '')}</span></label>`).join('')}</div></div>
    <label class="campo">Notas<textarea name="notas" rows="3">${v$(v?.notas)}</textarea></label>
    <div style="display:flex;gap:8px;justify-content:flex-end"><a class="btn" href="${v ? '#/viajes/' + v.id : '#/viajes'}">Cancelar</a><button class="btn prim">Guardar</button></div></form>`;
  $('#fv').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button.prim', ev.target), async () => {
    const body = { ...datosDe(ev.target), eventos: $$('[data-ev]').filter((x) => x.checked).map((x) => Number(x.dataset.ev)), personas: $$('[data-pe]').filter((x) => x.checked).map((x) => Number(x.dataset.pe)) };
    const r = await api('viajes' + (v ? '/' + v.id : ''), { method: v ? 'PUT' : 'POST', body }); toast('Gira guardada'); location.hash = '#/viajes/' + (v ? v.id : r.id); }); };
}
async function fichaViaje(c, id, pest) {
  const v = await api('viajes/' + id);
  const items = v.itinerario.flatMap((d) => d.items);
  const tabs = [['itinerario', 'Itinerario'], ['traslados', `Traslados · ${items.filter((i) => i.tipo === 'tramo').length}`], ['hoteles', `Hoteles · ${items.filter((i) => i.tipo === 'hotel_entrada').length}`], ['delegacion', `Delegación · ${v.personas.length}`], ['cambios', 'Cambios']];
  const act = tabs.some((t) => t[0] === pest) ? pest : 'itinerario';
  const ctx = { viaje_id: id, personas: v.personas, eventos: v.eventos, fecha: v.desde, moneda: 'USD' };
  const listo = () => fichaViaje(c, id, act);
  const sinAvisar = v.cambios.filter((x) => !x.avisado).length;
  const gastables = v.costos && puede('finanzas.registrar') ? listaGastables(items) : [];
  c.innerHTML = `<div class="mut peq"><a href="#/viajes">Giras</a> / ${esc(v.codigo)}</div>
    <div class="card" style="display:flex;flex-wrap:wrap;gap:18px;align-items:center"><div style="flex:1;min-width:260px;display:flex;flex-direction:column;gap:6px"><h1>${esc(v.nombre)}</h1>
      <div class="mut">${v.desde ? esc(diaTxt(v.desde, { day: 'numeric', month: 'long' })) + ' al ' + esc(diaTxt(v.hasta || v.desde, { day: 'numeric', month: 'long', year: 'numeric' })) : 'Sin fechas'}${v.responsable ? ' · Responsable: ' + esc(v.responsable) : ''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="est ${EST_VIAJE[v.estado][0]}">${EST_VIAJE[v.estado][1]}</span>${v.banda ? `<span class="tag">${esc(v.banda)}</span>` : ''}${v.publicado_en ? `<span class="est ok">Publicada ${esc(v.publicado_en.slice(0, 10))}</span>` : '<span class="est gr">La delegación todavía no la ve</span>'}</div></div>
      <div class="acc no-print" style="display:flex;gap:8px;flex-wrap:wrap">${puede('chat.usar') ? `<button class="btn" data-abrir-chat="viaje:${id}">${ico('chat')} Chat de la gira</button>` : ''}<button class="btn" onclick="window.print()">Imprimir</button>${v.editar ? `<a class="btn" href="#/viajes/${id}/editar">Editar</a>` : ''}
        ${v.publicar && v.estado !== 'cancelado' ? `<button class="btn mor" id="pub">${!v.publicado_en ? 'Publicar y avisar a la delegación' : sinAvisar ? `Avisar ${sinAvisar} cambio(s)` : 'Volver a avisar'}</button>` : ''}</div></div>
    ${v.alertas.map((a) => `<div class="aviso ${a.nivel}">${esc(a.texto)}</div>`).join('')}
    ${gastables.length ? `<div class="aviso mor" style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span>${gastables.length} traslado(s) u hotel(es) con costo todavía no están en los gastos del evento.</span><button class="btn chico mor" id="gas">Registrar como gastos</button></div>` : ''}
    <div class="pestanas no-print" role="tablist">${tabs.map(([k, t]) => `<button role="tab" class="${k === act ? 'act' : ''}" data-t="${k}">${esc(t)}</button>`).join('')}</div><div id="pc" style="display:flex;flex-direction:column;gap:12px"></div>`;
  $$('.pestanas button').forEach((bt) => (bt.onclick = () => { location.hash = `#/viajes/${id}/${bt.dataset.t}`; }));
  if ($('#pub')) $('#pub').onclick = (ev) => trabajando(ev.target, async () => { const r = await api(`viajes/${id}/publicar`, { method: 'POST' }); avisoEnviado({ ...r, citados: r.delegacion }, r.cambios ? 'Aviso de cambios' : 'Itinerario publicado'); listo(); });
  if ($('#gas')) $('#gas').onclick = (ev) => trabajando(ev.target, async () => { for (const i of gastables) await registrarGasto(i, () => {}); listo(); });
  const pc = $('#pc');
  const botones = v.editar ? `<div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn chico prim" data-n="t">+ Traslado</button><button class="btn chico" data-n="h">+ Hotel</button><button class="btn chico" data-n="a">+ Actividad</button></div>` : '';
  const conectarNuevos = () => $$('[data-n]', pc).forEach((bt) => (bt.onclick = () => (bt.dataset.n === 't' ? formTramo(ctx, {}, listo) : bt.dataset.n === 'h' ? formHotel(ctx, {}, listo) : formActividad(ctx, {}, listo))));
  if (act === 'itinerario') { pc.innerHTML = botones + htmlItinerario(v.itinerario, { oficina: true, editar: v.editar }); }
  if (act === 'traslados' || act === 'hoteles') {
    const tipo = act === 'traslados' ? 'tramo' : 'hotel_entrada', sel = items.filter((i) => i.tipo === tipo);
    pc.innerHTML = botones + (sel.length ? htmlItinerario(sel.map((i) => ({ fecha: i.fecha, items: [i] })).reduce((a, d) => { const u = a[a.length - 1]; if (u && u.fecha === d.fecha) u.items.push(...d.items); else a.push(d); return a; }, []), { oficina: true, editar: v.editar }) : `<div class="card vacio">Sin ${act}.</div>`);
  }
  if (act === 'delegacion') pc.innerHTML = `<div class="card sin">${v.personas.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Integrante</th><th>Pasaporte vence</th><th>Visas vigentes</th><th>Portal</th><th>Contacto</th></tr></thead><tbody>${v.personas.map((p) => `<tr>
      <td><span style="display:flex;gap:10px;align-items:center">${fotoAv(p.foto_url, p.nombre)}<span><b>${esc(p.nombre)}</b><br><span class="mut peq">${esc(p.funcion || p.instrumento || '')}</span></span></span></td>
      <td class="mono peq">${p.pasaporte_vence ? esc(p.pasaporte_vence) : '<span class="est mal">Sin pasaporte</span>'}</td><td>${p.visas}</td><td>${p.usuario_id ? '<span class="est ok">Activo</span>' : '<span class="est gr">Sin acceso</span>'}</td><td class="peq">${esc(p.whatsapp || p.email || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">La delegación está vacía. Edite la gira para agregar integrantes.</div>'}</div>
    <div class="card"><h2>Eventos de la gira</h2>${v.eventos.map((e) => `<div style="padding:8px 0;border-top:1px solid var(--suave)"><a href="#/eventos/${e.id}/logistica"><b>${esc(e.codigo)} · ${esc(e.nombre)}</b></a><div class="mut peq">${esc(e.fecha)} · ${esc([e.lugar, e.ciudad, e.pais].filter(Boolean).join(', '))}</div></div>`).join('') || '<p class="mut">Sin eventos.</p>'}</div>`;
  if (act === 'cambios') pc.innerHTML = `<div class="card">${v.cambios.length ? v.cambios.map((x) => `<div style="padding:8px 0;border-top:1px solid var(--suave);display:flex;justify-content:space-between;gap:10px"><span>${esc(x.detalle)}<br><span class="mut peq">${esc(x.creado)} · ${esc(x.por || '')}</span></span>${x.avisado ? '<span class="est ok">Avisado</span>' : '<span class="est adv">Sin avisar</span>'}</div>`).join('') : '<p class="mut" style="margin:0">Los cambios que se hagan después de publicar la gira aparecen aquí para avisarlos a la delegación.</p>'}</div>`;
  conectarNuevos(); enlazarItinerario(pc, v.itinerario, ctx, listo);
}
// pestaña «Logística» del evento
async function tabLogistica(pc, e) {
  const L = await api(`eventos/${e.id}/logistica`);
  const ctx = { viaje_id: L.viaje_id, evento_id: e.id, personas: e.equipo.map((m) => ({ musico_id: m.id, nombre: m.nombre, instrumento: m.instrumento })), fecha: e.fecha, moneda: e.moneda };
  const listo = () => tabLogistica(pc, e);
  const gastables = L.costos && puede('finanzas.registrar') ? listaGastables(L.dias.flatMap((d) => d.items)) : [];
  pc.innerHTML = `<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div>${L.viaje_id ? `Este evento es parte de la gira <a href="#/viajes/${L.viaje_id}"><b>${esc(L.viaje_codigo)} · ${esc(L.viaje)}</b></a>.` : 'Este evento no está en ninguna gira.'}<div class="mut peq">Quién paga vuelo, hotel y transporte se indica en la pestaña Resumen.</div></div>
      ${L.editar ? '<div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn chico prim" data-n="t">+ Traslado</button><button class="btn chico" data-n="h">+ Hotel</button><button class="btn chico" data-n="a">+ Actividad</button></div>' : ''}</div>
    ${gastables.length ? `<div class="aviso mor" style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span>${gastables.length} costo(s) de viaje todavía no están en los gastos del evento.</span><button class="btn chico mor" id="gas">Registrar como gastos</button></div>` : ''}
    ${htmlItinerario(L.dias, { oficina: true, editar: L.editar })}`;
  $$('[data-n]', pc).forEach((bt) => (bt.onclick = () => (bt.dataset.n === 't' ? formTramo(ctx, {}, listo) : bt.dataset.n === 'h' ? formHotel(ctx, {}, listo) : formActividad(ctx, {}, listo))));
  if ($('#gas', pc)) $('#gas', pc).onclick = (ev) => trabajando(ev.target, async () => { for (const i of gastables) await registrarGasto(i, () => {}); listo(); });
  enlazarItinerario(pc, L.dias, ctx, listo);
}
async function vItinerarios(c) {
  const B = puede('bandas.ver') ? (await api('bandas')).filter((b) => b.activa) : [];
  let desde = hoyISO(), dias = 30, banda = '';
  const pintar = async () => {
    const r = await api(`itinerario?desde=${desde}&hasta=${sumar(desde, dias)}${banda ? '&banda=' + banda : ''}`);
    $('#it').innerHTML = htmlItinerario(r.dias, { oficina: true });
  };
  c.innerHTML = `<div class="cab"><div><h1>Itinerario consolidado</h1><div class="mut">Vuelos, traslados, hoteles, actividades y presentaciones de todas las giras.</div></div><div class="acc no-print"><button class="btn" onclick="window.print()">Imprimir o PDF</button>${puede('viajes.editar') ? '<a class="btn prim" href="#/viajes/nueva">+ Gira</a>' : ''}</div></div>
    <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap"><input type="date" id="fd" value="${desde}" aria-label="Desde" style="height:40px;border:1px solid var(--borde2);border-radius:8px;padding:0 10px">
      <select id="fn" aria-label="Período" style="height:40px;border:1px solid var(--borde2);border-radius:8px;padding:0 10px">${[[7, '7 días'], [14, '2 semanas'], [30, '30 días'], [60, '60 días'], [120, '4 meses']].map(([n, t]) => `<option value="${n}"${n === dias ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <select id="fb" aria-label="Banda" style="height:40px;border:1px solid var(--borde2);border-radius:8px;padding:0 10px"><option value="">Todas las bandas</option>${B.map((b) => `<option value="${b.id}">${esc(b.nombre)}</option>`).join('')}</select></div>
    <div id="it" style="display:flex;flex-direction:column;gap:12px"></div>`;
  $('#fd').onchange = (e) => { desde = e.target.value || hoyISO(); pintar(); };
  $('#fn').onchange = (e) => { dias = Number(e.target.value); pintar(); };
  $('#fb').onchange = (e) => { banda = e.target.value; pintar(); };
  await pintar();
}

// ---------- portal: mi itinerario ----------
async function portalItinerario(el) {
  const r = await api('portal/itinerario');
  el.innerHTML = `${r.cambios.length ? `<div class="aviso adv"><b>Cambios recientes</b>${r.cambios.map((x) => `<div class="peq">${esc(x.viaje)}: ${esc(x.detalle)}</div>`).join('')}</div>` : ''}${htmlItinerario(r.dias)}`;
}
async function portalProximoViaje(el) {
  try {
    const r = await api('portal/itinerario'), hoy = hoyISO();
    const t = r.dias.flatMap((d) => d.items).find((i) => (i.tipo === 'tramo' || i.tipo === 'hotel_entrada') && i.fecha >= hoy && i.fecha <= sumar(hoy, 21));
    if (!t) return;
    el.innerHTML = `<a href="#/agenda/itinerario" class="card" style="display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit;margin-top:12px"><span style="width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:#ECFEFF;color:#0E7490">${ico(t.tipo === 'tramo' ? 'plane' : 'home', 22)}</span>
      <span style="flex:1"><span class="peq mut" style="font-weight:700;letter-spacing:1px">PRÓXIMO VIAJE · ${esc(diaTxt(t.fecha))}${t.hora ? ' · ' + esc(t.hora) : ''}</span><br><b>${esc(t.titulo)}</b>${r.cambios.length ? '<br><span class="est adv">Hubo cambios: revíselo</span>' : ''}</span></a>`;
  } catch {}
}
