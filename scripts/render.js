// The profile picture: one SVG, six screens, a thousand dots. Served live by api/field.js so the clock is
// set the moment the page loads; `node scripts/render.js` writes a snapshot to out/ for local preview.
// Scenes: field + name · globe (real coastlines) · contribution calendar · commits by hour · clock · T.
// Live data when reachable (contribution calendar, push events); seeded stand-ins otherwise.
// No dependencies. Node 20+.
const fs = require('fs');
const path = require('path');

// ---------- settings ----------
const LOGIN = 'Nils-Kelley';
const NAME = 'Nils Kelley';
const TAGLINE = 'Founder. Full-stack. Ships every day.';
const CITY = 'Seattle';
const CITY_CAPTION = 'Seattle, WA.';
const CITY_LAT = 47.61, CITY_LON = -122.33;
const TZ = 'America/Los_Angeles';
const DOG_CAPTION = "That's my dog, T.";
const OUT = path.join(__dirname, '..', 'out');
const DATA = path.join(__dirname, '..', 'data');

const SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
const themes = {
  dark:  { bg: '#0d1117', fg: '#e6e1d6', mute: '#8b949e', dot: '#e6e1d6', accent: '#d9a05b' },
  light: { bg: '#ffffff', fg: '#1f2328', mute: '#656d76', dot: '#1f2328', accent: '#b9772a' },
};
const W = 880, H = 340, HOLD = 5, TRAVEL = 1.8;
const f1 = n => +n.toFixed(1), f2 = n => +n.toFixed(2), f4 = n => +n.toFixed(4);
const EASE = '.45 0 .15 1', LIN = '0 0 1 1', SINE = '.37 0 .63 1';
const AMB = { o: .05, r: 1.5 };

