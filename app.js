import * as RX from './rx.js';
import { Cam } from './cam.js';
import { framesHome } from './frames.js';
const A4_CM = 29.7;

const $ = s => document.querySelector(s);
const main = $('#main');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EYE = { OD: { name: 'Høyre øye', cover: 'venstre' }, OS: { name: 'Venstre øye', cover: 'høyre' } };

const store = {
  get(k, d) { try { const v = localStorage.getItem('synstest:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('synstest:' + k, JSON.stringify(v)); } catch { } },
};

const state = {
  pxPerMm: store.get('pxPerMm', null),
  people: store.get('people', []),
  person: null,
  steps: [], i: 0,
  data: null,
  acuityDist: 3,
  cleanup: null,
};
const savePeople = () => store.set('people', state.people);

let wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.steps.length) keepAwake(); });

// ---------------------------------------------------------------- Sloan-bokstaver
const SLOAN_PATHS = {
  C: 'M4.232,1.5 A2,2 0 1 0 4.232,3.5',
  D: 'M0.5,0.5 H2.5 A2,2 0 0 1 2.5,4.5 H0.5 Z',
  H: 'M0.5,0 V5 M4.5,0 V5 M0.5,2.5 H4.5',
  K: 'M0.5,0 V5 M4.9,0 L0.8,3.3 M2.1,2.3 L4.9,5',
  N: 'M0.5,5 V0 L4.5,5 V0',
  O: 'M2.5,0.5 A2,2 0 1 0 2.5,4.5 A2,2 0 1 0 2.5,0.5',
  R: 'M0.5,5 V0.5 H3 A1.5,1.5 0 0 1 3,3.5 H0.5 M2.6,3.5 L4.6,5',
  S: 'M4.4,1.25 C3.9,0.6 3.3,0.5 2.5,0.5 C1.3,0.5 0.6,0.95 0.6,1.6 C0.6,2.3 1.3,2.5 2.5,2.5 C3.7,2.5 4.4,2.75 4.4,3.45 C4.4,4.1 3.7,4.5 2.5,4.5 C1.6,4.5 0.95,4.3 0.45,3.7',
  V: 'M0.2,0 L2.5,5 L4.8,0',
  Z: 'M0.3,0.5 H4.5 L0.5,4.5 H4.7',
};
const letterSvg = (ch, px) => `<svg width="${px}" height="${px}" viewBox="0 0 5 5" style="overflow:hidden"><path d="${SLOAN_PATHS[ch]}" fill="none" stroke="#000" stroke-width="1" stroke-linejoin="miter" stroke-linecap="butt"/></svg>`;

