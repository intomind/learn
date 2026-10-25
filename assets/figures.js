// The figures. Every drawing in the book is made here, by the page, as
// SVG: it takes the page's colors, switches level and theme with it,
// prints crisp, and moves only where motion teaches. Nothing here flashes.
//
// A figure is an element `<figure data-fig="name" data-...>` whose
// maker, registered with `fig`, returns `render(w, h)` and, for one that
// moves, `tick(t)`. Signals are simulated, and the pages say so.

const NS = "http://www.w3.org/2000/svg";
const FIGURES = new Map();
export function fig(name, make) { FIGURES.set(name, make); }
export function names() { return [...FIGURES.keys()]; }

// ---- SVG helpers ------------------------------------------------------------------------------------

export function el(tag, attrs = {}, children = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, String(v));
  for (const c of children) n.append(typeof c === "string" ? document.createTextNode(c) : c);
  return n;
}
export const g = (attrs, children) => el("g", attrs, children);
export const line = (x1, y1, x2, y2, cls = "ink", extra = {}) => el("line", { x1, y1, x2, y2, class: cls, "stroke-width": 1.2, "stroke-linecap": "round", ...extra });
export const circle = (cx, cy, r, cls = "fill-ink", extra = {}) => el("circle", { cx, cy, r, class: cls, ...extra });
export const rect = (x, y, w, h, cls = "fill-tile", extra = {}) => el("rect", { x, y, width: Math.max(0, w), height: Math.max(0, h), class: cls, ...extra });
export const path = (d, cls = "ink", extra = {}) => el("path", { d, class: cls, fill: "none", "stroke-width": 1.4, "stroke-linejoin": "round", "stroke-linecap": "round", ...extra });
export const text = (x, y, s, extra = {}) => { const { cls, ...rest } = extra; return el("text", { x, y, class: cls, ...rest }, [s]); };
export const tx = (x, y, s, cls = "", extra = {}) => el("text", { x, y, class: cls || null, ...extra }, [s]);
const f1 = (v) => Math.round(v * 10) / 10;
export function poly(points, cls = "ink", extra = {}) {
  let d = "";
  for (let i = 0; i < points.length; i++) d += (i ? "L" : "M") + f1(points[i][0]) + " " + f1(points[i][1]);
  return path(d, cls, extra);
}
export function arrow(x1, y1, x2, y2, cls = "ink", extra = {}) {
  const a = Math.atan2(y2 - y1, x2 - x1), s = 7;
  const head = `M${f1(x2)} ${f1(y2)} L${f1(x2 - s * Math.cos(a - 0.5))} ${f1(y2 - s * Math.sin(a - 0.5))} M${f1(x2)} ${f1(y2)} L${f1(x2 - s * Math.cos(a + 0.5))} ${f1(y2 - s * Math.sin(a + 0.5))}`;
  return g({}, [line(x1, y1, x2, y2, cls, extra), path(head, cls, extra)]);
}
/** A label with a quiet background, so it reads over a drawing. */
export function tag(x, y, s, cls = "", anchor = "middle") {
  return tx(x, y, s, cls, { "text-anchor": anchor, "dominant-baseline": "middle" });
}

// ---- A seeded source of randomness, so a figure draws the same signal every time. -----------------

export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  const r = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.gauss = () => { const u = Math.max(r(), 1e-9), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return r;
}

// ---- Simulated EEG, in microvolts. ---------------------------------------------------------------
// Background noise that falls with frequency, like EEG's, from white noise
// run through a few first-order filters. Alpha is a sinusoid near ten
// hertz whose amplitude waxes and wanes. A blink is a slow, large bump.
// A clenched jaw adds a burst of fast muscle noise. A flicker response is
// a small sinusoid at the stimulus rate with a weaker second harmonic.

export function eeg({ fs = 250, seconds = 4, seed = 7, alpha = 0, alphaHz = 10, open = null, blinks = [], jaw = [], ssvep = null, noise = 9, front = false } = {}) {
  const r = rng(seed);
  const n = Math.round(fs * seconds);
  const out = new Float32Array(n);
  let s1 = 0, s2 = 0, s3 = 0;
  const a1 = Math.exp(-2 * Math.PI * 2 / fs), a2 = Math.exp(-2 * Math.PI * 8 / fs), a3 = Math.exp(-2 * Math.PI * 25 / fs);
  const phase = r() * Math.PI * 2, wob = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const w = r.gauss();
    s1 = a1 * s1 + (1 - a1) * w; s2 = a2 * s2 + (1 - a2) * w; s3 = a3 * s3 + (1 - a3) * w;
    let v = noise * (2.2 * s1 + 1.6 * s2 + 0.9 * s3 + 0.35 * w);
    // Eyes open: alpha mostly blocked. A function of time says when they are open, 1 for open.
    const openness = open ? open(t) : 0;
    const amp = alpha * (1 - 0.82 * openness) * (0.62 + 0.38 * Math.sin(2 * Math.PI * 0.23 * t + wob)) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.07 * t));
    v += amp * Math.sin(2 * Math.PI * (alphaHz + 0.15 * Math.sin(2 * Math.PI * 0.11 * t)) * t + phase);
    for (const b of blinks) { const d = t - b; if (d > -0.4 && d < 0.4) v += (front ? 160 : 24) * Math.exp(-(d * d) / (2 * 0.085 * 0.085)); }
    for (const [j0, j1] of jaw) if (t >= j0 && t < j1) { const e = Math.min(1, (t - j0) * 6, (j1 - t) * 6); v += 42 * e * (r.gauss() * 0.5 + r.gauss() * 0.5); }
    if (ssvep) v += ssvep.amp * (Math.sin(2 * Math.PI * ssvep.hz * t) + 0.45 * Math.sin(2 * Math.PI * 2 * ssvep.hz * t + 0.6));
    out[i] = v;
  }
  return out;
}

// ---- Spectra: a real FFT, Welch's average of Hann-windowed segments, and band power. -------------

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

export function welch(x, fs, seg = 512) {
  const hop = seg >> 1;
  const win = new Float32Array(seg);
  let wsum = 0;
  for (let i = 0; i < seg; i++) { win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (seg - 1)); wsum += win[i] * win[i]; }
  const psd = new Float32Array(seg / 2 + 1);
  let count = 0;
  for (let s = 0; s + seg <= x.length; s += hop) {
    let mean = 0;
    for (let i = 0; i < seg; i++) mean += x[s + i];
    mean /= seg;
    const re = new Float64Array(seg), im = new Float64Array(seg);
    for (let i = 0; i < seg; i++) re[i] = (x[s + i] - mean) * win[i];
    fft(re, im);
    for (let k = 0; k <= seg / 2; k++) psd[k] += (re[k] * re[k] + im[k] * im[k]) / (fs * wsum) * (k === 0 || k === seg / 2 ? 1 : 2);
    count++;
  }
  for (let k = 0; k < psd.length; k++) psd[k] /= Math.max(count, 1);
  const freqs = Array.from(psd, (_, k) => (k * fs) / seg);
  return { freqs, psd };
}

export function bandPower(freqs, psd, lo, hi) {
  let p = 0;
  for (let k = 1; k < freqs.length; k++) if (freqs[k] >= lo && freqs[k] <= hi) p += psd[k] * (freqs[k] - freqs[k - 1]);
  return p;
}
export const alphaShare = (freqs, psd) => bandPower(freqs, psd, 8, 13) / Math.max(bandPower(freqs, psd, 4, 30), 1e-9);

// ---- Drawing pieces shared by several figures. -----------------------------------------------------

/** A trace in a box: x from `x0` over `w`, centered on `cy`, `pxPerUv` tall. Returns the path node. */
function tracePath(sig, fs, x0, w, cy, pxPerUv, cls = "ink", width = 1.3) {
  const n = sig.length;
  const pts = [];
  const step = Math.max(1, Math.floor(n / (w * 2)));
  for (let i = 0; i < n; i += step) pts.push([x0 + (i / n) * w, cy - sig[i] * pxPerUv]);
  return poly(pts, cls, { "stroke-width": width });
}

/** The time axis under a trace: a tick each second. */
function timeAxis(x0, y, w, seconds, step = 1) {
  const out = [line(x0, y, x0 + w, y, "rule")];
  for (let s = 0; s <= seconds + 1e-6; s += step) {
    const x = x0 + (s / seconds) * w;
    out.push(line(x, y, x, y + 5, "muted"));
    out.push(tx(x, y + 18, `${s} s`, "", { "text-anchor": s === 0 ? "start" : s >= seconds ? "end" : "middle" }));
  }
  return g({}, out);
}

/** A scale bar of `uv` microvolts beside a trace. */
function scaleBar(x, cy, uv, pxPerUv) {
  const h = uv * pxPerUv;
  return g({}, [line(x, cy - h / 2, x, cy + h / 2, "ink2"), line(x - 4, cy - h / 2, x + 4, cy - h / 2, "ink2"), line(x - 4, cy + h / 2, x + 4, cy + h / 2, "ink2"), tx(x + 9, cy + 4, `${uv} µV`, "")]);
}

/** The spectrum drawn in a box, log power against frequency, with the alpha band washed. Returns {node, update(psd)}. */
function spectrumBox(x0, y0, w, h, { fs, fmax = 45, bands = [[8, 13]], labels = true, card = false } = {}) {
  const node = g({});
  const plot = g({});
  const fx = (f) => x0 + ((f - 1) / (fmax - 1)) * w;
  node.append(rect(x0, y0, w, h, "fill-tile"));
  for (const [lo, hi] of bands) node.append(rect(fx(lo), y0, fx(hi) - fx(lo), h, "wash-signal"));
  node.append(plot);
  if (labels) {
    node.append(line(x0, y0 + h, x0 + w, y0 + h, "rule"));
    for (const f of card ? [10, 30] : [1, 10, 20, 30, 45]) node.append(tx(fx(f), y0 + h + 16, `${f}`, "", { "text-anchor": "middle" }));
    node.append(tx(x0 + w, y0 + h + 30, "hertz", "", { "text-anchor": "end" }));
    for (const [lo, hi] of bands) node.append(tx(fx((lo + hi) / 2), y0 + 14, "alpha", "on", { "text-anchor": "middle" }));
  }
  const update = (freqs, psd) => {
    plot.replaceChildren();
    const pts = [];
    let lo = Infinity, hi = -Infinity;
    const vals = [];
    for (let k = 1; k < freqs.length - 1; k++) if (freqs[k] >= 1 && freqs[k] <= fmax) { const v = Math.log10((psd[k - 1] + 2 * psd[k] + psd[k + 1]) / 4 + 1e-6); vals.push([freqs[k], v]); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const span = Math.max(hi - lo, 1.5);
    for (const [f, v] of vals) pts.push([fx(f), y0 + h - 8 - ((v - lo) / span) * (h - 24)]);
    plot.append(poly(pts, "ink", { "stroke-width": 1.5 }));
  };
  return { node, update };
}

/** A horizontal bar for a share, 0 to 1, with its percent. */
function shareBar(x, y, w, value, { label = "Alpha", h = 14, lines = [] } = {}) {
  const node = g({});
  node.append(rect(x, y, w, h, "fill-tile"));
  node.append(rect(x, y, Math.max(0, Math.min(1, value)) * w, h, "fill-signal"));
  for (const v of lines) node.append(line(x + v * w, y - 4, x + v * w, y + h + 4, "ink2"));
  node.append(tx(x, y - 8, label, "t2"));
  node.append(tx(x + w, y - 8, `${Math.round(value * 100)}%`, "big", { "text-anchor": "end", style: "font-size:18px" }));
  return node;
}

// ---- The head: the ten-twenty positions, seen from above or the side. ------------------------------
// Positions in the usual polar form: angle from the nose, clockwise seen
// from above, and radius as a share of the head's circle, where the circle
// is the ring through Fpz, T7, Oz and T8.
const SITES = {
  Fpz: [0, 0.511], Fp1: [-18, 0.511], Fp2: [18, 0.511], Fz: [0, 0.256], F3: [-39.5, 0.344], F4: [39.5, 0.344], F7: [-54, 0.511], F8: [54, 0.511],
  Cz: [0, 0], C3: [-90, 0.256], C4: [90, 0.256], T7: [-90, 0.511], T8: [90, 0.511],
  Pz: [180, 0.256], P3: [-140.5, 0.344], P4: [140.5, 0.344], P7: [-126, 0.511], P8: [126, 0.511], O1: [-162, 0.511], O2: [162, 0.511], Oz: [180, 0.511],
};
const PLAIN = { Oz: "back of the head", O1: "back, left", O2: "back, right", Fpz: "forehead", Fp1: "forehead, left", Fp2: "forehead, right", C3: "above the left ear", C4: "above the right ear", Cz: "top of the head", Pz: "crown, toward the back", Fz: "front of the top", T7: "left ear", T8: "right ear" };
/** Where a site falls on a circle of radius R about (cx, cy), from above, nose at the top. */
export function siteXY(name, cx, cy, R) {
  const [deg, r] = SITES[name];
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + Math.cos(a) * r * 2 * R, cy + Math.sin(a) * r * 2 * R];
}

/** The head from above. `sites`: which to mark. `device`: the site the IntoMind One sits on, or several. `shade`: regions washed, with a label. */
function headTop({ cx, cy, R, sites = [], device = [], shade = [], names = true, plain = false, card = false }) {
  const node = g({});
  const r = R * 1.08;
  // The head, the nose, the ears.
  node.append(path(`M${cx - r * 0.09} ${cy - r} Q${cx} ${cy - r * 1.24} ${cx + r * 0.09} ${cy - r}`, "ink2"));
  node.append(path(`M${cx - r} ${cy - r * 0.12} Q${cx - r * 1.12} ${cy} ${cx - r} ${cy + r * 0.12} M${cx + r} ${cy - r * 0.12} Q${cx + r * 1.12} ${cy} ${cx + r} ${cy + r * 0.12}`, "ink2"));
  node.append(circle(cx, cy, r, "fill-tile2", { class: "fill-tile2 ink2", "stroke-width": 1.4, stroke: "var(--ink2)" }));
  const SHADES = {
    occipital: { d: `M${cx - R * 0.72} ${cy + R * 0.72} A${R} ${R} 0 0 0 ${cx + R * 0.72} ${cy + R * 0.72} Q${cx} ${cy + R * 0.28} ${cx - R * 0.72} ${cy + R * 0.72}Z`, label: "visual cortex", at: [cx, cy + R * 0.58] },
    motor: { d: `M${cx - R * 0.9} ${cy - R * 0.08} Q${cx} ${cy - R * 0.5} ${cx + R * 0.9} ${cy - R * 0.08} L${cx + R * 0.9} ${cy + R * 0.12} Q${cx} ${cy - R * 0.28} ${cx - R * 0.9} ${cy + R * 0.12}Z`, label: "motor cortex", at: [cx, cy - R * 0.24] },
    language: { d: `M${cx - R * 0.98} ${cy - R * 0.1} Q${cx - R * 0.55} ${cy - R * 0.55} ${cx - R * 0.32} ${cy - R * 0.4} Q${cx - R * 0.45} ${cy + R * 0.2} ${cx - R * 0.95} ${cy + R * 0.38} Q${cx - R * 1.02} ${cy + R * 0.1} ${cx - R * 0.98} ${cy - R * 0.1}Z`, label: "language areas", at: [cx - R * 0.74, cy + R * 0.52] },
  };
  for (const s of shade) {
    const sh = SHADES[s];
    if (!sh) continue;
    node.append(el("path", { d: sh.d, class: "wash-signal" }));
    if (!card) node.append(tag(sh.at[0], sh.at[1], sh.label, "on"));
  }
  for (const name of sites) {
    const [x, y] = siteXY(name, cx, cy, R);
    node.append(circle(x, y, card ? 2.2 : 3, "fill-muted"));
    if (names && !card) {
      const [deg] = SITES[name];
      const label = plain ? (PLAIN[name] ?? name) : name;
      const back = deg > 100 || deg < -100;
      let lx = x, ly = back ? y + 15 : Math.abs(deg) < 20 ? y + 14 : y - 9, anchor = "middle";
      // Plain names are long: they hang off the side of their site, away from the middle of the head.
      if (plain && x < cx - R * 0.2) { anchor = "end"; lx = x + 14; } else if (plain && x > cx + R * 0.2) { anchor = "start"; lx = x - 14; }
      // The device's own site is named under the puck, and a label under its rim moves out past it.
      for (const d of device) {
        const [ux, uy] = siteXY(d, cx, cy, R);
        const dist = Math.hypot(x - ux, y - uy), dr = R * 0.21;
        if (dist < 1) { lx = x; ly = y + dr + 12; anchor = "middle"; }
        else if (dist < dr + 14) { const a = Math.atan2(y - cy, x - cx); lx = x + Math.cos(a) * (dr + 8); ly = y + Math.sin(a) * (dr + 8) + 4; anchor = "middle"; }
      }
      // A long plain name breaks into two lines at its middle space.
      const words = label.split(" ");
      if (plain && label.length > 12 && words.length > 1) {
        let best = 1, bestGap = Infinity;
        for (let k = 1; k < words.length; k++) { const gapK = Math.abs(words.slice(0, k).join(" ").length - words.slice(k).join(" ").length); if (gapK < bestGap) { bestGap = gapK; best = k; } }
        node.append(tag(lx, ly - 6, words.slice(0, best).join(" "), "", anchor));
        node.append(tag(lx, ly + 7, words.slice(best).join(" "), "", anchor));
      } else node.append(tag(lx, ly, label, plain ? "" : "t2", anchor));
    }
  }
  for (const d of device) {
    const [x, y] = siteXY(d, cx, cy, R);
    const dr = R * 0.21;
    node.append(circle(x, y, dr, "fill-bg", { stroke: "var(--signal)", "stroke-width": 2 }));
    // The five electrodes on the underside: four around the reference.
    node.append(circle(x, y, 2.6, "fill-signal"));
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; node.append(circle(x + Math.cos(a) * dr * 0.55, y + Math.sin(a) * dr * 0.55, 2.6, "fill-signal")); }
  }
  return node;
}