// ---------- data: live with fallbacks ----------
async function getJSON(url, headers = {}) {
  const r = await fetch(url, { headers: { 'user-agent': LOGIN + '-profile-render', ...headers } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function getText(url) {
  const r = await fetch(url, { headers: { 'user-agent': LOGIN + '-profile-render' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

// 52 weeks x 7 days of levels 0..4 (column-major, Sunday first), the year's total, and the current streak.
// With PROFILE_TOKEN (a personal token of LOGIN) the GraphQL calendar includes private contributions with exact counts.
// Without it, the public contributions page is scraped (levels only; private contributions appear there only if the
// profile setting "include private contributions" is on).
function streakFrom(days) { // days: [{date:'YYYY-MM-DD', on:boolean}] ascending; counts back from today or yesterday
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  let i = days.length - 1; while (i >= 0 && days[i].date > today) i--;
  if (i >= 0 && !days[i].on) i--; // today may still be empty; start from yesterday
  let n = 0; while (i >= 0 && days[i].on) { n++; i--; }
  return n;
}
function weeksFrom(days) { // ascending days → 52 x 7 levels, Sunday first
  const weeks = []; let cur = null, curKey = null;
  for (const d of days) {
    const dt = new Date(d.date + 'T00:00:00Z'); const sunday = new Date(dt); sunday.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
    const key = sunday.toISOString().slice(0, 10);
    if (key !== curKey) { cur = [0, 0, 0, 0, 0, 0, 0]; weeks.push(cur); curKey = key; }
    cur[dt.getUTCDay()] = d.level;
  }
  return weeks.slice(-52);
}
async function contributions() {
  const pat = process.env.PROFILE_TOKEN;
  if (pat) {
    try {
      const q = `query($login:String!){ user(login:$login){ contributionsCollection{ contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount contributionLevel } } } } } }`;
      const r = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { authorization: `bearer ${pat}`, 'content-type': 'application/json', 'user-agent': LOGIN }, body: JSON.stringify({ query: q, variables: { login: LOGIN } }) });
      const j = await r.json();
      if (!j.data?.user) throw new Error(JSON.stringify(j.errors || j).slice(0, 200));
      const cal = j.data.user.contributionsCollection.contributionCalendar;
      const L = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
      const days = cal.weeks.flatMap(w => w.contributionDays.map(x => ({ date: x.date, level: L[x.contributionLevel] ?? 0, on: x.contributionCount > 0 }))).sort((a, b) => a.date < b.date ? -1 : 1);
      return { weeks: weeksFrom(days), total: cal.totalContributions, streak: streakFrom(days), source: 'graphql' };
    } catch (e) { console.warn('graphql failed:', e.message); }
  }
  try {
    const html = await getText(`https://github.com/users/${LOGIN}/contributions`);
    const days = [...html.matchAll(/data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="(\d)"/g)].map(m => ({ date: m[1], level: +m[2], on: +m[2] > 0 }));
    if (days.length < 300) throw new Error('too few days parsed');
    days.sort((a, b) => a.date < b.date ? -1 : 1);
    const totalM = html.replace(/,/g, '').match(/([\d]+)\s+contributions?\s+in\s+the\s+last\s+year/i);
    return { weeks: weeksFrom(days), total: totalM ? +totalM[1] : null, streak: streakFrom(days), source: 'html' };
  } catch (e) { console.warn('contribution scrape failed:', e.message); }
  // seeded stand-in
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const weeks = []; let total = 0;
  for (let w = 0; w < 52; w++) { const wk = []; for (let d = 0; d < 7; d++) { const we = d === 0 || d === 6, u = rnd(); const l = we ? (u < .5 ? 0 : u < .8 ? 1 : 2) : (u < .1 ? 0 : u < .35 ? 1 : u < .65 ? 2 : u < .88 ? 3 : 4); total += [0, 2, 5, 9, 14][l]; wk.push(l); } weeks.push(wk); }
  return { weeks, total, streak: 0, source: 'seeded' };
}

// commits per hour of day (local), from recent public push events
async function commitsByHour() {
  try {
    // PROFILE_TOKEN (a personal token belonging to LOGIN) also sees pushes to private repos; GITHUB_TOKEN only public ones
    const pat = process.env.PROFILE_TOKEN;
    const headers = pat ? { authorization: `bearer ${pat}` } : process.env.GITHUB_TOKEN ? { authorization: `bearer ${process.env.GITHUB_TOKEN}` } : {};
    const feed = pat ? `https://api.github.com/users/${LOGIN}/events` : `https://api.github.com/users/${LOGIN}/events/public`;
    const counts = new Array(24).fill(0); let pushes = 0, lastPush = null;
    for (let page = 1; page <= 3; page++) {
      const ev = await getJSON(`${feed}?per_page=100&page=${page}`, headers);
      for (const e of ev) if (e.type === 'PushEvent') {
        const at = new Date(e.created_at);
        if (!lastPush || at > lastPush) lastPush = at;
        const hour = +at.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }) % 24;
        counts[hour] += Math.max(1, e.payload?.size || 1); pushes++;
      }
      if (ev.length < 100) break;
    }
    if (pushes < 10) throw new Error(`too few pushes to draw (${pushes})`);
    return { counts, source: 'events', pushes, lastPush: lastPush ? lastPush.toISOString() : null };
  } catch (e) { console.warn('events failed:', e.message); }
  return { counts: [6, 3, 2, 1, 1, 1, 2, 4, 9, 14, 16, 15, 12, 13, 15, 16, 17, 14, 10, 12, 16, 20, 22, 14], source: 'seeded' };
}

// ---------- geometry ----------
const topo = JSON.parse(fs.readFileSync(path.join(DATA, 'land-110m.json'), 'utf8'));
const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
const arcs = topo.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
const rings = [];
for (const g of topo.objects.land.geometries) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
  for (const poly of polys) for (const ring of poly) { let pts = []; for (const ai of ring) { const a = ai < 0 ? arcs[~ai].slice().reverse() : arcs[ai]; pts = pts.concat(pts.length ? a.slice(1) : a); } rings.push(pts); }
}
function isLand(lon, lat) { let inside = false; for (const r of rings) { for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside; } } return inside; }

const cols = 50, rows = 20, spx = W / cols, spy = 12.6, ox = spx / 2, oy = 12;
const dots = []; for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) dots.push({ x: f1(ox + c * spx), y: f1(oy + r * spy) });
const N = dots.length;