function pickLetters(n) {
  const pool = [...RX.SLOAN]; const out = [];
  while (out.length < n) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

// ---------------------------------------------------------------- Navigasjon
function render(html) {
  state.cleanup?.(); state.cleanup = null;
  main.innerHTML = html;
  window.scrollTo(0, 0);
}
const progress = () => {
  const total = state.steps.length, i = state.i;
  return `<div class="steps">${state.steps.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>`.replace(/<i/g, total > 18 ? '<i style="height:3px"' : '<i');
};

function buildSteps() {
  const s = [];
  if (!state.pxPerMm) s.push({ k: 'screencal' });
  s.push({ k: 'camstart' });
  s.push({ k: 'camcal' });
  for (const eye of ['OD', 'OS']) {
    s.push({ k: 'eyeintro', eye });
    s.push({ k: 'acuityIntro', eye });
    s.push({ k: 'acuity', eye });
    s.push({ k: 'fan', eye });
    s.push({ k: 'far', eye });
    if ((state.person.age ?? 0) >= 38) s.push({ k: 'near', eye });
  }
  s.push({ k: 'result' });
  return s;
}

function startTest(person) {
  state.person = person;
  state.data = { OD: { far: {} }, OS: { far: {} }, date: new Date().toISOString() };
  state.steps = buildSteps(); state.i = 0;
  keepAwake();
  runStep();
}
function next() {
  state.i++;
  while (state.steps[state.i]?.skip?.()) state.i++;
  runStep();
}
function runStep() {
  const st = state.steps[state.i];
  if (!st) return home();
  STEPS[st.k](st);
}
function abortTest() {
  state.steps = []; Cam.video.classList.remove('preview');
  Cam.stop(); wakeLock?.release?.().catch(() => { });
  home();
}
main.addEventListener('click', e => { if (e.target.closest('[data-abort]')) abortTest(); });
const abortBtn = `<button class="link" data-abort>Avbryt</button>`;

// ---------------------------------------------------------------- Hjem / personer
function home() {
  state.steps = [];
  const people = state.people.map((p, i) => {
    const last = p.history?.[p.history.length - 1];
    const sub = last ? `Sist testet ${new Date(last.date).toLocaleDateString('nb-NO')}` : (p.age ? `${p.age} år` : 'Ikke testet ennå');
    return `<div class="card person" data-p="${i}"><div class="avatar">${esc(p.name[0]?.toUpperCase())}</div>
      <div class="grow"><div style="font-weight:600">${esc(p.name)}</div><div class="muted small">${sub}</div></div><div class="muted">›</div></div>`;
  }).join('');
  render(`
    <div class="hero">${eyeLogo(76)}</div>
    <h1 class="center">Synstest</h1>
    <p class="center muted">Bokstavtavle, astigmatisme-skive og styrkemåling med frontkameraet. Ett øye om gangen, som hos optikeren.</p>
    ${people || '<div class="card muted center">Ingen personer ennå. Legg til den første!</div>'}
    <button class="btn ghost" id="add">+ Legg til person</button>
    <div class="card person" id="frames" style="margin-top:18px;background:#0b3d5c;color:#fff;border:0">
      <div class="avatar" style="background:rgba(255,255,255,.14);color:#fff">${glassesIcon()}</div>
      <div class="grow"><div style="font-weight:700">Finn briller som passer</div>
      <div class="small" style="opacity:.8">Ansiktsform, størrelse og prøv på – Specsavers og Brilleland</div></div><div>›</div></div>
    <div class="grow"></div>
    <div class="row" style="margin-top:18px"><button class="link" id="about">Slik virker det</button>
      <button class="link" id="recal" style="text-align:right">Kalibrer skjerm</button></div>
  `);
  main.querySelectorAll('[data-p]').forEach(el => el.onclick = () => personPage(+el.dataset.p));
  $('#add').onclick = addPerson;
  $('#frames').onclick = () => framesHome({ render, main, home, esc });
  $('#about').onclick = about;
  $('#recal').onclick = () => { state.steps = [{ k: 'screencal', standalone: true }]; state.i = 0; runStep(); };
}

function glassesIcon() {
  return `<svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="9" cy="17" r="6"/><circle cx="23" cy="17" r="6"/><path d="M15 16q1-1.5 2 0M3 15 1.5 11M29 15l1.5-4"/></svg>`;
}

function eyeLogo(s) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><path d="M4 32C12 18 22 12 32 12s20 6 28 20c-8 14-18 20-28 20S12 46 4 32z" fill="#fff" stroke="#0b3d5c" stroke-width="3"/><circle cx="32" cy="32" r="11" fill="#0b7a8c"/><circle cx="32" cy="32" r="4.5" fill="#071f2e"/><circle cx="36" cy="28" r="2" fill="#fff"/></svg>`;
}

function addPerson() {
  render(`
    <h2>Ny person</h2>
    <label for="nm">Navn</label><input id="nm" type="text" autocomplete="off" placeholder="F.eks. Mormor">
    <label for="ag">Alder</label><input id="ag" type="number" inputmode="numeric" min="5" max="110" placeholder="År">
    <p class="small muted" style="margin-top:8px">Alderen brukes til å avgjøre om lesestyrke (addisjon) skal måles.</p>
    <button class="btn" id="ok">Lagre</button><button class="btn ghost" id="back">Tilbake</button>`);
  $('#nm').focus();
  $('#back').onclick = home;
  $('#ok').onclick = () => {
    const name = $('#nm').value.trim(); const age = parseInt($('#ag').value, 10);
    if (!name) { $('#nm').focus(); return; }
    state.people.push({ name, age: isFinite(age) ? age : null, history: [] });
    savePeople(); personPage(state.people.length - 1);
  };
}

function personPage(i) {
  const p = state.people[i];
  const last = p.history?.[p.history.length - 1];
  render(`
    <button class="link" id="back" style="align-self:flex-start">‹ Tilbake</button>
    <h1>${esc(p.name)}</h1>
    <p class="muted">${p.age ? p.age + ' år' : ''}</p>
    ${last ? rxCard(last, p) : '<div class="card muted">Ingen resultater ennå.</div>'}
    ${p.history?.length > 1 ? `<details class="card"><summary style="font-weight:600;cursor:pointer">Tidligere tester (${p.history.length - 1})</summary>
      ${p.history.slice(0, -1).reverse().map(h => rxCard(h, p, true)).join('')}</details>` : ''}
    <button class="btn" id="go">Start ny test</button>
    <div class="grow"></div>
    <button class="link" id="del" style="color:var(--bad);margin-top:16px">Slett ${esc(p.name)}</button>`);
  $('#back').onclick = home;
  $('#go').onclick = () => startTest(p);
  let armed = false;
  $('#del').onclick = e => {
    if (!armed) { armed = true; e.target.textContent = 'Trykk igjen for å slette'; return; }
    state.people.splice(i, 1); savePeople(); home();
  };
}

function about() {
  render(`
    <button class="link" id="back" style="align-self:flex-start">‹ Tilbake</button>
    <h2>Slik virker det</h2>
    <p><b>1. Bokstavtavle (visus).</b> Samme Sloan-bokstaver som hos optikeren, i nøyaktig riktig størrelse for avstanden. Skjermen kalibreres med et bankkort, så millimeterne stemmer.</p>
    <p><b>2. Astigmatisme-skive.</b> Strekene i alle retninger skal se like ut. Ser noen mørkere ut, tyder det på skjeve hornhinner – og retningen gir aksen.</p>
    <p><b>3. Fjernpunkt.</b> Et nærsynt øye ser skarpt bare ut til en viss avstand. Frontkameraet måler avstanden til ansiktet ditt (via iris og ansiktsform) mens du fører mobilen bort. Styrken er omtrent −1 delt på avstanden i meter. Dette måles med striper i to retninger, som gir sfære, sylinder og akse.</p>
    <p><b>4. Nærpunkt</b> (fra 38 år). Hvor nær du klarer å lese, gir lesestyrken (ADD).</p>
    <p><b>5. PD</b> (pupilldistanse) måles fra kamerabildet under kalibreringen.</p>
    <div class="card small">
      <b>Begrensninger.</b> Dette er for moro og nysgjerrighet i familien, ikke en resept eller en helsekontroll.
      Langsynthet (plusstyrke) kan ikke måles med denne metoden. Resultatet kan avvike ±0,5 D eller mer.
      Gå til optiker for briller og for å sjekke øyehelsen.
    </div>`);
  $('#back').onclick = home;
}

// ---------------------------------------------------------------- Resultatkort
function rxCard(h, p, compact) {
  const row = (eye, r) => `<tr><td>${eye === 'OD' ? 'H' : 'V'}</td><td>${RX.formatD(r.sph)}</td><td>${r.cyl ? RX.formatD(r.cyl) : '—'}</td>
    <td>${r.axis ?? '—'}</td><td>${r.add ? RX.formatD(r.add) : '—'}</td><td>${RX.formatDecimal(r.acuity)}</td></tr>`;
  const notes = [...new Set([...(h.OD.notes || []), ...(h.OS.notes || [])])];
  return `<div class="card">
    <div class="row" style="align-items:baseline"><div class="stamp">Synstest · ${esc(p.name)}</div>
      <div class="stamp" style="text-align:right">${new Date(h.date).toLocaleDateString('nb-NO')}</div></div>
    <table class="rx" style="margin-top:8px"><tr><th>Øye</th><th>Sfære</th><th>Cyl</th><th>Akse</th><th>Add</th><th>Visus</th></tr>
      ${row('OD', h.OD)}${row('OS', h.OS)}</table>
    ${h.pd ? `<p style="margin:10px 0 0"><b>PD:</b> ${Math.round(h.pd)} mm <span class="muted small">(avstand)</span></p>` : ''}
    ${!compact && notes.length ? `<ul class="clean small muted">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${!compact && (h.OD.addSource === 'age' || h.OS.addSource === 'age') ? '<p class="small muted">Add er anslått ut fra alder.</p>' : ''}
  </div>`;
}

function rxText(h, p) {
  const l = (e, r) => `${e === 'OD' ? 'Høyre' : 'Venstre'}: SPH ${RX.formatD(r.sph)}  CYL ${r.cyl ? RX.formatD(r.cyl) : '—'}  AKSE ${r.axis ?? '—'}  ADD ${r.add ? RX.formatD(r.add) : '—'}  Visus ${RX.formatDecimal(r.acuity)}`;
  return `Synstest – ${p.name} – ${new Date(h.date).toLocaleDateString('nb-NO')}\n${l('OD', h.OD)}\n${l('OS', h.OS)}${h.pd ? `\nPD ${Math.round(h.pd)} mm` : ''}\n(Hjemmetest, ikke resept)`;
}

// ---------------------------------------------------------------- Stegene
const STEPS = {};

STEPS.screencal = st => {
  let px = Math.round((state.pxPerMm || 6.3) * 85.6);
  render(`
    ${st.standalone ? '' : progress()}
    <h2>Kalibrer skjermen</h2>
    <p>Legg et bankkort (eller førerkort) <b>på langs</b> mot skjermen. Juster til rammen er nøyaktig like stor som kortet.</p>
    <div class="grow" style="display:grid;place-items:center;min-height:200px"><div class="cardshape" id="cs"></div></div>
    <input type="range" id="sl" min="250" max="1000" step="1">
    <div class="row"><button class="btn light" id="mi">− Mindre</button><button class="btn light" id="pl">+ Større</button></div>
    <button class="btn" id="ok">Kortet passer</button>`);
  const cs = $('#cs'), sl = $('#sl');
  const upd = () => { cs.style.height = px + 'px'; cs.style.width = (px * 53.98 / 85.6) + 'px'; sl.value = px; };
  sl.oninput = () => { px = +sl.value; upd(); };
  $('#mi').onclick = () => { px--; upd(); };
  $('#pl').onclick = () => { px++; upd(); };
  $('#ok').onclick = () => {
    state.pxPerMm = px / 85.6; store.set('pxPerMm', state.pxPerMm);
    if (st.standalone) home(); else next();
  };
  upd();
};

STEPS.camstart = () => {
  render(`
    ${progress()}
    <h2>Slå på kameraet</h2>
    <p>Frontkameraet brukes til å måle hvor langt unna ansiktet ditt mobilen er. Bildene blir aldri lagret eller sendt noe sted – alt skjer på mobilen.</p>
    <div class="grow"></div>
    <p id="st" class="muted center"></p>
    <button class="btn" id="go">Slå på kamera</button>
    ${abortBtn}`);
  $('#go').onclick = async () => {
    const btn = $('#go'); btn.disabled = true;
    const st = $('#st');
    try {
      await Cam.start(msg => { st.innerHTML = `<span class="spin"></span>&nbsp; ${msg}`; });
      next();
    } catch (e) {
      console.error(e);
      st.innerHTML = `<b style="color:var(--bad)">Fikk ikke startet kameraet.</b><br>Sjekk at nettleseren har lov til å bruke kameraet. Du kan også fortsette og måle avstandene med målebånd.`;
      btn.disabled = false; btn.textContent = 'Prøv igjen';
      if (!$('#man')) {
        btn.insertAdjacentHTML('afterend', '<button class="btn ghost" id="man">Fortsett med målebånd</button>');
        $('#man').onclick = () => { Cam.manual = true; Cam.stop(); state.steps[state.i + 1].skip = () => true; next(); };
      }
    }
  };
};

STEPS.camcal = () => {
  Cam.video.classList.add('preview');
  render(`
    ${progress()}
    <h2>Kalibrer avstand</h2>
    <p>Hold et <b>A4-ark på langs</b> fra kinnbeinet rett under øyet og ut til skjermen (29,7 cm). Har du linjal, kan du måle 30 cm.</p>
    <p class="muted small">Hold mobilen rett foran ansiktet og se på skjermen. Begge øynene åpne.</p>
    <div class="grow center" style="display:grid;place-items:center">
      <div><div id="face" class="pill">Leter etter ansiktet …</div>
      <div class="dist" id="dv" style="margin-top:14px"></div><div id="pd" class="muted"></div></div>
    </div>
    <button class="btn" id="cal" disabled>Kalibrer nå</button>
    <button class="btn ghost" id="ok" style="display:none">Ser bra ut – fortsett</button>
    ${abortBtn}`);
  let done = false, alive = true;
  const tick = () => {
    if (!alive) return;
    const f = Cam.fresh() || (Cam.face && !Cam.K);
    $('#face').className = 'pill ' + (f ? 'ok' : 'warn');
    $('#face').textContent = f ? 'Ansikt funnet ✓' : 'Finner ikke ansiktet';
    $('#cal').disabled = !Cam.face;
    if (done && Cam.d) $('#dv').textContent = Math.round(Cam.d) + ' cm';
    requestAnimationFrame(tick);
  };
  tick();
  state.cleanup = () => { alive = false; Cam.video.classList.remove('preview'); };
  $('#cal').onclick = async () => {
    $('#cal').disabled = true; $('#cal').innerHTML = '<span class="spin" style="border-top-color:#fff"></span>&nbsp; Hold stille …';
    const ok = await Cam.calibrate(A4_CM);
    $('#cal').textContent = done || ok ? 'Kalibrer på nytt' : 'Prøv igjen';
    $('#cal').classList.toggle('ghost', ok); $('#cal').disabled = false;
    if (!ok) { $('#dv').textContent = ''; $('#pd').textContent = 'Fikk ikke nok bilder av ansiktet – prøv igjen i bedre lys.'; return; }
    done = true;
    state.data.pd = Cam.pdFar;
    $('#pd').innerHTML = `PD målt: <b>${Math.round(Cam.pdFar)} mm</b><br><span class="small">Flytt mobilen fram og tilbake – tallet skal følge med.</span>`;
    $('#ok').style.display = '';
  };
  $('#ok').onclick = next;
};

STEPS.eyeintro = st => {
  const E = EYE[st.eye];
  render(`
    ${progress()}
    <div class="grow" style="display:grid;place-items:center;text-align:center"><div>
      <span class="eye-tag">${st.eye}</span>
      <h1 style="margin-top:12px">${E.name}</h1>
      <p>Dekk til <b>${E.cover} øye</b> med håndflaten. Ikke trykk på øyet, og hold det åpent under hånden.</p>
      <p class="muted">Bruker du briller eller linser? Ta dem av.</p>
    </div></div>
    <button class="btn" id="go">Jeg er klar</button>${abortBtn}`);
  $('#go').onclick = next;
};

STEPS.acuityIntro = st => {
  const d = state.acuityDist;
  render(`
    ${progress()}
    <span class="eye-tag">${st.eye} · ${EYE[st.eye].name}</span>
    <h2 style="margin-top:10px">Bokstavtavle</h2>
    <p>Akkurat som hos optikeren. Du trenger en <b>hjelper</b>:</p>
    <ul class="clean">
      <li>Hjelperen holder mobilen i øyehøyde, med skjermen mot deg, på avstanden under.</li>
      <li>Du leser bokstavene høyt (dekk fortsatt til ${EYE[st.eye].cover} øye).</li>
      <li>Hjelperen kikker på skjermen og trykker på bokstaver som blir lest <b>feil</b>, og så «Neste rad».</li>
    </ul>
    <label>Avstand</label>
    <div class="row" id="dsel">${[2, 3, 4].map(m => `<button class="btn ${m === d ? '' : 'light'}" data-m="${m}" style="margin-top:0">${m} m</button>`).join('')}</div>
    <p class="small muted" style="margin-top:8px">3 m ≈ fire store skritt. Bruk målebånd hvis du har.</p>
    <div class="grow"></div>
    <button class="btn" id="go">Start bokstavtavla</button>
    <button class="btn ghost" id="skip">Hopp over (ingen hjelper)</button>${abortBtn}`);
  main.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { state.acuityDist = +b.dataset.m; STEPS.acuityIntro(st); });
  $('#go').onclick = next;
  $('#skip').onclick = () => { state.data[st.eye].acuity = null; state.i++; next(); };
};