/** The head from the left side, with the landmarks the ten-twenty system is measured from. Drawn in a 200 by 200 box, facing right. */
function headSide({ cx, cy, R, device = null, landmarks = true, plain = false, card = false }) {
  const node = g({});
  const k = (R * 2.1) / 200;
  const X = (x) => cx + (x - 100) * k, Y = (y) => cy + (y - 100) * k;
  const outline = `M${X(70)} ${Y(18)} C${X(110)} ${Y(5)} ${X(150)} ${Y(15)} ${X(160)} ${Y(45)} C${X(166)} ${Y(62)} ${X(165)} ${Y(78)} ${X(168)} ${Y(88)} C${X(175)} ${Y(95)} ${X(186)} ${Y(102)} ${X(184)} ${Y(110)} C${X(182)} ${Y(116)} ${X(172)} ${Y(117)} ${X(170)} ${Y(121)} C${X(176)} ${Y(126)} ${X(176)} ${Y(132)} ${X(170)} ${Y(138)} C${X(174)} ${Y(146)} ${X(168)} ${Y(156)} ${X(158)} ${Y(158)} C${X(148)} ${Y(162)} ${X(140)} ${Y(170)} ${X(136)} ${Y(182)} L${X(136)} ${Y(200)} L${X(92)} ${Y(200)} C${X(94)} ${Y(185)} ${X(86)} ${Y(170)} ${X(70)} ${Y(160)} C${X(40)} ${Y(145)} ${X(25)} ${Y(120)} ${X(30)} ${Y(90)} C${X(32)} ${Y(55)} ${X(45)} ${Y(25)} ${X(70)} ${Y(18)}Z`;
  node.append(el("path", { d: outline, class: "fill-tile2", stroke: "var(--ink2)", "stroke-width": 1.4 }));
  node.append(path(`M${X(120)} ${Y(92)} C${X(108)} ${Y(88)} ${X(104)} ${Y(106)} ${X(112)} ${Y(114)} C${X(118)} ${Y(118)} ${X(124)} ${Y(112)} ${X(122)} ${Y(104)}`, "ink2"));
  // The arc from the nasion, between the eyes, over the crown to the inion, the bump at the back: an ellipse through the crown.
  const ex = 100, ey = 104, rx = 70, ry = 88;
  const a0 = Math.atan2((86 - ey) / ry, (168 - ex) / rx), a1 = Math.atan2((112 - ey) / ry, (31 - ex) / rx);
  const arc = (frac) => { const a = a0 + (a1 - 2 * Math.PI - a0) * frac; return [X(ex + Math.cos(a) * rx), Y(ey + Math.sin(a) * ry), a]; };
  if (landmarks) {
    const nasion = [X(168), Y(86)], inion = [X(31), Y(112)], pre = [X(124), Y(100)];
    node.append(circle(nasion[0], nasion[1], 3, "fill-signal"));
    node.append(circle(inion[0], inion[1], 3, "fill-signal"));
    node.append(circle(pre[0], pre[1], 3, "fill-signal"));
    if (!card) {
      node.append(tag(nasion[0] - 10, nasion[1] - 12, plain ? "between the eyes" : "nasion", "t2", "end"));
      node.append(tag(inion[0] + 6, inion[1] + 16, plain ? "the bump at the back" : "inion", "t2", "start"));
      if (!plain) { node.append(tag(pre[0] - 8, pre[1] + 26, "preauricular", "t2")); node.append(tag(pre[0] - 8, pre[1] + 38, "point", "t2")); }
      if (!plain) for (const [frac, name] of [[0.1, "Fpz"], [0.3, "Fz"], [0.5, "Cz"], [0.7, "Pz"], [0.9, "Oz"]]) {
        const [x, y, a] = arc(frac);
        node.append(circle(x, y, 2.6, "fill-muted"));
        node.append(tag(x + Math.cos(a) * 16, y + Math.sin(a) * 16, name, "t2"));
      }
    }
  }
  if (device) {
    const frac = { Fpz: 0.1, Fz: 0.3, Cz: 0.5, Pz: 0.7, Oz: 0.9, O1: 0.9, O2: 0.9, C3: 0.5, C4: 0.5 }[device] ?? 0.9;
    const [x, y, a] = arc(frac);
    const w = R * 0.4, t = R * 0.085;
    node.append(el("rect", { x: -w / 2, y: -t - 1, width: w, height: t, rx: 3, class: "fill-bg", stroke: "var(--signal)", "stroke-width": 2, transform: `translate(${f1(x)} ${f1(y)}) rotate(${f1((a * 180) / Math.PI + 90)})` }));
  }
  return node;
}

// ---- Mounting: every figure on the page, sized to its box, redrawn on resize, theme and level. ------

const live = new Map();
const running = new Set();
let loop = null;
const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const still = () => !!document.documentElement.dataset.print || reduced;

function sizeOf(figure, svg, aspect) {
  const w = Math.max(240, Math.round(figure.clientWidth || 600));
  let h = Math.round(w * (typeof aspect === "function" ? aspect(w) : aspect));
  if (figure.classList.contains("hero-fig")) h = Math.round(svg.getBoundingClientRect().height) || h;
  return [w, h];
}

function create(figure) {
  const name = figure.dataset.fig;
  const make = FIGURES.get(name) ?? FIGURES.get("blank");
  const svg = el("svg", { role: "img", "aria-label": figure.querySelector("figcaption")?.textContent?.trim() || name });
  figure.prepend(svg);
  const inst = make(figure, svg, figure.dataset);
  const state = { figure, svg, inst, aspect: inst.aspect ?? (figure.dataset.card ? 0.625 : 0.62), w: 0, h: 0 };
  const draw = () => {
    const [w, h] = sizeOf(figure, svg, state.aspect);
    if (figure.classList.contains("hero-fig")) svg.setAttribute("preserveAspectRatio", still() ? "xMidYMid meet" : "xMidYMid slice");
    state.w = w; state.h = h;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    if (!figure.classList.contains("hero-fig")) svg.setAttribute("height", h);
    svg.replaceChildren();
    inst.render(w, h);
    if (inst.tick) inst.tick(still() ? 20 : 0, 0);
  };
  state.draw = draw;
  live.set(figure, state);
  draw();
  new ResizeObserver(() => { const [w] = sizeOf(figure, svg, state.aspect); if (Math.abs(w - state.w) > 2) draw(); }).observe(figure);
  if (inst.tick && !still()) {
    new IntersectionObserver((entries) => { for (const e of entries) { if (e.isIntersecting) running.add(state); else running.delete(state); } }, { rootMargin: "120px" }).observe(figure);
    if (loop === null) {
      let last = performance.now();
      const frame = (now) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        for (const s of running) { if (!s.figure.closest("[hidden]") && s.figure.offsetParent) s.inst.tick(now / 1000, dt); }
        loop = requestAnimationFrame(frame);
      };
      loop = requestAnimationFrame(frame);
    }
  }
}

export function mount(root) {
  for (const figure of root.querySelectorAll("figure[data-fig]")) if (!live.has(figure)) create(figure);
}
export function refresh() {
  for (const s of live.values()) if (s.inst.onLevel || s.inst.onTheme) s.draw();
}

// ---- The figures. ----------------------------------------------------------------------------------

fig("blank", (figure, svg) => ({ render(w, h) { svg.append(rect(0, 0, w, h, "fill-tile")); } }));

/** Four seconds of simulated EEG, one or four channels, with what the page asks drawn on it. */
fig("trace", (figure, svg, d) => {
  const seconds = Number(d.seconds ?? 4), fs = 250;
  const kind = d.kind ?? "closed";
  const seed = Number(d.seed ?? 11);
  const channels = Number(d.channels ?? 1);
  if (d.zoom && kind === "switch") return {
    aspect: 0.78,
    render(w, h) {
      const pad = 8, x0 = pad, tw = w - pad * 2;
      // A clear closed-eyes alpha, as it often is at the back of the head, so its waves can be counted.
      const sig = eeg({ fs, seconds, seed, alpha: 34, noise: 5.5, open: (t) => (t < seconds / 2 ? 1 : 0) });
      const topH = h * 0.46, cy = 30 + (topH - 30) / 2;
      const px = Math.min((topH - 34) / 120, 1.1);
      svg.append(rect(x0 + tw / 2, 20, tw / 2, topH - 20, "wash-signal"));
      svg.append(tracePath(sig, fs, x0, tw, cy, px, "ink"));
      svg.append(tag(x0 + tw * 0.25, 10, "eyes open", "t2"));
      svg.append(tag(x0 + tw * 0.75, 10, "eyes closed", "on"));
      // The second to count: the strongest one in the closed half.
      let best = seconds / 2 + 0.5, most = -1;
      for (let s0 = seconds / 2 + 0.5; s0 <= seconds - 1; s0 += 0.25) {
        let e = 0; for (let i = Math.round(s0 * fs); i < Math.round((s0 + 1) * fs); i++) e += sig[i] * sig[i];
        if (e > most) { most = e; best = s0; }
      }
      const seg = sig.slice(Math.round(best * fs), Math.round((best + 1) * fs));
      const bx0 = x0 + (best / seconds) * tw, bx1 = x0 + ((best + 1) / seconds) * tw;
      svg.append(rect(bx0, 22, bx1 - bx0, topH - 24, "", { fill: "none", stroke: "var(--signal)", "stroke-width": 1.5, rx: 3 }));
      const zTop = topH + 46, zH = h - zTop - 30, zcy = zTop + zH / 2;
      let peak = 0; for (const v of seg) peak = Math.max(peak, Math.abs(v));
      svg.append(path(`M${bx0} ${topH - 2} L${x0} ${zTop - 8} M${bx1} ${topH - 2} L${x0 + tw} ${zTop - 8}`, "faint"));
      svg.append(tracePath(seg, fs, x0, tw, zcy, (zH * 0.46) / peak, "signal", 2.2));
      svg.append(line(x0, h - 20, x0 + tw, h - 20, "rule"));
      svg.append(tag(x0, h - 6, "0", "", "start"));
      svg.append(tag(x0 + tw, h - 6, "1 second", "", "end"));
    },
  };
  return {
    aspect: channels > 1 ? 0.7 : d.card ? 0.625 : 0.5,
    render(w, h) {
      const pad = d.card ? 10 : 24, x0 = d.card ? pad : pad + 36, tw = w - x0 - pad;
      const rows = channels;
      // Labels sit in a band of their own above the trace, and the largest swing stays inside its row.
      const labelled = !d.card && ["switch", "blink", "jaw", "ssvep", "artifacts"].includes(kind);
      const top = labelled ? 26 : 14;
      const rowH = (h - (d.card ? 20 : 54) - (top - 14)) / rows;
      const sigs = [];
      for (let c = 0; c < rows; c++) {
        const opts = { fs, seconds, seed: seed + c * 3 };
        if (kind === "closed") Object.assign(opts, { alpha: 26 });
        if (kind === "open") Object.assign(opts, { alpha: 26, open: () => 1 });
        if (kind === "switch") Object.assign(opts, { alpha: 26, open: (t) => (t < seconds / 2 ? 1 : 0) });
        if (kind === "blink") Object.assign(opts, { alpha: 8, open: () => 1, blinks: [0.9, 2.1, 3.3], front: true });
        if (kind === "jaw") Object.assign(opts, { alpha: 24, jaw: [[1.6, 2.9]] });
        if (kind === "ssvep") Object.assign(opts, { alpha: 10, open: () => 1, ssvep: { hz: Number(d.hz ?? 12), amp: 5 } });
        if (kind === "front") Object.assign(opts, { alpha: 7, open: () => 0.5, blinks: [1.4, 2.8], front: true });
        if (kind === "artifacts") Object.assign(opts, { alpha: 18, open: (t) => (t < 2 ? 1 : 0), blinks: [0.7, 1.5], jaw: [[2.6, 3.5]], front: false });
        sigs.push(eeg(opts));
      }
      let peak = 1;
      for (const sig of sigs) for (const v of sig) peak = Math.max(peak, Math.abs(v));
      const pxPerUv = Math.min(rowH / 110, 1.1, (rowH / 2 - 2) / peak);
      sigs.forEach((sig, c) => {
        const cy = top + rowH * (c + 0.5);
        svg.append(line(x0, cy, x0 + tw, cy, "rule2"));
        svg.append(tracePath(sig, fs, x0, tw, cy, pxPerUv, "ink"));
        if (rows > 1) svg.append(tx(pad, cy + 4, `${c + 1}`, "t2"));
      });
      if (d.card) return;
      svg.append(timeAxis(x0, h - 36, tw, seconds, tw / seconds < 40 ? 2 : 1));
      svg.append(scaleBar(pad + 8, top + rowH * 0.5, 50, pxPerUv));
      if (kind === "switch") {
        svg.append(rect(x0 + tw / 2, 4, tw / 2, h - 44, "wash-signal"));
        svg.append(tag(x0 + tw * 0.25, 12, "eyes open", "t2"));
        svg.append(tag(x0 + tw * 0.75, 12, "eyes closed", "on"));
      }
      if (kind === "blink") for (const b of [0.9, 2.1, 3.3]) svg.append(tag(x0 + (b / seconds) * tw, 12, "blink", "on"));
      if (kind === "jaw") { svg.append(rect(x0 + (1.6 / seconds) * tw, 4, (1.3 / seconds) * tw, h - 44, "wash-signal")); svg.append(tag(x0 + (2.25 / seconds) * tw, 12, "jaw clenched", "on")); }
      if (kind === "ssvep") svg.append(tag(x0 + tw / 2, 12, `looking at the ${d.hz ?? 12} hertz light`, "on"));
      if (kind === "artifacts") { for (const b of [0.7, 1.5]) svg.append(tag(x0 + (b / seconds) * tw, 12, "blink", "on")); svg.append(rect(x0 + (2.6 / seconds) * tw, 4, (0.9 / seconds) * tw, h - 44, "wash-signal")); svg.append(tag(x0 + (3.05 / seconds) * tw, 12, "jaw", "on")); }
    },
  };
});

/** The spectrum of simulated EEG: eyes open against closed, or one state. */
fig("spectrum", (figure, svg, d) => {
  const fs = 250;
  const kinds = (d.kinds ?? "open closed").split(" ");
  return {
    aspect: 0.6,
    render(w, h) {
      const pad = 24, x0 = pad + 8, bw = w - x0 - pad, y0 = 10, bh = h - 56;
      const box = spectrumBox(x0, y0, bw, bh, { fs, bands: d.bands === "none" ? [] : [[8, 13]] });
      svg.append(box.node);
      const plot = g({});
      box.node.append(plot);
      const fx = (f) => x0 + ((f - 1) / 44) * bw;
      let lo = Infinity, hi = -Infinity;
      const series = kinds.map((kind, i) => {
        // Thirty seconds, averaged in pieces of about two seconds, so the spectrum is smooth enough to read, as a real one is after a minute of recording.
        const opts = { fs, seconds: 30, seed: 21 + i, alpha: 26 };
        if (kind === "open") opts.open = () => 1;
        if (kind === "jaw") opts.jaw = [[0, 30]];
        if (kind === "blink") Object.assign(opts, { alpha: 8, open: () => 1, blinks: Array.from({ length: 24 }, (_, b) => 1 + b * 1.2), front: true });
        if (kind === "ssvep") Object.assign(opts, { alpha: 14, open: () => 1, ssvep: { hz: Number(d.hz ?? 12), amp: 6 } });
        const { freqs, psd } = welch(eeg(opts), fs, 512);
        const vals = [];
        for (let k = 0; k < freqs.length; k++) if (freqs[k] >= 1 && freqs[k] <= 45) { const v = Math.log10(psd[k] + 1e-6); vals.push([freqs[k], v]); lo = Math.min(lo, v); hi = Math.max(hi, v); }
        return { kind, vals };
      });
      const span = Math.max(hi - lo, 1.5);
      series.forEach(({ kind, vals }, i) => {
        // The state being compared, last in the list, is drawn in orange, and the one it is compared with in gray.
        const hot = i === series.length - 1;
        const pts = vals.map(([f, v]) => [fx(f), y0 + bh - 8 - ((v - lo) / span) * (bh - 24)]);
        plot.append(poly(pts, hot ? "signal" : "ink2", { "stroke-width": 1.6 }));
        plot.append(tx(x0 + bw - 8, y0 + 16 + i * 14, { open: "eyes open", closed: "eyes closed", jaw: "jaw clenched", blink: "blinking", ssvep: `${d.hz ?? 12} hertz light` }[kind] ?? kind, hot ? "on" : "t2", { "text-anchor": "end" }));
      });
      svg.append(tx(pad, h - 6, "power, log scale", ""));
    },
  };
});

/** The Alpha Flower, live: a trace scrolling by, the eyes opening and closing, the spectrum and the share following. Click to open or close them. */
fig("alpha-hero", (figure, svg, d) => {
  const fs = 250, keep = 4, total = 48;
  let manual = null;
  const openAt = (t) => { if (manual !== null) return manual; const c = ((t % 12) + 12) % 12; return c < 6 ? 1 : 0; };
  // One long signal with the eyes open six seconds and closed six, looped, and the same signal held open or closed for the click.
  const sig = eeg({ fs, seconds: total, seed: 5, alpha: 28, open: (t) => (((t % 12) + 12) % 12) < 6 ? 1 : 0 });
  const sigClosed = eeg({ fs, seconds: total, seed: 5, alpha: 28, open: () => 0 });
  const sigOpen = eeg({ fs, seconds: total, seed: 5, alpha: 28, open: () => 1 });
  let parts = null;
  let lastSpec = -1;
  const card = !!d.card;
  figure.addEventListener("click", () => { manual = manual === null ? 1 : manual === 1 ? 0 : null; });
  return {
    aspect: 0.5,
    render(w, h) {
      const pad = card ? 14 : 28;
      const specW = card || w < 720 ? 0 : Math.min(320, w * 0.28);
      const x0 = pad, tw = w - pad * 2 - (specW ? specW + 56 : 0);
      const top = pad + (card ? 20 : 54), avail = h - top - (card ? 8 : pad + 22);
      const cy = top + avail / 2;
      const pxPerUv = Math.min((avail * 0.48) / 60, 3.2);
      svg.append(line(x0, cy, x0 + tw, cy, "rule2"));
      const trace = poly([[x0, cy]], "ink", { "stroke-width": card ? 1.2 : 1.6 });
      svg.append(trace);
      const eye = g({});
      svg.append(eye);
      let box = null, bar = null;
      if (specW) {
        const bx = x0 + tw + 56;
        box = spectrumBox(bx, pad + 36, specW, h * 0.46, { fs, card: true });
        svg.append(box.node);
        svg.append(tx(bx, pad + 18, "the spectrum, log power against hertz", "t2"));
        bar = g({});
        svg.append(bar);
      }
      if (!card) svg.append(timeAxis(x0, h - pad - 12, tw, keep));
      svg.append(scaleBar(x0 + tw - 10, cy, 50, pxPerUv));
      parts = { x0, tw, cy, pxPerUv, trace, eye, box, bar, specW, w, h, pad };
      lastSpec = -1;
    },
    tick(t) {
      if (!parts) return;
      const { x0, tw, cy, pxPerUv, trace, eye, box, bar, pad, specW } = parts;
      const open = openAt(t);
      const src = manual === null ? sig : manual ? sigOpen : sigClosed;
      const n = Math.round(keep * fs);
      const end = Math.floor(((t % total) * fs)) % src.length;
      const pts = [];
      const step = Math.max(1, Math.floor(n / (tw * 2)));
      for (let i = 0; i < n; i += step) { const v = src[(end - n + i + src.length) % src.length]; pts.push([x0 + (i / n) * tw, cy - v * pxPerUv]); }
      let dd = "";
      for (let i = 0; i < pts.length; i++) dd += (i ? "L" : "M") + f1(pts[i][0]) + " " + f1(pts[i][1]);
      trace.setAttribute("d", dd);
      eye.replaceChildren();
      eye.append(tx(x0, pad + (card ? 14 : 22), open ? "Eyes open" : "Eyes closed", open ? "big" : "big on", { style: card ? "font-size:17px" : parts.w < 520 ? "font-size:20px" : "font-size:26px" }));
      if (!card) eye.append(tx(x0, pad + 42, open ? "alpha blocked" : "alpha rises", open ? "t2" : "on"));
      if (box && t - lastSpec > 0.3) {
        lastSpec = t;
        const win = new Float32Array(fs * 6);
        for (let i = 0; i < win.length; i++) win[i] = src[(end - win.length + i + src.length) % src.length];
        const { freqs, psd } = welch(win, fs, 256);
        box.update(freqs, psd);
        bar.replaceChildren(shareBar(x0 + tw + 56, parts.h * 0.46 + pad + 92, specW, alphaShare(freqs, psd), { label: "alpha's share of 4 to 30 hertz", lines: [0.27, 0.36] }));
      }
    },
  };
});