// globe
const CX = 440, CY = 168, R = 150, TILT = 22 * Math.PI / 180, ROT_PERIOD = 20; let ROT_OFFSET = 0; const rot = t => 2 * Math.PI * t / ROT_PERIOD + ROT_OFFSET;
const golden = Math.PI * (3 - Math.sqrt(5)); const NS = 2600, samples = [];
for (let i = 0; i < NS; i++) { const yy = 1 - (i / (NS - 1)) * 2, th = golden * i; const lat = Math.asin(yy) * 180 / Math.PI, lon = ((th * 180 / Math.PI) % 360 + 540) % 360 - 180; samples.push({ lat, lon, land: isLand(lon, lat) }); }
const landS = samples.filter(p => p.land), oceanS = samples.filter(p => !p.land);
const sphere = landS.slice(0, N); { let k = 0; const step = oceanS.length / Math.max(1, N - sphere.length); while (sphere.length < N) { sphere.push(oceanS[Math.floor(k * step) % oceanS.length]); k++; } }
function project(lat, lon, theta) { const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180 + theta; const x = Math.cos(phi) * Math.sin(lam), y = Math.sin(phi), z = Math.cos(phi) * Math.cos(lam); const y2 = y * Math.cos(TILT) - z * Math.sin(TILT), z2 = y * Math.sin(TILT) + z * Math.cos(TILT); return { X: CX + R * x, Y: CY - R * y2, Z: z2 }; }

// T
const dogData = JSON.parse(fs.readFileSync(path.join(DATA, 'dog-dots.json'), 'utf8'));
const DSP = 6, DX0 = 440 - (dogData.cols - 1) * DSP / 2, DY0 = 12;
const dog = dogData.pts.map(p => ({ x: f1(DX0 + p.c * DSP), y: f1(DY0 + p.r * DSP), k: p.k, t: p.t }));
let THEME = 'dark';
const dogStyle = p => THEME === 'dark'
  ? (p.k === 'hi' ? { o: 1, r: f2(1.9 + 1.2 * p.t) } : { o: .72, r: f2(0.75 + 0.9 * p.t) })
  : (p.k === 'hi' ? { o: .35, r: 1.0 } : { o: f2(.85 - .3 * p.t), r: f2(1.8 - 0.6 * p.t) });

function assignByX(targets, key, centerY) {
  const pick = dots.map((d, i) => ({ i, d: Math.abs(d.y - centerY) })).sort((a, b) => a.d - b.d).map(o => o.i).slice(0, targets.length);
  pick.sort((a, b) => dots[a].x - dots[b].x || dots[a].y - dots[b].y);
  const tg = targets.slice().sort((a, b) => a.x - b.x || b.y - a.y);
  pick.forEach((di, q) => { dots[di][key] = tg[q]; });
}