STEPS.acuity = st => {
  const rows = RX.ACUITY_ROWS;
  let idx = rows.indexOf(0.5), best = null, letters = [], wrong = new Set();
  const results = {};
  const draw = () => {
    const l = rows[idx];
    const px = RX.letterHeightMm(l, state.acuityDist) * state.pxPerMm;
    const avail = Math.min(innerWidth, 560) - 28;
    const n = Math.max(1, Math.min(5, Math.floor((avail + px * 0.8) / (px * 1.8))));
    letters = pickLetters(n); wrong = new Set();
    render(`<div class="stage">
      <div class="top"><span class="eye-tag">${st.eye}</span><span class="muted small">${state.acuityDist} m · rad ${RX.formatDecimal(l)}</span>${abortBtn}</div>
      <div class="mid"><div class="letters" style="gap:${px * 0.8}px">
        ${letters.map((c, i) => `<div data-i="${i}" style="position:relative">${letterSvg(c, px)}</div>`).join('')}</div></div>
      <div class="hint">Hjelper: trykk på bokstavene som ble lest feil.</div>
      <button class="btn" id="nx">Neste rad</button>
    </div>`);
    main.querySelectorAll('[data-i]').forEach(el => el.onclick = () => {
      const i = +el.dataset.i;
      wrong.has(i) ? wrong.delete(i) : wrong.add(i);
      el.firstElementChild.classList.toggle('wrong', wrong.has(i));
    });
    $('#nx').onclick = submit;
  };
  const finish = () => {
    let val;
    if (best == null) val = 1.1;
    else {
      val = rows[best];
      const nxt = results[best + 1];
      if (nxt) val -= 0.1 * (nxt.c / nxt.n);
    }
    state.data[st.eye].acuity = Math.round(val * 100) / 100;
    next();
  };
  const submit = () => {
    const n = letters.length, c = n - wrong.size;
    results[idx] = { n, c };
    const pass = c / n >= 0.6;
    if (pass) {
      best = best == null ? idx : Math.max(best, idx);
      if (idx === rows.length - 1 || (results[idx + 1] && results[idx + 1].c / results[idx + 1].n < 0.6)) return finish();
      idx++;
    } else {
      if (best != null || idx === 0) return finish();
      idx--;
    }
    draw();
  };
  draw();
};

