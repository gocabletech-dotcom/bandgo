// BandGo · Fase 6 en la app: reportes con filtros, gráfico por moneda, tabla con totales, consolidado en la moneda base,
// exportación a Excel y hoja para imprimir / PDF; y el presupuesto estimado del evento (pestaña Finanzas).
'use strict';
const REP_ORDEN = ['ventas', 'cobros', 'gastos', 'rentabilidad', 'presupuesto', 'pagos', 'control'];
const fmtN = (v) => (v == null ? '—' : Number(v).toLocaleString('es-DO'));
const fmtP = (v) => (v == null ? '—' : (v * 100).toLocaleString('es-DO', { maximumFractionDigits: 1 }) + ' %');
const celda = (c, v, mon) => (c.tipo === 'dinero' ? esc(dinero(v ?? 0, mon)) : c.tipo === 'num' ? fmtN(v) : c.tipo === 'pct' ? fmtP(v) : esc(v ?? ''));

// barras verticales de una sola serie (una moneda); el título nombra la serie, por eso no lleva leyenda
function graficoBarras(filas, valor, moneda, titulo) {
  if (!filas.length) return '';
  const W = 560, H = 230, iz = 62, ab = 40, ar = 12, an = W - iz - 10;
  const vals = filas.map((f) => f[valor] || 0), max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  const paso = (() => { const r = (max - min) / 4 || 1, p = 10 ** Math.floor(Math.log10(r)), n = r / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; })();
  const top = Math.ceil(max / paso) * paso || paso, bot = Math.floor(min / paso) * paso;
  const y = (v) => ar + (H - ar - ab) * (1 - (v - bot) / (top - bot || 1));
  const bw = Math.max(4, Math.min(48, an / filas.length - 6)), x = (i) => iz + (an / filas.length) * (i + 0.5);
  const lineas = []; for (let v = bot; v <= top + 1e-9; v += paso) lineas.push(`<line x1="${iz}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? '#94A3B8' : '#E2E8F0'}" stroke-width="1"/><text x="${iz - 8}" y="${y(v) + 4}" text-anchor="end" font-size="13" fill="#64748B" font-family="JetBrains Mono, monospace">${esc(Number(v).toLocaleString('es-DO', { notation: Math.abs(v) >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: 1 }))}</text>`);
  const cada = Math.ceil(filas.length / 7);
  const barras = filas.map((f, i) => {
    const v = f[valor] || 0, y0 = y(0), y1 = y(v), h = Math.max(1, Math.abs(y0 - y1)), cx = x(i), r = Math.min(4, bw / 2, h);
    const d = v >= 0 ? `M${cx - bw / 2},${y0} V${y1 + r} Q${cx - bw / 2},${y1} ${cx - bw / 2 + r},${y1} H${cx + bw / 2 - r} Q${cx + bw / 2},${y1} ${cx + bw / 2},${y1 + r} V${y0} Z`
      : `M${cx - bw / 2},${y0} V${y1 - r} Q${cx - bw / 2},${y1} ${cx - bw / 2 + r},${y1} H${cx + bw / 2 - r} Q${cx + bw / 2},${y1} ${cx + bw / 2},${y1 - r} V${y0} Z`;
    const et = String(f.grupo || '').replace(/^(\w{3})\w* (\d{4})$/, '$1 $2');
    return `<g class="gb" data-t="${esc(f.grupo)}" data-v="${esc(dinero(v, moneda))}"><path d="${d}" fill="${v >= 0 ? '#7C02F7' : '#C2410C'}"/><rect x="${cx - an / filas.length / 2}" y="${ar}" width="${an / filas.length}" height="${H - ar - ab}" fill="transparent"/>
      ${i % cada === 0 ? `<text x="${cx}" y="${H - ab + 16}" text-anchor="middle" font-size="13" fill="#64748B" font-family="Plus Jakarta Sans, sans-serif">${esc(et.length > 12 ? et.slice(0, 11) + '…' : et)}</text>` : ''}</g>`;
  }).join('');
  return `<figure class="card" style="margin:0;position:relative"><figcaption style="font-weight:700;margin-bottom:6px">${esc(titulo)} · ${esc(moneda)}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="${esc(titulo)} en ${esc(moneda)}">${lineas.join('')}${barras}</svg><div class="tt" hidden style="position:absolute;pointer-events:none;background:#0F172A;color:#fff;padding:6px 10px;border-radius:8px;font-size:12px;white-space:nowrap"></div></figure>`;
}
function enlazarTooltips(el) {
  $$('figure', el).forEach((fig) => { const tt = $('.tt', fig); if (!tt) return;
    $$('.gb', fig).forEach((g) => { g.onpointerenter = () => { tt.hidden = false; tt.innerHTML = `<b>${esc(g.dataset.t)}</b><br>${esc(g.dataset.v)}`; $('path', g).style.opacity = '.8'; };
      g.onpointermove = (e) => { const r = fig.getBoundingClientRect(); tt.style.left = Math.min(r.width - 160, e.clientX - r.left + 12) + 'px'; tt.style.top = e.clientY - r.top - 40 + 'px'; };
      g.onpointerleave = () => { tt.hidden = true; $('path', g).style.opacity = ''; }; }); });
}