/** Where the IntoMind One goes: the head from above, and from the side with the landmarks. */
fig("head", (figure, svg, d) => {
  const sites = (d.sites ?? "").split(/\s+/).filter(Boolean);
  const device = (d.device ?? "").split(/\s+/).filter(Boolean);
  const shade = (d.shade ?? "").split(/\s+/).filter(Boolean);
  const views = (d.views ?? "top side").split(/\s+/);
  const card = !!d.card;
  return {
    aspect: card ? 0.625 : views.length > 1 ? (w) => (w < 520 ? 1.7 : 0.52) : 0.9,
    onLevel: true,
    render(w, h) {
      const plain = document.documentElement.dataset.level === "ms";
      const n = views.length;
      const stack = n > 1 && w < 520;
      const cellW = stack ? w : w / n, cellH = stack ? h / n : h;
      views.forEach((view, i) => {
        const x0 = stack ? 0 : cellW * i, y0 = stack ? cellH * i : 0;
        const cx = x0 + cellW / 2, cy = y0 + cellH * 0.52;
        const R = Math.min(cellW, cellH) * (card ? 0.4 : 0.38);
        if (view === "top") svg.append(headTop({ cx, cy, R, sites, device, shade, plain, card }));
        else svg.append(headSide({ cx, cy, R, device: device[0] ?? null, plain, card }));
        if (!card) svg.append(tag(x0 + 6, y0 + cellH - 6, view === "top" ? "from above" : "from the left", "", "start"));
      });
    },
  };
});

/** The path the signal takes, drawn in section: neurons in step in the brain, the skull and the skin, and the IntoMind One resting on the skin,
 * its electrodes part of it, on its underside. Its chip turns the voltage into numbers, and Bluetooth carries them to the computer, the board, or both, and nowhere else. */
fig("datapath", (figure, svg, d) => {
  const to = d.to ?? "screen";
  const card = !!d.card;
  let geo = null;
  /** On a narrow screen the path stands up: the brain at the bottom, the computer at the top, the signal rising between them. */
  const narrow = (w, h) => {
    const pad = 14, x0 = pad, x1 = w - pad, cx = w * 0.3, top = d.internet ? 34 : 0;
    const brainBot = h - pad, skullBot = h * 0.78, skinBot = h * 0.67, skinTop = h * 0.62;
    svg.append(rect(x0, skullBot, x1 - x0, brainBot - skullBot, "wash-signal"));
    svg.append(rect(x0, skinBot, x1 - x0, skullBot - skinBot, "fill-tile2"));
    svg.append(rect(x0, skinTop, x1 - x0, skinBot - skinTop, "fill-tile"));
    for (const y of [skinBot, skullBot]) svg.append(line(x0, y, x1, y, "rule"));
    svg.append(line(x0, skinTop, x1, skinTop, "ink2"));
    const waveY = (skullBot + brainBot) / 2 + 6, amp = 6;
    for (let i = 0; i < 5; i++) {
      const wx = x0 + (x1 - x0) * (0.06 + i * 0.19), ww = (x1 - x0) * 0.12, pts = [];
      for (let k = 0; k <= 24; k++) pts.push([wx + (k / 24) * ww, waveY - Math.sin((k / 24) * Math.PI * 4) * amp]);
      svg.append(poly(pts, "signal", { "stroke-width": 1.4 }));
    }
    const dw = w * 0.34, dx0 = cx - dw / 2, dx1 = cx + dw / 2, dBot = skinTop - 5, dTop = dBot - dw * 0.38;
    svg.append(rect(dx0, dTop, dw, dBot - dTop, "fill-tile2", { rx: (dBot - dTop) * 0.42, stroke: "var(--ink2)", "stroke-width": 1.4 }));
    for (const f of [0.22, 0.5, 0.78]) svg.append(rect(dx0 + dw * f - 3.5, dBot - 1, 7, skinTop - dBot + 1, "fill-signal", { rx: 1 }));
    const chip = (dBot - dTop) * 0.42, chipY = (dTop + dBot) / 2;
    svg.append(rect(cx - chip / 2, chipY - chip / 2, chip, chip, "fill-ink", { rx: 2 }));
    svg.append(tag(dx1 + 10, chipY - 8, "IntoMind One", "t1", "start"));
    svg.append(tag(dx1 + 10, chipY + 9, "its electrodes", "on", "start"));
    svg.append(tag(x1 - 6, (skinTop + skinBot) / 2, "skin", "", "end"));
    svg.append(tag(x1 - 6, (skinBot + skullBot) / 2, "skull", "", "end"));
    svg.append(tag(x0 + 6, skullBot + 12, "brain: neurons in step", "on", "start"));
    const by = dTop - h * 0.09;
    for (const r of [7, 12, 17]) svg.append(path(`M${cx - r * 0.85} ${by + r * 0.45} A${r} ${r} 0 0 1 ${cx + r * 0.85} ${by + r * 0.45}`, "glow", { "stroke-width": 1.6 }));
    svg.append(tag(cx + 26, by - 2, "Bluetooth", "t2", "start"));
    const sy = pad + top + 26, ends = [];
    const screen = (x) => { svg.append(rect(x - 30, sy - 20, 60, 38, "fill-tile2", { rx: 4, stroke: "var(--ink2)", "stroke-width": 1.4 })); svg.append(rect(x - 38, sy + 20, 76, 3, "fill-muted")); };
    const board = (x) => { svg.append(rect(x - 34, sy - 12, 68, 24, "fill-tile2", { rx: 3, stroke: "var(--ink2)", "stroke-width": 1.4 })); for (let q = 0; q < 8; q++) { svg.append(circle(x - 27 + q * 7.5, sy - 7.5, 1.4, "fill-amber")); svg.append(circle(x - 27 + q * 7.5, sy + 7.5, 1.4, "fill-amber")); } svg.append(circle(x + 26, sy, 2.6, "fill-signal")); };
    if (to === "both") { screen(cx); board(cx + 104); ends.push([cx, sy + 22], [cx + 104, sy + 14]); svg.append(tag(cx, sy + 38, "computer", "t2")); svg.append(tag(cx + 104, sy + 30, "board", "t2")); }
    else if (to === "board") { board(cx); ends.push([cx, sy + 14]); svg.append(tag(cx + 46, sy, "a Pico 2 W board", "t2", "start")); }
    else { screen(cx); ends.push([cx, sy + 22]); svg.append(tag(cx + 46, sy, "your computer", "t2", "start")); }
    if (d.internet) { const ix = x0 + 22, iy = pad + 12; svg.append(path(`M${ix - 20} ${iy + 6} a8 8 0 0 1 6 -12 a11 11 0 0 1 20 -2 a7 7 0 0 1 3 14 Z`, "muted")); svg.append(line(ix - 24, iy + 11, ix + 17, iy - 14, "signal", { "stroke-width": 2 })); svg.append(tag(ix + 30, iy, "never the internet", "on", "start")); }
    const trunk = [[cx, waveY], [cx, skinTop], [cx, chipY], [cx, dTop], [cx, by]];
    svg.append(poly(trunk.slice(0, 3), "faint", { "stroke-dasharray": "2 4" }));
    return { routes: ends.map((e) => trunk.concat([e])) };
  };
  return {
    aspect: card ? 0.625 : (w) => (w < 560 ? (Math.max(380, w * 0.85) + (d.internet ? 34 : 0)) / w : 0.44),
    render(w, h) {
      if (!card && w < 560) {
        geo = narrow(w, h);
        geo.dots = geo.routes.map(() => { const layer = g({}); svg.append(layer); return [0, 1, 2].map(() => { const c = circle(0, 0, 3, "fill-signal"); layer.append(c); return c; }); });
        geo.lengths = geo.routes.map((r) => { const L = [0]; for (let i = 1; i < r.length; i++) L.push(L[i - 1] + Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1])); return L; });
        return;
      }
      const pad = card ? 8 : 18;
      if (!card) svg.setAttribute("font-size", w > 900 ? "13" : "11");
      // The head in section, on the left.
      const x0 = pad, x1 = w * (card ? 0.5 : 0.47);
      const skinTop = h * 0.55, skinBot = h * 0.61, skullBot = h * 0.75, brainBot = h - pad;
      svg.append(rect(x0, skullBot, x1 - x0, brainBot - skullBot, "wash-signal"));
      svg.append(rect(x0, skinBot, x1 - x0, skullBot - skinBot, "fill-tile2"));
      svg.append(rect(x0, skinTop, x1 - x0, skinBot - skinTop, "fill-tile"));
      for (const y of [skinBot, skullBot]) svg.append(line(x0, y, x1, y, "rule"));
      svg.append(line(x0, skinTop, x1, skinTop, "ink2"));
      // Neurons in step: the same small wave, side by side, rising and falling together.
      const waveY = (skullBot + brainBot) / 2 + (card ? 0 : 6), amp = Math.min(8, (brainBot - skullBot) * 0.18);
      const waves = g({});
      for (let i = 0; i < 6; i++) {
        const wx = x0 + (x1 - x0) * (0.08 + i * 0.15), ww = (x1 - x0) * 0.1;
        const pts = [];
        for (let k = 0; k <= 24; k++) pts.push([wx + (k / 24) * ww, waveY - Math.sin((k / 24) * Math.PI * 4) * amp]);
        waves.append(poly(pts, "signal", { "stroke-width": 1.4 }));
      }
      svg.append(waves);
      // The IntoMind One: one piece, resting on the skin, its electrodes on its underside, its chip inside.
      const cx = (x0 + x1) / 2, dw = (x1 - x0) * 0.5, dx0 = cx - dw / 2, dx1 = cx + dw / 2;
      const dTop = h * 0.26, dBot = skinTop - Math.max(4, h * 0.03);
      svg.append(rect(dx0, dTop, dw, dBot - dTop, "fill-tile2", { rx: (dBot - dTop) * 0.42, stroke: "var(--ink2)", "stroke-width": 1.4 }));
      const ew = Math.max(4, dw * 0.07);
      for (const f of [0.22, 0.5, 0.78]) svg.append(rect(dx0 + dw * f - ew / 2, dBot - 1, ew, skinTop - dBot + 1, "fill-signal", { rx: 1 }));
      const chip = Math.min(dw * 0.18, (dBot - dTop) * 0.42), chipY = (dTop + dBot) / 2;
      svg.append(rect(cx - chip / 2, chipY - chip / 2, chip, chip, "fill-ink", { rx: 2 }));
      if (!card) {
        svg.append(tag(cx, dTop - 14, "IntoMind One", "t1"));
        svg.append(tag(dx0 - 8, (dBot + skinTop) / 2, "electrodes", "on", "end"));
        svg.append(tag(cx, chipY - chip / 2 - 6, "chip", "t2"));
        svg.append(tag(x0 + 8, (skinTop + skinBot) / 2, "skin", "", "start"));
        svg.append(tag(x0 + 8, (skinBot + skullBot) / 2, "skull", "", "start"));
        svg.append(tag(x0 + 8, skullBot + 13, "brain: neurons in step", "on", "start"));
      }
      // Bluetooth, from the device to what it talks to.
      const by = chipY, bx = x1 + (w - x1) * 0.14;
      for (const r of [0.5, 0.85, 1.2]) { const rr = r * Math.min(20, h * 0.07); svg.append(path(`M${bx - rr * 0.45} ${by - rr * 0.85} A${rr} ${rr} 0 0 1 ${bx - rr * 0.45} ${by + rr * 0.85}`, "glow", { "stroke-width": 1.6 })); }
      if (!card) svg.append(tag(bx, by + Math.min(20, h * 0.07) * 1.2 + 16, "Bluetooth", "t2"));
      // The computer, the board, or both.
      const sx = x1 + (w - x1) * 0.66, k = Math.min(1.4, h / 260);
      const ends = [];
      if (to === "screen" || to === "both") {
        const sy = to === "both" ? by - 40 * k : by;
        svg.append(rect(sx - 34 * k, sy - 22 * k, 68 * k, 44 * k, "fill-tile2", { rx: 4, stroke: "var(--ink2)", "stroke-width": 1.4 }));
        svg.append(rect(sx - 44 * k, sy + 24 * k, 88 * k, 3, "fill-muted"));
        if (!card) svg.append(tag(sx, sy + 24 * k + 16, "your computer", "t2"));
        ends.push([sx - 40 * k, sy]);
      }
      if (to === "board" || to === "both") {
        const oy = to === "both" ? by + 46 * k : by;
        svg.append(rect(sx - 36 * k, oy - 13 * k, 72 * k, 26 * k, "fill-tile2", { rx: 3, stroke: "var(--ink2)", "stroke-width": 1.4 }));
        for (let q = 0; q < 9; q++) { svg.append(circle(sx - 30 * k + q * 7.5 * k, oy - 8.5 * k, 1.5 * k, "fill-amber")); svg.append(circle(sx - 30 * k + q * 7.5 * k, oy + 8.5 * k, 1.5 * k, "fill-amber")); }
        svg.append(circle(sx + 27 * k, oy, 3 * k, "fill-signal"));
        if (!card) svg.append(tag(sx, oy + 13 * k + 16, "a Pico 2 W board", "t2"));
        ends.push([sx - 40 * k, oy]);
      }
      if (d.internet) {
        const ix = bx + 34, iy = pad + 16;
        svg.append(path(`M${ix - 26} ${iy + 8} a10 10 0 0 1 8 -16 a14 14 0 0 1 26 -2 a9 9 0 0 1 4 18 Z`, "muted"));
        svg.append(line(ix - 30, iy + 14, ix + 22, iy - 18, "signal", { "stroke-width": 2 }));
        if (!card) svg.append(tag(ix + 34, iy, "never the internet", "on", "start"));
      }
      // The way the signal goes: up from the neurons through skull and skin into an electrode, into the chip, out by Bluetooth.
      const trunk = [[cx, waveY], [cx, skinTop], [cx, chipY], [dx1, chipY], [bx + 18, by]];
      svg.append(poly(trunk.slice(0, 3), "faint", { "stroke-dasharray": "2 4" }));
      geo = { routes: ends.map((e) => trunk.concat([e])) };
      geo.dots = geo.routes.map(() => { const layer = g({}); svg.append(layer); return [0, 1, 2].map(() => { const c = circle(0, 0, card ? 2.5 : 3.5, "fill-signal"); layer.append(c); return c; }); });
      geo.lengths = geo.routes.map((r) => { const L = [0]; for (let i = 1; i < r.length; i++) L.push(L[i - 1] + Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1])); return L; });
    },
    tick(t) {
      if (!geo) return;
      geo.routes.forEach((r, ri) => {
        const L = geo.lengths[ri], total = L[L.length - 1];
        geo.dots[ri].forEach((c, k) => {
          const p = (t * 0.16 + k / 3) % 1, at = p * total;
          let i = 1; while (i < L.length - 1 && L[i] < at) i++;
          const u = (at - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
          c.setAttribute("cx", f1(r[i - 1][0] + (r[i][0] - r[i - 1][0]) * u));
          c.setAttribute("cy", f1(r[i - 1][1] + (r[i][1] - r[i - 1][1]) * u));
          c.setAttribute("opacity", p < 0.04 || p > 0.96 ? 0 : 1);
        });
      });
    },
  };
});

/** The Raspberry Pi Pico 2 W, drawn live by the demos' own board code, its LED following a reading. */
fig("board", (figure, svg, d) => {
  svg.remove();
  const canvas = document.createElement("canvas");
  figure.prepend(canvas);
  let drawer = null;
  const fit = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, dpr };
  };
  const paint = (t) => {
    if (!drawer || !canvas.clientWidth) return;
    const { ctx, w, h, dpr } = fit();
    ctx.clearRect(0, 0, w, h);
    const root = document.documentElement;
    const yaw = Number(d.yaw ?? 0.42) + (d.sway ? Math.sin(t * 0.23) * 0.1 : 0);
    const led = d.led === "off" ? 0 : d.led === "on" ? 1 : Math.sin(t * 0.77) > 0.15 ? 1 : 0;
    const cam = drawer.boardCamera(w, h, { yaw, pitch: Number(d.pitch ?? 0.72), size: Math.min(w * Number(d.scale ?? 0.42) * 1.4, h * 1.1) });
    drawer.drawBoardThemed(ctx, cam, { dark: root.dataset.theme !== "light", dpr, led, t, paper: getComputedStyle(figure).backgroundColor });
  };
  // The drawing code loads on its own. The board is painted as soon as it arrives, so a still page shows it too.
  import("./board.js").then((m) => { drawer = m; paint(still() ? 20 : 0); });
  return {
    aspect: 0.625,
    onTheme: true,
    render() { paint(still() ? 20 : 0); },
    tick(t) { paint(t); },
  };
});

/** A small icon for a rule: unplug, choice, eye, pin. */
fig("icon", (figure, svg, d) => ({
  aspect: 1,
  render(w, h) {
    const s = Math.min(w, h), c = s / 2;
    const k = d.icon;
    if (k === "unplug") {
      svg.append(circle(c, c * 0.8, s * 0.3, "fill-tile2", { stroke: "var(--ink2)", "stroke-width": 1.6 }));
      svg.append(rect(c - s * 0.07, c * 1.35, s * 0.14, s * 0.22, "fill-muted", { rx: 2 }));
      svg.append(line(c - s * 0.3, c * 1.95, c + s * 0.3, c * 1.45, "signal", { "stroke-width": 3 }));
    } else if (k === "choice") {
      for (const [x, r] of [[c - s * 0.25, 0.09], [c + s * 0.25, 0.09]]) { svg.append(circle(x, c * 0.75, s * r, "fill-ink2")); svg.append(path(`M${x - s * 0.18} ${c * 1.6} a${s * 0.18} ${s * 0.18} 0 0 1 ${s * 0.36} 0`, "ink2", { "stroke-width": 2 })); }
      svg.append(circle(c + s * 0.25, c * 0.75, s * 0.12, "", { fill: "none", stroke: "var(--signal)", "stroke-width": 2 }));
    } else if (k === "eye") {
      svg.append(path(`M${c - s * 0.4} ${c} Q${c} ${c - s * 0.42} ${c + s * 0.4} ${c} Q${c} ${c + s * 0.42} ${c - s * 0.4} ${c}Z`, "ink2", { "stroke-width": 2 }));
      svg.append(circle(c, c, s * 0.12, "fill-ink2"));
      svg.append(rect(c - s * 0.42, c - s * 0.22, s * 0.44, s * 0.46, "fill-signal", { rx: 3, opacity: 0.85 }));
    } else if (k === "pin") {
      svg.append(rect(c - s * 0.42, c - s * 0.12, s * 0.3, s * 0.24, "fill-tile2", { stroke: "var(--ink2)", "stroke-width": 1.6, rx: 2 }));
      svg.append(line(c - s * 0.12, c, c + s * 0.08, c, "ink2", { "stroke-width": 2 }));
      svg.append(path(`M${c + s * 0.08} ${c - s * 0.12} L${c + s * 0.3} ${c} L${c + s * 0.08} ${c + s * 0.12}Z`, "signal", { "stroke-width": 2, fill: "var(--signal)" }));
      svg.append(tx(c + s * 0.44, c + 4, "3.3 V", "on", { "text-anchor": "end", style: "font-size:9px" }));
    } else if (k === "cloth") {
      svg.append(path(`M${c - s * 0.34} ${c - s * 0.2} q${s * 0.17} ${s * 0.12} ${s * 0.34} 0 q${s * 0.17} -${s * 0.12} ${s * 0.34} 0 v${s * 0.4} q-${s * 0.17} -${s * 0.12} -${s * 0.34} 0 q-${s * 0.17} ${s * 0.12} -${s * 0.34} 0Z`, "ink2", { "stroke-width": 1.8 }));
    } else svg.append(circle(c, c, s * 0.3, "fill-tile2"));
  },
}));

