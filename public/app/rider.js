// BandGo · Fase 5 en la app: riders técnicos, editor del plano del escenario (SVG, se arrastra con el dedo o el ratón),
// lista de canales, monitores, requerimientos, versiones, hoja para imprimir / PDF y la sección técnica del sonidista.
'use strict';
const ALC_T = { general: 'General', rd: 'República Dominicana', us: 'Estados Unidos', eu: 'Europa', evento: 'Personalizado para un evento' };
const EST_R = { borrador: ['gr', 'Borrador'], vigente: ['ok', 'Vigente'], archivado: ['mal', 'Archivado'] };
const SOP_T = { '': '—', alto: 'Pedestal alto', bajo: 'Pedestal bajo', clip: 'Clip', mesa: 'Mesa' };
const MEZ_T = { cuna: 'Cuña', iem_estereo: 'In-ear estéreo', iem_mono: 'In-ear mono', sidefill: 'Side fill' };
const SEC_T = [['consola', 'Consola (FOH)'], ['monitores', 'Monitores'], ['microfonia', 'Microfonía'], ['di_backline', 'DI boxes y backline'], ['energia', 'Energía eléctrica'], ['escenario', 'Escenario'], ['instrucciones', 'Instrucciones generales']];
const PALETA = [['bateria', 'Batería'], ['percusion', 'Congas'], ['timbal', 'Timbales'], ['bongo', 'Bongó'], ['guira', 'Güira'], ['teclado', 'Teclado'],
  ['guitarra', 'Guitarra'], ['bajo', 'Bajo'], ['trompeta', 'Trompeta'], ['trombon', 'Trombón'], ['saxofon', 'Saxofón'],
  ['amp_guitarra', 'Amp. guitarra'], ['amp_bajo', 'Amp. bajo'], ['mic', 'Mic. voz'], ['mic_inst', 'Mic. instrumento'],
  ['di', 'DI box'], ['monitor', 'Monitor (cuña)'], ['sidefill', 'Side fill'], ['iem', 'In-ear'], ['musico', 'Músico'], ['tarima', 'Tarima'], ['toma', 'Toma eléctrica'], ['consola', 'Consola'], ['texto', 'Texto']];
const PAL_N = Object.fromEntries(PALETA);
const T = '#0F172A', MOR = '#7C02F7', SUA = '#F1F5F9';
// degradados y texturas compartidos por todos los íconos (bronce, parches, madera, metal dorado, cromo, rejilla)
const DEFS_PLANO = `<defs>
  <radialGradient id="bgCym" cx="42%" cy="38%" r="68%"><stop offset="0" stop-color="#FDF0B5"/><stop offset=".45" stop-color="#E2B457"/><stop offset="1" stop-color="#9A6B1F"/></radialGradient>
  <radialGradient id="bgHead" cx="38%" cy="34%" r="72%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DDE3EA"/></radialGradient>
  <radialGradient id="bgSkin" cx="38%" cy="34%" r="72%"><stop offset="0" stop-color="#FCF5E6"/><stop offset="1" stop-color="#E3CB9C"/></radialGradient>
  <radialGradient id="bgWood" cx="38%" cy="34%" r="72%"><stop offset="0" stop-color="#C98446"/><stop offset="1" stop-color="#6B3410"/></radialGradient>
  <radialGradient id="bgBurst" cx="45%" cy="50%" r="60%"><stop offset="0" stop-color="#FBBF24"/><stop offset=".6" stop-color="#B45309"/><stop offset="1" stop-color="#1C1917"/></radialGradient>
  <radialGradient id="bgCone" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#6B7280"/><stop offset=".35" stop-color="#1F2937"/><stop offset="1" stop-color="#030712"/></radialGradient>
  <linearGradient id="bgGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FEF3C7"/><stop offset=".45" stop-color="#E5A823"/><stop offset="1" stop-color="#92570A"/></linearGradient>
  <linearGradient id="bgChrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#CBD5E1"/><stop offset="1" stop-color="#8592A6"/></linearGradient>
  <linearGradient id="bgBlack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3F4654"/><stop offset="1" stop-color="#0B0F19"/></linearGradient>
  <linearGradient id="bgBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60A5FA"/><stop offset="1" stop-color="#1E3A8A"/></linearGradient>
  <linearGradient id="bgShell" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#BE123C"/><stop offset="1" stop-color="#4C0519"/></linearGradient>
  <pattern id="bgMesh" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#1F2937"/><circle cx="2.5" cy="2.5" r="1.1" fill="#6B7280"/></pattern>
  <pattern id="bgMeshS" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#E5E7EB"/><circle cx="1.5" cy="1.5" r=".75" fill="#6B7280"/></pattern>
  <pattern id="bgGuira" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="none"/><circle cx="2.5" cy="2.5" r="1" fill="#64748B"/></pattern>
</defs>`;

