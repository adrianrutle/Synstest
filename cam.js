import * as RX from './rx.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- Kamera / avstand
export const Cam = {
  video: document.getElementById('cam'), lm: null, stream: null, running: false, available: false, manual: false,
  K: null, d: null, hist: [], face: false, lastFaceT: 0, last: null, calBuf: null, pdNear: null, pdFar: null,

  async start(onStatus) {
    if (this.running) return;
    onStatus?.('Ber om tilgang til kameraet …');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => { });
    if (!this.lm) {
      onStatus?.('Laster ansiktsgjenkjenning …');
      let vision;
      try { vision = await import(MP + '/vision_bundle.mjs'); }
      catch { vision = await import(MP); }
      const fileset = await vision.FilesetResolver.forVisionTasks(MP + '/wasm');
      const opts = delegate => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numFaces: 1 });
      try { this.lm = await vision.FaceLandmarker.createFromOptions(fileset, opts('GPU')); }
      catch { this.lm = await vision.FaceLandmarker.createFromOptions(fileset, opts('CPU')); }
    }
    this.available = true; this.running = true; this.manual = false;
    this.loop();
  },

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null; this.video.srcObject = null; this.d = null; this.hist = [];
  },

  loop() {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this._lt && v.videoWidth) {
      this._lt = v.currentTime;
      let r = null;
      try { r = this.lm.detectForVideo(v, performance.now()); } catch { }
      const L = r?.faceLandmarks?.[0];
      if (L) {
        const m = metrics(L, v.videoWidth, v.videoHeight);
        this.L = L; this.vw = v.videoWidth; this.vh = v.videoHeight;
        this.last = m; this.face = true; this.lastFaceT = performance.now();
        if (this.calBuf) this.calBuf.push(m);
        if (this.K) {
          const raw = RX.median(['irisA', 'irisB', 'faceW', 'noseChin'].map(k => this.K[k] / m[k]));
          this.d = this.d == null || Math.abs(raw - this.d) > 15 ? raw : this.d * 0.55 + raw * 0.45;
          this.hist.push({ t: performance.now(), d: this.d });
          if (this.hist.length > 150) this.hist.shift();
        }
      } else this.face = false;
    }
    requestAnimationFrame(() => this.loop());
  },

  fresh() { return this.face && this.d != null && performance.now() - this.lastFaceT < 500; },

  distAgo(ms) {
    const t = performance.now() - ms;
    for (let i = this.hist.length - 1; i >= 0; i--) if (this.hist[i].t <= t) return this.hist[i].d;
    return this.d;
  },

  async calibrate(cm) {
    this.calBuf = [];
    await sleep(1300);
    const buf = this.calBuf; this.calBuf = null;
    if (buf.length < 8) return false;
    const K = {};
    for (const k of ['irisA', 'irisB', 'faceW', 'noseChin']) K[k] = RX.median(buf.map(m => m[k])) * cm;
    this.K = K; this.d = cm; this.hist = [];
    const pd = RX.median(buf.map(m => m.ipd * RX.IRIS_MM / ((m.irisA + m.irisB) / 2)));
    this.pdNear = pd; this.pdFar = RX.farPD(pd, cm * 10);
    return true;
  },
};

export function metrics(L, w, h) {
  const P = i => [L[i].x * w, L[i].y * h];
  const D = (a, b) => { const p = P(a), q = P(b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
  return {
    irisA: (D(469, 471) + D(470, 472)) / 2,
    irisB: (D(474, 476) + D(475, 477)) / 2,
    faceW: D(234, 454),
    noseChin: D(168, 152),
    ipd: D(468, 473),
  };
}