/** A screen of a demo, photographed with the simulated IntoMind One, in both themes. */
fig("shot", (figure, svg, d) => {
  svg.remove();
  const box = document.createElement("div");
  box.className = "shot";
  for (const theme of ["dark", "light"]) {
    const img = document.createElement("img");
    img.className = theme;
    img.src = `/assets/shots/${d.shot}-${theme}.webp`;
    img.alt = figure.querySelector("figcaption")?.textContent?.trim() ?? d.shot;
    box.append(img);
  }
  figure.prepend(box);
  return { render() {} };
});

// ---- Arithmetic the figures need. --------------------------------------------------------------------

/** The standard normal distribution function, to a few parts in ten million. */
export function Phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}
/** Its inverse, by bisection, good to a millionth. */
export function probit(p) {
  let lo = -8, hi = 8;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (Phi(m) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function logChoose(n, k) {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}
/** The chance of exactly k of n with probability p each. */
export function binomialPmf(n, k, p) { return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p)); }

const LABS = ["alpha-flower", "flight-simulator", "age-detector", "biological-sex-detector", "light-switch", "microcontroller"];
const level = () => document.documentElement.dataset.level;

/** A label broken into lines that fit `px` pixels of the figures' 11-pixel mono type, at spaces. */
function lines(s, px) {
  const n = Math.max(8, Math.floor(px / 7.3)), out = [""];
  for (const word of s.split(" ")) {
    const cur = out[out.length - 1];
    if (cur && (cur + " " + word).length > n) out.push(word);
    else out[out.length - 1] = cur ? cur + " " + word : word;
  }
  return out;
}

/** A slider under a figure, labeled, calling `on(value)`. */
function slider(figure, { label, min, max, step, value, format = (v) => v, on }) {
  let ctl = figure.querySelector(".ctl");
  if (!ctl) { ctl = document.createElement("div"); ctl.className = "ctl noprint"; const cap = figure.querySelector("figcaption"); if (cap) cap.before(ctl); else figure.append(ctl); }
  const lab = document.createElement("label");
  const input = Object.assign(document.createElement("input"), { type: "range", min, max, step, value });
  const out = document.createElement("output");
  out.textContent = format(value);
  lab.append(label, input, out);
  ctl.append(lab);
  input.addEventListener("input", () => { out.textContent = format(Number(input.value)); on(Number(input.value)); });
  return input;
}
function button(figure, label, on, pressed = false) {
  let ctl = figure.querySelector(".ctl");
  if (!ctl) { ctl = document.createElement("div"); ctl.className = "ctl noprint"; const cap = figure.querySelector("figcaption"); if (cap) cap.before(ctl); else figure.append(ctl); }
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.setAttribute("aria-pressed", String(pressed));
  b.addEventListener("click", () => on(b));
  ctl.append(b);
  return b;
}

// ---- Light and vision. --------------------------------------------------------------------------------

/** The four lights of the flight simulator, their rates, and the response in the spectrum when one is looked at. Nothing here flickers: the looked-at light is marked by a ring that moves slowly from light to light. */
fig("lights", (figure, svg, d) => {
  const rates = { up: 8, right: 10, down: 12, left: 15 };
  const fs = 250;
  const card = !!d.card;
  let parts = null;
  const spectra = {};
  return {
    aspect: card ? 0.625 : 0.5,
    render(w, h) {
      const pad = card ? 12 : 24;
      const specW = card ? 0 : Math.min(360, w * 0.34);
      const fw = w - (specW ? specW + 56 : 0) - pad * 2;
      const cx = pad + fw / 2, cy = h / 2, r = card ? Math.min(fw, h) * 0.085 : Math.min(fw, h) * 0.075;
      const reach = { x: fw / 2 - r - 6, y: h / 2 - r - (card ? 6 : 22) };
      const spots = { up: [cx, cy - reach.y], down: [cx, cy + reach.y], left: [cx - reach.x, cy], right: [cx + reach.x, cy] };
      const rings = {};
      for (const [dir, [x, y]] of Object.entries(spots)) {
        svg.append(circle(x, y, r, "fill-glow", { opacity: 0.85 }));
        rings[dir] = circle(x, y, r + 7, "", { fill: "none", stroke: "var(--ink)", "stroke-width": 2, opacity: 0 });
        svg.append(rings[dir]);
        const ly = dir === "up" ? y + r + 18 : dir === "down" ? y - r - 10 : y + r + 18;
        svg.append(tag(x, ly, `${rates[dir]} hertz`, "t2"));
      }
      // The ship, small, in the middle.
      svg.append(path(`M${cx} ${cy - 14} L${cx + 10} ${cy + 10} L${cx} ${cy + 4} L${cx - 10} ${cy + 10}Z`, "ink2", { fill: "var(--ink2)" }));
      let box = null;
      if (specW) {
        const bx = w - pad - specW;
        box = spectrumBox(bx, pad + 36, specW, h - pad * 2 - 70, { fs, bands: [], card: true });
        svg.append(box.node);
        parts = null;
        for (const dir of Object.keys(rates)) spectra[dir] = welch(eeg({ fs, seconds: 16, seed: 31, alpha: 10, open: () => 1, ssvep: { hz: rates[dir], amp: 5 } }), fs, 512);
      }
      parts = { rings, box, cur: null, label: null, bx: w - pad - specW, by: pad + 20 };
    },
    tick(t) {
      if (!parts) return;
      const dirs = ["up", "right", "down", "left"];
      const dir = dirs[Math.floor(t / 3) % 4];
      const phase = (t % 3) / 3;
      const fade = Math.min(1, phase * 4, (1 - phase) * 4);
      for (const k of dirs) parts.rings[k].setAttribute("opacity", k === dir ? fade : 0);
      if (parts.box && dir !== parts.cur) {
        parts.cur = dir;
        const { freqs, psd } = spectra[dir];
        parts.box.update(freqs, psd);
        parts.label?.remove();
        parts.label = tx(parts.bx, parts.by, `looking at ${ { up: 8, right: 10, down: 12, left: 15 }[dir] } hertz`, "on");
        svg.append(parts.label);
      }
    },
  };
});

/** Vision crosses: the left half of what you see goes to the right visual cortex, and the right half to the left. */
fig("visualfield", (figure, svg, d) => ({
  aspect: 0.62,
  render(w, h) {
    const cx = w / 2, cy = h * 0.6, R = Math.min(w, h) * 0.26;
    // The screen, above the head, in two halves.
    const sw = w * 0.5, sx = cx - sw / 2, sy = 18, sh = h * 0.16;
    svg.append(rect(sx, sy, sw / 2, sh, "wash-signal"));
    svg.append(rect(sx + sw / 2, sy, sw / 2, sh, "wash-glow"));
    svg.append(rect(sx, sy, sw, sh, "", { fill: "none", stroke: "var(--ink2)", "stroke-width": 1.4 }));
    svg.append(tag(cx, sy - 8, "the screen", ""));
    svg.append(tag(sx + sw / 4, sy + sh / 2, "left half", "on"));
    svg.append(tag(sx + (3 * sw) / 4, sy + sh / 2, "right half", "t2"));
    svg.append(headTop({ cx, cy, R, sites: [], device: [], shade: ["occipital"], card: true }));
    // The eyes, at the front of the head, and the crossing behind them.
    const ex = [cx - R * 0.3, cx + R * 0.3], ey = cy - R * 0.72;
    for (const x of ex) svg.append(circle(x, ey, 5, "fill-ink"));
    const chy = cy - R * 0.25;
    svg.append(path(`M${ex[0]} ${ey} L${cx - 10} ${chy} L${cx + R * 0.5} ${cy + R * 0.95}`, "signal", { "stroke-width": 2 }));
    svg.append(path(`M${ex[1]} ${ey} L${cx + 10} ${chy} L${cx - R * 0.5} ${cy + R * 0.95}`, "glow", { "stroke-width": 2 }));
    svg.append(path(`M${sx + sw / 4} ${sy + sh} L${ex[0]} ${ey - 8} M${sx + sw / 4} ${sy + sh} L${ex[1]} ${ey - 8}`, "signal", { "stroke-dasharray": "3 4" }));
    svg.append(path(`M${sx + (3 * sw) / 4} ${sy + sh} L${ex[0]} ${ey - 8} M${sx + (3 * sw) / 4} ${sy + sh} L${ex[1]} ${ey - 8}`, "glow", { "stroke-dasharray": "3 4" }));
    svg.append(tag(cx - R * 1.1, cy + R * 1.1, "right visual cortex, O2", "on", "end"));
    svg.append(tag(cx + R * 1.1, cy + R * 1.1, "left visual cortex, O1", "t2", "start"));
    svg.append(tag(cx + 26, chy + 4, "the crossing", "", "start"));
  },
}));

// ---- Estimates, scores and chance. ------------------------------------------------------------------

/** The Age Detector settling: one estimate per window, scattered, and their running mean with the published error around it. */
fig("estimate", (figure, svg, d) => {
  const N = 45, r = rng(9);
  const truth = 31;
  const ests = Array.from({ length: N }, () => truth + 4 + r.gauss() * 9);
  let parts = null;
  const card = !!d.card;
  return {
    aspect: card ? 0.625 : 0.5,
    render(w, h) {
      // Room on the right for the running estimate, beside the newest window.
      const pad = card ? 14 : 30, x0 = pad + 34, y0 = pad + 10, pw = w - x0 - pad - (card ? 0 : 118), ph = h - y0 - pad - 26;
      const y = (age) => y0 + ph - ((age - 10) / 50) * ph;
      const x = (i) => x0 + (i / (N - 1)) * pw;
      for (const a of [20, 30, 40, 50]) { svg.append(line(x0, y(a), x0 + pw, y(a), "rule2")); if (!card) svg.append(tx(x0 - 8, y(a) + 4, `${a}`, "", { "text-anchor": "end" })); }
      if (!card) { svg.append(tx(w < 560 ? pad : x0, h - 6, "windows of four seconds, one after another", "")); svg.append(tx(pad, y0 - 2, "years", "")); }
      parts = { w, x, y, dots: g({}), band: el("path", { class: "wash-signal" }), mean: poly([], "signal", { "stroke-width": 2 }), label: g({}) };
      svg.append(parts.band, parts.dots, parts.mean, parts.label);
    },
    tick(t) {
      if (!parts) return;
      const shown = Math.min(N, 1 + Math.floor((t % 32) * 1.6));
      const { x, y, dots, band, mean, label } = parts;
      dots.replaceChildren();
      const pts = [];
      let sum = 0;
      let up = "", down = "";
      for (let i = 0; i < shown; i++) {
        sum += ests[i];
        const m = sum / (i + 1);
        dots.append(circle(x(i), y(ests[i]), card ? 2 : 3, "fill-muted"));
        pts.push([x(i), y(m)]);
        up += (i ? "L" : "M") + f1(x(i)) + " " + f1(y(m + 9.16));
        down = "L" + f1(x(i)) + " " + f1(y(m - 9.16)) + down;
      }
      band.setAttribute("d", shown > 1 ? up + down + "Z" : "");
      let dd = "";
      for (let i = 0; i < pts.length; i++) dd += (i ? "L" : "M") + f1(pts[i][0]) + " " + f1(pts[i][1]);
      mean.setAttribute("d", dd);
      label.replaceChildren();
      const last = pts[pts.length - 1];
      label.append(tx(last[0] + 8, last[1] + 5, `${Math.round(sum / shown)} ± 9 years`, "big", { style: "font-size:18px" }));
      label.append(tx(last[0] + 8, last[1] + 21, `${shown} ${shown === 1 ? "window" : "windows"}`, ""));
    },
  };
});

/** Two groups that overlap: normal scores a distance d′ apart, a threshold between them, and what a call from one score is worth. */
fig("dist", (figure, svg, d) => {
  const dprime = Number(d.dprime ?? 0.44);
  let base = Number(d.base ?? 0.5);
  let parts = null;
  const card = !!d.card;
  const draw = () => {
    if (!parts) return;
    const { w, h, pad } = parts;
    svg.replaceChildren();
    const x0 = pad, pw = w - pad * 2, y0 = pad + 8, ph = h - pad * 2 - (card ? 10 : w < 560 ? 76 : 44);
    const xs = (z) => x0 + ((z + 3.5) / 7) * pw;
    const pdf = (z, m) => Math.exp(-((z - m) ** 2) / 2) / Math.sqrt(2 * Math.PI);
    const top = pdf(0, 0);
    const curve = (m, cls) => { const pts = []; for (let z = -3.5; z <= 3.5; z += 0.05) pts.push([xs(z), y0 + ph - (pdf(z, m) / top) * ph * 0.92]); return poly(pts, cls, { "stroke-width": 2 }); };
    const fillUnder = (m, from, to, cls) => { let dd = `M${f1(xs(from))} ${f1(y0 + ph)}`; for (let z = from; z <= to + 1e-9; z += 0.05) dd += `L${f1(xs(z))} ${f1(y0 + ph - (pdf(z, m) / top) * ph * 0.92)}`; dd += `L${f1(xs(to))} ${f1(y0 + ph)}Z`; return el("path", { d: dd, class: cls }); };
    const m0 = -dprime / 2, m1 = dprime / 2, thr = 0;
    svg.append(fillUnder(m0, thr, 3.5, "wash-signal"));
    svg.append(fillUnder(m1, -3.5, thr, "wash-glow"));
    svg.append(curve(m0, "signal"));
    svg.append(curve(m1, "glow"));
    svg.append(line(xs(thr), y0, xs(thr), y0 + ph, "ink2", { "stroke-dasharray": "4 4" }));
    svg.append(line(x0, y0 + ph, x0 + pw, y0 + ph, "rule"));
    if (!card) {
      svg.append(tag(xs(-2.3), y0 + ph * 0.42, d.left ?? "group 0", "on"));
      svg.append(tag(xs(2.3), y0 + ph * 0.42, d.right ?? "group 1", "t2"));
      svg.append(tag(xs(thr), y0 + ph + 16, "threshold", "t2"));
      svg.append(tag(xs(-2.6), y0 + ph + 16, "score", ""));
      const sens = Phi(dprime / 2);
      const ppv = (base * sens) / (base * sens + (1 - base) * (1 - sens));
      const said = [`d′ ${dprime.toFixed(2)} · equal groups: a call is right ${Math.round(sens * 100)} in 100`, `group 1 at ${Math.round(base * 100)} percent: a call of group 1 is right ${Math.round(ppv * 100)} in 100`];
      const ls = said.flatMap((t) => lines(t, w - x0 - 8));
      ls.forEach((l, k) => svg.append(tx(x0, h - 6 - (ls.length - 1 - k) * 14, l, "t2")));
    }
  };
  if (d.control === "base" && !figure.dataset.card) slider(figure, { label: "share of group 1", min: 1, max: 99, step: 1, value: Math.round(base * 100), format: (v) => `${v}%`, on: (v) => { base = v / 100; draw(); } });
  return { aspect: card ? 0.625 : (w) => (w < 560 ? 0.82 : 0.5), render(w, h) { parts = { w, h, pad: card ? 12 : 28 }; draw(); } };
});

/** How many of n a guesser gets right: the binomial distribution, with the tail past a threshold washed. */
fig("binomial", (figure, svg, d) => {
  const n = Number(d.n ?? 88), p = Number(d.p ?? 0.5), k0 = Number(d.k ?? 53);
  const card = !!d.card;
  return {
    aspect: card ? 0.625 : 0.5,
    render(w, h) {
      const pad = card ? 12 : 28, x0 = pad + 8, pw = w - x0 - pad, y0 = pad + 10, ph = h - y0 - pad - (card ? 14 : 40);
      const pm = []; let top = 0, tail = 0;
      for (let k = 0; k <= n; k++) { pm[k] = binomialPmf(n, k, p); top = Math.max(top, pm[k]); if (k >= k0) tail += pm[k]; }
      const lo = n > 20 ? Math.max(0, Math.round(n * p - 4.2 * Math.sqrt(n * p * (1 - p)))) : 0, hi = n > 20 ? Math.min(n, Math.round(n * p + 4.2 * Math.sqrt(n * p * (1 - p)))) : n;
      const bw = pw / (hi - lo + 1);
      for (let k = lo; k <= hi; k++) {
        const bh = (pm[k] / top) * ph;
        svg.append(rect(x0 + (k - lo) * bw + 1, y0 + ph - bh, Math.max(1, bw - 2), bh, k >= k0 ? "fill-signal" : "fill-muted"));
      }
      svg.append(line(x0, y0 + ph, x0 + pw, y0 + ph, "rule"));
      if (!card) {
        const ticks = n > 20 ? [lo, Math.round(n * p), k0, hi] : Array.from({ length: n + 1 }, (_, k) => k);
        for (const k of ticks) svg.append(tag(x0 + (k - lo + 0.5) * bw, y0 + ph + 16, `${k}`, k === k0 ? "on" : ""));
        const odds = `${k0} or more: ${tail < 0.001 ? "under 0.1" : (tail * 100).toFixed(1)} in 100`;
        if (w < 520) { svg.append(tx(x0, h - 20, `right out of ${n}, by guessing`, "t2")); svg.append(tx(x0, h - 6, odds, "t2")); }
        else svg.append(tx(x0, h - 6, `right out of ${n}, by guessing · ${odds}`, "t2"));
      }
    },
  };
});

/** A pair of pictures, one for each theme: a render, or a photograph that is not a demo's screen. `data-src` is the path without "-dark.webp". */
fig("picture", (figure, svg, d) => {
  svg.remove();
  const box = document.createElement("div");
  box.className = "picture";
  for (const theme of ["dark", "light"]) {
    const img = document.createElement("img");
    img.className = theme;
    img.src = `${d.src}-${theme}.webp`;
    img.alt = d.alt ?? "";
    box.append(img);
  }
  figure.prepend(box);
  return { render() {} };
});

