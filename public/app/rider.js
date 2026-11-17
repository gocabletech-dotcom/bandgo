// BandGo · Fase 5 en la app: riders técnicos, editor del plano del escenario (SVG, se arrastra con el dedo o el ratón),
// lista de canales, monitores, requerimientos, versiones, hoja para imprimir / PDF y la sección técnica del sonidista.
'use strict';
const ALC_T = { general: 'General', rd: 'República Dominicana', us: 'Estados Unidos', eu: 'Europa', evento: 'Personalizado para un evento' };
const EST_R = { borrador: ['gr', 'Borrador'], vigente: ['ok', 'Vigente'], archivado: ['mal', 'Archivado'] };
const SOP_T = { '': '—', alto: 'Pedestal alto', bajo: 'Pedestal bajo', clip: 'Clip', mesa: 'Mesa' };
const MEZ_T = { cuna: 'Cuña', iem_estereo: 'In-ear estéreo', iem_mono: 'In-ear mono', sidefill: 'Side fill' };
const SEC_T = [['consola', 'Consola (FOH)'], ['monitores', 'Monitores'], ['microfonia', 'Microfonía'], ['di_backline', 'DI boxes y backline'], ['energia', 'Energía eléctrica'], ['escenario', 'Escenario'], ['instrucciones', 'Instrucciones generales']];
const PALETA = [['bateria', 'Batería'], ['percusion', 'Congas'], ['timbal', 'Timbales'], ['teclado', 'Teclado'], ['amp_guitarra', 'Amp. guitarra'], ['amp_bajo', 'Amp. bajo'], ['mic', 'Mic. voz'], ['mic_inst', 'Mic. instrumento'],
  ['di', 'DI box'], ['monitor', 'Monitor (cuña)'], ['sidefill', 'Side fill'], ['iem', 'In-ear'], ['musico', 'Músico'], ['tarima', 'Tarima'], ['toma', 'Toma eléctrica'], ['consola', 'Consola'], ['texto', 'Texto']];
const PAL_N = Object.fromEntries(PALETA);
const T = '#0F172A', MOR = '#7C02F7', SUA = '#F1F5F9';

// ---------- dibujo de cada elemento (unidades: centímetros; el escenario se mide en metros × 100) ----------
function simbolo(p) {
  const r = (w, h, extra = '') => `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="6" fill="#fff" stroke="${T}" stroke-width="3" ${extra}/>`;
  const t = (s, y = 6, sz = 18, col = T) => `<text x="0" y="${y}" text-anchor="middle" font-size="${sz}" font-weight="700" font-family="Plus Jakarta Sans, sans-serif" fill="${col}">${esc(s)}</text>`;
  const c = (x, y, rr, f = '#fff') => `<circle cx="${x}" cy="${y}" r="${rr}" fill="${f}" stroke="${T}" stroke-width="3"/>`;
  switch (p.tipo) {
    case 'bateria': return c(0, 6, 34, SUA) + c(-46, -16, 18) + c(-18, -40, 16) + c(18, -40, 16) + c(46, -10, 20) + c(-60, 22, 22, '#FEF3C7') + c(60, 26, 24, '#FEF3C7') + t('BAT', 12, 16);
    case 'percusion': return c(-24, 0, 22, SUA) + c(24, 0, 22, SUA) + c(0, -30, 18, SUA) + t('CNG', 7, 14);
    case 'timbal': return c(-22, 0, 20, SUA) + c(22, 0, 22, SUA) + c(0, -32, 14, '#FEF3C7') + t('TIM', 7, 14);
    case 'teclado': return r(140, 40) + Array.from({ length: 13 }, (_, i) => `<line x1="${-60 + i * 10}" y1="-16" x2="${-60 + i * 10}" y2="16" stroke="${T}" stroke-width="1.5"/>`).join('');
    case 'amp_guitarra': return r(70, 44, `fill="${SUA}"`) + t('GTR', 7, 16);
    case 'amp_bajo': return r(72, 60, `fill="${SUA}"`) + t('BAJO', 7, 16);
    case 'monitor': return `<path d="M-36 14 L-28 -14 L28 -14 L36 14 Z" fill="#fff" stroke="${T}" stroke-width="3"/>` + t('M', 8, 16);
    case 'sidefill': return r(60, 60) + t('SF', 7, 18);
    case 'mic': return `<line x1="0" y1="0" x2="0" y2="40" stroke="${MOR}" stroke-width="4"/>` + `<circle cx="0" cy="0" r="11" fill="${MOR}"/>`;
    case 'mic_inst': return `<line x1="0" y1="0" x2="22" y2="22" stroke="${MOR}" stroke-width="3"/>` + `<circle cx="0" cy="0" r="8" fill="${MOR}"/>`;
    case 'di': return r(34, 20, `fill="#EDE9FE"`) + t('DI', 6, 13, MOR);
    case 'iem': return r(34, 22, `fill="#EDE9FE"`) + t('IEM', 6, 11, MOR);
    case 'toma': return r(28, 28, `fill="#FEF3C7"`) + `<path d="M2 -9 L-6 2 L0 2 L-2 10 L6 -1 L0 -1 Z" fill="${T}"/>`;
    case 'consola': return r(120, 56, `fill="${SUA}"`) + t('FOH', 7, 18);
    case 'musico': return c(0, 0, 26, '#F3E8FF') + t(iniciales(p.etiqueta) || '?', 7, 17, '#6A02D4');
    case 'texto': return '';
    default: return c(0, 0, 10);
  }
}
const ALTO = { bateria: 70, percusion: 40, timbal: 40, teclado: 26, amp_guitarra: 28, amp_bajo: 36, monitor: 20, sidefill: 36, mic: 46, mic_inst: 28, di: 16, iem: 16, toma: 20, consola: 34, musico: 32, texto: 0 };
function svgPlano(datos, { editable = false, sel = null } = {}) {
  const W = datos.escenario.ancho * 100, H = datos.escenario.fondo * 100;
  const grid = [];
  for (let x = 100; x < W; x += 100) grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#E2E8F0" stroke-width="1.5"/>`);
  for (let y = 100; y < H; y += 100) grid.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#E2E8F0" stroke-width="1.5"/>`);
  const orden = [...datos.plot].sort((a, b) => (a.tipo === 'tarima' ? -1 : 0) - (b.tipo === 'tarima' ? -1 : 0));
  const el = orden.map((p) => {
    const X = p.x * 100, Y = p.y * 100, s = p.id === sel;
    if (p.tipo === 'tarima') {
      const w = p.ancho * 100, h = p.fondo * 100;
      return `<g data-id="${esc(p.id)}" transform="translate(${X} ${Y})" style="${editable ? 'cursor:move' : ''}"><g transform="rotate(${p.rot})"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="#F8FAFC" stroke="${s ? MOR : '#94A3B8'}" stroke-width="${s ? 6 : 3}" stroke-dasharray="14 8"/></g>
        <text x="0" y="${h / 2 - 12}" text-anchor="middle" font-size="16" fill="#64748B" font-family="Plus Jakarta Sans, sans-serif">${esc(p.etiqueta)}</text></g>`;
    }
    const lbl = p.tipo === 'texto' ? `<text x="0" y="8" text-anchor="middle" font-size="26" font-weight="700" fill="${T}" font-family="Outfit, sans-serif">${esc(p.etiqueta || 'Texto')}</text>`
      : p.etiqueta ? `<text x="0" y="${(ALTO[p.tipo] || 20) + 24}" text-anchor="middle" font-size="17" font-weight="600" fill="${T}" font-family="Plus Jakarta Sans, sans-serif" paint-order="stroke" stroke="#fff" stroke-width="6">${esc(p.etiqueta)}</text>` : '';
    return `<g data-id="${esc(p.id)}" transform="translate(${X} ${Y})" style="${editable ? 'cursor:move' : ''}">${s ? `<circle r="${Math.max(40, (ALTO[p.tipo] || 20) + 16)}" fill="none" stroke="${MOR}" stroke-width="4" stroke-dasharray="10 6"/>` : ''}
      <g transform="rotate(${p.rot})">${simbolo(p)}</g>${lbl}${editable ? `<circle r="${Math.max(30, ALTO[p.tipo] || 20)}" fill="transparent"/>` : ''}</g>`;
  }).join('');
  return `<svg viewBox="-60 -70 ${W + 120} ${H + 170}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;touch-action:${editable ? 'none' : 'auto'};user-select:none" ${editable ? 'tabindex="0" aria-label="Plano del escenario: arrastre los elementos; flechas para mover, R para girar, Supr para quitar"' : 'role="img" aria-label="Plano del escenario"'}>
    <text x="${W / 2}" y="-28" text-anchor="middle" font-size="20" font-weight="700" fill="#64748B" letter-spacing="3" font-family="Plus Jakarta Sans, sans-serif">FONDO DEL ESCENARIO</text>
    <rect data-fondo="1" x="0" y="0" width="${W}" height="${H}" fill="#fff" stroke="${T}" stroke-width="5"/>${grid.join('')}
    <text x="${W - 8}" y="-8" text-anchor="end" font-size="15" fill="#94A3B8" font-family="JetBrains Mono, monospace">${datos.escenario.ancho} × ${datos.escenario.fondo} m · cuadros de 1 m</text>
    ${el}<rect x="${W * 0.15}" y="${H + 30}" width="${W * 0.7}" height="46" rx="10" fill="#0F172A"/><text x="${W / 2}" y="${H + 61}" text-anchor="middle" font-size="22" font-weight="700" fill="#fff" letter-spacing="6" font-family="Outfit, sans-serif">PÚBLICO</text></svg>`;
}

