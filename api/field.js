// GET /dark.svg or /light.svg (see vercel.json): the profile picture rendered for this very moment.
// Live data is refreshed in memory once an hour; the SVG itself is cached per theme per minute.
const { render, contributions, commitsByHour } = require('../scripts/render.js');

let data = { calAt: 0, evAt: 0, contrib: null, hours: null };
let loading = null;
const svgs = new Map(); // `${theme}:${HH:MM}` → svg
const CAL_TTL = 60 * 60 * 1000, EV_TTL = 5 * 60 * 1000;

async function freshData() {
  const t = Date.now(), calStale = t - data.calAt > CAL_TTL, evStale = t - data.evAt > EV_TTL;
  if (!calStale && !evStale) return data;
  if (!loading) loading = (async () => {
    try {
      const [contrib, hours] = await Promise.all([calStale ? contributions() : data.contrib, evStale ? commitsByHour() : data.hours]);
      data = { calAt: calStale ? t : data.calAt, evAt: evStale ? t : data.evAt, contrib, hours };
      svgs.clear();
    } finally { loading = null; }
    return data;
  })();
  return data.contrib ? data : loading; // stale-while-revalidate once anything is loaded
}

module.exports = async (req, res) => {
  const theme = /light/.test(req.url || '') ? 'light' : 'dark';
  const now = new Date();
  const minute = now.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles' });
  const key = `${theme}:${minute}`;
  let svg = svgs.get(key);
  if (!svg) {
    const d = await freshData();
    const out = render(now, d.contrib, d.hours);
    svgs.set(`dark:${minute}`, out.dark); svgs.set(`light:${minute}`, out.light);
    for (const k of svgs.keys()) if (!k.endsWith(minute)) svgs.delete(k);
    svg = out[theme];
  }
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).send(svg);
};