/** Every way of labeling four of eight rounds On: the seventy relabelings the permutation test scores. The taught one and its mirror are marked. */
fig("labelings", (figure, svg, d) => ({
  aspect: (w) => (w < 560 ? 0.7 : 0.62),
  render(w, h) {
    const sets = [];
    for (let m = 0; m < 256; m++) { let c = 0; for (let b = 0; b < 8; b++) if (m & (1 << b)) c++; if (c === 4) sets.push(m); }
    const cols = 10, rows = 7, pad = 24;
    const cw = (w - pad * 2) / cols, rh = (h - pad * 2 - (w < 560 ? 34 : 20)) / rows;
    const cell = Math.min(cw / 9, rh / 2.2);
    sets.forEach((m, i) => {
      const cx = pad + (i % cols) * cw, cy = pad + Math.floor(i / cols) * rh;
      const taught = m === 0b10101010, mirror = m === 0b01010101;
      for (let b = 0; b < 8; b++) svg.append(rect(cx + b * cell, cy, cell - 1, cell * 1.4, m & (1 << b) ? "fill-signal" : "fill-tile2"));
      if (taught || mirror) svg.append(rect(cx - 2, cy - 2, 8 * cell + 3, cell * 1.4 + 4, "", { fill: "none", stroke: "var(--ink)", "stroke-width": 1.5 }));
    });
    if (w < 560) { svg.append(tx(pad, h - 20, "70 labelings", "t2")); svg.append(tx(pad, h - 6, "outlined: the one taught, and its mirror", "t2")); }
    else svg.append(tx(pad, h - 6, "70 labelings · outlined: the one taught, and its mirror", "t2"));
  },
}));

/** The receiver operating characteristic of two overlapping normal groups, and its area. */
fig("roc", (figure, svg, d) => {
  const dprime = Number(d.dprime ?? 0.44);
  return {
    aspect: 0.72,
    render(w, h) {
      const pad = 36, s = Math.min(w - pad * 2, h - pad * 2);
      const x0 = (w - s) / 2, y0 = pad - 6;
      svg.append(rect(x0, y0, s, s, "fill-tile"));
      svg.append(line(x0, y0 + s, x0 + s, y0, "muted", { "stroke-dasharray": "4 4" }));
      const pts = [];
      let auc = 0, prev = null;
      for (let z = 4; z >= -4; z -= 0.02) {
        const fpr = 1 - Phi(z + dprime / 2), tpr = 1 - Phi(z - dprime / 2);
        pts.push([x0 + fpr * s, y0 + s - tpr * s]);
        if (prev) auc += (fpr - prev[0]) * (tpr + prev[1]) / 2;
        prev = [fpr, tpr];
      }
      svg.append(poly(pts, "signal", { "stroke-width": 2 }));
      svg.append(tx(x0 + s / 2, y0 + s + 18, "false positive rate", "", { "text-anchor": "middle" }));
      svg.append(tx(x0 - 8, y0 + s / 2, "true positive rate", "", { "text-anchor": "middle", transform: `rotate(-90 ${x0 - 8} ${y0 + s / 2})` }));
      svg.append(tx(x0 + s * 0.6, y0 + s * 0.6, `area ${auc.toFixed(3)} · d′ ${dprime.toFixed(2)}`, "on"));
    },
  };
});

/** Differences with their intervals: one row each, a line at zero. `rows` is JSON: [{label, value, lo, hi}]. */
fig("intervals", (figure, svg, d) => {
  const rows = JSON.parse(d.rows ?? "[]");
  const unit = d.unit ?? "";
  return {
    aspect: Math.max(0.3, 0.12 + rows.length * 0.11),
    render(w, h) {
      // Each row names itself above its line, so a long name never runs into the interval.
      const pad = 28, x0 = pad + 8, pw = w - x0 - pad - 190;
      let lo = 0, hi = 0;
      for (const r of rows) { lo = Math.min(lo, r.lo); hi = Math.max(hi, r.hi); }
      const span = hi - lo || 1;
      const xs = (v) => x0 + ((v - lo) / span) * pw;
      const rh = (h - pad * 2) / rows.length;
      rows.forEach((r, i) => {
        const y = pad + rh * (i + 0.5) + 6;
        // Zero is marked across each interval, not through the names above them.
        svg.append(line(xs(0), y - 8, xs(0), y + 8, "ink2", { "stroke-dasharray": "3 3" }));
        svg.append(tx(x0, y - 14, r.label, "t2"));
        svg.append(line(xs(r.lo), y, xs(r.hi), y, r.lo > 0 || r.hi < 0 ? "signal" : "muted", { "stroke-width": 2 }));
        svg.append(circle(xs(r.value), y, 4, r.lo > 0 || r.hi < 0 ? "fill-signal" : "fill-ink"));
        svg.append(tx(xs(r.hi) + 10, y + 4, `${r.value > 0 ? "+" : ""}${r.value}${unit}  [${r.lo}, ${r.hi}]`, ""));
      });
      svg.append(tx(xs(0), h - 4, "0", "", { "text-anchor": "middle" }));
    },
  };
});

// ---- The light switch's pipeline and its rounds. ------------------------------------------------------

/** From four seconds of EEG to On: the encoder, the 76 numbers, the head, the score against 0.5, and the light. A reading travels it every few seconds. */
fig("pipeline", (figure, svg, d) => {
  const fs = 250;
  let parts = null;
  const card = !!d.card;
  const stagesWanted = (d.stages ?? "eeg encoder embedding head score light").split(" ");
  const TITLE = { eeg: "EEG", encoder: "encoder", embedding: "76 numbers", head: "head", score: "score", light: "light" };
  const UNDER = { encoder: "on the chip", head: "on the chip" };
  const STEP = 56;
  return {
    // Wide, the stages run left to right. Narrow, they stand in a column, each named beside its box.
    aspect: card ? 0.625 : (w) => (w < 560 ? (14 + stagesWanted.length * STEP) / w : 0.36),
    render(w, h) {
      const narrow = !card && w < 560;
      const n = stagesWanted.length;
      const pad = card ? 10 : 24, gap = card ? 10 : 26;
      const boxes = {};
      stagesWanted.forEach((name, i) => {
        const sw = narrow ? Math.min(120, w * 0.34) : (w - pad * 2 - gap * (n - 1)) / n;
        const sh = narrow ? 40 : h - (pad + (card ? 4 : 22)) - pad - (card ? 4 : 30);
        const x = narrow ? 16 : pad + i * (sw + gap), y0 = narrow ? 8 + i * STEP : pad + (card ? 4 : 22);
        const box = rect(x, y0, sw, sh, "fill-tile", { rx: 4, stroke: "var(--rule)" });
        svg.append(box);
        boxes[name] = { x, box };
        const cx = x + sw / 2, cy = y0 + sh / 2;
        if (name === "eeg") {
          const sig = eeg({ fs, seconds: 4, seed: 4, alpha: 16, open: () => 0.5 });
          svg.append(tracePath(sig, fs, x + 6, sw - 12, cy, Math.min(sh / 140, 0.8), "ink", 1.1));
        } else if (name === "encoder") {
          for (let k = 0; k < 3; k++) svg.append(rect(x + sw * 0.2, y0 + sh * (0.22 + k * 0.22), sw * 0.6, sh * 0.12, "fill-ink2", { rx: 2 }));
        } else if (name === "embedding") {
          const bw = (sw - 12) / 76;
          for (let k = 0; k < 76; k++) { const v = 0.15 + 0.7 * Math.abs(Math.sin(k * 0.7 + 1)); svg.append(rect(x + 6 + k * bw, cy + sh * 0.3 - v * sh * 0.6, Math.max(0.6, bw - 0.6), v * sh * 0.6, "fill-signal", { opacity: 0.8 })); }
        } else if (name === "head") {
          for (let k = 0; k < 6; k++) svg.append(line(x + sw * 0.2, y0 + sh * (0.18 + k * 0.13), x + sw * 0.8, cy, "ink2"));
          svg.append(circle(x + sw * 0.8, cy, 5, "fill-signal"));
        } else if (name === "score") {
          // A line from 0 to 1, with 0.5 marked: the board or the page compares the score with it.
          const ly = narrow ? cy + 6 : cy, lx0 = x + (narrow ? 18 : 10), lx1 = x + sw - (narrow ? 18 : 10);
          svg.append(line(lx0, ly, lx1, ly, "ink2"));
          const half = (lx0 + lx1) / 2;
          svg.append(line(half, ly - (narrow ? 7 : 10), half, ly + (narrow ? 7 : 10), "ink"));
          if (narrow) { svg.append(tag(x + 8, ly + 4, "0", "")); svg.append(tag(x + sw - 8, ly + 4, "1", "")); svg.append(tag(half, ly - 11, "0.5", "t1")); }
          else { svg.append(tag(lx0, ly + 20, "0", "")); svg.append(tag(lx1, ly + 20, "1", "")); svg.append(tag(half, ly - 16, "0.5", "t1")); }
          boxes.marker = circle(half, ly, narrow ? 5 : 6, "fill-signal");
          boxes.line = [lx0, lx1];
          svg.append(boxes.marker);
        } else if (name === "light") {
          boxes.led = circle(cx, cy, Math.min(sw, sh) * 0.22, "fill-tile2", { stroke: "var(--ink2)", "stroke-width": 1.4 });
          svg.append(boxes.led);
        }
        if (!card) {
          if (narrow) {
            svg.append(tx(x + sw + 14, y0 + 16, TITLE[name], "t2"));
            if (UNDER[name]) svg.append(tx(x + sw + 14, y0 + 31, UNDER[name], ""));
            if (name === "light") { boxes.word = tx(x + sw + 14, y0 + 31, "Off", "t2"); svg.append(boxes.word); }
          } else {
            svg.append(tag(cx, y0 - 8, TITLE[name], "t2"));
            if (UNDER[name]) svg.append(tag(cx, y0 + sh + 16, UNDER[name], ""));
            if (name === "light") { boxes.word = tag(cx, y0 + sh + 16, "Off", "t2"); svg.append(boxes.word); }
          }
        }
        if (i < n - 1) {
          if (narrow) svg.append(arrow(x + sw / 2, y0 + sh + 3, x + sw / 2, y0 + STEP - 3, "muted"));
          else svg.append(arrow(x + sw + 3, cy, x + sw + gap - 3, cy, "muted"));
        }
      });
      parts = { boxes };
    },
    tick(t) {
      if (!parts) return;
      const { boxes } = parts;
      const cycle = (t % 4) / 4;
      const stage = Math.floor(cycle * stagesWanted.length);
      stagesWanted.forEach((name, i) => boxes[name].box.setAttribute("stroke", i === stage ? "var(--signal)" : "var(--rule)"));
      const score = 0.5 + 0.42 * Math.sin(t * 0.5) + 0.06 * Math.sin(t * 2.3);
      if (boxes.marker) {
        const [lx0, lx1] = boxes.line;
        boxes.marker.setAttribute("cx", f1(lx0 + (lx1 - lx0) * Math.max(0, Math.min(1, score))));
      }
      if (boxes.led) {
        const on = score > 0.5;
        boxes.led.setAttribute("class", on ? "fill-signal" : "fill-tile2");
        if (boxes.word) boxes.word.textContent = on ? "On" : "Off";
      }
    },
  };
});

/** Eight rounds of teaching, Off and On in turn: eleven readings kept in each, the first two after every switch dropped, and one round held out of the training to test on. */
fig("rounds", (figure, svg, d) => {
  const held = Number(d.held ?? 3);
  const card = !!d.card;
  return {
    aspect: card ? 0.625 : 0.3,
    render(w, h) {
      const pad = card ? 10 : 26, rounds = 8, per = 13;
      const gap = 6, rw = (w - pad * 2 - gap * (rounds - 1)) / rounds, bw = rw / per;
      const y0 = pad + (card ? 6 : 24), bh = h - y0 - pad - (card ? 6 : 30);
      for (let r = 0; r < rounds; r++) {
        const x = pad + r * (rw + gap);
        const on = r % 2 === 1;
        for (let i = 0; i < per; i++) svg.append(rect(x + i * bw + 0.5, y0, bw - 1, bh, i < 2 ? "fill-tile2" : on ? "fill-signal" : "fill-muted"));
        if (!card) { svg.append(tag(x + rw / 2, y0 - 8, on ? "On" : "Off", on ? "on" : "t2")); svg.append(tag(x + rw / 2, y0 + bh + 16, rw < 60 ? `${r + 1}` : `round ${r + 1}`, "")); }
        if (r === held) svg.append(rect(x - 3, y0 - 3, rw + 6, bh + 6, "", { fill: "none", stroke: "var(--ink)", "stroke-width": 1.5 }));
      }
    },
  };
});

// ---- The board, its pins, a circuit, and what its light says. --------------------------------------

/** The Raspberry Pi Pico 2 W's forty pins, from above, USB at the top, with the pins the lab uses marked. */
fig("pinmap", (figure, svg, d) => {
  const pins = (d.pins ?? "18 20").split(/\s+/).map(Number);
  const NAMES = { 18: "GND", 20: "GP15", 3: "GND", 8: "GND", 13: "GND", 23: "GND", 28: "GND", 33: "GND", 38: "GND", 36: "3V3", 40: "VBUS", 39: "VSYS" };
  const card = !!d.card;
  return {
    aspect: card ? 0.625 : 1.15,
    render(w, h) {
      const bw = Math.min(w * 0.42, h * 0.36), bh = bw * 2.45;
      const x0 = w / 2 - bw / 2, y0 = (h - bh) / 2;
      svg.append(rect(x0, y0, bw, bh, "fill-tile2", { rx: 6, stroke: "var(--ink2)", "stroke-width": 1.4 }));
      svg.append(rect(x0 + bw / 2 - bw * 0.14, y0 - 6, bw * 0.28, 14, "fill-muted", { rx: 2 }));
      svg.append(rect(x0 + bw * 0.3, y0 + bh * 0.3, bw * 0.4, bw * 0.4, "fill-ink2", { rx: 3 }));
      svg.append(circle(x0 + bw * 0.82, y0 + bh * 0.08, 3, "fill-signal"));
      if (!card) svg.append(tag(x0 + bw * 0.82, y0 + bh * 0.04 - 8, "LED", ""));
      const step = (bh - 24) / 20;
      for (let i = 0; i < 20; i++) {
        const y = y0 + 12 + step * (i + 0.5);
        const left = i + 1, right = 40 - i;
        for (const [n, x, anchor, lx] of [[left, x0 + 10, "end", x0 - 10], [right, x0 + bw - 10, "start", x0 + bw + 10]]) {
          const hot = pins.includes(n);
          svg.append(circle(x, y, hot ? 5 : 3.2, hot ? "fill-signal" : "fill-amber"));
          if (!card && (hot || n % 5 === 0 || n === 1)) svg.append(tx(lx, y + 4, hot ? `${n} · ${NAMES[n] ?? ""}` : `${n}`, hot ? "on" : "", { "text-anchor": anchor }));
        }
      }
      if (!card) svg.append(tag(w / 2, y0 - 14, "USB", "t2"));
    },
  };
});

/** The circuit a project starts from: pin 20 through a resistor and an LED to ground on pin 18, with the LED's longer leg toward the pin. */
fig("circuit", (figure, svg, d) => ({
  aspect: 0.56,
  render(w, h) {
    const narrow = w < 480, pad = narrow ? 12 : 24;
    // The board, with its two pins on its right edge, named inside it.
    const bw = narrow ? w * 0.34 : Math.max(150, w * 0.28), bx = pad, by = h * 0.12, bh = h * 0.66;
    svg.append(rect(bx, by, bw, bh, "fill-tile2", { rx: 6, stroke: "var(--ink2)", "stroke-width": 1.4 }));
    svg.append(tx(bx + 14, by + 22, "Pico 2 W", "t2"));
    const y1 = by + bh * 0.3, y2 = by + bh * 0.78, px = bx + bw;
    for (const y of [y1, y2]) svg.append(circle(px, y, 4.5, "fill-signal"));
    svg.append(tx(px - 12, y1 + 4, narrow ? "pin 20" : "pin 20 · GP15", "on", { "text-anchor": "end" }));
    svg.append(tx(px - 12, y2 + 4, narrow ? "pin 18" : "pin 18 · GND", "on", { "text-anchor": "end" }));
    // From pin 20, the resistor, then down through the LED, and back to pin 18.
    const xl = w - pad - (narrow ? 64 : Math.max(90, w * 0.16)), rx0 = px + (xl - px) * 0.22, rw = Math.min(110, (xl - px) * 0.5);
    svg.append(line(px, y1, rx0, y1, "ink2", { "stroke-width": 1.6 }));
    const zig = [];
    for (let i = 0; i <= 8; i++) zig.push([rx0 + (i / 8) * rw, y1 + (i === 0 || i === 8 ? 0 : i % 2 ? -8 : 8)]);
    svg.append(poly(zig, "ink", { "stroke-width": 1.8 }));
    svg.append(tag(rx0 + rw / 2, y1 - 20, narrow ? "330 ohm" : "330 ohm resistor", "t2"));
    svg.append(line(rx0 + rw, y1, xl, y1, "ink2", { "stroke-width": 1.6 }));
    const ly = (y1 + y2) / 2;
    svg.append(line(xl, y1, xl, ly - 14, "ink2", { "stroke-width": 1.6 }));
    svg.append(path(`M${xl - 12} ${ly - 14} L${xl + 12} ${ly - 14} L${xl} ${ly + 8} Z`, "ink", { "stroke-width": 1.8, fill: "var(--tile2)" }));
    svg.append(line(xl - 12, ly + 8, xl + 12, ly + 8, "ink", { "stroke-width": 2 }));
    svg.append(line(xl, ly + 8, xl, y2, "ink2", { "stroke-width": 1.6 }));
    svg.append(line(xl, y2, px, y2, "ink2", { "stroke-width": 1.6 }));
    svg.append(tx(xl - 20, ly + 2, "LED", "t2", { "text-anchor": "end" }));
    svg.append(tx(xl + 16, ly - 18, narrow ? "long leg" : "long leg here", "", { "text-anchor": "start" }));
    svg.append(path(`M${xl + 18} ${ly + 2} l9 -9 m-9 4 l9 -9`, "signal", { "stroke-width": 1.5 }));
    svg.append(tx(xl + 32, ly + 8, "lights", "on", { "text-anchor": "start" }));
    // Which way the current goes.
    svg.append(path(`M${(px + rx0) / 2 - 6} ${y1 - 5} l6 5 l-6 5`, "signal", { "stroke-width": 1.4 }));
    svg.append(path(`M${(px + xl) / 2 + 6} ${y2 - 5} l-6 5 l6 5`, "signal", { "stroke-width": 1.4 }));
    svg.append(tag(w / 2, by + bh + 20, narrow ? "current flows from pin 20 to ground" : "current flows from pin 20, around, to ground", ""));
  },
}));

