/**
 * Scena video guidata dallo scroll.
 *
 * Ogni clip è una cartella di fotogrammi in public/frames/<dir>/NN.webp.
 * `start`/`end` dicono in quale parte dello scroll (0 → 1) la clip avanza;
 * nelle FADES due clip consecutive si sfumano una nell'altra.
 * Per sostituire una clip basta rigenerare i fotogrammi con lo stesso nome
 * (vedi README) e, se cambia il numero, aggiornare `count`.
 */

type Clip = {
  dir: string;
  count: number;
  start: number;
  end: number;
  imgs: HTMLImageElement[];
  ok: boolean[];
};

const CLIPS: Clip[] = [
  { dir: 'latte', count: 95, start: 0, end: 0.30, imgs: [], ok: [] },
  { dir: 'cagliata', count: 95, start: 0.33, end: 0.55, imgs: [], ok: [] },
  { dir: 'forma', count: 95, start: 0.58, end: 1.0, imgs: [], ok: [] },
];

/** intervalli di scroll in cui la clip i sfuma nella clip i+1 */
const FADES: [number, number][] = [
  [0.28, 0.34],
  [0.53, 0.59],
];

const BG = '#0E0C09';

const frameUrl = (c: Clip, i: number) => `/frames/${c.dir}/${String(i + 1).padStart(2, '0')}.webp`;

export function initHero() {
  const hero = document.querySelector<HTMLElement>('.hero');
  const canvas = hero?.querySelector<HTMLCanvasElement>('.seq');
  const ctx = canvas?.getContext('2d');
  if (!hero || !canvas || !ctx) return;

  let p = 0;
  let lastKey = '';
  let queued = false;

  // --- caricamento fotogrammi: prima il primo di ogni clip, poi tutto in ordine
  const load = (c: Clip, i: number) => {
    if (c.imgs[i]) return;
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      c.ok[i] = true;
      lastKey = '';
      schedule();
    };
    im.src = frameUrl(c, i);
    c.imgs[i] = im;
  };
  CLIPS.forEach((c) => load(c, 0));
  CLIPS.forEach((c) => {
    for (let i = 1; i < c.count; i++) load(c, i);
  });

  // fotogramma caricato più vicino a quello voluto
  const nearest = (c: Clip) => {
    const t = Math.min(1, Math.max(0, (p - c.start) / (c.end - c.start)));
    const want = Math.round(t * (c.count - 1));
    for (let d = 0; d < c.count; d++) {
      if (want - d >= 0 && c.ok[want - d]) return want - d;
      if (want + d < c.count && c.ok[want + d]) return want + d;
    }
    return -1;
  };

  const cover = (im: HTMLImageElement, W: number, H: number) => {
    const s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
    const w = im.naturalWidth * s;
    const h = im.naturalHeight * s;
    ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
  };

  const draw = () => {
    // dimensione reale del canvas (nitido anche su schermi retina)
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      lastKey = '';
    }

    let base = CLIPS.length - 1;
    let over = -1;
    let t = 0;
    for (let i = 0; i < FADES.length; i++) {
      const [a, b] = FADES[i];
      if (p < a) { base = i; break; }
      if (p < b) { base = i; over = i + 1; t = (p - a) / (b - a); break; }
    }
    const fa = nearest(CLIPS[base]);
    const fb = over >= 0 ? nearest(CLIPS[over]) : -1;

    const key = `${cw}x${ch}|${base}:${fa}|${over}:${fb}|${t.toFixed(2)}`;
    if (key === lastKey) return;
    lastKey = key;

    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cw, ch);
    if (fa >= 0) cover(CLIPS[base].imgs[fa], cw, ch);
    if (fb >= 0) {
      ctx.globalAlpha = fa >= 0 ? t : 1;
      cover(CLIPS[over].imgs[fb], cw, ch);
      ctx.globalAlpha = 1;
    }
  };

  const update = () => {
    queued = false;
    const r = hero.getBoundingClientRect();
    const range = Math.max(1, hero.offsetHeight - window.innerHeight);
    p = Math.min(1, Math.max(0, -r.top / range));
    hero.style.setProperty('--p', p.toFixed(4));
    draw();
  };

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
}
