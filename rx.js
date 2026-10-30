// Beregninger for synstesten. Rene funksjoner uten DOM, slik at de kan testes.
//
// Metoden: fjernpunkt-måling. Et nærsynt øye ser skarpt bare ut til en viss
// avstand (fjernpunktet). Brillestyrken er da omtrent -1 / avstand (meter).
// Ved å måle fjernpunktet for striper i to retninger (vinkelrett på hverandre)
// får vi styrken i to meridianer, og dermed sfære, sylinder og akse.

export const VERTEX_M = 0.012;     // avstand brilleglass–hornhinne (12 mm)
export const DOF_CORR = 0.25;      // dybdeskarphet: folk merker uskarphet litt etter fjernpunktet
export const IRIS_MM = 11.7;       // gjennomsnittlig irisdiameter
export const SLOAN = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z'];

export const round025 = x => Math.round(x * 4) / 4;
export const ceil025 = x => Math.ceil(x * 4 - 1e-9) / 4;

export function median(arr) {
  const a = arr.filter(v => v != null && isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Fjernpunkt (cm, målt fra øyet) -> brilleglass-styrke (dioptrier) ved 12 mm.
export function farPointToSpectacle(cm) {
  const d = cm / 100;
  return -1 / (d - VERTEX_M);
}

// Vinkel på skjermen (mot klokka fra høyre, sett av den som testes)
// -> TABO-akse slik optikeren skriver den (sett fra optikeren, 1–180).
export function screenToTabo(deg) {
  let t = ((180 - deg) % 180 + 180) % 180;
  return t === 0 ? 180 : t;
}

// Striper med linjer i vinkel a tester meridianen a+90.
export const meridianOfLines = a => (a + 90) % 180;

// Bokstavhøyde i mm for gitt logMAR og avstand (m). Standard: 5 bueminutter ved logMAR 0.
export function letterHeightMm(logMAR, distM) {
  const arcmin = 5 * Math.pow(10, logMAR);
  return distM * 1000 * Math.tan((arcmin / 60) * Math.PI / 180);
}

export const logmarToDecimal = l => Math.pow(10, -l);

export function formatD(x) {
  if (x == null) return '—';
  if (Math.abs(x) < 0.125) return '0,00';
  const s = (x > 0 ? '+' : '−') + Math.abs(x).toFixed(2);
  return s.replace('.', ',');
}

export function formatDecimal(l) {
  if (l == null) return '—';
  const d = logmarToDecimal(l);
  return (d >= 1 ? d.toFixed(1) : d.toFixed(2)).replace('.', ',');
}

// Typisk leseaddisjon etter alder (brukes når nærpunkt ikke kunne måles).
export function ageAdd(age) {
  if (age == null || age < 40) return 0;
  if (age < 45) return 0.75;
  if (age < 50) return 1.25;
  if (age < 55) return 1.75;
  if (age < 60) return 2.25;
  return 2.5;
}

// Grovt anslag fra synsskarphet når fjernpunktet er utenfor rekkevidde.
// Ca. 0,25 D per linje (0,1 logMAR) for lett nærsynthet, maks −1,25.
export function acuityEstimate(logMAR) {
  if (logMAR == null || logMAR <= 0.1) return 0;
  return -Math.min(1.25, round025(logMAR * 2.5));
}

// Hovedberegning for ett øye.
//   linesA:  vinkel (skjerm) for stripene som så mørkest ut på skiva
//   farA:    fjernpunkter (cm, null = aldri uskarp) for striper i vinkel linesA
//   farB:    fjernpunkter for striper i vinkel linesA+90
//   acuity:  logMAR eller null
//   near:    nærpunkter (cm) eller []
//   age:     alder eller null
export function computeEye({ linesA = 0, farA = [], farB = [], acuity = null, near = [], age = null }) {
  const notes = [];
  let estimated = false;

  const pw = list => {
    const valid = list.filter(v => v != null);
    if (!valid.length || valid.length < list.length / 2) return null; // flest sa "aldri uskarp"
    return farPointToSpectacle(median(valid)) - DOF_CORR;
  };

  const merA = meridianOfLines(linesA);          // meridian målt av farA
  const merB = meridianOfLines(linesA + 90);     // meridian målt av farB
  let pA = pw(farA), pB = pw(farB);

  if (pA == null && pB == null) {
    const est = acuityEstimate(acuity);
    pA = pB = est;
    estimated = true;
    notes.push(est === 0
      ? 'Ingen nærsynthet funnet. Langsynthet kan ikke måles med denne metoden.'
      : 'Svak nærsynthet anslått ut fra synsskarpheten (fjernpunktet var utenfor rekkevidde).');
  } else if (pA == null || pB == null) {
    const known = pA ?? pB;
    const fill = Math.max(known, -0.5);
    if (pA == null) pA = fill; else pB = fill;
    estimated = true;
    notes.push('Én retning ble aldri uskarp – sylinderen er anslått.');
  }

  let sph, cyl, axis;
  const hi = Math.max(pA, pB), lo = Math.min(pA, pB);
  const rawCyl = lo - hi;
  if (Math.abs(rawCyl) < 0.5) {
    sph = round025((pA + pB) / 2);
    cyl = 0;
    axis = null;
  } else {
    sph = round025(hi);
    cyl = round025(rawCyl);
    const merHi = pA >= pB ? merA : merB;   // minus-sylinder: aksen ligger i meridianen med sfærestyrken
    axis = Math.round(screenToTabo(merHi) / 5) * 5 || 180;
  }
  if (Object.is(sph, -0)) sph = 0;

  // Addisjon (lesestyrke)
  let add = 0, addSource = 'none';
  const nearCm = median(near);
  const se = sph + cyl / 2;
  if (nearCm != null) {
    const amp = 100 / nearCm + se;                  // akkommodasjonsbredde
    add = Math.min(3, Math.max(0, ceil025(2.5 - amp / 2)));
    addSource = 'measured';
  } else if (age != null && age >= 40) {
    add = ageAdd(age);
    addSource = 'age';
  }

  return { sph, cyl, axis, add, addSource, acuity, estimated, notes, raw: { pA, pB, merA, merB, nearCm } };
}

// Pupilldistanse på avstand ut fra nær-PD målt med kamera på avstand distMm.
// Øynene konvergerer når man ser på mobilen; pupillen ligger ~13,5 mm foran rotasjonssenteret.
export function farPD(nearPdMm, distMm) {
  let pd = nearPdMm;
  for (let i = 0; i < 4; i++) {
    const ang = Math.atan((pd / 2) / (distMm + 13.5));
    pd = nearPdMm + 2 * 13.5 * Math.sin(ang);
  }
  return pd;
}

// Bokstavrader for visus, fra stor til liten.
export const ACUITY_ROWS = [1.0, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0, -0.1, -0.2];