/** What the board's LED says, as one second of each pattern on a strip. Drawn still, so nothing on the page flashes. */
fig("ledstrips", (figure, svg, d) => {
  const rows = [
    ["one short blink a second", "looking for your IntoMind One", [[0, 0.1]]],
    ["two short blinks a second", "your IntoMind One is on its charger", [[0, 0.1], [0.25, 0.35]]],
    ["three short blinks a second", "no custom AI head is installed yet", [[0, 0.1], [0.25, 0.35], [0.5, 0.6]]],
    ["off", "your custom AI head reads Off", []],
    ["on", "your custom AI head reads On", [[0, 1]]],
    ["fast blinking", "the last reading had a gap in the signal", [[0, 0.1], [0.2, 0.3], [0.4, 0.5], [0.6, 0.7], [0.8, 0.9]]],
  ];
  // Narrow: each pattern's name and meaning, wrapped to the width, with its second of light under them.
  const wrap = (s, n) => { const out = [""]; for (const word of s.split(" ")) { const cur = out[out.length - 1]; if (cur && (cur + " " + word).length > n) out.push(word); else out[out.length - 1] = cur ? cur + " " + word : word; } return out; };
  const narrowRows = (w) => { const n = Math.floor((w - 32) / 7.4); return rows.map(([name, meaning, spans]) => [name, wrap(meaning, n), spans]); };
  const rowH = (lines) => 64 + 14 * (lines.length - 1);
  return {
    aspect: (w) => (w < 560 ? (32 + 14 + narrowRows(w).reduce((t, r) => t + rowH(r[1]), 0)) / w : 0.5),
    render(w, h) {
      if (w < 560) {
        const pad = 16, sw = w - pad * 2;
        let y = pad;
        narrowRows(w).forEach(([name, lines, spans]) => {
          svg.append(tx(pad, y + 12, name, "t1"));
          lines.forEach((l, k) => svg.append(tx(pad, y + 27 + 14 * k, l, "")));
          const sy = y + 36 + 14 * (lines.length - 1);
          svg.append(rect(pad, sy, sw, 12, "fill-tile2"));
          for (const [a, b] of spans) svg.append(rect(pad + a * sw, sy, (b - a) * sw, 12, "fill-signal"));
          y += rowH(lines);
        });
        svg.append(tx(w - pad, h - 6, "one second", "", { "text-anchor": "end" }));
        return;
      }
      const pad = 24, sw = Math.min(220, w * 0.3), x0 = w - pad - sw;
      const rh = (h - pad * 2) / rows.length;
      rows.forEach(([name, meaning, spans], i) => {
        const y = pad + rh * i, mid = y + rh * 0.5;
        svg.append(tx(pad, mid - 4, name, "t1"));
        svg.append(tx(pad, mid + 12, meaning, ""));
        svg.append(rect(x0, mid - 7, sw, 14, "fill-tile2"));
        for (const [a, b] of spans) svg.append(rect(x0 + a * sw, mid - 7, (b - a) * sw, 14, "fill-signal"));
      });
      svg.append(tx(x0 + sw, h - 4, "one second", "", { "text-anchor": "end" }));
    },
  };
});

/** Why the board's light lags. Your EEG goes to the IntoMind One in four-second readings. The one you switch in holds some of each state and
 * scores in between, each score arrives once its reading has ended, and the light comes on with the first score above 0.5: often the next
 * reading's, so the delay depends on where in a reading the switch fell. A button moves the switch. Simulated. */
fig("lag", (figure, svg, d) => {
  const T = 16, R = 4, ARRIVE = 0.8;
  const r = rng(11);
  let at = 6.2, size = null;
  const paint = (w, h) => {
    const narrow = w < 560;
    const pad = 16, lw = narrow ? 66 : 96, x0 = pad + lw, pw = w - x0 - pad;
    const X = (s) => x0 + (s / T) * pw;
    const rh = narrow ? 30 : 34, y1 = 34, y2 = y1 + rh + 46;
    svg.append(tx(pad, y1 + rh / 2 + 4, "readings", "t2"));
    svg.append(tx(pad, y2 + rh / 2 + 4, "light", "t2"));
    let lit = null, from = null;
    for (let i = 0; i < T / R; i++) {
      const a = X(R * i) + 1.5, b = X(R * (i + 1)) - 1.5, cut = Math.max(a, Math.min(b, X(at)));
      svg.append(rect(a, y1, cut - a, rh, "fill-muted"));
      svg.append(rect(cut, y1, b - cut, rh, "fill-signal"));
      const share = Math.max(0, Math.min(1, (R * (i + 1) - at) / R));
      const score = 0.12 + 0.78 * share;
      svg.append(tag((a + b) / 2, y1 + rh + 16, score.toFixed(2), score > 0.5 ? "on" : "t2"));
      if (score > 0.5 && lit === null) { lit = R * (i + 1) + ARRIVE; from = (a + b) / 2; }
    }
    svg.append(rect(X(0), y2, X(lit) - X(0) - 1, rh, "fill-tile2", { stroke: "var(--rule)" }));
    svg.append(rect(X(lit), y2, X(T) - X(lit), rh, "fill-signal"));
    svg.append(arrow(from, y1 + rh + 22, X(lit) + 2, y2 - 3, "muted"));
    for (const [a, b] of [[y1 - 8, y1 + rh + 4], [y2 - 4, y2 + rh + 8]]) svg.append(line(X(at), a, X(at), b, "ink", { "stroke-dasharray": "3 3" }));
    svg.append(tag(X(at), y1 - 14, "you switch to On", "t1"));
    const by = y2 + rh + 16;
    svg.append(line(X(at), by, X(lit), by, "ink2"));
    svg.append(line(X(lit), by - 4, X(lit), by + 4, "ink2"));
    svg.append(tag((X(at) + X(lit)) / 2, by + 15, `delay ${(lit - at).toFixed(1)} s`, "t1"));
    svg.append(timeAxis(x0, h - 24, pw, T, R));
  };
  if (!d.card) button(figure, "Switch at another moment", () => { at = 4.2 + r() * 3.6; if (size) { svg.replaceChildren(); paint(...size); } });
  return {
    aspect: (w) => (w < 560 ? 228 : 244) / w,
    render(w, h) { size = [w, h]; paint(w, h); },
  };
});

/** Two kinds of mistakes. Forty Off readings and forty On readings from one simulated custom AI head, placed by score, and a threshold the
 * reader moves. An Off reading above it is a false positive, a switch to On nobody meant. An On reading at or below it is a false negative. */
fig("threshold", (figure, svg, d) => {
  const r = rng(23), N = 40;
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / Math.sqrt(0.5); };
  const off = Array.from({ length: N }, () => 0.2 + 0.28 * gauss());
  const on = Array.from({ length: N }, () => 0.8 + 0.28 * gauss());
  const jit = Array.from({ length: N * 2 }, () => r());
  let thr = Number(d.threshold ?? 0.5), size = null;
  const paint = () => {
    if (!size) return;
    const [w, h] = size;
    svg.replaceChildren();
    const narrow = w < 560;
    const pad = 16, lw = narrow ? 0 : 104, x0 = pad + lw, pw = w - x0 - pad;
    const lo = -0.6, hi = 1.6;
    const X = (v) => x0 + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * pw;
    const rowH = 46, y1 = narrow ? 26 : 14, y2 = y1 + rowH + (narrow ? 30 : 16);
    const rows = [["Off readings", off, y1, (v) => v > thr, "fill-muted"], ["On readings", on, y2, (v) => v <= thr, "fill-signal"]];
    rows.forEach(([name, vals, y, wrong, cls], k) => {
      if (narrow) svg.append(tx(x0, y - 8, name, "t2"));
      else svg.append(tx(pad, y + rowH / 2 + 4, name, "t2"));
      vals.forEach((v, i) => {
        const cx = X(v), cy = y + 6 + jit[k * N + i] * (rowH - 12);
        svg.append(circle(cx, cy, 3.6, cls));
        if (wrong(v)) svg.append(circle(cx, cy, 6.5, "", { fill: "none", stroke: "var(--ink)", "stroke-width": 1.2 }));
      });
    });
    const ay = y2 + rowH + 14;
    svg.append(line(x0, ay, x0 + pw, ay, "rule"));
    for (const v of [0, 0.5, 1]) { svg.append(line(X(v), ay, X(v), ay + 5, "muted")); svg.append(tag(X(v), ay + 18, String(v), "")); }
    svg.append(tx(x0 + pw, ay + 18, "score", "", { "text-anchor": "end" }));
    svg.append(line(X(thr), y1 - 4, X(thr), ay, "ink", { "stroke-dasharray": "4 4" }));
    const fp = off.filter((v) => v > thr).length, fn = on.filter((v) => v <= thr).length;
    const a = `false positives: ${fp} of ${N} Off readings`, b = `false negatives: ${fn} of ${N} On readings`;
    if (narrow) { svg.append(tx(x0, h - 22, a, "t1")); svg.append(tx(x0, h - 6, b, "t1")); }
    else svg.append(tx(x0, h - 6, `${a}  ·  ${b}`, "t1"));
  };
  if (!d.card) slider(figure, { label: "threshold", min: 0.1, max: 0.9, step: 0.05, value: thr, format: (v) => v.toFixed(2), on: (v) => { thr = v; paint(); } });
  return {
    aspect: (w) => (w < 560 ? 224 : 188) / w,
    render(w, h) { size = [w, h]; paint(); },
  };
});

// ---- Neurons, waves and noise. ---------------------------------------------------------------------

/** Many small signals add up only when they are in step. A button sets the population in step, or lets each run on its own. */
fig("neurons", (figure, svg, d) => {
  const N = 14;
  let inStep = d.step === "1";
  const r = rng(17);
  // Out of step, each neuron keeps its own rhythm and its own timing, so their sum is small and ragged. In step, every one rises and falls together.
  const phases = Array.from({ length: N }, () => r() * Math.PI * 2);
  const freqs = Array.from({ length: N }, () => 6 + r() * 8);
  let parts = null;
  const card = !!d.card;
  const say = () => (inStep ? "Let each go its own way" : "Make them pulse in step");
  if (!card) button(figure, say(), (b) => { inStep = !inStep; b.textContent = say(); b.setAttribute("aria-pressed", String(inStep)); }, inStep);
  return {
    aspect: card ? 0.625 : (w) => (w < 560 ? 0.95 : 0.5),
    render(w, h) {
      const narrow = !card && w < 560;
      const pad = card ? 10 : 24;
      // Wide: the neurons on the left, their sum on the right. Narrow: the neurons above, their sum below.
      const lw = narrow ? w : w * 0.55, x0 = pad, tw = lw - pad * 2;
      const top = pad + (card ? 0 : 6), nh = narrow ? h * 0.56 - top : h - pad - top;
      const rowH = nh / N;
      const lines = [];
      for (let i = 0; i < N; i++) { const p = poly([], "muted", { "stroke-width": 1 }); svg.append(p); lines.push(p); }
      const sumX = narrow ? pad : lw + pad, sumW = narrow ? w - pad * 2 : w - sumX - pad;
      const sumY = narrow ? h * 0.8 : h / 2, sumA = narrow ? h * 0.15 : h * 0.4;
      svg.append(line(sumX, sumY, sumX + sumW, sumY, "rule2"));
      const sum = poly([], "signal", { "stroke-width": 2 });
      svg.append(sum);
      if (!card) {
        svg.append(tx(x0, top - 8, `${N} neurons, each a small rhythm`, "t2"));
        svg.append(tx(sumX, narrow ? sumY - sumA - 10 : top - 8, "added up: what an electrode picks up", "on"));
      }
      parts = { lines, sum, x0, tw, rowH, top, sumX, sumW, sumY, sumA };
    },
    tick(t) {
      if (!parts) return;
      const { lines, sum, x0, tw, rowH, top, sumX, sumW, sumY, sumA } = parts;
      const M = 140;
      const total = new Float32Array(M);
      for (let i = 0; i < lines.length; i++) {
        const cy = top + rowH * (i + 0.5);
        let dd = "";
        for (let k = 0; k < M; k++) {
          const tt = t * 0.25 + (k / M) * 0.6;
          const v = Math.sin(2 * Math.PI * (inStep ? 10 : freqs[i]) * tt + (inStep ? 0 : phases[i]));
          total[k] += v;
          dd += (k ? "L" : "M") + f1(x0 + (k / M) * tw) + " " + f1(cy - v * rowH * 0.36);
        }
        lines[i].setAttribute("d", dd);
      }
      let dd = "";
      for (let k = 0; k < M; k++) dd += (k ? "L" : "M") + f1(sumX + (k / M) * sumW) + " " + f1(sumY - (total[k] / lines.length) * sumA);
      sum.setAttribute("d", dd);
    },
  };
});

/** How the flight simulator decides: the four lights as the demo lays them out, a ring on the one being looked at, and beside them
 * how strongly each light's rate shows up in the EEG compared with the baseline. The looked-at rate stands out, and the ship turns
 * toward it. The 10 hertz light stands out least, since the brain's own alpha is there too. Nothing here flickers. */
fig("decoder", (figure, svg, d) => {
  const LIGHTS = [{ hz: 8, dir: "up" }, { hz: 10, dir: "right" }, { hz: 12, dir: "down" }, { hz: 15, dir: "left" }];
  const strength = { 8: 4.2, 10: 2.9, 12: 4.6, 15: 3.8 };
  let parts = null;
  return {
    aspect: (w) => (w < 560 ? 1.25 : 0.5),
    render(w, h) {
      const narrow = w < 560, pad = 20;
      const lw = narrow ? w : w * 0.46, lh = narrow ? h * 0.52 : h;
      const cx = lw / 2, cy = lh / 2 + (narrow ? 4 : 0), R = Math.min(lw, lh) * 0.32, r = Math.min(lw, lh) * 0.075;
      const pos = { up: [cx, cy - R], right: [cx + R, cy], down: [cx, cy + R], left: [cx - R, cy] };
      svg.append(path(`M${cx} ${cy - 9} L${cx + 7} ${cy + 8} L${cx} ${cy + 4} L${cx - 7} ${cy + 8} Z`, "ink2", { fill: "var(--ink2)" }));
      const ring = circle(0, 0, r + 7, "", { fill: "none", stroke: "var(--ink)", "stroke-width": 2 });
      for (const L of LIGHTS) {
        const [x, y] = pos[L.dir];
        svg.append(circle(x, y, r, "fill-glow"));
        svg.append(tag(x, y + r + 16, `${L.hz} hertz`, "t2"));
      }
      svg.append(ring);
      // The bars: one for each light's rate.
      const bx = narrow ? pad + 8 : lw + pad, bw = (narrow ? w - pad * 2 - 8 : w - lw - pad * 2), by = narrow ? h * 0.62 : pad + 30, bh = narrow ? h * 0.28 : h - pad * 2 - 70;
      const slot = bw / LIGHTS.length, top = 5, base = by + bh;
      const Y = (v) => base - (v / top) * bh;
      svg.append(line(bx, base, bx + bw, base, "rule"));
      svg.append(line(bx, Y(2.5), bx + bw, Y(2.5), "signal", { "stroke-dasharray": "4 4" }));
      svg.append(tx(bx + bw, Y(2.5) - 6, "stands out", "on", { "text-anchor": "end" }));
      if (narrow) { svg.append(tx(bx, by - 30, "how strongly each light's speed", "t2")); svg.append(tx(bx, by - 14, "shows up in the EEG", "t2")); }
      else svg.append(tx(bx, by - 14, "how strongly each light's speed shows up in the EEG", "t2"));
      const bars = LIGHTS.map((L, i) => {
        const x = bx + slot * i + slot * 0.22;
        const b = rect(x, base, slot * 0.56, 0, "fill-muted", { rx: 2 });
        svg.append(b);
        svg.append(tag(x + slot * 0.28, base + 16, `${L.hz} Hz`, "t2"));
        return { b, x, L, v: 1 };
      });
      parts = { ring, pos, bars, Y, base, r };
    },
    tick(t) {
      if (!parts) return;
      const { ring, pos, bars, Y, base } = parts;
      // The ring moves from light to light every three seconds. A still page shows the 12 hertz light looked at.
      const k = still() ? 2 : Math.floor(t / 3) % 4;
      const looked = LIGHTS[k];
      const [x, y] = pos[looked.dir];
      ring.setAttribute("cx", f1(x)); ring.setAttribute("cy", f1(y));
      for (const bar of bars) {
        const target = bar.L === looked ? strength[bar.L.hz] : 1 + 0.25 * Math.sin(t * 1.7 + bar.L.hz);
        bar.v += (target - bar.v) * (still() ? 1 : 0.08);
        const yy = Y(bar.v);
        bar.b.setAttribute("y", f1(yy)); bar.b.setAttribute("height", f1(base - yy));
        bar.b.setAttribute("class", bar.L === looked ? "fill-signal" : "fill-muted");
      }
    },
  };
});

/** Five people's alpha numbers, three tries with eyes open and three closed, on one line each: for most, closed is higher every time; for one, the tries overlap. */
fig("dotplot", (figure, svg, d) => ({
  aspect: (w) => (w < 560 ? 0.95 : 0.52),
  render(w, h) {
    const people = [
      ["A", [18, 22, 25], [61, 66, 72]],
      ["B", [24, 21, 27], [48, 55, 52]],
      ["C", [15, 19, 17], [70, 64, 75]],
      ["D", [26, 30, 24], [44, 51, 39]],
      ["E", [29, 34, 31], [36, 30, 41]],
    ];
    const pad = 22, x0 = pad + 34, pw = w - x0 - pad, top = pad + 26, rowH = (h - top - 46) / people.length;
    const X = (v) => x0 + (v / 100) * pw;
    for (const v of [0, 25, 50, 75, 100]) { svg.append(line(X(v), top - 6, X(v), top + rowH * people.length, "rule2")); svg.append(tag(X(v), h - 30, `${v}%`, "")); }
    svg.append(tx(x0, h - 8, "the alpha number in Alpha Flower", "t2"));
    svg.append(circle(x0 + 6, pad + 4, 5, "fill-muted")); svg.append(tx(x0 + 16, pad + 8, "eyes open", "t2"));
    svg.append(circle(x0 + 106, pad + 4, 5, "fill-signal")); svg.append(tx(x0 + 116, pad + 8, "eyes closed", "on"));
    people.forEach(([name, open, closed], i) => {
      const cy = top + rowH * (i + 0.5);
      svg.append(tag(pad + 6, cy, name, "t2"));
      for (const v of open) svg.append(circle(X(v), cy, 6, "fill-muted", { opacity: 0.85 }));
      for (const v of closed) svg.append(circle(X(v), cy, 6, "fill-signal", { opacity: 0.9 }));
    });
  },
}));

/** One sitting on one line: each part of it a stretch of the line, as long as it lasts, named under it. It reads the table named by
 * data-table, whose rows are part, minutes (a–b) and what happens; a row with no part continues the one above. Labs are in orange. */