STEPS.fan = st => {
  let sel = null;
  const sizePx = Math.min(innerWidth - 28, innerHeight * 0.52, 75 * state.pxPerMm);
  const lines = [];
  for (let k = 0; k < 12; k++) {
    const a = k * 15 * Math.PI / 180, dx = Math.cos(a), dy = -Math.sin(a), nx = -dy, ny = dx;
    let seg = '';
    for (const off of [-3.4, 0, 3.4]) for (const s of [-1, 1]) {
      const x1 = s * 22 * dx + off * nx, y1 = s * 22 * dy + off * ny, x2 = s * 86 * dx + off * nx, y2 = s * 86 * dy + off * ny;
      seg += `M${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}`;
    }
    lines.push(`<path data-k="${k}" d="${seg}" stroke="#111" stroke-width="1.5" fill="none"/>`);
  }
  const labels = [];
  for (let k = 0; k < 24; k += 2) {
    const deg = k * 15, a = deg * Math.PI / 180;
    let h = Math.round(3 - deg / 30); h = ((h % 12) + 12) % 12 || 12;
    labels.push(`<text x="${(95 * Math.cos(a)).toFixed(1)}" y="${(-95 * Math.sin(a) + 3.2).toFixed(1)}" font-size="9" text-anchor="middle" fill="#5d6f7a" font-family="inherit">${h}</text>`);
  }
  render(`<div class="stage">
    <div class="top"><span class="eye-tag">${st.eye}</span><span class="muted small">Astigmatisme</span>${abortBtn}</div>
    <div class="hint" style="color:var(--ink)">Hold mobilen på <b>strak arm</b> og se på midten.<br>Ser noen streker <b>mørkere og skarpere</b> ut enn de andre? Trykk på dem.</div>
    <div class="mid"><svg id="fan" width="${sizePx}" height="${sizePx}" viewBox="-102 -102 204 204" style="touch-action:manipulation">
      <circle r="102" fill="#fff"/>${lines.join('')}${labels.join('')}<circle r="3" fill="#111"/></svg></div>
    <div class="row"><button class="btn ghost" id="eq">Alle er like</button><button class="btn" id="ok" disabled>Disse er mørkest</button></div>
  </div>`);
  $('#fan').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(x, y) < r.width * 0.08) return;
    let a = Math.atan2(-y, x) * 180 / Math.PI; a = ((a % 180) + 180) % 180;
    sel = Math.round(a / 15) % 12;
    main.querySelectorAll('#fan path').forEach(p => p.setAttribute('stroke', +p.dataset.k === sel ? '#0b7a8c' : '#111'));
    $('#ok').disabled = false;
  };
  $('#eq').onclick = () => { state.data[st.eye].fan = null; next(); };
  $('#ok').onclick = () => { state.data[st.eye].fan = sel * 15; next(); };
};

