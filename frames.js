// «Finn briller som passer»: ansiktsanalyse, katalog med filtre og prøv-på med kamera.
import { Cam } from './cam.js';
import { IRIS_MM, median } from './rx.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('synstest:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('synstest:' + k, JSON.stringify(v)); } catch { } },
};

// ---------------------------------------------------------------- Ansiktsform
// Forholdstall for et «gjennomsnittsansikt» målt på MediaPipe-landemerker.
const PRIOR = { R: 1.22, J: 0.72, F: 0.76 };

export const FACE = {
  oval: { name: 'Ovalt', text: 'Balanserte proporsjoner – nesten alle former kler deg.' },
  rund: { name: 'Rundt', text: 'Myke linjer og like bredt som langt. Kantete innfatninger gir kontrast og struktur.' },
  firkantet: { name: 'Firkantet', text: 'Markert kjevelinje og bred panne. Runde og myke former mykner trekkene.' },
  avlangt: { name: 'Avlangt', text: 'Lengre enn det er bredt. Høye, brede innfatninger balanserer lengden.' },
  hjerte: { name: 'Hjerteformet', text: 'Bred panne og smal hake. Lette innfatninger og former som er bredest nederst.' },
  diamant: { name: 'Diamant', text: 'Brede kinnben, smal panne og hake. Cateye og ovale former fremhever kinnbena.' },
};

export const SHAPES = {
  rund: 'Rund', oval: 'Oval', rektangulær: 'Rektangulær', firkantet: 'Firkantet', pilot: 'Pilot',
  cateye: 'Cateye', geometrisk: 'Geometrisk', browline: 'Browline', panto: 'Panto',
};

const FIT = {
  oval: { best: ['rektangulær', 'firkantet', 'pilot', 'geometrisk', 'browline', 'panto'], avoid: [] },
  rund: { best: ['rektangulær', 'firkantet', 'geometrisk', 'browline'], avoid: ['rund', 'oval'] },
  firkantet: { best: ['rund', 'oval', 'pilot', 'panto', 'cateye'], avoid: ['firkantet', 'rektangulær'] },
  avlangt: { best: ['firkantet', 'pilot', 'panto', 'browline', 'rund'], avoid: ['rektangulær'] },
  hjerte: { best: ['oval', 'rund', 'pilot', 'panto'], avoid: ['browline', 'cateye'] },
  diamant: { best: ['cateye', 'oval', 'browline', 'rund'], avoid: ['rektangulær'] },
};

export function classifyFace({ R, J, F }) {
  const r = R / PRIOR.R, j = J / PRIOR.J, f = F / PRIOR.F;
  if (r >= 1.08) return 'avlangt';
  if (f >= 1.04 && j <= 0.96) return 'hjerte';
  if (f <= 0.96 && j <= 0.96) return 'diamant';
  if (j >= 1.04) return 'firkantet';
  if (r <= 0.94) return 'rund';
  return 'oval';
}