async function vReportes(c, rep) {
  const CAT = await api('reportes');
  const act = REP_ORDEN.includes(rep) ? rep : 'ventas';
  let F = {}; try { F = JSON.parse(sessionStorage.getItem('bg_rep') || '{}'); } catch {}
  const anio = hoyISO().slice(0, 4);
  F.desde ||= anio + '-01-01'; F.hasta ||= anio + '-12-31';
  const R = CAT.reportes[act];
  if (!R.agrupar[F['ag_' + act]]) F['ag_' + act] = Object.keys(R.agrupar)[0];
  const sel = (id, ops, v, todos) => `<select id="${id}" style="height:40px;border:1px solid var(--borde2);border-radius:8px;padding:0 8px;max-width:190px">${todos ? `<option value="">${todos}</option>` : ''}${ops.map(([k, t]) => `<option value="${esc(k)}"${String(k) === String(v ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  c.innerHTML = `<div class="cab no-print"><div><h1>Reportes</h1><div class="mut">Salen de los movimientos y cuadres; nada se calcula aparte.</div></div>
      <div class="acc">${CAT.exportar ? '<button class="btn" id="xl">Excel</button><button class="btn" id="pdf">Imprimir / PDF</button>' : ''}</div></div>
    <div class="pestanas no-print" role="tablist">${REP_ORDEN.map((k) => `<button role="tab" class="${k === act ? 'act' : ''}" data-r="${k}">${esc(CAT.reportes[k].titulo.replace(' estimado frente a resultado real', ' vs real'))}</button>`).join('')}</div>
    <div class="card no-print" style="display:flex;flex-wrap:wrap;gap:8px;align-items:end">
      <label class="campo" style="width:auto">Desde<input type="date" id="fd" value="${F.desde}"></label><label class="campo" style="width:auto">Hasta<input type="date" id="fh" value="${F.hasta}"></label>
      ${sel('rap', [['mes', 'Este mes'], ['anio', 'Este año'], ['ant', 'Año pasado'], ['12', 'Últimos 12 meses']], '', 'Rápido…')}
      ${Object.keys(R.agrupar).length > 1 ? `<label class="campo" style="width:auto">Agrupar por${sel('fa', Object.entries(R.agrupar), F['ag_' + act])}</label>` : ''}
      ${sel('fb', CAT.bandas.map((b) => [b.id, b.nombre]), F.banda, 'Todas las bandas')}${sel('fk', CAT.bookings.map((b) => [b.id, b.nombre]), F.booking, 'Todos los booking')}
      ${sel('fp', CAT.paises.map((p) => [p, p]), F.pais, 'Todos los países')}${sel('fm', [['USD', 'USD'], ['DOP', 'DOP'], ['EUR', 'EUR']], F.moneda, 'Todas las monedas')}
      ${sel('fe', Object.entries(CAT.estados), F.estado, 'Todos los estados')}${sel('ft', [['publico', 'Públicos'], ['privado', 'Privados']], F.tipo, 'Público y privado')}
      ${sel('fc', CAT.clientes.map((x) => [x.id, x.nombre]), F.cliente, 'Todos los clientes')}
      <label class="chk" style="height:40px"><input type="checkbox" id="fx" ${F.consolidar ? 'checked' : ''}> Consolidar en ${esc(CAT.moneda_base)}</label></div>
    <div id="rr" style="display:flex;flex-direction:column;gap:14px"></div>`;
  const leer = () => { F = { ...F, desde: $('#fd').value, hasta: $('#fh').value, banda: $('#fb').value, booking: $('#fk').value, pais: $('#fp').value, moneda: $('#fm').value, estado: $('#fe').value, tipo: $('#ft').value, cliente: $('#fc').value, consolidar: $('#fx').checked };
    if ($('#fa')) F['ag_' + act] = $('#fa').value; sessionStorage.setItem('bg_rep', JSON.stringify(F)); };
  const qs = (extra = '') => { const p = new URLSearchParams({ desde: F.desde, hasta: F.hasta, agrupar: F['ag_' + act] || '' });
    for (const k of ['banda', 'booking', 'pais', 'moneda', 'estado', 'tipo', 'cliente']) if (F[k]) p.set(k, F[k]); if (F.consolidar) p.set('consolidar', '1'); return p.toString() + extra; };
  $$('[data-r]').forEach((b) => (b.onclick = () => { location.hash = '#/reportes/' + b.dataset.r; }));
  $('#rap').onchange = (e) => { const h = hoyISO(), v = e.target.value; if (!v) return;
    if (v === 'mes') { $('#fd').value = h.slice(0, 8) + '01'; const d = new Date(Number(h.slice(0, 4)), Number(h.slice(5, 7)), 0); $('#fh').value = h.slice(0, 8) + String(d.getDate()).padStart(2, '0'); }
    if (v === 'anio') { $('#fd').value = anio + '-01-01'; $('#fh').value = anio + '-12-31'; }
    if (v === 'ant') { $('#fd').value = anio - 1 + '-01-01'; $('#fh').value = anio - 1 + '-12-31'; }
    if (v === '12') { $('#fd').value = sumar(h, -365); $('#fh').value = h; }
    e.target.value = ''; cargar(); };
  $$('.card.no-print input, .card.no-print select').forEach((x) => { if (x.id !== 'rap') x.onchange = cargar; });
  if ($('#xl')) $('#xl').onclick = (ev) => trabajando(ev.target, async () => {
    leer(); const r = await fetch('/api/reportes/' + act + '?' + qs('&formato=xlsx'), { headers: { 'x-requested-with': 'bg' }, credentials: 'same-origin' });
    if (!r.ok) { let m = 'No se pudo exportar'; try { m = (await r.json()).error || m; } catch {} throw new Error(m); }
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `BandGo-${act}-${F.desde}-a-${F.hasta}.xlsx`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Excel descargado'); });
  if ($('#pdf')) $('#pdf').onclick = (ev) => trabajando(ev.target, async () => { leer(); await pintar(await api('reportes/' + act + '?' + qs('&imprimir=1'))); setTimeout(() => window.print(), 200); });

  async function cargar() { leer(); $('#rr').innerHTML = '<div class="card mut">Calculando…</div>'; try { await pintar(await api('reportes/' + act + '?' + qs())); } catch (e) { $('#rr').innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`; } }
  async function pintar(D) {
    const monedas = D.totales.map((t) => t.moneda);
    const dineroCols = D.columnas.filter((c) => c.tipo === 'dinero');
    const pref = ['contratado', 'resultado', 'cobrado', 'por_cobrar', 'total', 'pendiente', 'monto', 'diferencia'];
    const clave = [...pref.map((k) => dineroCols.find((c) => c.k === k)).filter(Boolean), ...dineroCols].filter((c, i, a) => a.indexOf(c) === i).slice(0, 3);
    const filtrosTxt = [`Del ${D.filtros.desde} al ${D.filtros.hasta}`, D.filtros.pais && 'País: ' + D.filtros.pais, D.filtros.moneda && 'Moneda: ' + D.filtros.moneda, D.filtros.estado && 'Estado: ' + CAT.estados[D.filtros.estado], D.filtros.tipo && (D.filtros.tipo === 'publico' ? 'Públicos' : 'Privados'), D.agrupar_nombre && 'Agrupado por ' + D.agrupar_nombre.toLowerCase()].filter(Boolean).join(' · ');
    $('#rr').innerHTML = `<div class="solo-print"><div class="peq mut" style="font-weight:700;letter-spacing:2px">${esc(D.empresa.toUpperCase())}</div><h1 style="margin:2px 0">${esc(D.titulo)}</h1></div>
      <div class="peq mut">${esc(filtrosTxt)}</div>
      ${monedas.length ? `<section style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">${D.totales.map((t) => `<div class="card" style="display:flex;flex-direction:column;gap:6px"><div class="peq mut" style="font-weight:700;letter-spacing:1px">${esc(t.moneda)} · ${fmtN(t.filas)} fila(s)</div>${clave.map((c, i) => `<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><span class="peq">${esc(c.t)}</span><b class="mono" style="font-size:${i ? 15 : 18}px;white-space:nowrap">${esc(dinero(t[c.k] ?? 0, t.moneda))}</b></div>`).join('')}${'margen' in t ? `<div style="display:flex;justify-content:space-between"><span class="peq">Margen</span><b class="mono">${fmtP(t.margen)}</b></div>` : ''}</div>`).join('')}
        ${D.consolidado ? `<div class="card" style="background:var(--tinta);color:#fff;border-color:var(--tinta);display:flex;flex-direction:column;gap:6px"><div class="peq" style="color:#CBD5E1;font-weight:700;letter-spacing:1px">CONSOLIDADO EN ${esc(D.consolidado.moneda)}</div>${clave.map((c, i) => `<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><span class="peq" style="color:#CBD5E1">${esc(c.t)}</span><b class="mono" style="white-space:nowrap;font-size:${i ? 15 : 18}px;color:${i ? '#fff' : '#C77DFF'}">${esc(dinero(D.consolidado[c.k] ?? 0, D.consolidado.moneda))}</b></div>`).join('')}${D.consolidado.excluidas ? `<div class="peq" style="color:#FCD34D">${D.consolidado.excluidas} fila(s) sin tasa no entran</div>` : ''}</div>` : ''}</section>` : ''}
      ${D.grafico && D.filas.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:12px">${monedas.filter((m) => D.filas.filter((f) => f.moneda === m).length > 1).map((m) => graficoBarras(D.filas.filter((f) => f.moneda === m), D.grafico.valor, m, D.grafico.etiqueta)).join('')}</div>` : ''}
      <div class="card sin">${D.filas.length ? `<div class="desliza"><table class="tabla"><thead><tr>${D.columnas.map((c) => `<th style="${['dinero', 'num', 'pct'].includes(c.tipo) ? 'text-align:right' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead><tbody>
        ${D.filas.map((f) => `<tr>${D.columnas.map((c, i) => `<td class="${['dinero', 'num', 'pct'].includes(c.tipo) ? 'mono' : ''}" style="${['dinero', 'num', 'pct'].includes(c.tipo) ? 'text-align:right;white-space:nowrap' : ''}${c.tipo === 'dinero' && f[c.k] < 0 ? ';color:var(--rojo)' : ''}">${i === 0 && f.evento_id ? `<a href="#/eventos/${f.evento_id}/finanzas">${celda(c, f[c.k], f.moneda)}</a>` : celda(c, f[c.k], f.moneda)}</td>`).join('')}</tr>`).join('')}
        ${D.totales.map((t) => `<tr style="font-weight:700;background:var(--suave)">${D.columnas.map((c, i) => `<td class="${['dinero', 'num', 'pct'].includes(c.tipo) ? 'mono' : ''}" style="${['dinero', 'num', 'pct'].includes(c.tipo) ? 'text-align:right;white-space:nowrap' : ''}">${i === 0 ? 'Total ' + esc(t.moneda) : c.k === 'moneda' ? esc(t.moneda) : ['dinero', 'num', 'pct'].includes(c.tipo) && c.k in t ? celda(c, t[c.k], t.moneda) : ''}</td>`).join('')}</tr>`).join('')}
        ${D.consolidado ? `<tr style="font-weight:700;background:var(--morado-cc)">${D.columnas.map((c, i) => `<td class="mono" style="${['dinero', 'pct'].includes(c.tipo) ? 'text-align:right;white-space:nowrap' : ''}">${i === 0 ? 'Consolidado ' + esc(D.consolidado.moneda) : c.k === 'moneda' ? esc(D.consolidado.moneda) : ['dinero', 'pct'].includes(c.tipo) ? celda(c, D.consolidado[c.k], D.consolidado.moneda) : ''}</td>`).join('')}</tr>` : ''}
        </tbody></table></div>` : '<div class="vacio">No hay datos con estos filtros.</div>'}</div>
      <div class="card peq" style="display:flex;flex-direction:column;gap:6px"><div><b>Criterio:</b> ${esc(D.criterio)}</div>${D.tasas_usadas.length ? `<div><b>Tasas usadas:</b> ${D.tasas_usadas.map(esc).join(' · ')}</div>` : ''}${D.notas.map((n) => `<div class="mut">${esc(n)}</div>`).join('')}<div class="mut">Generado ${esc(new Date(D.generado).toLocaleString('es-DO'))}</div></div>`;
    enlazarTooltips($('#rr'));
  }
  await cargar();
}

// tarjeta del presupuesto estimado (dentro de la pestaña Finanzas del evento)
async function cardPresupuesto(el, e, cerrado) {
  let P; try { P = await api(`eventos/${e.id}/presupuesto`); } catch { el.innerHTML = ''; return; }
  const M = P.moneda, p = P.presupuesto || {}, r = P.real, ed = P.editar && !cerrado;
  const filas = [['nomina', 'Nómina de músicos'], ['comisiones', 'Comisiones'], ['viajes', 'Viajes (vuelos, hotel, transporte, dietas)'], ['otros', 'Otros gastos']];
  const est = filas.reduce((a, [k]) => a + (Number(p[k]) || 0), 0), real = filas.reduce((a, [k]) => a + (Number(r[k]) || 0), 0);
  el.innerHTML = `<div class="card sin"><div class="card-h"><div><h2>Presupuesto estimado frente a lo real</h2><div class="mut peq">Estime antes de confirmar; la columna real sale de la nómina, comisiones y gastos registrados.${p.actualizado ? ' Actualizado ' + esc(p.actualizado.slice(0, 10)) + (p.por ? ' por ' + esc(p.por) : '') : ''}</div></div>${ed ? '<button class="btn chico prim" id="gpr">Guardar presupuesto</button>' : ''}</div>
    <div class="desliza"><table class="tabla"><thead><tr><th>Concepto</th><th style="text-align:right">Estimado (${esc(M)})</th><th style="text-align:right">Real</th><th style="text-align:right">Diferencia</th></tr></thead><tbody>
      ${filas.map(([k, t]) => { const d = (Number(r[k]) || 0) - (Number(p[k]) || 0); return `<tr><td>${t}</td><td style="text-align:right">${ed ? `<input data-p="${k}" inputmode="decimal" value="${p[k] ?? ''}" style="height:34px;width:130px;text-align:right;border:1px solid var(--borde2);border-radius:8px;padding:0 8px">` : `<span class="mono">${esc(dinero(p[k] || 0, M))}</span>`}</td><td class="mono" style="text-align:right">${esc(dinero(r[k] || 0, M))}</td><td class="mono" style="text-align:right;color:${d > 0 ? 'var(--rojo)' : 'var(--verde)'}">${P.presupuesto ? (d > 0 ? '+' : '') + esc(dinero(d, M)) : '—'}</td></tr>`; }).join('')}
      <tr style="font-weight:700"><td>Resultado</td><td class="mono" style="text-align:right">${esc(dinero(P.contratado - est, M))}</td><td class="mono" style="text-align:right">${esc(dinero(r.resultado, M))}</td><td class="mono" style="text-align:right;color:${r.resultado - (P.contratado - est) < 0 ? 'var(--rojo)' : 'var(--verde)'}">${P.presupuesto ? esc(dinero(r.resultado - (P.contratado - est), M)) : '—'}</td></tr></tbody></table></div>
    ${ed ? `<div style="padding:0 24px 16px"><label class="campo">Notas<input data-p="notas" value="${esc(p.notas || '')}"></label></div>` : p.notas ? `<div class="peq mut" style="padding:0 24px 16px">${esc(p.notas)}</div>` : ''}</div>`;
  if ($('#gpr', el)) $('#gpr', el).onclick = (ev) => trabajando(ev.target, async () => { await api(`eventos/${e.id}/presupuesto`, { method: 'PUT', body: Object.fromEntries($$('[data-p]', el).map((i) => [i.dataset.p, i.value])) }); toast('Presupuesto guardado'); cardPresupuesto(el, e, cerrado); });
}