// Sinusgitter med fast vinkelstørrelse (4 bueminutter per periode ≈ visus 0,5-detaljer)
function gratingCanvas(sizeCss, orientDeg) {
  const cv = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  cv.width = cv.height = Math.round(sizeCss * dpr);
  cv.style.width = cv.style.height = sizeCss + 'px';
  cv.style.borderRadius = '50%';
  const ctx = cv.getContext('2d');
  let lastP = 0;
  cv.update = distCm => {
    const periodMm = distCm * 10 * Math.tan((4 / 60) * Math.PI / 180);
    const P = Math.max(3, periodMm * state.pxPerMm * dpr);
    if (Math.abs(P - lastP) / P < 0.03) return;
    lastP = P;
    const N = cv.width, img = ctx.createImageData(N, N), d = img.data;
    const a = orientDeg * Math.PI / 180, nx = -Math.sin(a), ny = -Math.cos(a), c = N / 2, R = N / 2, k = 2 * Math.PI / P;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - c, dy = y - c, r = Math.hypot(dx, dy) / R, o = (y * N + x) * 4;
      let v = 255;
      if (r < 1) {
        const w = r < 0.85 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (r - 0.85) / 0.15);
        v = 255 * (1 - w * (0.5 - 0.5 * Math.cos(k * (dx * nx + dy * ny))));
      }
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  return cv;
}

