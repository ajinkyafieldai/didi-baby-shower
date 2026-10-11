import { feature } from 'topojson-client';
import land from 'world-atlas/land-110m.json' with { type: 'json' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const point = ([lon, lat]) => [(lon + 180) * 2, (90 - lat) * 2];
function worldMap(people) {
  const shape = feature(land, land.objects.land);
  const geometries = shape.type === 'FeatureCollection' ? shape.features.map(f => f.geometry) : [shape.geometry];
  const paths = geometries.flatMap(g => g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]).map(polygon =>
    polygon.map(ring => 'M' + ring.map(p => point(p).map(v => v.toFixed(2)).join(',')).join('L') + 'Z').join('')).join('');
  const pins = people.map((p, i) => {
    if (!Array.isArray(p.coords) || p.coords.length !== 2 || !p.coords.every(Number.isFinite) || Math.abs(p.coords[0]) > 180 || Math.abs(p.coords[1]) > 90) return '';
    const [x, y] = point(p.coords);
    return `<g><title>${escape(p.name)} — ${escape(p.city)}</title><circle cx="${x}" cy="${y}" r="8" fill="#a94762"/><text x="${x}" y="${y + 3}" text-anchor="middle" fill="white" font-size="9">${i + 1}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 720 360" role="img" aria-label="Family locations"><rect width="720" height="360" fill="#eaf2f4"/><path d="${paths}" fill="#d8d9cb" stroke="#fff" stroke-width=".4"/>${pins}</svg><small>Natural Earth land map · public domain</small>`;
}
function embedPhoto(blob) {
  return new Promise((resolve, reject) => {
    if (!blob || !/^image\/(jpeg|png|webp|gif)$/i.test(blob.type)) return resolve(null);
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
export async function createKeepsakeHtml(data, { loadPhoto = async () => null, photoDataUrl = embedPhoto, progress = () => {} } = {}) {
  const warnings = [...data.warnings];
  async function image(item) {
    if (!item.asset && !item.photoId) return '';
    try {
      const src = await photoDataUrl(await loadPhoto(item));
      if (!/^data:image\/(jpeg|png|webp|gif);base64,[a-zA-Z0-9+/=]+$/i.test(src || '')) throw new Error('Missing photo');
      return `<img src="${src}" alt="${escape(item.caption || item.name || 'Family photo')}">`;
    } catch { warnings.push(`Photo unavailable: ${item.caption || item.name || 'Family photo'}`); return '<p>Photo unavailable during export.</p>'; }
  }
  const meta = item => `<small>${escape(item.sender || item.name || 'Family')}${item.localOnly ? ' · saved on this device' : ''}</small>`;
  const text = value => `<p>${escape(value)}</p>`;
  async function section(title, items, content) {
    progress(title);
    const cards = [];
    for (const item of items) cards.push(`<article>${await content(item)}${meta(item)}</article>`);
    return `<section><h2>${title} (${items.length})</h2>${cards.join('') || '<p>No entries collected.</p>'}</section>`;
  }
  const sections = [];
  sections.push(await section('Notes', data.notes, item => text(item.message) + text(Object.entries(item.reactions || {}).map(([emoji, count]) => `${emoji} ${count}`).join(' '))));
  sections.push(await section('Family photos', data.photos, async item => await image(item) + text(item.caption)));
  sections.push(await section('Moments', data.moments, async item => `<h3>${escape([item.when, item.title || 'Memory'].filter(Boolean).join(" — "))}</h3>` + text(item.story || item.message || item.description) + await image(item)));
  sections.push(`<section><h2>Family map (${data.people.length})</h2>${worldMap(data.people)}<ol>${data.people.map(item => `<li>${escape(item.name)} — ${escape(item.city || 'Location not supplied')}</li>`).join('')}</ol></section>`);
  sections.push(await section('Recipes', data.recipes, async item => `<h3>${escape(item.name)}</h3>` + text(item.why) + text(item.recipe) + await image(item)));
  sections.push(await section('Sealed time capsules', data.capsules, item => `<h3>${escape(item.title || 'A message from the family')}</h3>` + text(`Open at age ${item.openAt}. Message remains sealed.`)));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escape(data.title)} — Family keepsake</title><style>body{margin:0;background:#fffaf7;color:#422f35;font:17px/1.6 system-ui,sans-serif}main{max-width:900px;margin:auto;padding:32px 20px}h1,h2{color:#a94762}section{margin:36px 0}article{padding:20px;border:1px solid #eadfdc;border-radius:16px;margin:16px 0;break-inside:avoid}p{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#786970}img{display:block;max-width:100%;max-height:700px;margin:auto;border-radius:10px}svg{width:100%;height:auto}li{overflow-wrap:anywhere}@media print{body{background:white}main{padding:0}section{break-before:auto}}</style></head><body><main><small>APSILA · FAMILY KEEPSAKE</small><h1>${escape(data.title)}</h1>${text(data.honoree)}${sections.join('')}${warnings.length ? `<section><h2>Export notes</h2><ul>${warnings.map(w => `<li>${escape(w)}</li>`).join('')}</ul></section>` : ''}</main></body></html>`;
  return { blob: new Blob([html], { type: 'text/html;charset=utf-8' }), warnings };
}