// Renders both themes for the given instant. Pure apart from the shared dot table; safe to call per request.
function render(now, contrib, hoursData) {
  const pt = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const h = pt.getHours(), m = pt.getMinutes(), s = pt.getSeconds();
  const hh = String(h).padStart(2, '0'), mm = String(m).padStart(2, '0');
  const day = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: TZ });

  // calendar targets
  const weeks = 52, days = 7, csp = 15, cx0 = (W - (weeks - 1) * csp) / 2, cy0 = 86;
  const LO = [.08, .42, .66, .85, 1], LR = [1.6, 2.5, 2.9, 3.3, 3.6];
  const cal = [];
  for (let w = 0; w < weeks; w++) for (let d = 0; d < days; d++) { const lvl = contrib.weeks[w]?.[d] ?? 0; cal.push({ x: f1(cx0 + w * csp), y: f1(cy0 + d * csp), o: LO[lvl], r: LR[lvl] }); }

  // hours targets: columns of dots, tallest column 22 dots.
  // With push events: 24 columns, one per hour of the day. Without them (private repos, no PROFILE_TOKEN):
  // 7 columns, one per weekday, summed from the real contribution calendar, so nothing on the page is invented.
  const byWeekday = hoursData.source === 'seeded';
  const counts = byWeekday ? [0, 1, 2, 3, 4, 5, 6].map(d => contrib.weeks.reduce((a, w) => a + (w[d] || 0), 0)) : hoursData.counts;
  const hsp = byWeekday ? 56 : 28, hx0 = byWeekday ? 440 - 3 * hsp : 112, hbase = 236, hstep = 9.4, maxC = Math.max(1, ...counts);
  const hours = [];
  counts.forEach((c, col) => { const n = Math.round(c / maxC * 22); for (let i = 0; i < n; i++) hours.push({ x: f1(hx0 + col * hsp), y: f1(hbase - i * hstep), o: i === n - 1 ? .95 : .6, r: 2.4 }); });
  const peak = counts.indexOf(maxC);
  const hourLabel = hr => hr === 0 ? 'midnight' : hr === 12 ? 'noon' : hr < 12 ? hr + ' am' : (hr - 12) + ' pm';
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hoursTicks = byWeekday ? dayNames.map((n, i) => [i, n.slice(0, 3)]) : [0, 6, 12, 18].map(hr => [hr, hourLabel(hr)]);
  const even = Math.min(...counts) / maxC > 0.8;
  const hoursCaption = byWeekday
    ? (even ? 'When the work lands. Every day of the week, about the same.' : `When the work lands. Most of it on ${dayNames[peak]}s.`)
    : `When the commits land. Most of them around ${hourLabel(peak)}.`;

  // clock targets
  const KX = 440, KY = 160, KR = 118;
  const hd = ((h % 12) * 30 + m * 0.5) * Math.PI / 180, md = m * 6 * Math.PI / 180, sd = s * 6;
  const clock = [];
  for (let i = 0; i < 60; i++) { const a = i * 6 * Math.PI / 180, hour = i % 5 === 0; clock.push({ x: f1(KX + Math.sin(a) * KR), y: f1(KY - Math.cos(a) * KR), o: hour ? .95 : .4, r: hour ? 3 : 1.7 }); }
  for (let i = 0; i < 12; i++) { const a = i * 30 * Math.PI / 180; clock.push({ x: f1(KX + Math.sin(a) * (KR - 14)), y: f1(KY - Math.cos(a) * (KR - 14)), o: .55, r: 1.7 }); }
  for (let q = 0; q < 7; q++) { const rr = 12 + q * 9; clock.push({ x: f1(KX + Math.sin(hd) * rr), y: f1(KY - Math.cos(hd) * rr), o: .95, r: 2.6 }); }
  for (let q = 0; q < 11; q++) { const rr = 12 + q * 9; clock.push({ x: f1(KX + Math.sin(md) * rr), y: f1(KY - Math.cos(md) * rr), o: .95, r: 2.2 }); }

  // assignments
  for (const d of dots) { delete d.cal; delete d.hours; delete d.clock; delete d.dog; }
  const sph = sphere.map((sp, i) => ({ i, ...project(sp.lat, sp.lon, 0) })).sort((a, b) => a.X - b.X || a.Y - b.Y);
  const fld = dots.map((d, i) => ({ i, X: d.x, Y: d.y })).sort((a, b) => a.X - b.X || a.Y - b.Y);
  fld.forEach((fd, q) => { dots[fd.i].sphere = sph[q].i; });
  assignByX(cal, 'cal', cy0 + 45);
  assignByX(hours, 'hours', hbase - 60);
  assignByX(dog, 'dog', 160);
  const byDist = dots.map((d, i) => ({ i, d: Math.hypot(d.x - KX, d.y - KY) })).sort((a, b) => a.d - b.d).map(o => o.i);
  const ringIdx = byDist.slice(0, 60).sort((a, b) => Math.atan2(dots[a].y - KY, dots[a].x - KX) - Math.atan2(dots[b].y - KY, dots[b].x - KX));
  const ringT = clock.slice(0, 60).map(c => ({ c, ang: Math.atan2(c.y - KY, c.x - KX) })).sort((a, b) => a.ang - b.ang).map(o => o.c);
  ringIdx.forEach((di, q) => { dots[di].clock = ringT[q]; });
  byDist.slice(60, clock.length).forEach((di, q) => { dots[di].clock = clock[60 + q]; });

  // scenes
  const scenes = [
    { name: 'field', hold: 3, frames: (d, t0) => {
      const HOLD = 3, dist = Math.hypot(d.x - 70, d.y - 280), delay = (dist / 900) * HOLD * 1.6;
      const p = tt => 0.5 - 0.5 * Math.cos(2 * Math.PI * (tt + delay) / HOLD);
      const fr = tt => ({ t: t0 + tt, x: d.x, y: d.y, o: f2(.10 + .80 * p(tt)), r: f2(1.5 + 1.5 * p(tt)), spline: SINE });
      const dm = ((delay % HOLD) + HOLD) % HOLD, tMax = ((HOLD / 2 - dm) % HOLD + HOLD) % HOLD, tMin = ((-dm) % HOLD + HOLD) % HOLD;
      const ext = [tMax, tMin].filter(v => v > 0.3 && v < HOLD - 0.3).sort((a, b) => a - b);
      return [fr(0), ...ext.map(fr), fr(HOLD)]; } },
    { name: 'globe', hold: 8, frames: (d, t0) => { const sp = sphere[d.sphere], out = [];
      for (let tt = 0; tt <= 8 + 1e-9; tt += 1) { const P = project(sp.lat, sp.lon, rot(t0 + tt)), z = Math.max(0, P.Z);
        out.push({ t: t0 + tt, x: f1(P.X), y: f1(P.Y), o: f2(sp.land ? (.14 + .84 * z * z) : (.03 + .10 * z)), r: f2(sp.land ? 1.2 + 1.9 * z : 1.0 + 0.8 * z), spline: LIN }); }
      return out; } },
    { name: 'calendar', frames: (d, t0) => { const c = d.cal || { x: d.x, y: d.y, ...AMB }; return [{ t: t0, ...c }, { t: t0 + HOLD, ...c }]; } },
    { name: 'hours', frames: (d, t0) => { const c = d.hours || { x: d.x, y: d.y, ...AMB }; return [{ t: t0, ...c }, { t: t0 + HOLD, ...c }]; } },
    { name: 'clock', frames: (d, t0) => { const c = d.clock || { x: d.x, y: d.y, ...AMB }; return [{ t: t0, ...c }, { t: t0 + HOLD, ...c }]; } },
    { name: 'dog', hold: 6, frames: (d, t0) => { const c = d.dog ? { x: d.dog.x, y: d.dog.y, ...dogStyle(d.dog) } : { x: d.x, y: d.y, ...AMB }; return [{ t: t0, ...c }, { t: t0 + 6, ...c }]; } },
  ];
  const holdOf = k => scenes[k].hold || HOLD;
  const starts = []; { let acc = 0; scenes.forEach((sc, k) => { starts.push(acc); acc += holdOf(k) + TRAVEL; }); }
  const DUR = starts[starts.length - 1] + holdOf(scenes.length - 1) + TRAVEL;
  const sceneStart = k => starts[k], sceneEnd = k => starts[k] + holdOf(k);
  const T = sec => f4(sec / DUR);
  ROT_OFFSET = (-CITY_LON * Math.PI / 180) - 2 * Math.PI * (sceneStart(1) + holdOf(1) / 2) / ROT_PERIOD; // the city faces the viewer mid-scene

  function dotSVG(d) {
    const stag = 0.5 * (d.x / W);
    const K = [];
    scenes.forEach((sc, k) => { const fr = sc.frames(d, sceneStart(k)); fr.forEach((f, i) => { const t = f.t + ((i === 0 && k > 0) || (i === fr.length - 1) ? stag : 0); K.push({ ...f, t, spline: i === fr.length - 1 ? EASE : (f.spline || LIN) }); }); });
    const first = K[0]; K.push({ ...first, t: DUR });
    for (let i = 1; i < K.length; i++) if (K[i].t <= K[i - 1].t) K[i].t = K[i - 1].t + 0.01;
    K[K.length - 1].t = DUR;
    const kt = K.map(k => T(k.t)); kt[0] = 0; kt[kt.length - 1] = 1;
    const ks = K.slice(0, -1).map(k => k.spline).join(';');
    return `<g transform="translate(${first.x},${first.y})"><animateTransform attributeName="transform" type="translate" values="${K.map(k => k.x + ',' + k.y).join(';')}" keyTimes="${kt.join(';')}" calcMode="spline" keySplines="${ks}" dur="${DUR}s" repeatCount="indefinite"/>`
      + `<circle class="d" r="${first.r}" opacity="${first.o}"><animate attributeName="opacity" values="${K.map(k => k.o).join(';')}" keyTimes="${kt.join(';')}" dur="${DUR}s" repeatCount="indefinite"/><animate attributeName="r" values="${K.map(k => k.r).join(';')}" keyTimes="${kt.join(';')}" dur="${DUR}s" repeatCount="indefinite"/></circle></g>`;
  }
  function fade(k) {
    const last = k === scenes.length - 1;
    const a = T(sceneStart(k) - TRAVEL * 0.5), b = T(sceneStart(k) + TRAVEL * 0.4), c = T(sceneEnd(k) + (last ? 0 : TRAVEL * 0.2)), e = T(sceneEnd(k) + (last ? TRAVEL * 0.3 : TRAVEL * 0.9));
    if (k === 0) return `<animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;${c};${e};${T(DUR - TRAVEL * 0.6)};1" dur="${DUR}s" repeatCount="indefinite"/>`;
    return `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${a};${b};${c};${e};1" dur="${DUR}s" repeatCount="indefinite"/>`;
  }
  function marker(t) {
    const t0 = sceneStart(1), pts = []; for (let tt = 0; tt <= holdOf(1) + 1e-9; tt += 0.5) { const P = project(CITY_LAT, CITY_LON, rot(t0 + tt)); pts.push({ t: t0 + tt, X: f1(P.X), Y: f1(P.Y), Z: P.Z }); }
    const kt = ['0', T(t0 - 0.01), ...pts.map(p => T(p.t)), T(sceneEnd(1) + 0.01), '1'].join(';');
    const tr = [`${pts[0].X},${pts[0].Y}`, `${pts[0].X},${pts[0].Y}`, ...pts.map(p => `${p.X},${p.Y}`), `${pts.at(-1).X},${pts.at(-1).Y}`, `${pts[0].X},${pts[0].Y}`].join(';');
    const op = ['0', '0', ...pts.map(p => p.Z > 0.08 ? 1 : 0), '0', '0'].join(';');
    return `<g opacity="0"><animate attributeName="opacity" values="${op}" keyTimes="${kt}" dur="${DUR}s" repeatCount="indefinite"/><g><animateTransform attributeName="transform" type="translate" values="${tr}" keyTimes="${kt}" dur="${DUR}s" repeatCount="indefinite"/><circle r="3.4" fill="${t.accent}"/><circle r="3" fill="none" stroke="${t.accent}" stroke-width="1.2"><animate attributeName="r" values="3;18" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0" dur="2.4s" repeatCount="indefinite"/></circle></g></g>`;
  }
  const streakLine = contrib.streak >= 3 ? ` ${contrib.streak} days in a row.` : '';
  const totalLine = (contrib.total != null ? `${contrib.total.toLocaleString('en-US')} contributions in the last year.` : 'A year of contributions.') + streakLine;
  const ago = hoursData.lastPush ? Math.max(0, Math.round((now - new Date(hoursData.lastPush)) / 60000)) : null; // minutes
  const agoText = ago == null ? null : ago < 1 ? 'Last commit just now.' : ago < 60 ? `Last commit ${ago} minute${ago === 1 ? '' : 's'} ago.` : ago < 180 ? `Last commit ${Math.round(ago / 60)} hour${Math.round(ago / 60) === 1 ? '' : 's'} ago.` : null;
  const statusLine = agoText || (h >= 8 ? 'Probably locked in.' : 'Asleep.');

  function build(t) {
    const body = dots.map(dotSVG).join('');
    const hl = hoursTicks.map(([col, label]) => `<text class="tick" x="${f1(hx0 + col * hsp)}" y="${hbase + 22}" text-anchor="middle">${label}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${NAME}">
<style>
  .d{fill:${t.dot}}
  .name{font:600 44px/1 ${SANS};fill:${t.fg};letter-spacing:-.5px}
  .line{font:400 16px/1 ${SANS};fill:${t.mute}}
  .cap{font:400 15px/1 ${SANS};fill:${t.mute}}
  .tick{font:400 12px/1 ${SANS};fill:${t.mute}}
</style>
<rect width="${W}" height="${H}" fill="${t.bg}"/>
<defs>
  <filter id="b" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="26"/></filter>
  <mask id="m"><rect width="${W}" height="${H}" fill="#fff"/><rect x="24" y="222" width="430" height="110" fill="#000" filter="url(#b)">${fade(0)}</rect></mask>
</defs>
<g mask="url(#m)">${body}</g>
<g opacity="1">${fade(0)}<text class="name" x="40" y="272">${NAME}</text><text class="line" x="40" y="304">${TAGLINE}</text></g>
<g opacity="0">${fade(1)}<text class="cap" x="40" y="316">${CITY_CAPTION}</text></g>
${marker(t)}
<g opacity="0">${fade(2)}<text class="cap" x="${cx0}" y="220">${totalLine}</text></g>
<g opacity="0">${fade(3)}${hl}<text class="cap" x="${byWeekday ? 40 : hx0}" y="${byWeekday ? 316 : hbase + 52}">${hoursCaption}</text></g>
<g opacity="0">${fade(4)}<text class="cap" x="40" y="316">${hh}:${mm} in ${CITY}, ${day}. ${statusLine}</text>
  <circle cx="${KX}" cy="${KY - 108}" r="2.8" fill="${t.accent}"><animateTransform attributeName="transform" type="rotate" from="${sd} ${KX} ${KY}" to="${sd + 360} ${KX} ${KY}" dur="60s" repeatCount="indefinite"/></circle>
  <circle cx="${KX}" cy="${KY}" r="2.8" fill="${t.accent}"/></g>
<g opacity="0">${fade(5)}<text class="cap" x="40" y="316">${DOG_CAPTION}</text></g>
</svg>`;
  }

  const out = {};
  for (const [k, t] of Object.entries(themes)) { THEME = k; out[k] = build(t); }
  out.loop = DUR;
  return out;
}

module.exports = { render, contributions, commitsByHour, LOGIN, TZ };

// CLI: node scripts/render.js  → out/field-dark.svg + out/field-light.svg (a snapshot for local preview)
if (require.main === module) {
  (async () => {
    const [contrib, hoursData] = await Promise.all([contributions(), commitsByHour()]);
    console.log('calendar:', contrib.source, 'total', contrib.total, '| hours:', hoursData.source === 'seeded' ? 'no push events, drawing weekdays from the calendar' : `${hoursData.pushes} pushes`);
    const now = new Date(), out = render(now, contrib, hoursData);
    fs.mkdirSync(OUT, { recursive: true });
    for (const k of ['dark', 'light']) { fs.writeFileSync(path.join(OUT, `field-${k}.svg`), out[k]); console.log(`out/field-${k}.svg`, (out[k].length / 1024).toFixed(0) + ' KB'); }
    console.log(`loop ${out.loop}s, rendered ${now.toISOString()}`);
  })().catch(e => { console.error(e); process.exit(1); });
}
