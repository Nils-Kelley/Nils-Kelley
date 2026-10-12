// GET /dark.svg or /light.svg (see vercel.json): the profile picture rendered for this very moment.
// Live data is refreshed in memory once an hour; the SVG itself is cached per theme per minute.
const { render, contributions, commitsByHour } = require('../scripts/render.js');

let data = { at: 0, contrib: null, hours: null, loading: null };
const svgs = new Map(); // `${theme}:${HH:MM}` → svg

async function freshData() {
  const age = Date.now() - data.at;
  if (data.contrib && age < 60 * 60 * 1000) return data;
  if (!data.loading) data.loading = Promise.all([contributions(), commitsByHour()])
    .then(([contrib, hours]) => { data = { at: Date.now(), contrib, hours, loading: null }; svgs.clear(); return data; })
    .catch(e => { data.loading = null; if (!data.contrib) throw e; return data; });
  return data.contrib ? data : data.loading; // stale-while-revalidate once we have anything
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