// ---------- íconos realistas vistos desde arriba (unidades: centímetros; el escenario se mide en metros × 100; el público queda abajo) ----------
function simbolo(p) {
  const t = (s, y = 6, sz = 18, col = T) => `<text x="0" y="${y}" text-anchor="middle" font-size="${sz}" font-weight="700" font-family="Plus Jakarta Sans, sans-serif" fill="${col}">${esc(s)}</text>`;
  const anillo = (x, y, rr, n, col = '#CBD5E1', d = 2.2) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return `<circle cx="${(x + Math.cos(a) * rr).toFixed(1)}" cy="${(y + Math.sin(a) * rr).toFixed(1)}" r="${d}" fill="${col}" stroke="#475569" stroke-width=".6"/>`; }).join('');
  // tambor: casco, aro cromado, afinadores y parche
  const tambor = (x, y, r, casco = 'url(#bgShell)', parche = 'url(#bgHead)') => `<circle cx="${x}" cy="${y}" r="${r + 4}" fill="${casco}" stroke="#1E293B" stroke-width="1.5"/>${anillo(x, y, r + 4, Math.max(6, Math.round(r / 2.6)))}<circle cx="${x}" cy="${y}" r="${r + 1}" fill="none" stroke="url(#bgChrome)" stroke-width="3"/><circle cx="${x}" cy="${y}" r="${r}" fill="${parche}" stroke="#94A3B8" stroke-width="1"/><circle cx="${x}" cy="${y}" r="${(r * 0.32).toFixed(1)}" fill="none" stroke="#CBD5E1" stroke-width="1"/>`;
  // platillo: bronce con surcos, campana y agujero
  const platillo = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#bgCym)" stroke="#8A5A12" stroke-width="1.3"/><circle cx="${x}" cy="${y}" r="${(r * 0.78).toFixed(1)}" fill="none" stroke="#A9772A" stroke-opacity=".45" stroke-width="1"/><circle cx="${x}" cy="${y}" r="${(r * 0.56).toFixed(1)}" fill="none" stroke="#A9772A" stroke-opacity=".45" stroke-width="1"/><circle cx="${x}" cy="${y}" r="${(r * 0.24).toFixed(1)}" fill="url(#bgCym)" stroke="#8A5A12" stroke-width="1.2"/><circle cx="${x}" cy="${y}" r="1.8" fill="#1F2937"/>`;
  const caja = (w, h, f = 'url(#bgBlack)', rx = 5) => `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${rx}" fill="${f}" stroke="#030712" stroke-width="1.5"/>`;
  const perillas = (x0, y, n, paso, col = '#E5E7EB', r = 2.4) => Array.from({ length: n }, (_, i) => `<circle cx="${x0 + i * paso}" cy="${y}" r="${r}" fill="${col}" stroke="#111827" stroke-width=".8"/>`).join('');
  switch (p.tipo) {
    case 'bateria': return `<circle cx="0" cy="-60" r="14" fill="#111827" stroke="#030712" stroke-width="1.5"/><circle cx="0" cy="-60" r="10" fill="none" stroke="#374151" stroke-width="1" stroke-dasharray="2 2"/>`
      + `<rect x="-28" y="-14" width="56" height="42" rx="4" fill="url(#bgShell)" stroke="#1E293B" stroke-width="1.5"/><rect x="-30" y="-16" width="60" height="5" rx="2" fill="url(#bgChrome)"/><rect x="-30" y="25" width="60" height="5" rx="2" fill="url(#bgChrome)"/><rect x="-5" y="-26" width="10" height="11" rx="2" fill="#374151"/>`
      + tambor(42, -36, 18) + tambor(-30, -32, 15, 'url(#bgChrome)') + tambor(-15, -8, 12) + tambor(17, -8, 13)
      + platillo(-63, -34, 17) + platillo(-52, 16, 22) + platillo(62, 4, 25);
    case 'percusion': return tambor(-30, 8, 16, 'url(#bgWood)', 'url(#bgSkin)') + tambor(0, -16, 18, 'url(#bgWood)', 'url(#bgSkin)') + tambor(31, 8, 20, 'url(#bgWood)', 'url(#bgSkin)');
    case 'timbal': return platillo(-46, -30, 16) + tambor(-21, 4, 17, 'url(#bgChrome)') + tambor(22, 4, 19, 'url(#bgChrome)')
      + `<path d="M-9 -38 L9 -38 L6 -20 L-6 -20 Z" fill="url(#bgBlack)" stroke="#030712" stroke-width="1"/><rect x="-2" y="-44" width="4" height="7" fill="#64748B"/><path d="M18 -38 L32 -38 L30 -26 L20 -26 Z" fill="url(#bgBlack)" stroke="#030712" stroke-width="1"/>`;
    case 'bongo': return `<rect x="-6" y="-4" width="14" height="8" fill="#5B2A0C"/>` + tambor(-15, 0, 11, 'url(#bgWood)', 'url(#bgSkin)') + tambor(17, 0, 13, 'url(#bgWood)', 'url(#bgSkin)');
    case 'guira': return `<rect x="-30" y="-9" width="50" height="18" rx="9" fill="url(#bgChrome)" stroke="#64748B" stroke-width="1.3"/><rect x="-26" y="-6" width="42" height="12" rx="6" fill="url(#bgGuira)"/><rect x="20" y="-4.5" width="14" height="9" rx="3" fill="#1F2937"/>`
      + `<rect x="-24" y="14" width="26" height="4" rx="2" fill="#1F2937"/>${Array.from({ length: 8 }, (_, i) => `<line x1="${-22 + i * 3}" y1="18" x2="${-22 + i * 3}" y2="24" stroke="#94A3B8" stroke-width="1"/>`).join('')}`;
    case 'teclado': {
      const n = 29, w = 128 / n;
      const blancas = Array.from({ length: n - 1 }, (_, i) => `<line x1="${(-64 + (i + 1) * w).toFixed(1)}" y1="-14" x2="${(-64 + (i + 1) * w).toFixed(1)}" y2="6" stroke="#94A3B8" stroke-width=".8"/>`).join('');
      const negras = Array.from({ length: n - 1 }, (_, i) => [0, 1, 3, 4, 5].includes(i % 7) ? `<rect x="${(-64 + (i + 1) * w - w * 0.32).toFixed(1)}" y="-14" width="${(w * 0.64).toFixed(1)}" height="12" rx=".8" fill="#0B0F19"/>` : '').join('');
      return caja(144, 42) + `<rect x="-64" y="-14" width="128" height="20" fill="#fff"/>${blancas}${negras}<rect x="-66" y="9" width="10" height="9" rx="2" fill="#4B5563"/><rect x="-20" y="9" width="30" height="8" rx="1.5" fill="#0E7490" stroke="#67E8F9" stroke-width=".6"/>` + perillas(18, 13, 7, 7, '#D1D5DB', 2) + perillas(-50, 13, 4, 7, '#F59E0B', 1.8);
    }
    case 'guitarra': return `<path d="M-54 0 C-54 -22 -40 -27 -30 -21 C-24 -17 -18 -17 -12 -21 C-2 -27 8 -19 8 0 C8 19 -2 27 -12 21 C-18 17 -24 17 -30 21 C-40 27 -54 22 -54 0 Z" fill="url(#bgBurst)" stroke="#1C1917" stroke-width="1.5"/>`
      + `<path d="M-46 -10 L-30 -10 L-30 10 L-46 10 Z" fill="#FAFAF9" fill-opacity=".9"/><rect x="-26" y="-7" width="6" height="14" rx="1.5" fill="#111827"/><rect x="-14" y="-7" width="6" height="14" rx="1.5" fill="#111827"/><rect x="-42" y="-5" width="5" height="10" fill="#9CA3AF"/>`
      + `<rect x="6" y="-3.5" width="46" height="7" rx="1" fill="#7C4A1E"/><path d="M52 -6 L66 -7 L66 7 L52 6 Z" fill="#3B2412"/>${[-2, 0, 2].map((y) => `<line x1="-42" y1="${y}" x2="62" y2="${y}" stroke="#E5E7EB" stroke-width=".5"/>`).join('')}` + perillas(-6, 14, 3, 5, '#E5E7EB', 1.6);
    case 'bajo': return `<path d="M-60 0 C-60 -24 -44 -29 -33 -22 C-27 -18 -20 -18 -14 -23 C-4 -29 6 -20 6 0 C6 20 -4 29 -14 23 C-20 18 -27 18 -33 22 C-44 29 -60 24 -60 0 Z" fill="url(#bgBlue)" stroke="#0B1A3D" stroke-width="1.5"/>`
      + `<rect x="-44" y="-8" width="8" height="16" rx="1.5" fill="#111827"/><rect x="-28" y="-8" width="8" height="16" rx="1.5" fill="#111827"/><rect x="-52" y="-6" width="5" height="12" fill="#9CA3AF"/>`
      + `<rect x="4" y="-4" width="64" height="8" rx="1" fill="#7C4A1E"/><path d="M68 -7 L84 -8 L84 8 L68 7 Z" fill="#1E293B"/>${[-2.4, -0.8, 0.8, 2.4].map((y) => `<line x1="-50" y1="${y}" x2="80" y2="${y}" stroke="#E5E7EB" stroke-width=".6"/>`).join('')}` + perillas(-10, 15, 3, 5, '#E5E7EB', 1.8);
    case 'trompeta': return `<rect x="-40" y="-2.2" width="9" height="4.4" rx="1.5" fill="url(#bgChrome)"/><line x1="-32" y1="0" x2="14" y2="0" stroke="#D49A1F" stroke-width="4.5"/><rect x="-20" y="-13" width="34" height="26" rx="11" fill="none" stroke="#D49A1F" stroke-width="4"/>`
      + [-6, 2, 10].map((x) => `<circle cx="${x}" cy="-2" r="5" fill="url(#bgGold)" stroke="#92570A" stroke-width="1"/><circle cx="${x}" cy="-2" r="2.2" fill="#FEF3C7"/>`).join('')
      + `<path d="M14 -5 L34 -16 Q40 0 34 16 L14 5 Z" fill="url(#bgGold)" stroke="#92570A" stroke-width="1.2"/><ellipse cx="35" cy="0" rx="3" ry="16" fill="#B7791F" stroke="#92570A" stroke-width="1"/>`;
    case 'trombon': return `<rect x="-64" y="-5" width="74" height="10" rx="5" fill="none" stroke="#D49A1F" stroke-width="3.5"/><line x1="-30" y1="-5" x2="-30" y2="5" stroke="#92570A" stroke-width="2.5"/>`
      + `<path d="M10 -5 Q20 -5 20 -14 Q20 -22 6 -22 L-6 -22" fill="none" stroke="#D49A1F" stroke-width="4"/><path d="M-6 -27 L-36 -35 Q-42 -22 -36 -9 L-6 -17 Z" fill="url(#bgGold)" stroke="#92570A" stroke-width="1.2"/><ellipse cx="-37" cy="-22" rx="3" ry="13" fill="#B7791F" stroke="#92570A" stroke-width="1"/><rect x="10" y="3" width="9" height="4" rx="1.5" fill="url(#bgChrome)"/>`;
    case 'saxofon': return `<path d="M-36 -10 L14 -13 Q32 -13 32 3 Q32 15 20 16" fill="none" stroke="#B7791F" stroke-width="12" stroke-linecap="round"/><path d="M-36 -10 L14 -13 Q32 -13 32 3 Q32 15 20 16" fill="none" stroke="#F6C453" stroke-width="5" stroke-linecap="round"/>`
      + `<ellipse cx="16" cy="17" rx="10" ry="8" fill="#78350F" stroke="#D49A1F" stroke-width="3"/><line x1="-36" y1="-10" x2="-46" y2="-17" stroke="#D49A1F" stroke-width="4" stroke-linecap="round"/><rect x="-53" y="-21" width="8" height="5" rx="2" fill="#111827" transform="rotate(30 -49 -18)"/>`
      + [-24, -14, -4, 6].map((x) => `<circle cx="${x}" cy="-11.5" r="2.6" fill="#FEF3C7" stroke="#92570A" stroke-width=".8"/>`).join('');
    case 'amp_guitarra': return caja(70, 44) + `<rect x="-35" y="-22" width="70" height="44" rx="5" fill="none" stroke="#D4A017" stroke-width="1.2"/><rect x="-31" y="10" width="62" height="9" rx="1.5" fill="url(#bgMesh)"/><rect x="-31" y="-18" width="62" height="8" rx="1.5" fill="url(#bgChrome)"/>` + perillas(-25, -14, 7, 8, '#111827', 2.2)
      + `<rect x="-14" y="-3" width="28" height="6" rx="3" fill="#111827" stroke="#4B5563" stroke-width="1.2"/>`;
    case 'amp_bajo': return caja(72, 60) + `<rect x="-33" y="-29" width="66" height="22" rx="3" fill="#1F2937" stroke="#4B5563" stroke-width="1"/><rect x="-30" y="-26" width="60" height="6" rx="1" fill="url(#bgChrome)"/>` + perillas(-25, -23, 8, 7, '#111827', 1.8)
      + `<rect x="-12" y="-15" width="24" height="5" rx="2.5" fill="#030712"/><rect x="-33" y="-4" width="10" height="5" rx="2" fill="#4B5563"/><rect x="23" y="-4" width="10" height="5" rx="2" fill="#4B5563"/><rect x="-33" y="20" width="66" height="8" rx="1.5" fill="url(#bgMesh)"/>`;
    case 'monitor': return `<path d="M-40 16 L-32 -16 L32 -16 L40 16 Z" fill="url(#bgBlack)" stroke="#030712" stroke-width="1.5"/><path d="M-29 -12 L29 -12 L33 4 L-33 4 Z" fill="url(#bgMesh)" stroke="#4B5563" stroke-width="1"/><rect x="-8" y="8" width="16" height="4" rx="1" fill="#9CA3AF"/>`;
    case 'sidefill': return caja(60, 60) + `<rect x="-26" y="-26" width="52" height="52" rx="3" fill="url(#bgMesh)"/><circle cx="0" cy="6" r="18" fill="url(#bgCone)" stroke="#4B5563" stroke-width="2"/><circle cx="0" cy="6" r="5" fill="#374151"/><rect x="-14" y="-24" width="28" height="9" rx="2" fill="#111827" stroke="#4B5563" stroke-width="1"/>`;
    case 'mic': return `${['-16 38', '16 38', '0 47'].map((q) => `<line x1="0" y1="30" x2="${q.split(' ')[0]}" y2="${q.split(' ')[1]}" stroke="#374151" stroke-width="3" stroke-linecap="round"/>`).join('')}<circle cx="0" cy="30" r="3.5" fill="#111827"/>`
      + `<rect x="-3.5" y="5" width="7" height="22" rx="3" fill="url(#bgBlack)"/><circle cx="0" cy="0" r="9" fill="url(#bgMeshS)" stroke="#6B7280" stroke-width="1.5"/><path d="M-9 0 A9 9 0 0 1 9 0" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1"/>`;
    case 'mic_inst': return `<line x1="10" y1="10" x2="30" y2="30" stroke="#374151" stroke-width="3" stroke-linecap="round"/><circle cx="30" cy="30" r="5" fill="#111827"/>`
      + `<g transform="rotate(-45)"><rect x="-3.2" y="3" width="6.4" height="16" rx="2" fill="url(#bgBlack)"/><rect x="-4.5" y="-7" width="9" height="11" rx="2.5" fill="url(#bgMeshS)" stroke="#6B7280" stroke-width="1"/></g>`;
    case 'di': return caja(34, 20, 'url(#bgBlue)', 3) + `<circle cx="-11" cy="0" r="4" fill="#111827" stroke="#CBD5E1" stroke-width="1.2"/><circle cx="11" cy="0" r="4" fill="#111827" stroke="#CBD5E1" stroke-width="1.2"/>` + t('DI', 3, 7, '#fff');
    case 'iem': return `<path d="M-6 -15 Q-6 -26 -16 -26 M6 -15 Q6 -26 16 -26" fill="none" stroke="#111827" stroke-width="1.5"/><circle cx="-16" cy="-26" r="3" fill="#111827"/><circle cx="16" cy="-26" r="3" fill="#111827"/>`
      + caja(22, 30, 'url(#bgBlack)', 4) + `<rect x="-7" y="-10" width="14" height="8" rx="1" fill="#0E7490" stroke="#67E8F9" stroke-width=".6"/><line x1="7" y1="-15" x2="7" y2="-22" stroke="#4B5563" stroke-width="2"/>` + perillas(-4, 6, 2, 8, '#9CA3AF', 2);
    case 'toma': return `<rect x="-22" y="-8" width="44" height="16" rx="3" fill="#F8FAFC" stroke="#64748B" stroke-width="1.3"/><rect x="-19" y="-4" width="6" height="8" rx="1" fill="#DC2626"/>`
      + [-6, 4, 14].map((x) => `<circle cx="${x}" cy="0" r="4" fill="#E2E8F0" stroke="#94A3B8" stroke-width=".8"/><rect x="${x - 2}" y="-1.8" width="1" height="3.6" fill="#111827"/><rect x="${x + 1}" y="-1.8" width="1" height="3.6" fill="#111827"/>`).join('')
      + `<path d="M22 0 Q30 0 30 8" fill="none" stroke="#111827" stroke-width="2"/>`;
    case 'consola': return caja(124, 58, 'url(#bgBlack)', 6) + `<rect x="-20" y="-25" width="40" height="13" rx="1.5" fill="#0C4A6E" stroke="#38BDF8" stroke-width=".8"/>${[0, 1, 2].map((i) => `<rect x="${-16 + i * 11}" y="-22" width="9" height="7" fill="#22D3EE" fill-opacity="${0.35 + i * 0.2}"/>`).join('')}`
      + Array.from({ length: 16 }, (_, i) => { const x = -56 + i * 7.4; const yf = 8 + ((i * 7) % 11); return `<circle cx="${x}" cy="-4" r="1.6" fill="#9CA3AF"/><line x1="${x}" y1="2" x2="${x}" y2="24" stroke="#030712" stroke-width="1.8"/><rect x="${x - 2.6}" y="${yf}" width="5.2" height="3.4" rx=".6" fill="#F8FAFC"/>`; }).join('')
      + perillas(28, -22, 4, 7, '#F59E0B', 1.8) + perillas(-54, -22, 4, 7, '#9CA3AF', 1.8);
    case 'musico': return `<ellipse cx="0" cy="8" rx="28" ry="14" fill="${MOR}" stroke="#4C0199" stroke-width="1.5"/><circle cx="0" cy="-2" r="15" fill="#F3E8FF" stroke="#6A02D4" stroke-width="2"/>` + t(iniciales(p.etiqueta) || '?', 3, 12, '#6A02D4');
    case 'tarima': return `<rect x="-36" y="-26" width="72" height="52" fill="#F8FAFC" stroke="#94A3B8" stroke-width="3" stroke-dasharray="10 6"/>`;
    case 'texto': return `<text x="0" y="10" text-anchor="middle" font-size="30" font-weight="700" fill="${T}" font-family="Outfit, sans-serif">Aa</text>`;
    default: return `<circle r="10" fill="#fff" stroke="${T}" stroke-width="3"/>`;
  }
}
const ALTO = { bateria: 72, percusion: 40, timbal: 36, bongo: 18, guira: 26, teclado: 26, guitarra: 28, bajo: 30, trompeta: 18, trombon: 22, saxofon: 26, amp_guitarra: 28, amp_bajo: 36, monitor: 20, sidefill: 36, mic: 48, mic_inst: 34, di: 14, iem: 18, toma: 12, consola: 34, musico: 26, texto: 0 };
// ventana de cada ícono en los botones de «Agregar»: [centro x, centro y, mitad del lado]
const VISTA = { bateria: [0, -6, 88], percusion: [0, -2, 44], timbal: [-8, -10, 48], bongo: [1, 0, 32], guira: [0, 6, 36], teclado: [0, 0, 74], guitarra: [6, 0, 62], bajo: [12, 0, 74], trompeta: [-2, 0, 42], trombon: [-14, -10, 54], saxofon: [-8, 0, 48], amp_guitarra: [0, 0, 38], amp_bajo: [0, 0, 38], monitor: [0, 0, 42], sidefill: [0, 0, 34], mic: [0, 22, 28], mic_inst: [12, 12, 24], di: [0, 0, 19], iem: [0, -6, 24], toma: [4, 2, 28], consola: [0, 0, 64], musico: [0, 4, 30], tarima: [0, 0, 40], texto: [0, 0, 24] };
function iconoPaleta(k) { const [x, y, e] = VISTA[k] || [0, 0, 40]; return `<svg viewBox="${x - e} ${y - e} ${e * 2} ${e * 2}" width="30" height="30" aria-hidden="true" style="flex:none">${simbolo({ tipo: k, etiqueta: '' })}</svg>`; }
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
    ${DEFS_PLANO}<text x="${W / 2}" y="-28" text-anchor="middle" font-size="20" font-weight="700" fill="#64748B" letter-spacing="3" font-family="Plus Jakarta Sans, sans-serif">FONDO DEL ESCENARIO</text>
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
      ${ed ? `<aside class="card no-print" style="flex:1 1 220px;max-width:280px;display:flex;flex-direction:column;gap:10px"><h2>Agregar</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${PALETA.map(([k, t]) => `<button class="btn chico" data-add="${k}" style="justify-content:flex-start;gap:6px;padding:4px 8px" title="Agregar ${esc(t)}">${iconoPaleta(k)}<span>${esc(t)}</span></button>`).join('')}</div>
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