function faceSample(L, w, h) {
  const P = i => [L[i].x * w, L[i].y * h];
  const D = (a, b) => { const p = P(a), q = P(b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
  const iris = (D(469, 471) + D(470, 472) + D(474, 476) + D(475, 477)) / 4;
  const W = D(234, 454), mm = IRIS_MM / iris;
  const yaw = (P(1)[0] - (P(234)[0] + P(454)[0]) / 2) / W;
  return { R: D(10, 152) / W, J: D(172, 397) / W, F: D(54, 284) / W, widthMm: W * mm, ipdMm: D(468, 473) * mm, yaw };
}

// ---------------------------------------------------------------- Passform
export const frameTotal = f => 2 * (f.lensMm || 50) + (f.bridgeMm || 18) + 8;

export function scoreFrame(f, face) {
  let s = 0; const tags = [];
  if (face?.shape) {
    const fit = FIT[face.shape];
    if (fit.best.includes(f.shape)) { s += 2; tags.push(['ok', 'Kler ansiktsformen']); }
    else if (fit.avoid.includes(f.shape)) { s -= 2; tags.push(['warn', 'Mindre gunstig form']); }
  }
  if (face?.widthMm && f.lensMm) {
    const diff = frameTotal(f) - face.widthMm * 0.95;
    if (Math.abs(diff) <= 4) { s += 2; tags.push(['ok', 'Riktig bredde']); }
    else if (Math.abs(diff) <= 8) { s += 1; tags.push(['', diff > 0 ? 'Litt bred' : 'Litt smal']); }
    else { s -= 1; tags.push(['warn', diff > 0 ? 'For bred' : 'For smal']); }
  }
  return { s, tags };
}

// ---------------------------------------------------------------- Tegninger av innfatninger
// Glass for bildets venstre side (brukerens høyre øye), nesesiden mot +x. Bredde 50 enheter.
const LENS = {
  rund: 'M25,0 A25,25 0 1 1 -25,0 A25,25 0 1 1 25,0 Z',
  oval: 'M25,0 A25,17 0 1 1 -25,0 A25,17 0 1 1 25,0 Z',
  rektangulær: 'M-18,-14 H18 Q25,-14 25,-7 V7 Q25,14 18,14 H-18 Q-25,14 -25,7 V-7 Q-25,-14 -18,-14 Z',
  firkantet: 'M-20,-20 H20 Q25,-20 25,-15 V15 Q25,20 20,20 H-20 Q-25,20 -25,15 V-15 Q-25,-20 -20,-20 Z',
  pilot: 'M-25,-15 C-10,-20 14,-20 24,-15 C27,2 18,22 2,22 C-16,22 -26,6 -25,-15 Z',
  cateye: 'M-25,-19 C-10,-14 10,-14 24,-11 C27,4 18,16 2,16 C-14,16 -24,8 -25,-19 Z',
  geometrisk: 'M-25,0 L-13,-19 L13,-19 L25,0 L13,19 L-13,19 Z',
  browline: 'M-25,-14 H25 V0 C25,12 15,17 0,17 C-15,17 -25,12 -25,0 Z',
  panto: 'M-22,-17 H22 C27,-5 22,20 0,20 C-22,20 -27,-5 -22,-17 Z',
};
const LENS_TOP = { rund: -25, oval: -17, rektangulær: -14, firkantet: -20, pilot: -18, cateye: -15, geometrisk: -19, browline: -14, panto: -17 };

const COLORS = [
  [/sort|svart|black/i, '#151515'], [/skilpadde|havana|tortoise/i, '#6e3f1c'], [/brun|brown/i, '#6b4226'],
  [/gull|gold/i, '#c4a031'], [/sølv|silver|stål/i, '#9ea4a8'], [/grå|grey|gray|gun/i, '#6d7378'],
  [/marine|navy/i, '#1d2f55'], [/blå|blue/i, '#2457a0'], [/rød|red|burgunder|vin/i, '#a3242c'],
  [/grønn|green/i, '#2e6b3f'], [/rosa|pink/i, '#d98aa3'], [/lilla|purple/i, '#6a3d8f'],
  [/transparent|krystall|klar|crystal/i, '#b9c6cc'], [/hvit|white/i, '#d9d9d9'], [/beige|nude/i, '#c9a98a'],
];
const colorOf = c => (COLORS.find(([re]) => re.test(c || '')) || [0, '#2b3a44'])[1];

function frameSvg(f, w = 132) {
  const col = colorOf(f.color), metal = f.material === 'metall' || f.material === 'titan';
  const sw = f.rim === 'uten' ? 0.9 : metal ? 1.8 : 3.4;
  const lens = LENS[f.shape] || LENS.rektangulær, top = LENS_TOP[f.shape] ?? -16;
  const fill = f.sun ? 'rgba(25,25,25,.78)' : 'rgba(205,225,240,.25)';
  const rim = f.rim === 'uten' ? `stroke="${col}" stroke-opacity=".45"` : `stroke="${col}"`;
  const half = f.rim === 'halv';
  const lensEl = x => `<g transform="translate(${x},0)${x > 0 ? ' scale(-1,1)' : ''}">
    <path d="${lens}" fill="${fill}" ${half ? `stroke="${col}" stroke-opacity=".35" stroke-width="0.8"` : `${rim} stroke-width="${sw}"`}/>
    ${half || f.shape === 'browline' ? `<path d="${lens}" fill="none" stroke="${col}" stroke-width="${half ? 3 : 5}" clip-path="url(#tc)"/>` : ''}</g>`;
  return `<svg width="${w}" height="${w * 0.42}" viewBox="-74 -31 148 62" aria-hidden="true">
    <defs><clipPath id="tc"><rect x="-30" y="-30" width="60" height="${Math.abs(top) * 0.7 + 2}"/></clipPath></defs>
    ${lensEl(-34)}${lensEl(34)}
    <path d="M-9,${top * 0.55} Q0,${top * 0.9} 9,${top * 0.55}" fill="none" stroke="${col}" stroke-width="${metal ? 1.8 : 3}"/>
    <path d="M-59,${top + 3} L-71,${top + 1} M59,${top + 3} L71,${top + 1}" stroke="${col}" stroke-width="${metal ? 1.8 : 3}" stroke-linecap="round"/>
  </svg>`;
}

// ---------------------------------------------------------------- Skjermer
let ctx, catalog = null;
const filt = Object.assign({ store: 'alle', gender: 'alle', shape: 'anbefalt', rim: 'alle', material: 'alle', maxPrice: null, sun: 'nei', sort: 'match' }, store.get('filters', {}));

async function loadCatalog() {
  if (catalog) return catalog;
  try { const r = await fetch('./catalog.json', { cache: 'no-cache' }); catalog = await r.json(); }
  catch { catalog = { updated: null, frames: [] }; }
  return catalog;
}

export async function framesHome(c) {
  ctx = c;
  await loadCatalog();
  const face = store.get('face', null);
  if (face) return results();
  ctx.render(`
    <button class="link" id="back" style="align-self:flex-start">‹ Tilbake</button>
    <h1>Finn briller som passer</h1>
    <p>Kameraet måler ansiktsformen og hvor bredt ansiktet ditt er i millimeter. Så får du forslag fra Specsavers og Brilleland, og kan prøve dem på i kameraet.</p>
    <div class="grow" style="display:grid;place-items:center">${frameSvg({ shape: 'panto', color: 'skilpadde', material: 'plast', rim: 'hel' }, 220)}</div>
    <button class="btn" id="scan">Skann ansiktet</button>
    <button class="btn ghost" id="manual">Velg ansiktsform selv</button>`);
  $('#back').onclick = ctx.home;
  $('#scan').onclick = scan;
  $('#manual').onclick = () => { store.set('face', { shape: 'oval', widthMm: null, manual: true }); results(); };
}

function mountVideo(host) {
  const v = Cam.video; v.classList.remove('preview');
  v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:1;transform:scaleX(-1);border-radius:18px';
  host.prepend(v);
  return () => { v.style.cssText = ''; document.body.prepend(v); };
}

async function startCam(statusEl) {
  try {
    await Cam.start(msg => { statusEl.innerHTML = `<span class="spin"></span>&nbsp; ${msg}`; });
    statusEl.textContent = '';
    return true;
  } catch (e) {
    console.error(e);
    statusEl.innerHTML = '<b style="color:var(--bad)">Fikk ikke startet kameraet.</b> Gi nettleseren lov til å bruke kameraet, eller velg ansiktsform selv.';
    return false;
  }
}

async function scan() {
  ctx.render(`<div class="stage">
    <div class="top"><span class="eye-tag">Ansiktsskann</span><span></span><button class="link" id="x">Lukk</button></div>
    <div class="hint" style="color:var(--ink)">Hold mobilen rett foran ansiktet i armlengdes avstand. Se rett inn i kameraet, med håret bort fra pannen.</div>
    <div class="mid"><div id="vh" style="position:relative;width:min(78vw,340px);aspect-ratio:3/4;border-radius:18px;overflow:hidden;background:#e9eef0">
      <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"><ellipse cx="150" cy="190" rx="98" ry="132" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="8 8" opacity=".9"/></svg>
    </div></div>
    <p class="center" id="st" style="min-height:2.6em"></p>
    <button class="btn" id="go" disabled>Skann</button>
  </div>`);
  const unmount = mountVideo($('#vh'));
  let alive = true;
  ctx.main.querySelector('#x').onclick = () => { alive = false; unmount(); Cam.stop(); framesHome(ctx); };
  const st = $('#st');
  if (!await startCam(st)) return;
  const tick = () => {
    if (!alive) return;
    const ok = Cam.face && Cam.L;
    $('#go').disabled = !ok;
    if (!st.dataset.busy) st.innerHTML = ok ? '<span class="pill ok">Ansikt funnet ✓</span>' : '<span class="pill warn">Finner ikke ansiktet</span>';
    requestAnimationFrame(tick);
  };
  tick();
  $('#go').onclick = async () => {
    st.dataset.busy = 1; $('#go').disabled = true;
    st.innerHTML = '<span class="spin"></span>&nbsp; Hold stille …';
    const samples = []; const t0 = performance.now(); let lastL = null;
    while (performance.now() - t0 < 1600) {
      if (Cam.face && Cam.L && Cam.L !== lastL) { lastL = Cam.L; samples.push(faceSample(Cam.L, Cam.vw, Cam.vh)); }
      await sleep(30);
    }
    const good = samples.filter(s => Math.abs(s.yaw) < 0.05);
    if (good.length < 8) {
      delete st.dataset.busy; $('#go').disabled = false;
      st.innerHTML = samples.length >= 8 ? '<b style="color:var(--warn)">Se rett inn i kameraet</b> – hodet var litt vridd. Prøv igjen.' : '<b style="color:var(--warn)">Fikk ikke nok bilder.</b> Prøv i bedre lys.';
      return;
    }
    const m = k => median(good.map(s => s[k]));
    const ratios = { R: m('R'), J: m('J'), F: m('F') };
    const face = { shape: classifyFace(ratios), widthMm: m('widthMm'), ipdMm: m('ipdMm'), ratios, date: new Date().toISOString() };
    store.set('face', face);
    alive = false; unmount(); Cam.stop();
    results(true);
  };
}

function results(fresh) {
  const face = store.get('face', { shape: 'oval' });
  const frames = catalog.frames || [];
  const maxAll = Math.max(1000, ...frames.map(f => f.price || 0));
  if (filt.maxPrice == null || filt.maxPrice > maxAll) filt.maxPrice = maxAll;

  const list = frames.map(f => ({ f, ...scoreFrame(f, face) })).filter(({ f }) =>
    (filt.store === 'alle' || f.store === filt.store) &&
    (filt.gender === 'alle' || f.gender === filt.gender || (f.gender === 'unisex' && filt.gender !== 'barn')) &&
    (filt.shape === 'alle' || (filt.shape === 'anbefalt' ? !FIT[face.shape].avoid.includes(f.shape) : f.shape === filt.shape)) &&
    (filt.rim === 'alle' || f.rim === filt.rim) &&
    (filt.material === 'alle' || f.material === filt.material || (filt.material === 'metall' && f.material === 'titan')) &&
    (filt.sun === 'alle' || (filt.sun === 'ja') === !!f.sun) &&
    f.price <= filt.maxPrice);
  list.sort(filt.sort === 'lav' ? (a, b) => a.f.price - b.f.price : filt.sort === 'høy' ? (a, b) => b.f.price - a.f.price : (a, b) => b.s - a.s || a.f.price - b.f.price);
  ctx.state = list;

  const sel = (id, label, opts) => `<div><label for="${id}" class="small" style="margin:8px 0 4px">${label}</label>
    <select id="${id}" class="sel">${opts.map(([v, t]) => `<option value="${v}" ${String(filt[id]) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
  const F = FACE[face.shape];
  const fmt = n => n.toLocaleString('nb-NO');
  ctx.render(`
    <style>.sel{width:100%;font:inherit;padding:11px 12px;border:1.5px solid var(--line);border-radius:12px;background:#fff;color:var(--ink)}
      .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.chip{border:1.5px solid var(--line);background:#fff;border-radius:99px;padding:6px 12px;font:inherit;font-size:14px;cursor:pointer}
      .chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
      .fr{display:flex;gap:12px;align-items:center}.fr .meta{flex:1;min-width:0}.tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
      .tags .pill{font-size:12px;padding:3px 8px}.price{font-weight:700;font-size:18px}
      .acts{display:flex;gap:8px;margin-top:10px}.acts a,.acts button{flex:1;text-align:center;text-decoration:none;border-radius:10px;padding:10px;font-weight:600;font-size:15px;border:0;font-family:inherit;cursor:pointer}
      .acts a{background:#e8f3f5;color:var(--accent)}.acts button{background:var(--accent);color:#fff}
      .filters{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}</style>
    <button class="link" id="back" style="align-self:flex-start">‹ Tilbake</button>
    <h2>${fresh ? 'Ditt ansikt' : 'Briller som passer'}</h2>
    <div class="card">
      <div class="small muted">Ansiktsform${face.manual ? ' (valgt selv)' : ''}</div>
      <div style="font-size:24px;font-weight:700">${F.name}</div>
      <p class="small" style="margin:4px 0 0">${F.text}</p>
      ${face.widthMm ? `<p class="small muted" style="margin:8px 0 0">Ansiktsbredde ca. <b>${Math.round(face.widthMm)} mm</b> → innfatninger rundt <b>${Math.round(face.widthMm * 0.95)} mm</b> totalbredde passer best.</p>` : ''}
      <div class="small muted" style="margin-top:10px">Stemmer det ikke? Velg selv:</div>
      <div class="chips">${Object.entries(FACE).map(([k, v]) => `<button class="chip ${k === face.shape ? 'on' : ''}" data-face="${k}">${v.name}</button>`).join('')}</div>
      <div class="row" style="margin-top:6px"><button class="link" id="rescan" style="text-align:left">${face.widthMm ? 'Skann på nytt' : 'Skann ansiktet med kamera'}</button>
        ${face.ratios ? '<button class="link small" id="dbg" style="text-align:right;font-weight:400">Måledata</button>' : ''}</div>
      <div id="dbgv" class="small muted" style="display:none">${face.ratios ? `L/B ${face.ratios.R.toFixed(3)} · kjeve ${face.ratios.J.toFixed(3)} · panne ${face.ratios.F.toFixed(3)} · PD (nær) ${Math.round(face.ipdMm)} mm` : ''}</div>
    </div>
    <details class="card" ${fresh ? '' : 'open'}><summary style="font-weight:600;cursor:pointer">Filtrer (${list.length} treff)</summary>
      <div class="filters">
        ${sel('store', 'Butikk', [['alle', 'Alle'], ['Specsavers', 'Specsavers'], ['Brilleland', 'Brilleland']])}
        ${sel('gender', 'Type', [['alle', 'Alle'], ['dame', 'Dame'], ['herre', 'Herre'], ['barn', 'Barn']])}
        ${sel('shape', 'Form', [['anbefalt', 'Anbefalte'], ['alle', 'Alle former'], ...Object.entries(SHAPES)])}
        ${sel('rim', 'Ramme', [['alle', 'Alle'], ['hel', 'Hel ramme'], ['halv', 'Halv ramme'], ['uten', 'Uten ramme']])}
        ${sel('material', 'Materiale', [['alle', 'Alle'], ['plast', 'Plast/acetat'], ['metall', 'Metall'], ['titan', 'Titan']])}
        ${sel('sun', 'Solbriller', [['nei', 'Nei'], ['ja', 'Kun solbriller'], ['alle', 'Begge']])}
      </div>
      <label for="mp" class="small" style="margin:12px 0 4px">Maks pris: <b id="mpv">${fmt(filt.maxPrice)} kr</b></label>
      <input type="range" id="mp" min="200" max="${maxAll}" step="100" value="${filt.maxPrice}">
      ${sel('sort', 'Sorter', [['match', 'Best passform'], ['lav', 'Pris: lav til høy'], ['høy', 'Pris: høy til lav']])}
    </details>
    ${list.length ? '' : '<div class="card muted center">Ingen treff. Prøv å utvide filtrene.</div>'}
    ${list.map(({ f, tags }, i) => `<div class="card">
      <div class="fr"><div>${frameSvg(f, 118)}</div>
        <div class="meta"><div class="small muted">${ctx.esc(f.store)}${f.brand && f.brand !== f.store ? ' · ' + ctx.esc(f.brand) : ''}</div>
          <div style="font-weight:700;overflow:hidden;text-overflow:ellipsis">${ctx.esc(f.name)}</div>
          <div class="small muted">${SHAPES[f.shape] || f.shape} · ${f.rim === 'halv' ? 'halv ramme' : f.rim === 'uten' ? 'uten ramme' : f.material}${f.lensMm ? ` · ${f.lensMm}□${f.bridgeMm ?? '?'}-${f.templeMm ?? '?'}` : ''}</div>
          <div class="price">${fmt(f.price)} kr</div></div></div>
      <div class="tags">${tags.map(([c, t]) => `<span class="pill ${c}">${t}</span>`).join('')}${f.sun ? '<span class="pill">Solbrille</span>' : ''}</div>
      <div class="acts"><button data-try="${i}">Prøv på</button><a href="${ctx.esc(f.url)}" target="_blank" rel="noopener">Se hos ${ctx.esc(f.store)} ↗</a></div>
    </div>`).join('')}
    <p class="small muted center" style="margin-top:14px">Priser hentet ${catalog.updated ? new Date(catalog.updated).toLocaleDateString('nb-NO') : ''} – kan ha endret seg. Inkluderer normalt enkle enstyrkeglass. Butikkene kan ha tilbud.</p>`);

  $('#back').onclick = ctx.home;
  $('#rescan').onclick = scan;
  $('#dbg') && ($('#dbg').onclick = () => { $('#dbgv').style.display = ''; });
  ctx.main.querySelectorAll('[data-face]').forEach(b => b.onclick = () => { store.set('face', { ...face, shape: b.dataset.face }); results(); });
  ctx.main.querySelectorAll('select.sel').forEach(s => s.onchange = () => { filt[s.id] = s.value; store.set('filters', filt); results(); });
  const mp = $('#mp');
  mp.oninput = () => { $('#mpv').textContent = fmt(+mp.value) + ' kr'; };
  mp.onchange = () => { filt.maxPrice = +mp.value; store.set('filters', filt); results(); };
  ctx.main.querySelectorAll('[data-try]').forEach(b => b.onclick = () => tryOn(+b.dataset.try));
}

// ---------------------------------------------------------------- Prøv på
async function tryOn(idx) {
  const list = ctx.state;
  let i = idx;
  ctx.render(`<div class="stage" style="padding-left:0;padding-right:0">
    <div class="top" style="padding:0 14px"><span class="eye-tag">Prøv på</span><span></span><button class="link" id="x">Lukk</button></div>
    <div class="mid"><div id="vh" style="position:relative;width:100%;height:100%;overflow:hidden;background:#e9eef0">
      <canvas id="ov" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);pointer-events:none"></canvas>
      <div id="st" class="center" style="position:absolute;left:0;right:0;bottom:14px"></div>
    </div></div>
    <div style="padding:10px 14px 0">
      <div class="row" style="align-items:center">
        <button class="btn light" id="pv" style="flex:0 0 52px;margin:0">‹</button>
        <div class="center" style="flex:1"><div class="small muted" id="fs"></div><div style="font-weight:700" id="fn"></div><div class="small" id="fp"></div></div>
        <button class="btn light" id="nx" style="flex:0 0 52px;margin:0">›</button>
      </div>
    </div>
  </div>`);
  const host = $('#vh'); const unmount = mountVideo(host);
  Cam.video.style.borderRadius = '0';
  host.appendChild($('#ov')); host.appendChild($('#st'));
  let alive = true;
  const close = () => { alive = false; unmount(); Cam.stop(); results(); };
  $('#x').onclick = close;
  const show = () => {
    const f = list[i].f;
    $('#fs').textContent = `${f.store} · ${i + 1} av ${list.length}`;
    $('#fn').textContent = f.name;
    $('#fp').textContent = `${f.price.toLocaleString('nb-NO')} kr · ${SHAPES[f.shape] || f.shape}`;
  };
  $('#pv').onclick = () => { i = (i - 1 + list.length) % list.length; show(); };
  $('#nx').onclick = () => { i = (i + 1) % list.length; show(); };
  show();
  if (!await startCam($('#st'))) return;
  const cv = $('#ov'), g = cv.getContext('2d');
  const paths = {}; for (const k in LENS) paths[k] = new Path2D(LENS[k]);
  const draw = () => {
    if (!alive) return;
    requestAnimationFrame(draw);
    if (!Cam.vw) return;
    if (cv.width !== Cam.vw) { cv.width = Cam.vw; cv.height = Cam.vh; }
    g.clearRect(0, 0, cv.width, cv.height);
    const L = Cam.L;
    if (!Cam.face || !L) { $('#st').innerHTML = '<span class="pill warn">Finner ikke ansiktet</span>'; return; }
    $('#st').innerHTML = '';
    const P = k => [L[k].x * cv.width, L[k].y * cv.height];
    const D = (a, b) => { const p = P(a), q = P(b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
    const pxPerMm = ((D(469, 471) + D(470, 472) + D(474, 476) + D(475, 477)) / 4) / IRIS_MM;
    const a = P(468), b = P(473);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const f = list[i].f, lens = f.lensMm || 50, bridge = f.bridgeMm || 18;
    const col = colorOf(f.color), metal = f.material === 'metall' || f.material === 'titan';
    const u = lens / 50 * pxPerMm;                  // piksler per tegneenhet
    const half = (lens + bridge) / 2 * pxPerMm / u;  // glassenter fra midten, i enheter
    g.save();
    g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    g.rotate(ang);
    g.scale(u, u);
    g.translate(0, 2.5 * pxPerMm / u);
    const sw = (f.rim === 'uten' ? 0.5 : metal ? 1.1 : 2.6) * pxPerMm / u;
    for (const s of [-1, 1]) {
      g.save(); g.translate(s * half, 0); if (s > 0) g.scale(-1, 1);
      const p = paths[f.shape] || paths.rektangulær;
      g.fillStyle = f.sun ? 'rgba(20,20,20,.72)' : 'rgba(210,230,245,.16)'; g.fill(p);
      g.strokeStyle = col; g.lineWidth = sw; g.globalAlpha = f.rim === 'uten' ? 0.5 : f.rim === 'halv' ? 0.35 : 1;
      g.stroke(p); g.globalAlpha = 1;
      if (f.rim === 'halv' || f.shape === 'browline') {
        g.save(); g.beginPath(); g.rect(-30, -30, 60, Math.abs(LENS_TOP[f.shape] ?? 16) * 0.7 + 2); g.clip();
        g.lineWidth = sw * (f.rim === 'halv' ? 1.6 : 2.2); g.stroke(p); g.restore();
      }
      g.restore();
    }
    const top = LENS_TOP[f.shape] ?? -16;
    g.beginPath(); g.moveTo(-half + 25, top * 0.55); g.quadraticCurveTo(0, top * 0.9, half - 25, top * 0.55);
    g.strokeStyle = col; g.lineWidth = sw; g.stroke();
    g.restore();
  };
  draw();
}