// ---------- hoja completa del rider (impresión, sonidista y versiones viejas) ----------
function htmlRider(R) {
  const d = R.datos;
  const seccion = (t, cuerpo) => `<section style="break-inside:avoid;display:flex;flex-direction:column;gap:8px"><h2 style="margin:0;font-size:17px;border-bottom:2px solid ${T};padding-bottom:4px">${t}</h2>${cuerpo}</section>`;
  return `<div class="hoja-rider" style="display:flex;flex-direction:column;gap:18px">
    <header style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-end;border-bottom:3px solid ${MOR};padding-bottom:10px">
      <div><div class="peq mut" style="font-weight:700;letter-spacing:2px">RIDER TÉCNICO${R.banda ? ' · ' + esc(R.banda.toUpperCase()) : ''}</div><h1 style="margin:2px 0 0">${esc(R.nombre)}</h1><div class="mut peq">${esc(R.alcance_nombre || ALC_T[R.alcance] || '')}${R.evento?.nombre ? ' · ' + esc(R.evento.nombre) : ''}</div></div>
      <div class="peq" style="text-align:right">${esc(R.empresa || ME?.empresa?.nombre || '')}<br><b>${esc(R.codigo)} · versión ${R.version}</b><br>${esc(String(R.fecha || '').slice(0, 10))}${R.por ? ' · ' + esc(R.por) : ''}</div></header>
    ${seccion('Plano del escenario (stage plot)', `<div style="border:1px solid var(--borde);border-radius:10px;padding:8px;background:#fff">${svgPlano(d)}</div>`)}
    ${seccion(`Lista de canales (input list) · ${d.canales.length}`, d.canales.length ? `<div class="desliza"><table class="tabla rider-t"><thead><tr><th>Canal</th><th>Fuente</th><th>Micrófono / conexión</th><th>Soporte</th><th>48V</th><th>Sub</th><th>Notas</th></tr></thead><tbody>${d.canales.map((c) => `<tr><td class="mono"><b>${c.n}</b></td><td><b>${esc(c.fuente)}</b></td><td>${esc(c.mic)}</td><td>${esc(SOP_T[c.soporte] || '')}</td><td>${c.phantom ? '✓' : ''}</td><td class="mono">${esc(c.sub)}</td><td class="peq">${esc(c.notas)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Sin canales.</p>')}
    ${d.mezclas.length ? seccion('Monitores', `<table class="tabla rider-t"><thead><tr><th>Mezcla</th><th>Para</th><th>Tipo</th><th>Notas</th></tr></thead><tbody>${d.mezclas.map((m) => `<tr><td class="mono"><b>${m.n}</b></td><td>${esc(m.para)}</td><td>${esc(MEZ_T[m.tipo])}</td><td class="peq">${esc(m.notas)}</td></tr>`).join('')}</tbody></table>`) : ''}
    ${SEC_T.filter(([k]) => d.secciones[k]).map(([k, t]) => seccion(t, `<div style="white-space:pre-wrap;line-height:1.55">${esc(d.secciones[k])}</div>`)).join('')}
    ${d.contactos.length ? seccion('Contactos técnicos', d.contactos.map((c) => `<div><b>${esc(c.nombre)}</b> ${c.rol ? '· ' + esc(c.rol) : ''}<br><span class="peq">${[c.telefono ? `<a href="tel:${esc(c.telefono.replace(/[^\d+]/g, ''))}">${esc(c.telefono)}</a>` : '', c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''].filter(Boolean).join(' · ')}</span></div>`).join('')) : ''}
    ${R.huella ? `<footer class="mut peq mono" style="border-top:1px solid var(--borde);padding-top:8px">Huella ${esc(R.huella.slice(0, 16))} · ${esc(R.cambios || '')}</footer>` : ''}</div>`;
}

// ---------- lista de riders ----------
async function vRider(c, a, b, x) {
  if (a && /^\d+$/.test(a)) return b === 'imprimir' ? vRiderImprimir(c, Number(a), Number(x)) : editorRider(c, Number(a), b);
  const L = await api('riders');
  c.innerHTML = `<div class="cab"><div><h1>Rider técnico</h1><div class="mut">Un rider por país (RD, EE. UU., Europa), generales y personalizados por evento. El sonidista ve la última versión guardada.</div></div>${puede('rider.editar') ? '<div class="acc"><button class="btn prim" id="nr">+ Rider</button></div>' : ''}</div>
    <div class="card sin">${L.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Rider</th><th>Banda</th><th>Para</th><th>Versión</th><th>Estado</th><th>Eventos próximos</th></tr></thead><tbody>${L.map((r) => `<tr>
      <td><a href="#/rider/${r.id}" style="font-weight:600;color:var(--tinta);text-decoration:none">${esc(r.nombre)}</a><div class="mut peq">${esc(r.codigo)}${r.actualizado ? ' · cambiado ' + esc(r.actualizado.slice(0, 10)) + (r.actualizado_por_n ? ' por ' + esc(r.actualizado_por_n) : '') : ''}</div></td>
      <td>${r.banda ? `<span class="tag">${esc(r.banda)}</span>` : '<span class="mut">Todas</span>'}</td><td class="peq">${esc(r.alcance_nombre)}${r.evento ? `<br><a href="#/eventos/${r.evento_id}/tecnico">${esc(r.evento_codigo)} · ${esc(r.evento)}</a>` : ''}</td>
      <td class="mono">${r.version ? 'v' + r.version : '—'}${r.sin_version && r.version ? '<br><span class="est adv">Cambios sin versión</span>' : ''}</td><td><span class="est ${EST_R[r.estado][0]}">${EST_R[r.estado][1]}</span></td><td>${r.eventos_proximos}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Todavía no hay riders. Cree el primero: empieza con una plantilla (plano, lista de canales y monitores) que puede cambiar.</div>'}</div>`;
  if ($('#nr')) $('#nr').onclick = () => nuevoRider(L);
}
async function nuevoRider(L, pre = {}) {
  const [B, Ev] = await Promise.all([puede('bandas.ver') ? api('bandas') : [], api(`calendario?desde=${hoyISO()}&hasta=${sumar(hoyISO(), 365)}`).catch(() => ({ eventos: [] }))]);
  const md = modal('Nuevo rider', `<label class="campo">Nombre<input name="nombre" required value="${esc(pre.nombre || '')}" placeholder="Rider Banda RD · República Dominicana"></label>
    <div class="fila"><label class="campo">Banda<select name="banda_id"><option value="">Todas</option>${B.filter((b) => b.activa).map((b) => `<option value="${b.id}"${b.id === pre.banda_id ? ' selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select></label>
      <label class="campo">Para<select name="alcance">${Object.entries(ALC_T).map(([k, t]) => `<option value="${k}"${k === (pre.alcance || 'general') ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <label class="campo" id="cev" hidden>Evento<select name="evento_id">${Ev.eventos.filter((e) => e.estado !== 'cancelado').map((e) => `<option value="${e.id}"${e.id === pre.evento_id ? ' selected' : ''}>${esc(e.fecha + ' · ' + e.codigo + ' · ' + e.nombre)}</option>`).join('')}</select></label>
    <label class="campo">Empezar desde<select name="copiar_de"><option value="">La plantilla de BandGo</option>${L.filter((r) => r.estado !== 'archivado').map((r) => `<option value="${r.id}"${r.id === pre.copiar_de ? ' selected' : ''}>Copia de ${esc(r.nombre)}${r.version ? ' (v' + r.version + ')' : ''}</option>`).join('')}</select></label>`,
  { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="cr">Crear</button>' });
  const al = $('[name=alcance]', md.el), ver = () => ($('#cev', md.el).hidden = al.value !== 'evento'); al.onchange = ver; ver();
  $('#cr', md.el).onclick = (ev) => trabajando(ev.target, async () => { const r = await api('riders', { method: 'POST', body: Object.fromEntries($$('[name]', md.el).map((i) => [i.name, i.value])) }); md.cerrar(); toast('Rider ' + r.codigo + ' creado'); location.hash = '#/rider/' + r.id; });
}

// ---------- editor ----------
async function editorRider(c, id, pest) {
  const R = await api('riders/' + id);
  const D = R.datos;
  let act = ['plano', 'canales', 'monitores', 'requerimientos', 'versiones', 'ajustes'].includes(pest) ? pest : 'plano';
  let sel = null, reloj = null, estado = 'ok';
  const hist = [JSON.stringify(D)];
  const ed = R.editar;
  const pintaEstado = () => { const e = $('#gs'); if (e) e.innerHTML = estado === 'guardando' ? '<span class="est gr">Guardando…</span>' : estado === 'error' ? '<span class="est mal">No se guardó: revise la conexión</span>' : R.sin_version ? '<span class="est adv">Borrador guardado · cambios sin versión</span>' : '<span class="est ok">Al día con la versión ' + R.version + '</span>'; };
  const guardar = async () => { clearTimeout(reloj); reloj = null; estado = 'guardando'; pintaEstado();
    try { const r = await api('riders/' + id, { method: 'PUT', body: { datos: D } }); R.sin_version = r.sin_version; estado = 'ok'; } catch { estado = 'error'; } pintaEstado(); };
  const cambio = (conHistoria = true) => { if (!ed) return; if (conHistoria) { const s = JSON.stringify(D); if (s !== hist[hist.length - 1]) { hist.push(s); if (hist.length > 60) hist.shift(); } } R.sin_version = 1; estado = 'guardando'; pintaEstado(); clearTimeout(reloj); reloj = setTimeout(guardar, 900); };
  const deshacer = () => { if (hist.length < 2) return; hist.pop(); const prev = JSON.parse(hist[hist.length - 1]); Object.assign(D, prev); sel = null; cambio(false); pintar(); };
  const salir = () => { if (reloj) guardar(); window.removeEventListener('hashchange', salir); };
  window.addEventListener('hashchange', salir);

  c.innerHTML = `<div class="mut peq no-print"><a href="#/rider">Riders</a> / ${esc(R.codigo)}</div>
    <div class="card" style="display:flex;flex-wrap:wrap;gap:16px;align-items:center"><div style="flex:1;min-width:260px;display:flex;flex-direction:column;gap:6px"><h1>${esc(R.nombre)}</h1>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="est ${EST_R[R.estado][0]}">${EST_R[R.estado][1]}</span>${R.banda ? `<span class="tag">${esc(R.banda)}</span>` : ''}<span class="tag gris">${esc(R.alcance_nombre)}</span>${R.evento ? `<a class="tag gris" href="#/eventos/${R.evento_id}/tecnico">${esc(R.evento_codigo)}</a>` : ''}<span id="gs"></span></div></div>
      <div class="acc no-print" style="display:flex;gap:8px;flex-wrap:wrap">${R.version && R.descargar ? `<a class="btn" href="#/rider/${id}/imprimir/${R.version}">Imprimir / PDF v${R.version}</a>` : ''}${ed ? '<button class="btn mor" id="gv">Guardar versión</button>' : ''}</div></div>
    <div class="pestanas no-print" role="tablist">${[['plano', 'Plano del escenario'], ['canales', `Canales · ${D.canales.length}`], ['monitores', 'Monitores'], ['requerimientos', 'Requerimientos y contactos'], ['versiones', `Versiones · ${R.versiones.length}`], ['ajustes', 'Ajustes']].map(([k, t]) => `<button role="tab" data-t="${k}" class="${k === act ? 'act' : ''}">${t}</button>`).join('')}</div><div id="pc"></div>`;
  pintaEstado();
  $$('.pestanas button').forEach((b) => (b.onclick = () => { act = b.dataset.t; $$('.pestanas button').forEach((x) => x.classList.toggle('act', x === b)); history.replaceState(null, '', `#/rider/${id}/${act}`); pintar(); }));
  if ($('#gv')) $('#gv').onclick = (ev) => { const n = prompt(R.version ? '¿Qué cambió desde la versión ' + R.version + '?' : 'Nota de la primera versión:', R.version ? '' : 'Primera versión'); if (!n) return;
    trabajando(ev.target, async () => { if (reloj) await guardar(); const r = await api(`riders/${id}/version`, { method: 'POST', body: { cambios: n } }); toast('Versión ' + r.version + ' guardada'); editorRider(c, id, act); }); };
  const pc = $('#pc');

  function pintar() {
    if (act === 'plano') return pintarPlano();
    if (act === 'canales') return pintarCanales();
    if (act === 'monitores') return pintarMonitores();
    if (act === 'requerimientos') return pintarReq();
    if (act === 'versiones') return pintarVersiones();
    return pintarAjustes();
  }

  // --- plano ---
  function pintarPlano() {
    pc.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">
      ${ed ? `<aside class="card no-print" style="flex:1 1 220px;max-width:280px;display:flex;flex-direction:column;gap:10px"><h2>Agregar</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${PALETA.map(([k, t]) => `<button class="btn chico" data-add="${k}" style="justify-content:flex-start">${esc(t)}</button>`).join('')}</div>
        <div class="fila"><label class="campo">Ancho (m)<input id="ea" inputmode="decimal" value="${D.escenario.ancho}"></label><label class="campo">Fondo (m)<input id="ef" inputmode="decimal" value="${D.escenario.fondo}"></label></div>
        <button class="btn chico" id="und">Deshacer (Ctrl+Z)</button><p class="mut peq" style="margin:0">Arrastre con el dedo o el ratón. Teclado: flechas mueven (Mayús = 50 cm), R gira, Supr quita, Ctrl+D duplica.</p></aside>` : ''}
      <div class="card" style="flex:999 1 520px;min-width:0;padding:12px" id="lienzo">${svgPlano(D, { editable: ed, sel })}</div>
      ${ed ? '<aside class="card no-print" id="props" style="flex:1 1 240px;max-width:300px;display:flex;flex-direction:column;gap:10px"></aside>' : ''}</div>`;
    if (!ed) return;
    $$('[data-add]', pc).forEach((b) => (b.onclick = () => { const t = b.dataset.add, n = D.plot.filter((p) => p.tipo === t).length;
      const p = { id: 'p' + Date.now().toString(36), tipo: t, x: Math.min(D.escenario.ancho, D.escenario.ancho / 2 + (n % 5) * 0.5), y: Math.min(D.escenario.fondo, D.escenario.fondo / 2 + (n % 3) * 0.4), rot: 0, etiqueta: t === 'texto' ? 'Texto' : t === 'musico' ? '' : PAL_N[t] };
      if (t === 'tarima') Object.assign(p, { ancho: 2.4, fondo: 2, etiqueta: 'Tarima 2,4 × 2 m' });
      D.plot.push(p); sel = p.id; cambio(); pintarPlano(); }));
    const medidas = () => { const a = Number(String($('#ea').value).replace(',', '.')), f = Number(String($('#ef').value).replace(',', '.'));
      if (a >= 2 && a <= 40 && f >= 2 && f <= 30) { D.escenario = { ancho: a, fondo: f }; D.plot.forEach((p) => { p.x = Math.min(p.x, a); p.y = Math.min(p.y, f); }); cambio(); pintarPlano(); } else toast('El ancho va de 2 a 40 m y el fondo de 2 a 30 m', true); };
    $('#ea').onchange = medidas; $('#ef').onchange = medidas;
    $('#und').onclick = deshacer;
    enlazarLienzo(); pintarProps();
  }
  function enlazarLienzo() {
    const svg = $('#lienzo svg');
    const punto = (e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
    let arr = null;
    svg.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-id]');
      if (!g) { sel = null; redibujar(); return; }
      const p = D.plot.find((x) => x.id === g.dataset.id); if (!p) return;
      sel = p.id; const q = punto(e); arr = { p, dx: q.x / 100 - p.x, dy: q.y / 100 - p.y, movio: false };
      svg.setPointerCapture(e.pointerId); e.preventDefault(); svg.focus({ preventScroll: true });
    });
    svg.addEventListener('pointermove', (e) => {
      if (!arr) return; const q = punto(e), snap = (v) => Math.round(v * 10) / 10;
      arr.p.x = Math.max(0, Math.min(D.escenario.ancho, snap(q.x / 100 - arr.dx))); arr.p.y = Math.max(0, Math.min(D.escenario.fondo, snap(q.y / 100 - arr.dy))); arr.movio = true;
      const g = svg.querySelector(`[data-id="${CSS.escape(arr.p.id)}"]`); if (g) g.setAttribute('transform', `translate(${arr.p.x * 100} ${arr.p.y * 100})`);
    });
    const soltar = () => { if (!arr) return; if (arr.movio) cambio(); arr = null; redibujar(); };
    svg.addEventListener('pointerup', soltar); svg.addEventListener('pointercancel', soltar);
    svg.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return deshacer(); }
      const p = D.plot.find((x) => x.id === sel); if (!p) return;
      const paso = e.shiftKey ? 0.5 : 0.1, mov = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
      if (mov) { e.preventDefault(); p.x = Math.max(0, Math.min(D.escenario.ancho, Math.round((p.x + mov[0]) * 10) / 10)); p.y = Math.max(0, Math.min(D.escenario.fondo, Math.round((p.y + mov[1]) * 10) / 10)); cambio(); redibujar(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); quitar(p); }
      else if (e.key.toLowerCase() === 'r' && !e.ctrlKey) { p.rot = (p.rot + (e.shiftKey ? -15 : 15)) % 360; cambio(); redibujar(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicar(p); }
    });
  }
  function redibujar() { const l = $('#lienzo'); if (!l) return; const foco = document.activeElement?.tagName === 'svg'; l.innerHTML = svgPlano(D, { editable: ed, sel }); enlazarLienzo(); pintarProps(); if (foco) $('#lienzo svg').focus({ preventScroll: true }); }
  const quitar = (p) => { D.plot = D.plot.filter((x) => x !== p); sel = null; cambio(); redibujar(); };
  const duplicar = (p) => { const n = { ...p, id: 'p' + Date.now().toString(36), x: Math.min(D.escenario.ancho, p.x + 0.5), y: Math.min(D.escenario.fondo, p.y + 0.3) }; D.plot.push(n); sel = n.id; cambio(); redibujar(); };
  function pintarProps() {
    const el = $('#props'); if (!el) return;
    const p = D.plot.find((x) => x.id === sel);
    if (!p) { el.innerHTML = `<h2>Elemento</h2><p class="mut peq" style="margin:0">Toque un elemento del plano para cambiar su nombre, girarlo o quitarlo.</p><div class="peq">${D.plot.length} elementos en el escenario.</div>`; return; }
    el.innerHTML = `<h2>${esc(PAL_N[p.tipo])}</h2><label class="campo">${p.tipo === 'texto' ? 'Texto' : 'Etiqueta'}<input id="pe" value="${esc(p.etiqueta)}" maxlength="60"></label>
      ${['musico', 'mic', 'mic_inst', 'monitor', 'iem'].includes(p.tipo) && R.musicos.length ? `<label class="campo">Integrante<select id="pm"><option value="">—</option>${R.musicos.map((m) => `<option value="${m.id}"${m.id === p.musico_id ? ' selected' : ''}>${esc(m.nombre)}${m.instrumento ? ' · ' + esc(m.instrumento) : ''}</option>`).join('')}</select></label>` : ''}
      ${p.tipo === 'tarima' ? `<div class="fila"><label class="campo">Ancho (m)<input id="ta" inputmode="decimal" value="${p.ancho}"></label><label class="campo">Fondo (m)<input id="tf" inputmode="decimal" value="${p.fondo}"></label></div>` : ''}
      <div class="fila"><label class="campo">X (m)<input id="px" inputmode="decimal" value="${p.x}"></label><label class="campo">Y (m)<input id="py" inputmode="decimal" value="${p.y}"></label></div>
      <div style="display:flex;gap:6px;align-items:center"><button class="btn chico" id="r1" aria-label="Girar a la izquierda">↺ 15°</button><span class="mono peq" style="flex:1;text-align:center">${p.rot}°</span><button class="btn chico" id="r2" aria-label="Girar a la derecha">↻ 15°</button></div>
      <div style="display:flex;gap:6px"><button class="btn chico" id="dup" style="flex:1">Duplicar</button><button class="btn chico peligro" id="del" style="flex:1">Quitar</button></div>`;
    const num = (v, max) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : null; };
    $('#pe').oninput = (e) => { p.etiqueta = e.target.value; const l = $('#lienzo'); l.innerHTML = svgPlano(D, { editable: ed, sel }); enlazarLienzo(); cambio(); };
    if ($('#pm')) $('#pm').onchange = (e) => { const m = R.musicos.find((x) => x.id === Number(e.target.value)); p.musico_id = m ? m.id : undefined; if (m && (!p.etiqueta || p.etiqueta === PAL_N[p.tipo])) p.etiqueta = p.tipo === 'musico' ? m.nombre.split(' ')[0] : `${PAL_N[p.tipo]} · ${m.nombre.split(' ')[0]}`; cambio(); redibujar(); };
    if ($('#ta')) { const t = () => { const a = num($('#ta').value, D.escenario.ancho), f = num($('#tf').value, D.escenario.fondo); if (a >= 0.5 && f >= 0.5) { p.ancho = a; p.fondo = f; cambio(); redibujar(); } }; $('#ta').onchange = t; $('#tf').onchange = t; }
    $('#px').onchange = (e) => { const v = num(e.target.value, D.escenario.ancho); if (v != null) { p.x = v; cambio(); redibujar(); } };
    $('#py').onchange = (e) => { const v = num(e.target.value, D.escenario.fondo); if (v != null) { p.y = v; cambio(); redibujar(); } };
    $('#r1').onclick = () => { p.rot = (p.rot - 15) % 360; cambio(); redibujar(); };
    $('#r2').onclick = () => { p.rot = (p.rot + 15) % 360; cambio(); redibujar(); };
    $('#dup').onclick = () => duplicar(p); $('#del').onclick = () => quitar(p);
  }

  // --- canales ---
  const inp = (k, v, w, extra = '') => `<input data-k="${k}" value="${esc(v ?? '')}" ${ed ? '' : 'disabled'} style="height:34px;width:${w}px;border:1px solid var(--borde2);border-radius:8px;padding:0 8px" ${extra}>`;
  function pintarCanales() {
    const C = D.canales;
    pc.innerHTML = `${ed ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn chico prim" id="ac">+ Canal</button><button class="btn chico" id="bat">+ Batería completa (8)</button><button class="btn chico" id="dpl">Crear canales desde el plano</button><button class="btn chico" id="num">Numerar 1, 2, 3…</button></div>` : ''}
      <div class="card sin"><div class="desliza"><table class="tabla"><thead><tr><th>Canal</th><th>Fuente</th><th>Micrófono / conexión</th><th>Soporte</th><th>48V</th><th>Sub</th><th>Notas</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>${C.map((x, i) => `<tr data-i="${i}">
        <td>${inp('n', x.n, 56, 'inputmode="numeric"')}</td><td>${inp('fuente', x.fuente, 150)}</td><td>${inp('mic', x.mic, 200)}</td>
        <td><select data-k="soporte" ${ed ? '' : 'disabled'} style="height:34px;border:1px solid var(--borde2);border-radius:8px">${Object.entries(SOP_T).map(([k, t]) => `<option value="${k}"${k === x.soporte ? ' selected' : ''}>${t}</option>`).join('')}</select></td>
        <td style="text-align:center"><input type="checkbox" data-k="phantom" ${x.phantom ? 'checked' : ''} ${ed ? '' : 'disabled'} aria-label="Phantom 48V"></td><td>${inp('sub', x.sub, 50)}</td><td>${inp('notas', x.notas, 160)}</td>
        ${ed ? `<td style="white-space:nowrap"><button class="btn chico" data-up="${i}" aria-label="Subir">↑</button> <button class="btn chico" data-dn="${i}" aria-label="Bajar">↓</button> <button class="btn chico" data-q="${i}" aria-label="Quitar">×</button></td>` : ''}</tr>`).join('')}</tbody></table></div>${C.length ? '' : '<div class="vacio">Sin canales.</div>'}</div>`;
    if (!ed) return;
    $$('tr[data-i] [data-k]', pc).forEach((f) => (f.onchange = () => { const x = C[f.closest('tr').dataset.i], k = f.dataset.k; x[k] = k === 'phantom' ? f.checked : k === 'n' ? Number(f.value) || x.n : f.value; cambio(); }));
    $$('[data-q]', pc).forEach((b) => (b.onclick = () => { C.splice(Number(b.dataset.q), 1); cambio(); pintarCanales(); }));
    $$('[data-up]', pc).forEach((b) => (b.onclick = () => { const i = Number(b.dataset.up); if (i > 0) { [C[i - 1], C[i]] = [C[i], C[i - 1]]; cambio(); pintarCanales(); } }));
    $$('[data-dn]', pc).forEach((b) => (b.onclick = () => { const i = Number(b.dataset.dn); if (i < C.length - 1) { [C[i + 1], C[i]] = [C[i], C[i + 1]]; cambio(); pintarCanales(); } }));
    const sig = () => (C.length ? Math.max(...C.map((x) => x.n)) + 1 : 1);
    $('#ac').onclick = () => { C.push({ n: sig(), fuente: '', mic: '', soporte: '', phantom: false, sub: '', notas: '' }); cambio(); pintarCanales(); };
    $('#bat').onclick = () => { [['Kick', 'Beta 52 / D112', 'bajo'], ['Snare', 'SM57', 'clip'], ['Hi-Hat', 'Condensador', 'bajo', true], ['Tom 1', 'e604', 'clip'], ['Tom 2', 'e604', 'clip'], ['Floor tom', 'e604', 'clip'], ['OH L', 'Condensador', 'alto', true], ['OH R', 'Condensador', 'alto', true]]
      .forEach(([f, m, s, ph]) => C.push({ n: sig(), fuente: f, mic: m, soporte: s, phantom: !!ph, sub: '', notas: '' })); cambio(); pintarCanales(); };
    $('#dpl').onclick = () => { const ya = new Set(C.map((x) => x.fuente.toLowerCase())); let n = 0;
      D.plot.filter((p) => ['mic', 'mic_inst', 'di'].includes(p.tipo) && p.etiqueta && !ya.has(p.etiqueta.toLowerCase())).forEach((p) => { C.push({ n: sig(), fuente: p.etiqueta, mic: p.tipo === 'di' ? 'DI Box' : p.tipo === 'mic' ? 'Micrófono vocal' : 'Micrófono de instrumento', soporte: p.tipo === 'mic' ? 'alto' : p.tipo === 'mic_inst' ? 'bajo' : '', phantom: false, sub: '', notas: '' }); n++; });
      toast(n ? n + ' canal(es) agregado(s)' : 'Todos los micrófonos y DI del plano ya tienen canal'); if (n) { cambio(); pintarCanales(); } };
    $('#num').onclick = () => { C.forEach((x, i) => (x.n = i + 1)); cambio(); pintarCanales(); };
  }
  function pintarMonitores() {
    const M = D.mezclas;
    pc.innerHTML = `${ed ? '<div><button class="btn chico prim" id="am">+ Mezcla</button></div>' : ''}<div class="card sin"><div class="desliza"><table class="tabla"><thead><tr><th>Mezcla</th><th>Para</th><th>Tipo</th><th>Notas</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>${M.map((x, i) => `<tr data-i="${i}"><td>${inp('n', x.n, 56, 'inputmode="numeric"')}</td><td>${inp('para', x.para, 180)}</td>
      <td><select data-k="tipo" ${ed ? '' : 'disabled'} style="height:34px;border:1px solid var(--borde2);border-radius:8px">${Object.entries(MEZ_T).map(([k, t]) => `<option value="${k}"${k === x.tipo ? ' selected' : ''}>${t}</option>`).join('')}</select></td><td>${inp('notas', x.notas, 240)}</td>${ed ? `<td><button class="btn chico" data-q="${i}" aria-label="Quitar">×</button></td>` : ''}</tr>`).join('')}</tbody></table></div>${M.length ? '' : '<div class="vacio">Sin mezclas de monitor.</div>'}</div>`;
    if (!ed) return;
    $$('tr[data-i] [data-k]', pc).forEach((f) => (f.onchange = () => { const x = M[f.closest('tr').dataset.i], k = f.dataset.k; x[k] = k === 'n' ? Number(f.value) || x.n : f.value; cambio(); }));
    $$('[data-q]', pc).forEach((b) => (b.onclick = () => { M.splice(Number(b.dataset.q), 1); cambio(); pintarMonitores(); }));
    $('#am').onclick = () => { M.push({ n: M.length ? Math.max(...M.map((x) => x.n)) + 1 : 1, para: '', tipo: 'cuna', notas: '' }); cambio(); pintarMonitores(); };
  }
  function pintarReq() {
    pc.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">${SEC_T.map(([k, t]) => `<label class="card campo" style="gap:8px"><b>${t}</b><textarea data-s="${k}" rows="5" ${ed ? '' : 'disabled'}>${esc(D.secciones[k] || '')}</textarea></label>`).join('')}</div>
      <div class="card sin"><div class="card-h"><h2>Contactos técnicos</h2>${ed ? '<button class="btn chico" id="acn">+ Contacto</button>' : ''}</div><div class="desliza"><table class="tabla"><tbody>${D.contactos.map((x, i) => `<tr data-i="${i}"><td>${inp('nombre', x.nombre, 170, 'placeholder="Nombre"')}</td><td>${inp('rol', x.rol, 150, 'placeholder="Ingeniero FOH"')}</td><td>${inp('telefono', x.telefono, 140, 'placeholder="Teléfono"')}</td><td>${inp('email', x.email, 200, 'placeholder="Correo"')}</td>${ed ? `<td><button class="btn chico" data-q="${i}" aria-label="Quitar">×</button></td>` : ''}</tr>`).join('')}</tbody></table></div>${D.contactos.length ? '' : '<div class="vacio">Sin contactos.</div>'}</div>`;
    if (!ed) return;
    $$('[data-s]', pc).forEach((t) => (t.oninput = () => { D.secciones[t.dataset.s] = t.value; cambio(); }));
    $$('tr[data-i] [data-k]', pc).forEach((f) => (f.onchange = () => { D.contactos[f.closest('tr').dataset.i][f.dataset.k] = f.value; cambio(); }));
    $$('[data-q]', pc).forEach((b) => (b.onclick = () => { D.contactos.splice(Number(b.dataset.q), 1); cambio(); pintarReq(); }));
    $('#acn').onclick = () => { D.contactos.push({ nombre: '', rol: '', telefono: '', email: '' }); pintarReq(); };
  }
  function pintarVersiones() {
    pc.innerHTML = `<div class="card">${R.versiones.length ? R.versiones.map((v) => `<div style="padding:10px 0;border-top:1px solid var(--suave);display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap">
      <span><b>Versión ${v.version}</b> · ${esc(v.creado)} · ${esc(v.por || '')}<br><span class="peq">${esc(v.cambios)}</span><br><span class="mono mut" style="font-size:11px">huella ${esc(v.huella.slice(0, 16))}</span></span>
      <span style="display:flex;gap:6px">${R.descargar ? `<a class="btn chico" href="#/rider/${id}/imprimir/${v.version}">Ver / imprimir</a>` : ''}${ed ? `<button class="btn chico" data-res="${v.version}">Usar como borrador</button>` : ''}</span></div>`).join('') : '<p class="mut" style="margin:0">Todavía no hay versiones. Cuando el rider esté listo, toque «Guardar versión»: queda congelado con fecha, autor y nota, y es lo que verá el sonidista.</p>'}
      ${R.eventos.length ? `<h2 style="margin-top:16px">Eventos que lo usan</h2>${R.eventos.map((e) => `<div class="peq" style="padding:4px 0"><a href="#/eventos/${e.id}/tecnico">${esc(e.fecha)} · ${esc(e.codigo)} · ${esc(e.nombre)}</a> <span class="mut">${esc([e.ciudad, e.pais].filter(Boolean).join(', '))}</span></div>`).join('')}` : ''}</div>`;
    $$('[data-res]', pc).forEach((b) => (b.onclick = () => { if (confirm('El borrador actual se reemplaza por la versión ' + b.dataset.res + '. Las versiones guardadas no cambian. ¿Seguir?')) trabajando(b, async () => { await api(`riders/${id}/restaurar/${b.dataset.res}`, { method: 'POST' }); toast('Borrador restaurado'); editorRider(c, id, 'plano'); }); }));
  }
  async function pintarAjustes() {
    const B = puede('bandas.ver') ? await api('bandas') : [];
    pc.innerHTML = `<form class="card" id="fa" style="display:flex;flex-direction:column;gap:12px;max-width:640px"><label class="campo">Nombre<input name="nombre" value="${esc(R.nombre)}" ${ed ? '' : 'disabled'}></label>
      <div class="fila"><label class="campo">Banda<select name="banda_id" ${ed ? '' : 'disabled'}><option value="">Todas</option>${B.map((b) => `<option value="${b.id}"${b.id === R.banda_id ? ' selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select></label>
        <label class="campo">Para<select name="alcance" ${ed ? '' : 'disabled'}>${Object.entries(ALC_T).filter(([k]) => k !== 'evento' || R.alcance === 'evento').map(([k, t]) => `<option value="${k}"${k === R.alcance ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="campo">Estado<select name="estado" ${ed ? '' : 'disabled'}>${Object.entries(EST_R).map(([k, x]) => `<option value="${k}"${k === R.estado ? ' selected' : ''}>${x[1]}</option>`).join('')}</select></label></div>
      ${ed ? '<div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap"><button type="button" class="btn" id="cp">Duplicar para otro país o evento</button><button class="btn prim">Guardar</button></div>' : ''}</form>`;
    if (!ed) return;
    $('#fa').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button.prim', ev.target), async () => { await api('riders/' + id, { method: 'PUT', body: datosDe(ev.target) }); toast('Guardado'); editorRider(c, id, 'ajustes'); }); };
    $('#cp').onclick = async () => nuevoRider(await api('riders'), { nombre: R.nombre + ' (copia)', banda_id: R.banda_id, copiar_de: id });
  }
  window.onkeydown = null;
  pintar();
}

// hoja para imprimir / PDF de una versión
async function vRiderImprimir(c, id, v) {
  const R = await api(`riders/${id}/versiones/${v}?imprimir=1`);
  c.innerHTML = `<div class="no-print" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><a class="btn" href="#/rider/${id}">Volver al rider</a><button class="btn prim" onclick="window.print()">Imprimir o guardar PDF</button></div>
    <div class="card" style="padding:28px">${htmlRider(R)}</div>`;
}

// ---------- pestaña «Técnico» del evento ----------
async function tabTecnico(pc, e) {
  const T2 = await api(`eventos/${e.id}/tecnico`);
  const ed = T2.editar;
  pc.innerHTML = `${T2.sugerido && ed ? `<div class="aviso mor" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span>Para un evento en ${esc(e.pais || 'este país')} se sugiere <b>${esc(T2.sugerido.nombre)}</b> (v${T2.sugerido.version}).</span><button class="btn chico mor" id="asg">Asignar</button></div>` : ''}
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start"><form class="card" id="ft" style="flex:999 1 460px;display:flex;flex-direction:column;gap:12px"><h2>Rider y sonido</h2>
      <label class="campo">Rider de este evento<select name="rider_id" ${ed ? '' : 'disabled'}><option value="">— Sin rider —</option>${T2.opciones.map((o) => `<option value="${o.id}"${o.id === T2.rider?.id ? ' selected' : ''}>${esc(o.nombre)} · ${esc(o.alcance_nombre)}${o.version ? ' · v' + o.version : ' · sin versión'}</option>`).join('')}</select></label>
      ${T2.rider ? `<div class="peq">${T2.rider.version ? `El sonidista ve la <b>versión ${T2.rider.version}</b>.` : '<span class="est adv">Este rider todavía no tiene una versión guardada: el sonidista no lo verá.</span>'} ${T2.ver_rider ? `<a href="#/rider/${T2.rider.id}">Abrir el rider</a>` : ''}${T2.rider.version && puede('rider.descargar') ? ` · <a href="#/rider/${T2.rider.id}/imprimir/${T2.rider.version}">Imprimir</a>` : ''}</div>` : ''}
      <div class="fila"><label class="campo">Empresa que provee el sonido<input name="sonido_proveedor" value="${esc(T2.sonido_proveedor || '')}" ${ed ? '' : 'disabled'}></label><label class="campo">Técnico local<input name="sonido_tecnico" value="${esc(T2.sonido_tecnico || '')}" ${ed ? '' : 'disabled'}></label></div>
      <div class="fila"><label class="campo">Teléfono<input name="sonido_telefono" inputmode="tel" value="${esc(T2.sonido_telefono || '')}" ${ed ? '' : 'disabled'}></label><label class="campo">Correo<input name="sonido_email" type="email" value="${esc(T2.sonido_email || '')}" ${ed ? '' : 'disabled'}></label></div>
      <label class="campo">Datos del escenario<textarea name="escenario_info" rows="3" placeholder="Medidas, altura, techado, acceso de carga…" ${ed ? '' : 'disabled'}>${esc(T2.escenario_info || '')}</textarea></label>
      ${ed ? `<div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">${puede('rider.editar') ? '<button type="button" class="btn" id="pers">Crear rider personalizado para este evento</button>' : '<span></span>'}<button class="btn prim">Guardar</button></div>` : ''}</form>
      <aside class="card" style="flex:1 1 260px;display:flex;flex-direction:column;gap:8px"><h2>Sonidistas asignados</h2>${T2.sonidistas.map((s) => `<div><b>${esc(s.nombre)}</b><div class="peq mut">${esc(s.whatsapp || s.telefono || '')}</div></div>`).join('') || '<p class="mut peq" style="margin:0">Ningún sonidista en el equipo. Agréguelo en la pestaña Equipo para que vea el rider y los horarios en su portal.</p>'}
        <div class="horario peq" style="margin-top:6px">${[['Llegada', e.hora_llegada], ['Montaje', e.hora_montaje], ['Sound check', e.hora_soundcheck], ['Presentación', e.hora_show]].filter((h) => h[1]).map(([t, h]) => `<div><b>${esc(h)}</b> ${t}</div>`).join('')}</div></aside></div>`;
  if (!ed) return;
  $('#ft').onsubmit = (ev) => { ev.preventDefault(); trabajando($('button.prim', ev.target), async () => { await api(`eventos/${e.id}/tecnico`, { method: 'PUT', body: datosDe(ev.target) }); toast('Guardado'); tabTecnico(pc, e); }); };
  if ($('#asg')) $('#asg').onclick = (ev) => trabajando(ev.target, async () => { await api(`eventos/${e.id}/tecnico`, { method: 'PUT', body: { rider_id: T2.sugerido.id } }); toast('Rider asignado'); tabTecnico(pc, e); });
  if ($('#pers')) $('#pers').onclick = (ev) => trabajando(ev.target, async () => {
    const base = T2.rider?.id || T2.sugerido?.id;
    const r = await api('riders', { method: 'POST', body: { nombre: `Rider ${e.nombre}`, alcance: 'evento', evento_id: e.id, banda_id: e.banda_id || '', ...(base ? { copiar_de: base } : {}) } });
    toast('Rider ' + r.codigo + ' creado y asignado'); location.hash = '#/rider/' + r.id; });
}

// ---------- portal del sonidista ----------
async function portalTecnico(pc, arg, ev) {
  if (arg === 'rider' && ev) {
    const R = await api('portal/rider/' + ev);
    pc.innerHTML = `<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:12px"><a href="#/tecnico" class="peq">‹ Volver a mis eventos</a>${htmlRider(R)}</div>`;
    return;
  }
  const L = await api('portal/tecnico');
  const tel = (t) => (t ? `<a class="btn chico" href="tel:${esc(String(t).replace(/[^\d+]/g, ''))}">Llamar</a> <a class="btn chico" target="_blank" rel="noopener" href="https://wa.me/${esc(String(t).replace(/\D/g, ''))}">WhatsApp</a>` : '');
  pc.innerHTML = L.length ? L.map((e) => `<div class="card" style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between;gap:8px"><span class="peq mut" style="font-weight:700">${esc(diaTxt(e.fecha, { weekday: 'long', day: 'numeric', month: 'short' }))}</span>${e.banda ? `<span class="tag">${esc(e.banda)}</span>` : ''}</div>
      <b style="font-size:17px">${esc(e.nombre)}</b><div class="peq">${esc([e.lugar, e.direccion, e.ciudad, e.pais].filter(Boolean).join(', '))} ${mapa([e.lugar, e.direccion, e.ciudad, e.pais].filter(Boolean).join(', '))}</div>
      <div class="horario" style="gap:4px">${[['Llegada', e.hora_llegada], ['Montaje', e.hora_montaje], ['Sound check', e.hora_soundcheck], ['Presentación', e.hora_show]].filter((h) => h[1]).map(([t, h]) => `<div><b>${esc(h)}</b>${t}</div>`).join('')}</div>
      ${e.escenario_info ? `<div class="peq" style="background:var(--fondo);padding:8px 10px;border-radius:8px"><b>Escenario:</b> ${esc(e.escenario_info)}</div>` : ''}
      ${e.sonido_proveedor || e.sonido_tecnico ? `<div class="peq"><b>Sonido:</b> ${esc([e.sonido_proveedor, e.sonido_tecnico].filter(Boolean).join(' · '))}${e.sonido_email ? `<br><a href="mailto:${esc(e.sonido_email)}">${esc(e.sonido_email)}</a>` : ''}<div style="margin-top:6px">${tel(e.sonido_telefono)}</div></div>` : ''}
      ${e.rider_id && e.rider_version ? `<a class="btn prim" style="white-space:normal;height:auto;min-height:44px;padding:10px 14px;text-align:center;line-height:1.3" href="#/tecnico/rider/${e.id}">Ver rider · ${esc(e.rider)} · v${e.rider_version}</a>` : '<span class="est gr">Todavía no hay rider asignado</span>'}</div>`).join('')
    : '<div class="card mut">No tiene eventos próximos asignados.</div>';
}