// Felles motor for fjernpunkt og nærpunkt
function pointStage({ st, title, queue, makeStim, armWhen, intro, armedHint, neverLabel, neverValue, onDone, onRecord }) {
  let t = 0;
  const runTrial = () => {
    if (t >= queue.length) return onDone();
    const trial = queue[t];
    let armed = Cam.manual, alive = true, busy = false;
    render(`<div class="stage">
      <div class="top"><span class="eye-tag">${st.eye}</span><span class="muted small">${title} · ${t + 1} av ${queue.length}</span>${abortBtn}</div>
      <div class="hint" id="hint" style="color:var(--ink)">${intro}</div>
      <div class="mid" id="mid"><div id="stim"></div></div>
      <div class="center" style="min-height:58px"><span class="dist" id="dv" style="font-size:30px"></span> <span id="fp" class="pill"></span></div>
      <button class="btn ghost" id="never">${neverLabel}</button>
    </div>`);
    const stim = makeStim(trial);
    $('#stim').appendChild(stim);
    const loop = () => {
      if (!alive) return;
      if (!Cam.manual) {
        const f = Cam.fresh();
        $('#fp').className = 'pill ' + (f ? 'ok' : 'warn');
        $('#fp').textContent = f ? 'Ansikt ✓' : 'Finner ikke ansiktet';
        $('#dv').textContent = f ? Math.round(Cam.d) + ' cm' : '';
        if (f && !armed && armWhen(Cam.d)) { armed = true; $('#hint').innerHTML = armedHint; }
        stim.update?.(f ? Cam.d : 40);
      } else stim.update?.(40);
      requestAnimationFrame(loop);
    };
    if (Cam.manual) { $('#hint').innerHTML = armedHint; $('#fp').style.display = 'none'; }
    loop();
    state.cleanup = () => { alive = false; };
    const record = async v => {
      busy = true;
      onRecord(trial, v);
      $('#mid').insertAdjacentHTML('beforeend', `<div class="flash">${v == null ? 'Notert ✓' : Math.round(v) + ' cm ✓'}</div>`);
      await sleep(1100);
      if (!alive) return;
      t++; runTrial();
    };
    $('#mid').onclick = () => {
      if (busy) return;
      if (Cam.manual) return manualEntry(record);
      if (!armed) return;
      const d = Cam.distAgo(250);
      if (!Cam.fresh() || d == null) { $('#hint').innerHTML = '<b style="color:var(--warn)">Fant ikke ansiktet akkurat da.</b> Prøv igjen – hold ansiktet midt foran kameraet.'; return; }
      record(d);
    };
    $('#never').onclick = () => { if (!busy) record(neverValue); };
  };
  runTrial();
}