fig("timeline", (figure, svg, d) => {
  const table = document.querySelector(d.table);
  const parts = [];
  if (table) for (const tr of table.querySelectorAll("tbody tr")) {
    const td = [...tr.querySelectorAll("td")].map((c) => c.textContent.trim());
    if (td.length < 2) continue;
    // The name and the stretch, in either order: "Welcome | 0–15" in minutes, or "1–2 | Proposal" in periods.
    const range = /^\d+\s*[–-]\s*\d+$/;
    const [when, name] = range.test(td[0]) ? [td[0], td[1]] : [td[1], td[0]];
    const m = when.match(/(\d+)\s*[–-]\s*(\d+)/);
    if (!m) continue;
    if (name || !parts.length) parts.push({ name, a: Number(m[1]), b: Number(m[2]), lab: tr.dataset.kind === "lab" });
    else parts[parts.length - 1].b = Number(m[2]);
  }
  // Minutes start at 0 and run to the end of a stretch. Periods are counted from 1, and 1–2 is two of them.
  const counted = parts.length > 0 && parts[0].a === 1;
  if (counted) for (const p of parts) p.a -= 1;
  const label = (p) => `${counted ? p.a + 1 : p.a}–${p.b}`;
  const total = Math.max(1, ...parts.map((p) => p.b));
  return {
    aspect: (w) => (w < 640 ? (parts.length * 44 + 30) / w : 84 / w),
    render(w, h) {
      const pad = 6;
      if (w < 640) {
        // Narrow: the line stands up, one part per row.
        const x0 = pad + 70, bw = w - x0 - pad, rh = (h - 30) / parts.length;
        parts.forEach((p, i) => {
          const y = 6 + i * rh, len = ((p.b - p.a) / total) * bw;
          svg.append(tx(pad, y + rh / 2 + 4, label(p), ""));
          svg.append(rect(x0, y + 4, Math.max(3, len), rh - 20, p.lab ? "fill-signal" : "fill-muted", { rx: 2 }));
          svg.append(tx(x0, y + rh - 3, p.name, p.lab ? "on" : "t2"));
        });
        return;
      }
      const x0 = pad, bw = w - pad * 2, y = 18, bh = 22;
      const X = (m) => x0 + (m / total) * bw;
      parts.forEach((p) => {
        svg.append(rect(X(p.a) + 1, y, Math.max(2, X(p.b) - X(p.a) - 2), bh, p.lab ? "fill-signal" : "fill-muted", { rx: 2, opacity: p.lab ? 0.9 : 0.6 }));
        // Each part is named under its stretch only when the name fits in it. The table below has every part.
        const room = (X(p.b) - X(p.a) - 6) / 7.2, time = label(p);
        const first = p.name.split(" ")[0].replace(/[,.:]$/, "");
        const name = p.name.length <= room ? p.name : first.length <= room ? first : "";
        if (name) svg.append(tx(X(p.a) + 2, y + bh + 18, name, p.lab ? "on" : "t2"));
        if (time.length <= room) svg.append(tx(X(p.a) + 2, y + bh + 34, time, ""));
      });
    },
  };
});

/** Why contact matters, in section: the IntoMind One resting on a layer of hair, its electrodes held off the skin, beside the same
 * device with the hair parted under each electrode, so each one rests on skin. Drawn plainly, as the data path draws the device. */
fig("contact", (figure, svg, d) => ({
  aspect: (w) => (w < 560 ? 1.1 : 0.42),
  render(w, h) {
    const narrow = w < 560, pad = 12;
    const panels = narrow ? [[0, 0, w, h / 2], [0, h / 2, w, h / 2]] : [[0, 0, w / 2, h], [w / 2, 0, w / 2, h]];
    const r = rng(5);
    panels.forEach(([px, py, pw, ph], k) => {
      const parted = k === 1;
      const x0 = px + pad, x1 = px + pw - pad, cx = (x0 + x1) / 2;
      const skin = py + ph * 0.66, skull = py + ph * 0.8;
      svg.append(rect(x0, skin, x1 - x0, skull - skin, "fill-tile"));
      svg.append(rect(x0, skull, x1 - x0, py + ph - pad - skull, "fill-tile2"));
      svg.append(line(x0, skin, x1, skin, "ink2"));
      const dw = (x1 - x0) * 0.56, dx0 = cx - dw / 2, hairTop = skin - ph * 0.16;
      const bumps = [0.2, 0.5, 0.8].map((f) => dx0 + dw * f);
      // Hair: strands lying along the scalp, parted away from under each electrode on the right.
      for (let i = 0; i < 46; i++) {
        const hx = x0 + ((x1 - x0 - 40) * i) / 46 + r() * 6;
        if (parted && bumps.some((b) => Math.abs(hx - b) < 14)) continue;
        const lift = (parted ? 0.3 : 1) * (ph * 0.11 + r() * ph * 0.05);
        svg.append(path(`M${f1(hx)} ${f1(skin)} c${f1(2 + r() * 4)} ${f1(-lift)} ${f1(14 + r() * 6)} ${f1(-lift * 1.1)} ${f1(26 + r() * 10)} ${f1(-lift * 0.5)}`, "muted", { "stroke-width": 1.2 }));
      }
      // The device, and its electrodes on its underside, reaching the skin only where the hair is parted.
      const bottom = parted ? skin - 1 : hairTop, dh = Math.min(ph * 0.16, 40);
      svg.append(rect(dx0, bottom - 9 - dh, dw, dh, "fill-tile2", { rx: dh * 0.45, stroke: "var(--ink2)", "stroke-width": 1.4 }));
      for (const b of bumps) svg.append(rect(b - 4, bottom - 10, 8, 10, "fill-signal", { rx: 1.5 }));
      if (!parted) for (const b of bumps) svg.append(line(b, bottom + 2, b, skin - 2, "signal", { "stroke-dasharray": "2 3" }));
      svg.append(tx(x0, py + 18, parted ? "Hair parted: each electrode on skin" : "Resting on hair: electrodes held off the skin", parted ? "on" : "t2"));
      svg.append(tx(x0 + 6, (skin + skull) / 2 + 4, "skin", ""));
      svg.append(tx(x0 + 6, skull + 16, "skull", ""));
      svg.append(tx(x0, py + ph - 2, parted ? "more of the brain's signal" : "less of the brain, more noise", parted ? "t1" : ""));
    });
  },
}));

/** Why averaging helps: thirty averages of noisy measurements of the same true value, for averages of 1, 4, 16 and 64 at a time.
 * The spread halves each time the number averaged goes up four times. */
fig("averages", (figure, svg, d) => ({
  aspect: (w) => (w < 560 ? 0.9 : 0.45),
  render(w, h) {
    const r = rng(12), truth = 40, rows = [1, 4, 16, 64];
    const pad = 16, lw = w < 560 ? 82 : 132, x0 = pad + lw, pw = w - x0 - pad, top = 10, rh = (h - top - 44) / rows.length;
    const X = (v) => x0 + ((v - 15) / 50) * pw;
    for (const v of [20, 30, 40, 50, 60]) { svg.append(line(X(v), top, X(v), top + rh * rows.length, v === truth ? "signal" : "rule2", v === truth ? { "stroke-dasharray": "4 4" } : {})); svg.append(tag(X(v), h - 28, `${v}`, "")); }
    svg.append(tag(X(truth), top - 2 + rh * rows.length + 34, "the true value", "on"));
    rows.forEach((n, i) => {
      const cy = top + rh * (i + 0.5);
      svg.append(tx(pad, cy + 4, n === 1 ? "one at a time" : `averages of ${n}`, "t2"));
      for (let k = 0; k < 30; k++) {
        let sum = 0;
        for (let j = 0; j < n; j++) sum += truth + 40 * (r() - 0.5);
        svg.append(circle(X(sum / n), cy + (r() - 0.5) * rh * 0.4, 3.2, "fill-ink2", { opacity: 0.75 }));
      }
    });
  },
}));

/** Three rhythms on the same four seconds: breathing, the heartbeat, and alpha, so how often each repeats can be seen side by side. */
fig("rhythms", (figure, svg, d) => ({
  aspect: (w) => (w < 560 ? 1.05 : 0.5),
  render(w, h) {
    const pad = 22, x0 = pad, pw = w - pad * 2, seconds = 4;
    const narrow = w < 560;
    const rows = [
      { name: "breathing: about 15 times a minute, a quarter of a hertz", f: (t) => Math.sin(2 * Math.PI * 0.25 * t - Math.PI / 2) },
      { name: "heartbeat: about once a second, 1 hertz", f: (t) => { const p = (t * 1.15) % 1; return Math.exp(-((p - 0.3) ** 2) / 0.0012) - 0.25 * Math.exp(-((p - 0.36) ** 2) / 0.002); } },
      { name: "alpha in the brain: about 10 times a second, 10 hertz", f: (t) => Math.sin(2 * Math.PI * 10 * t) },
    ];
    const top = pad + 8, rowH = (h - top - 34) / rows.length;
    rows.forEach((r, i) => {
      const names = narrow ? lines(r.name, pw) : [r.name];
      const extra = (names.length - 1) * 14;
      const cy = top + rowH * i + extra / 2 + rowH * 0.62, A = Math.min(rowH * 0.28, (rowH - extra) * 0.3);
      names.forEach((l, k) => svg.append(tx(x0, top + rowH * i + 12 + k * 14, l, i === 2 ? "on" : "t2")));
      const pts = [];
      for (let k = 0; k <= 900; k++) { const t = (k / 900) * seconds; pts.push([x0 + (k / 900) * pw, cy - r.f(t) * A]); }
      svg.append(poly(pts, i === 2 ? "signal" : "ink", { "stroke-width": 1.6 }));
    });
    svg.append(timeAxis(x0, h - 24, pw, seconds));
  },
}));

/** A wave with its frequency and amplitude on sliders, and, when asked, the samples a device takes of it and the wave those samples alone would suggest. */
fig("wave", (figure, svg, d) => {
  let hz = Number(d.hz ?? 3), amp = 1, rate = Number(d.rate ?? 20);
  const controls = (d.controls ?? "hz amp").split(" ");
  const card = !!d.card;
  let parts = null;
  const draw = () => {
    if (!parts) return;
    const { w, h, pad } = parts;
    svg.replaceChildren();
    const narrow = !card && w < 560, rated = controls.includes("rate");
    const top = card ? 6 : narrow && rated ? 50 : 34, bottom = card ? 6 : 40;
    const x0 = pad + 8, pw = w - x0 - pad, cy = top + (h - top - bottom) / 2, A = (h - top - bottom) / 2 - 4;
    svg.append(line(x0, cy, x0 + pw, cy, "rule2"));
    const pts = [];
    for (let i = 0; i <= 600; i++) { const t = i / 600; pts.push([x0 + t * pw, cy - amp * A * Math.sin(2 * Math.PI * hz * t)]); }
    svg.append(poly(pts, "ink", { "stroke-width": 1.8 }));
    if (controls.includes("amp") && !controls.includes("rate") && !card) {
      const crest = x0 + (0.25 / hz) * pw;
      svg.append(line(crest, cy, crest, cy - amp * A, "signal", { "stroke-width": 1.6 }));
      svg.append(line(crest - 5, cy - amp * A, crest + 5, cy - amp * A, "signal", { "stroke-width": 1.6 }));
      svg.append(line(crest - 5, cy, crest + 5, cy, "signal", { "stroke-width": 1.6 }));
      svg.append(tx(crest + 9, cy - (amp * A) / 2 + 4, "amplitude", "on"));
    }
    if (controls.includes("rate")) {
      const samples = [];
      for (let k = 0; k * (1 / rate) <= 1 + 1e-9; k++) { const t = k / rate; samples.push([x0 + t * pw, cy - amp * A * Math.sin(2 * Math.PI * hz * t)]); }
      svg.append(poly(samples, "signal", { "stroke-width": 1.4 }));
      for (const [x, y] of samples) svg.append(circle(x, y, 3.5, "fill-signal"));
      if (!card && narrow) { svg.append(tx(x0, 16, `${rate} samples a second`, "on")); svg.append(tx(x0, 32, "orange: what the samples alone say", "on")); }
      else if (!card) svg.append(tx(x0, 18, `${rate} samples a second: the orange line is what the samples alone say`, "on"));
    } else if (!card) svg.append(tx(x0, 18, `${hz} waves a second, so ${hz} hertz`, "t2"));
    if (!card) svg.append(timeAxis(x0, h - 34, pw, 1, 0.5));
  };
  if (!card) {
    if (controls.includes("hz")) slider(figure, { label: "frequency", min: 1, max: 20, step: 1, value: hz, format: (v) => `${v} Hz`, on: (v) => { hz = v; draw(); } });
    if (controls.includes("amp")) slider(figure, { label: "amplitude", min: 10, max: 100, step: 5, value: 100, format: (v) => `${v}%`, on: (v) => { amp = v / 100; draw(); } });
    if (controls.includes("rate")) slider(figure, { label: "sample rate", min: 4, max: 60, step: 1, value: rate, format: (v) => `${v} a second`, on: (v) => { rate = v; draw(); } });
  }
  return { aspect: card ? 0.625 : (w) => (w < 560 ? 0.66 : 0.42), render(w, h) { parts = { w, h, pad: card ? 10 : 26 }; draw(); } };
});

// ---- Models: points, a line, and what a head is. -----------------------------------------------------

/** Points from a table on the page, two groups, a straight line fitted by least squares through the training points, and the held-back points hollow. */
fig("scatter", (figure, svg, d) => {
  const card = !!d.card;
  const read = () => {
    const table = d.table ? document.querySelector(d.table) : figure.closest("section")?.querySelector("table");
    const rows = [];
    if (table) for (const tr of table.querySelectorAll("tbody tr")) {
      const cells = [...tr.querySelectorAll("td")].map((td) => td.textContent.trim().replace("−", "-"));
      if (cells.length >= 4) rows.push({ n: Number(cells[0]), x: Number(cells[1]), y: Number(cells[2]), g: Number(cells[3]) });
    }
    return rows.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y));
  };
  return {
    aspect: card ? 0.625 : 0.62,
    render(w, h) {
      let rows = read();
      if (rows.length === 0) {
        const r = rng(5);
        rows = Array.from({ length: 24 }, (_, i) => { const g = i % 2; return { n: i + 1, x: (g ? 2.1 : 1.0) + r.gauss() * 0.5, y: 1.8 + r.gauss() * 0.5, g }; });
      }
      const train = Number(d.train ?? 16);
      // The key sits above the box: one line when wide, two when narrow.
      const narrow = !card && w < 560;
      const pad = card ? 12 : 30, x0 = pad + 20, y0 = card ? pad : narrow ? 44 : 34, pw = w - x0 - pad, ph = h - y0 - (card ? pad + 8 : 30);
      const xs = rows.map((r) => r.x), ys = rows.map((r) => r.y);
      const xmin = Math.min(...xs) - 0.3, xmax = Math.max(...xs) + 0.3, ymin = Math.min(...ys) - 0.3, ymax = Math.max(...ys) + 0.3;
      const X = (x) => x0 + ((x - xmin) / (xmax - xmin)) * pw, Y = (y) => y0 + ph - ((y - ymin) / (ymax - ymin)) * ph;
      svg.append(rect(x0, y0, pw, ph, "fill-tile"));
      const clipId = `clip${Math.round(Math.random() * 1e9)}`;
      svg.append(el("clipPath", { id: clipId }, [rect(x0, y0, pw, ph)]));
      // Least squares of the group label on x and y over the training points: g ≈ a x + b y + c, and the boundary is where it reaches one half.
      const T = rows.slice(0, train);
      let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sg = 0, sgx = 0, sgy = 0, n = T.length;
      for (const r of T) { sx += r.x; sy += r.y; sg += r.g; sxx += r.x * r.x; sxy += r.x * r.y; syy += r.y * r.y; sgx += r.g * r.x; sgy += r.g * r.y; }
      const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], v = [sgx, sgy, sg];
      // Solve the three by three by elimination.
      for (let i = 0; i < 3; i++) { const p = M[i][i] || 1e-9; for (let j = i + 1; j < 3; j++) { const f = M[j][i] / p; for (let k = i; k < 3; k++) M[j][k] -= f * M[i][k]; v[j] -= f * v[i]; } }
      const sol = [0, 0, 0];
      for (let i = 2; i >= 0; i--) { let s = v[i]; for (let k = i + 1; k < 3; k++) s -= M[i][k] * sol[k]; sol[i] = s / (M[i][i] || 1e-9); }
      const [a, b, c] = sol;
      // The boundary a x + b y + c = 0.5, drawn across the box.
      const pts = [];
      if (Math.abs(b) > 1e-6) for (const x of [xmin, xmax]) pts.push([X(x), Y((0.5 - c - a * x) / b)]);
      else if (Math.abs(a) > 1e-6) for (const y of [ymin, ymax]) pts.push([X((0.5 - c) / a), Y(y)]);
      if (pts.length === 2) svg.append(poly(pts, "signal", { "stroke-width": 1.8, "clip-path": `url(#${clipId})` }));
      rows.forEach((r, i) => {
        const held = i >= train;
        svg.append(circle(X(r.x), Y(r.y), card ? 3 : 5, held ? "" : r.g ? "fill-signal" : "fill-ink", held ? { fill: "var(--bg)", stroke: r.g ? "var(--signal)" : "var(--ink)", "stroke-width": 1.8 } : {}));
      });
      if (!card) {
        svg.append(tx(x0, h - 6, "x", "")); svg.append(tx(pad, y0 + 12, "y", ""));
        if (narrow) { svg.append(tx(x0, 16, `line fitted on ${train} points`, "t2")); svg.append(tx(x0, 31, "hollow points held back", "t2")); }
        else svg.append(tx(x0, 20, `line fitted on ${train} points · hollow points held back`, "t2"));
      }
    },
  };
});