function manualEntry(cb) {
  const mid = $('#mid');
  mid.insertAdjacentHTML('beforeend', `<div class="flash" id="me" style="color:var(--ink);font-size:17px"><div style="width:80%">
    <label for="cm">Mål avstanden fra øyet til skjermen (cm)</label><input id="cm" type="number" inputmode="decimal" min="5" max="150">
    <button class="btn" id="cmok">Lagre</button></div></div>`);
  const me = $('#me'); me.onclick = e => e.stopPropagation();
  $('#cm').focus();
  $('#cmok').onclick = () => { const v = parseFloat($('#cm').value.replace(',', '.')); if (v > 3) { me.remove(); cb(v); } };
}

STEPS.far = st => {
  const D = state.data[st.eye];
  const a = D.fan ?? 0, b = (a + 90) % 180;
  const res = { [a]: [], [b]: [] };
  const queue = [a, b, a, b];
  let extraDone = false;
  const size = Math.min(innerWidth - 40, 42 * state.pxPerMm, innerHeight * 0.42);
  const toD = cm => cm == null ? 0 : 100 / cm;
  pointStage({
    st, title: 'Fjernpunkt', queue,
    makeStim: o => gratingCanvas(size, o),
    armWhen: d => d < 35,
    intro: 'Hold mobilen <b>nær øyet</b> (10–20 cm), så nær at stripene er skarpe.',
    armedHint: 'Før mobilen <b>sakte bort</b>. Trykk på stripene <b>i det</b> de begynner å bli grå eller utydelige.',
    neverLabel: 'De blir aldri uskarpe (strak arm)',
    neverValue: null,
    onRecord: (o, v) => res[o].push(v),
    onDone: () => {
      if (!extraDone) {
        extraDone = true;
        const extra = [a, b].filter(o => { const v = res[o]; return Math.abs(toD(v[0]) - toD(v[1])) > 0.5; });
        if (extra.length) { queue.push(...extra); return STEPS._resume(); }
      }
      D.far = { linesA: a, farA: res[a], farB: res[b] };
      next();
    },
  });
  // pointStage kjører videre gjennom queue når vi legger til ekstra målinger:
  STEPS._resume = () => { const done = res[a].length + res[b].length; pointStageResume(done); };
  const pointStageResume = startAt => {
    const q = queue.slice(startAt);
    pointStage({
      st, title: 'Ekstra måling', queue: q,
      makeStim: o => gratingCanvas(size, o), armWhen: d => d < 35,
      intro: 'Målingene sprikte litt. En gang til: hold mobilen <b>nær øyet</b>.',
      armedHint: 'Før mobilen <b>sakte bort</b>. Trykk <b>i det</b> stripene blir utydelige.',
      neverLabel: 'De blir aldri uskarpe (strak arm)', neverValue: null,
      onRecord: (o, v) => res[o].push(v),
      onDone: () => { D.far = { linesA: a, farA: res[a], farB: res[b] }; next(); },
    });
  };
};

STEPS.near = st => {
  const D = state.data[st.eye]; D.near = [];
  const fs = 1.76 * state.pxPerMm; // N5-skrift
  const text = 'Les denne teksten. Når bokstavene flyter sammen og blir uklare, trykker du på teksten. Små bokstaver krever at øyet stiller skarpt på nært hold.';
  pointStage({
    st, title: 'Nærpunkt', queue: [0, 1],
    makeStim: () => { const el = document.createElement('div'); el.style.cssText = `font-size:${fs}px;line-height:1.35;max-width:${46 * state.pxPerMm}px;font-family:Georgia,serif;color:#000`; el.textContent = text + ' ' + text; return el; },
    armWhen: d => d > 28,
    intro: 'Hold mobilen på <b>armlengdes avstand</b> (over 30 cm).',
    armedHint: 'Før mobilen <b>sakte nærmere</b>. Trykk på teksten <b>i det</b> den blir uskarp.',
    neverLabel: 'Den blir aldri uskarp',
    neverValue: 10,
    onRecord: (o, v) => D.near.push(v),
    onDone: next,
  });
};

STEPS.result = () => {
  Cam.stop(); wakeLock?.release?.().catch(() => { });
  const p = state.person, h = { date: state.data.date, pd: state.data.pd };
  for (const eye of ['OD', 'OS']) {
    const D = state.data[eye];
    h[eye] = RX.computeEye({ linesA: D.far?.linesA ?? 0, farA: D.far?.farA ?? [], farB: D.far?.farB ?? [], acuity: D.acuity ?? null, near: D.near ?? [], age: p.age });
    h[eye].rawInput = { fan: D.fan ?? null, ...D.far, near: D.near ?? [] };
  }
  p.history = p.history || []; p.history.push(h); savePeople();
  state.steps = [];
  render(`
    <div class="hero" style="margin-top:4px">${eyeLogo(52)}</div>
    <h1 class="center">Resultat</h1>
    ${rxCard(h, p)}
    <details class="card small"><summary style="font-weight:600;cursor:pointer">Hva betyr tallene?</summary>
      <p style="margin-top:10px"><b>Sfære</b>: minus = nærsynt (ser dårlig på avstand), pluss = langsynt.</p>
      <p><b>Cyl</b> og <b>akse</b>: astigmatisme – hvor mye og i hvilken retning (grader).</p>
      <p><b>Add</b>: ekstra styrke for lesing. <b>Visus</b>: synsskarphet uten briller (1,0 = normalt).</p>
      <p><b>PD</b>: avstanden mellom pupillene.</p>
      <p class="muted">Dette er en hjemmetest for moro skyld – ikke en resept. Avvik på ±0,5 D er vanlig.</p></details>
    <button class="btn" id="cp">Kopier resultat</button>
    <button class="btn ghost" id="done">Ferdig</button>`);
  $('#cp').onclick = async () => {
    try { await navigator.clipboard.writeText(rxText(h, p)); $('#cp').textContent = 'Kopiert ✓'; }
    catch { $('#cp').textContent = 'Kunne ikke kopiere'; }
  };
  $('#done').onclick = () => personPage(state.people.indexOf(p));
};

home();