/** The encoder and its heads: four seconds in, 76 numbers out, and small heads that each read the numbers for one thing. */
fig("encoder", (figure, svg, d) => {
  const fs = 250;
  const card = !!d.card;
  return {
    aspect: card ? 0.625 : (w) => (w < 560 ? 372 / w : 0.42),
    render(w, h) {
      if (!card && w < 560) {
        // Narrow: from the EEG down to the heads, each step named under it.
        const x0 = 16, pw = w - 32, mid = w / 2;
        const sig = eeg({ fs, seconds: 4, seed: 8, alpha: 16, open: () => 0.5 });
        svg.append(tx(x0, 14, "four seconds of EEG", "t2"));
        svg.append(tracePath(sig, fs, x0, pw, 48, 0.45, "ink", 1.1));
        svg.append(arrow(mid, 82, mid, 100, "muted"));
        const ew = Math.min(140, pw * 0.5), ex = mid - ew / 2, ey = 106, eh = 44;
        svg.append(rect(ex, ey, ew, eh, "fill-tile", { rx: 4, stroke: "var(--rule)" }));
        for (let k = 0; k < 3; k++) svg.append(rect(ex + ew * 0.2, ey + eh * (0.18 + k * 0.25), ew * 0.6, eh * 0.14, "fill-ink2", { rx: 2 }));
        svg.append(tag(mid, ey + eh + 16, "the encoder · 170,772 parameters", ""));
        svg.append(arrow(mid, ey + eh + 24, mid, ey + eh + 42, "muted"));
        const by = ey + eh + 50, bh = 44, bw = pw / 76;
        for (let k = 0; k < 76; k++) { const v = 0.15 + 0.75 * Math.abs(Math.sin(k * 0.7 + 1)); svg.append(rect(x0 + k * bw, by + bh - v * bh, Math.max(0.6, bw - 0.6), v * bh, "fill-signal", { opacity: 0.85 })); }
        svg.append(tag(mid, by + bh + 16, "76 numbers, the embedding", "t2"));
        const hy = by + bh + 58;
        ["age head", "sex head", "custom AI head"].forEach((name, i) => {
          const hx = x0 + pw * (i + 0.5) / 3;
          svg.append(arrow(mid, by + bh + 24, hx, hy - 10, "muted"));
          svg.append(circle(hx, hy, 7, i === 2 ? "fill-signal" : "fill-ink2"));
          svg.append(tag(hx, hy + 22, name, i === 2 ? "on" : "t2"));
        });
        return;
      }
      const pad = card ? 10 : 24;
      const cols = [pad, w * 0.28, w * 0.5, w * 0.74];
      const cy = h * 0.5;
      const sig = eeg({ fs, seconds: 4, seed: 8, alpha: 16, open: () => 0.5 });
      const tw = cols[1] - cols[0] - 30;
      svg.append(tracePath(sig, fs, cols[0], tw, cy, Math.min(h / 160, 0.8), "ink", 1.1));
      if (!card) svg.append(tag(cols[0] + tw / 2, pad + 6, "four seconds of EEG", "t2"));
      const ex = cols[1], ew = cols[2] - cols[1] - 40, eh = h * 0.5;
      svg.append(rect(ex, cy - eh / 2, ew, eh, "fill-tile", { rx: 4, stroke: "var(--rule)" }));
      for (let k = 0; k < 3; k++) svg.append(rect(ex + ew * 0.2, cy - eh / 2 + eh * (0.2 + k * 0.22), ew * 0.6, eh * 0.12, "fill-ink2", { rx: 2 }));
      if (!card) { svg.append(tag(ex + ew / 2, pad + 6, "the encoder", "t2")); svg.append(tag(ex + ew / 2, cy + eh / 2 + 16, "170,772 parameters", "")); }
      svg.append(arrow(cols[0] + tw + 6, cy, ex - 6, cy, "muted"));
      const bx = cols[2], bwid = cols[3] - cols[2] - 40, bw = bwid / 76;
      for (let k = 0; k < 76; k++) { const v = 0.15 + 0.75 * Math.abs(Math.sin(k * 0.7 + 1)); svg.append(rect(bx + k * bw, cy + h * 0.16 - v * h * 0.32, Math.max(0.6, bw - 0.6), v * h * 0.32, "fill-signal", { opacity: 0.85 })); }
      if (!card) svg.append(tag(bx + bwid / 2, cy + h * 0.16 + 16, "76 numbers, the embedding", "t2"));
      svg.append(arrow(ex + ew + 6, cy, bx - 6, cy, "muted"));
      const heads = card ? ["age", "sex", "yours"] : ["age head", "sex head", "custom AI head"];
      heads.forEach((name, i) => {
        const hy = cy + (i - 1) * h * 0.28, hx = cols[3];
        svg.append(arrow(bx + bwid + 6, cy, hx - 6, hy, "muted"));
        svg.append(circle(hx + 8, hy, 7, i === 2 ? "fill-signal" : "fill-ink2"));
        if (!card) svg.append(tx(hx + 22, hy + 4, name, i === 2 ? "on" : "t2"));
      });
    },
  };
});

/** How much of each band the encoder's description gives back: the published shares. `values` is JSON of [[label, r2], ...]. */
fig("recon", (figure, svg, d) => {
  const rows = JSON.parse(d.values ?? '[["1 to 4 Hz",0.871],["4 to 8 Hz",0.665],["8 to 13 Hz",0.728],["13 to 30 Hz",0.421],["30 to 45 Hz",0.122]]');
  return {
    aspect: 0.5,
    render(w, h) {
      const pad = 28, x0 = pad + 8, pw = w - x0 - pad, y0 = pad + 8, ph = h - y0 - pad - 30;
      const bw = pw / rows.length;
      rows.forEach(([label, v], i) => {
        const x = x0 + i * bw + bw * 0.15, bh = v * ph;
        svg.append(rect(x, y0 + ph - bh, bw * 0.7, bh, "fill-signal", { opacity: 0.9 }));
        svg.append(tag(x + bw * 0.35, y0 + ph - bh - 10, v.toFixed(2), "t1"));
        // A band's name on two lines when its bar is too narrow for one.
        const parts = label.length * 7.3 > bw ? label.replace(" to ", " to\n").split("\n") : [label];
        parts.forEach((p, k) => svg.append(tag(x + bw * 0.35, y0 + ph + 16 + k * 13, p, "")));
      });
      svg.append(line(x0, y0 + ph, x0 + pw, y0 + ph, "rule"));
    },
  };
});

// ---- Figures read from the tables beside them. -----------------------------------------------------

function tableNear(figure, cls) {
  if (figure.dataset.table) return document.querySelector(figure.dataset.table);
  let n = figure.nextElementSibling;
  while (n && !(n.matches && n.matches(`table.${cls}`))) n = n.nextElementSibling;
  return n ?? figure.closest("section")?.querySelector(`table.${cls}`) ?? null;
}

/** A flow of stages, read from the first two columns of the table after it: boxes in a row, joined by arrows. */
fig("flow", (figure, svg, d) => ({
  aspect: 0.22,
  render(w, h) {
    const table = tableNear(figure, "plan") ?? tableNear(figure, "cal") ?? figure.closest("section")?.querySelector("table");
    const stages = [];
    if (table) for (const tr of table.querySelectorAll("tbody tr")) { const td = tr.querySelectorAll("td"); if (td.length >= 2 && td[1].textContent.trim()) stages.push({ when: td[0].textContent.trim(), name: td[1].textContent.trim() }); }
    if (!stages.length) return;
    // Boxes stay a readable height however tall the figure is, and a long name breaks onto two lines.
    const pad = 16, gap = 14, bw = (w - pad * 2 - gap * (stages.length - 1)) / stages.length, bh = Math.min(h - pad * 2, 132), y0 = (h - bh) / 2;
    const fits = Math.max(6, Math.floor((bw - 4) / 6.6));
    stages.forEach((s, i) => {
      const x = pad + i * (bw + gap);
      svg.append(rect(x, y0, bw, bh, "fill-tile", { rx: 4, stroke: "var(--rule)" }));
      let lines = [s.name];
      if (s.name.length > fits && s.name.includes(" ")) {
        const words = s.name.split(" "); let best = 0, bestGap = Infinity;
        for (let k = 1; k < words.length; k++) { const gapK = Math.abs(words.slice(0, k).join(" ").length - words.slice(k).join(" ").length); if (gapK < bestGap) { bestGap = gapK; best = k; } }
        lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
      }
      lines = lines.map((l) => (l.length > fits ? l.slice(0, fits - 1) + "…" : l));
      lines.forEach((l, j) => svg.append(tag(x + bw / 2, y0 + bh * 0.4 + (j - (lines.length - 1) / 2) * 14, l, "t1")));
      svg.append(tag(x + bw / 2, y0 + bh * 0.76, s.when, ""));
      if (i < stages.length - 1) svg.append(arrow(x + bw + 2, y0 + bh / 2, x + bw + gap - 2, y0 + bh / 2, "muted"));
    });
  },
}));

/** The design loop: a need, requirements, a test written first, a build, the test run, and the next change. */
fig("loop", (figure, svg, d) => ({
  aspect: d.card ? 0.625 : (w) => (w < 560 ? 236 / w : 0.6),
  render(w, h) {
    const card = !!d.card, narrow = !card && w < 560;
    const steps = ["a person and a need", "requirements", "the test, written first", "build", "the test, run", "one change"];
    if (narrow) {
      // Narrow: the six steps in a column, and a path from the last back up to the first.
      const x = 40, top = 22, gap = 36;
      steps.forEach((s, i) => {
        const y = top + i * gap;
        if (i < steps.length - 1) svg.append(line(x, y + 9, x, y + gap - 9, "muted"));
        svg.append(circle(x, y, 6, i === 2 ? "fill-signal" : "fill-ink2"));
        svg.append(tx(x + 18, y + 4, s, i === 2 ? "on" : "t2"));
      });
      const yl = top + (steps.length - 1) * gap;
      svg.append(path(`M${x - 9} ${yl} H${x - 20} V${top} H${x - 12}`, "muted"));
      svg.append(circle(x - 11, top, 2.5, "fill-muted"));
      return;
    }
    const cx = w / 2, cy = h / 2, R = card ? Math.min(w, h) * 0.38 : narrow ? Math.min(w * 0.2, h * 0.3) : Math.min(w, h) * 0.34;
    // A label that would run off the edge goes on two lines, broken after a comma or at the middle space.
    const split = (t) => { const c = t.indexOf(", "); if (c > 0) return [t.slice(0, c + 1), t.slice(c + 2)]; const sp = [...t.matchAll(/ /g)].map((m) => m.index); const mid = sp.reduce((b, i) => (Math.abs(i - t.length / 2) < Math.abs(b - t.length / 2) ? i : b), sp[0]); return [t.slice(0, mid), t.slice(mid + 1)]; };
    steps.forEach((s, i) => {
      const a = (i / steps.length) * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      const a2 = ((i + 1) / steps.length) * Math.PI * 2 - Math.PI / 2;
      svg.append(path(`M${f1(cx + Math.cos(a + 0.28) * R)} ${f1(cy + Math.sin(a + 0.28) * R)} A${R} ${R} 0 0 1 ${f1(cx + Math.cos(a2 - 0.3) * R)} ${f1(cy + Math.sin(a2 - 0.3) * R)}`, "muted"));
      svg.append(circle(cx + Math.cos(a2 - 0.3) * R, cy + Math.sin(a2 - 0.3) * R, 2.5, "fill-muted"));
      svg.append(circle(x, y, 6, i === 2 ? "fill-signal" : "fill-ink2"));
      if (card) return;
      const ca = Math.cos(a), sa = Math.sin(a);
      const lx = cx + ca * (R + 14), ly = cy + sa * (R + 14);
      const anchor = ca > 0.3 ? "start" : ca < -0.3 ? "end" : "middle";
      const room = anchor === "start" ? w - lx - 6 : anchor === "end" ? lx - 6 : w - 12;
      const lines = s.length * 7.4 > room && s.includes(" ") ? split(s) : [s];
      const top = sa < -0.5 ? ly - 6 - (lines.length - 1) * 13 : sa > 0.5 ? ly + 14 : ly + 4 - (lines.length - 1) * 6.5;
      lines.forEach((t, k) => svg.append(tx(lx, top + k * 13, t, i === 2 ? "on" : "t2", { "text-anchor": anchor })));
    });
    if (!card) svg.append(tag(cx, cy + 4, "then again", ""));
  },
}));

/** Statistical power against the number of people, for an effect size on a slider. */
fig("power", (figure, svg, d) => {
  let dz = Number(d.d ?? 0.5);
  let parts = null;
  const card = !!d.card;
  const draw = () => {
    if (!parts) return;
    const { w, h, pad } = parts;
    svg.replaceChildren();
    const x0 = pad + 30, pw = w - x0 - pad, y0 = pad + 8, ph = h - y0 - pad - (w < 560 ? 44 : 26);
    const X = (n) => x0 + ((n - 4) / 96) * pw, Y = (p) => y0 + ph - p * ph;
    for (const p of [0.5, 0.8]) { svg.append(line(x0, Y(p), x0 + pw, Y(p), p === 0.8 ? "signal" : "rule2", { "stroke-dasharray": p === 0.8 ? "4 4" : null })); svg.append(tx(x0 - 6, Y(p) + 4, `${Math.round(p * 100)}%`, "", { "text-anchor": "end" })); }
    const pts = [];
    for (let n = 4; n <= 100; n++) pts.push([X(n), Y(Phi(dz * Math.sqrt(n / 2) - 1.96))]);
    svg.append(poly(pts, "ink", { "stroke-width": 2 }));
    let need = null;
    for (let n = 4; n <= 100; n++) if (Phi(dz * Math.sqrt(n / 2) - 1.96) >= 0.8) { need = n; break; }
    if (!card) {
      for (const n of [10, 25, 50, 100]) svg.append(tag(X(n), y0 + ph + 16, `${n}`, ""));
      const said = `people per group · 80 percent power at an effect of ${dz.toFixed(1)} needs ${need ? `${need} per group` : "more than 100 per group"}`;
      const ls = lines(said, w - x0 - 8);
      ls.forEach((l, k) => svg.append(tx(x0, h - 6 - (ls.length - 1 - k) * 14, l, "t2")));
    }
  };
  if (!card) slider(figure, { label: "effect size", min: 2, max: 12, step: 1, value: Math.round(dz * 10), format: (v) => (v / 10).toFixed(1), on: (v) => { dz = v / 10; draw(); } });
  return { aspect: card ? 0.625 : (w) => (w < 560 ? 0.72 : 0.5), render(w, h) { parts = { w, h, pad: card ? 10 : 28 }; draw(); } };
});

/** An action potential beside a postsynaptic potential, on the same clock: a millisecond against tens of milliseconds. */
fig("potentials", (figure, svg, d) => ({
  aspect: 0.5,
  render(w, h) {
    const plain = level() === "ms";
    const pad = 28, x0 = pad + 40, pw = w - x0 - pad, y0 = pad + 10, ph = h - y0 - pad - 30;
    const ms = 60;
    const X = (t) => x0 + (t / ms) * pw;
    const rest = y0 + ph * 0.7, mv = (v) => rest - ((v + 70) / 110) * ph * 0.95;
    for (const [v, lab] of [[-70, "−70 mV"], [0, "0"], [30, "+30"]]) { svg.append(line(x0, mv(v), x0 + pw, mv(v), "rule2")); svg.append(tx(x0 - 6, mv(v) + 4, lab, "", { "text-anchor": "end" })); }
    // The action potential: a spike of about a millisecond at t = 5 ms.
    const ap = [];
    for (let t = 0; t <= ms; t += 0.05) { const dt = t - 5; let v = -70; if (dt > 0 && dt < 1.2) v = -70 + 100 * Math.sin((dt / 1.2) * Math.PI) ** 1.3; else if (dt >= 1.2 && dt < 4) v = -70 - 8 * Math.exp(-(dt - 1.2) / 1.2); ap.push([X(t), mv(v)]); }
    svg.append(poly(ap, "signal", { "stroke-width": 1.8 }));
    // The postsynaptic potential: a small bump that lasts tens of milliseconds, starting at 20 ms.
    const psp = [];
    for (let t = 0; t <= ms; t += 0.2) { const dt = t - 20; const v = -70 + (dt > 0 ? 12 * (dt / 6) * Math.exp(1 - dt / 6) : 0); psp.push([X(t), mv(v)]); }
    svg.append(poly(psp, "ink", { "stroke-width": 1.8 }));
    lines(plain ? "one pulse, a thousandth of a second" : "action potential, about 1 ms", w - (X(5) + 36) - 8).forEach((l, k) => svg.append(tag(X(5) + 36, mv(10) + k * 14, l, "on", "start")));
    lines(plain ? "the slower change in the next neuron" : "postsynaptic potential, tens of ms", w - X(26) - 8).forEach((l, k, all) => svg.append(tag(X(26), mv(-50) - (all.length - 1 - k) * 14, l, "t2", "start")));
    for (const t of [0, 10, 20, 30, 40, 50, 60]) { svg.append(line(X(t), y0 + ph, X(t), y0 + ph + 5, "muted")); svg.append(tag(X(t), y0 + ph + 18, `${t}`, "")); }
    svg.append(tx(x0 + pw, y0 + ph + 32, "milliseconds", "", { "text-anchor": "end" }));
  },
}));

/** A patch of active cortex as a current dipole in a cross-section of the head, and the potential it leaves on the scalp, smeared by the skull. */
fig("dipole", (figure, svg, d) => ({
  aspect: (w) => (w < 560 ? 0.8 : 0.6),
  render(w, h) {
    const cx = w / 2, cy = h * 0.88, R = Math.min(w * 0.34, h * 0.5);
    const arc = (r, cls, extra = {}) => el("path", { d: `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`, class: cls, fill: "none", "stroke-width": 1.4, ...extra });
    svg.append(el("path", { d: `M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy}Z`, class: "fill-tile2" }));
    svg.append(el("path", { d: `M${cx - R * 0.86} ${cy} A${R * 0.86} ${R * 0.86} 0 0 1 ${cx + R * 0.86} ${cy}Z`, class: "fill-tile" }));
    svg.append(arc(R, "ink2"));
    svg.append(arc(R * 0.92, "muted"));
    svg.append(arc(R * 0.86, "muted"));
    svg.append(line(cx - R, cy, cx + R, cy, "rule"));
    svg.append(tag(cx + R * 0.98, cy - R * 0.1, "scalp", "t2", "start"));
    svg.append(tag(cx + R * 0.9, cy - R * 0.36, "skull", "t2", "start"));
    svg.append(tag(cx + R * 0.62, cy - R * 0.62, "cortex", "t2", "start"));
    // The dipole, a little off the midline, pointing out through the cortex.
    const a = -1.25, dx = cx + Math.cos(a) * R * 0.74, dy = cy + Math.sin(a) * R * 0.74;
    svg.append(arrow(dx - Math.cos(a) * 14, dy - Math.sin(a) * 14, dx + Math.cos(a) * 14, dy + Math.sin(a) * 14, "signal", { "stroke-width": 2.2 }));
    lines("a patch of cortex in step", R * 1.3).forEach((l, k) => svg.append(tag(cx - R * 0.08, dy + 40 + k * 14, l, "on")));
    // Field lines, loops from the dipole's head to its tail, spreading through the head.
    for (const k of [0.3, 0.5, 0.7]) svg.append(el("path", { d: `M${f1(dx + Math.cos(a) * 14)} ${f1(dy + Math.sin(a) * 14)} C${f1(dx + Math.cos(a - 1.2) * R * k)} ${f1(dy + Math.sin(a - 1.2) * R * k)} ${f1(dx + Math.cos(a + 1.2) * R * k)} ${f1(dy + Math.sin(a + 1.2) * R * k)} ${f1(dx - Math.cos(a) * 14)} ${f1(dy - Math.sin(a) * 14)}`, class: "faint", fill: "none", "stroke-width": 1 }));
    // The potential along the scalp, as a curve above the head: a smooth, wide bump over the source.
    const top = cy - R - 16;
    const pts = [];
    for (let i = 0; i <= 120; i++) { const ang = -Math.PI + (i / 120) * Math.PI; const dAng = ang - a; const v = Math.exp(-(dAng * dAng) / (2 * 0.28 * 0.28)); pts.push([cx + Math.cos(ang) * (R + 14 + v * 36), cy + Math.sin(ang) * (R + 14 + v * 36)]); }
    svg.append(poly(pts, "signal", { "stroke-width": 1.6 }));
    lines("the potential on the scalp, spread over centimeters", w - 16).forEach((l, k) => svg.append(tag(cx, Math.max(12, top - 36) + k * 14, l, "on")));
  },
}));
