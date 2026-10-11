import { jsPDF } from 'jspdf';
import { feature } from 'topojson-client';
import land from 'world-atlas/land-110m.json' with { type: 'json' };
import { quizQuestions } from './keepsake-extras.js';

const WIDTH = 794, HEIGHT = 1123, MARGIN = 62, BOTTOM = 1040;
const landFeatures = feature(land, land.objects.land);
const landGeometries = landFeatures.type === 'FeatureCollection'
  ? landFeatures.features.map(item => item.geometry) : [landFeatures.geometry];
const graphemes = text => typeof Intl.Segmenter === 'function'
  ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(item => item.segment)
  : Array.from(text);

export function wrapText(text, measure, maxWidth) {
  const lines = [];
  String(text ?? '').replace(/\r\n?/g, '\n').split('\n').forEach(paragraph => {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? line + ' ' + word : word;
      if (measure(candidate) <= maxWidth) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const char of graphemes(word)) {
        if (line && measure(line + char) > maxWidth) { lines.push(line); line = ''; }
        line += char;
      }
    }
    lines.push(line);
  });
  return lines;
}

async function decodePhoto(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally { URL.revokeObjectURL(url); }
}

export async function createKeepsakePdf(data, {
  createCanvas = () => document.createElement('canvas'),
  loadPhoto = async () => null, decodeImage = decodePhoto, progress = () => {}
} = {}) {
  const pdf = new jsPDF({ unit: 'px', format: [WIDTH, HEIGHT], hotfixes: ['px_scaling'], compress: true });
  pdf.setProperties({ title: `${data.title} - Family Keepsake`, subject: 'Notes, photos, moments, places and family recipes', creator: 'Apsila' });
  let canvas, ctx, y, page = 0;
  const warnings = [...data.warnings];
  const availableWidth = WIDTH - 2 * MARGIN;

  function startPage() {
    canvas = createCanvas();
    canvas.width = WIDTH * 2; canvas.height = HEIGHT * 2;
    ctx = canvas.getContext('2d'); ctx.scale(2, 2);
    ctx.fillStyle = '#fffaf7'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#a94762'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('APSILA  /  FAMILY KEEPSAKE', MARGIN, 43);
    y = 90;
  }
  function flushPage() {
    ctx.fillStyle = '#786970'; ctx.font = '12px sans-serif';
    ctx.fillText('A day to remember', MARGIN, HEIGHT - 38);
    ctx.textAlign = 'right'; ctx.fillText(String(page + 1), WIDTH - MARGIN, HEIGHT - 38); ctx.textAlign = 'left';
    if (page++) pdf.addPage([WIDTH, HEIGHT]);
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, WIDTH, HEIGHT);
    canvas.width = 1; canvas.height = 1; // Release the page's backing buffer.
  }
  function room(height) { if (y + height > BOTTOM) { flushPage(); startPage(); } }
  function text(value, { size = 17, bold = false, color = '#422f35', gap = 8 } = {}) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
    const lines = wrapText(value, line => ctx.measureText(line).width, availableWidth);
    const lineHeight = size * 1.5;
    for (const line of lines) {
      room(lineHeight);
      ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
      ctx.fillStyle = color; ctx.fillText(line, MARGIN, y + size);
      y += lineHeight;
    }
    y += gap;
  }
  function section(title, count, firstBlock = 70) {
    progress(title);
    room(95 + (count ? firstBlock : 0)); y += 15;
    ctx.strokeStyle = '#eadfdc'; ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(WIDTH - MARGIN, y); ctx.stroke(); y += 18;
    text(`${title} (${count})`, { size: 26, bold: true, color: '#a94762', gap: 16 });
    if (!count) text('No entries collected.', { color: '#786970' });
  }
  function meta(item) {
    const at = Number(item.at);
    const date = at > 0 ? new Date(at).toLocaleString() : '';
    text([item.sender ? `From ${item.sender}` : '', date, item.localOnly ? 'Saved on this device' : ''].filter(Boolean).join(' | '), { size: 13, color: '#786970', gap: 18 });
  }
  async function photo(item) {
    if (!item.photoId && !item.asset) return;
    try {
      const blob = await loadPhoto(item);
      if (!blob) throw new Error('Photo unavailable');
      const image = await decodeImage(blob);
      const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
      if (!iw || !ih) throw new Error('Invalid image');
      const height = Math.min(350, availableWidth * ih / iw), width = height * iw / ih;
      room(height + 90);
      ctx.drawImage(image, MARGIN + (availableWidth - width) / 2, y, width, height);
      y += height + 18;
    } catch {
      text('Photo unavailable in this export.', { size: 14, color: '#786970' });
      warnings.push(`Photo unavailable: ${item.caption || item.title || item.name || 'family photo'}`);
    }
  }
  startPage();
  text(data.title, { size: 38, bold: true, gap: 14 });
  text('Our family keepsake', { size: 25, color: '#a94762', gap: 12 });
  text(`Collected on ${new Date(data.exportedAt).toLocaleString()}`, { size: 14, color: '#786970' });
  text('Wishes, photographs, memories, family places and recipes - kept together, wherever life takes us.', { size: 19, gap: 22 });
  text('This PDF includes shared entries available at export time and entries saved on this device. Sealed messages remain sealed.', { size: 14, color: '#786970' });

  section('Wishes and notes', data.notes.length);
  for (const item of data.notes) {
    room(95);
    text(item.audience === 'didi' ? `For ${data.honoree || 'the honoree'}` : 'For the baby', { size: 16, bold: true });
    text(item.message || '');
    if (item.reactions) text(Object.entries(item.reactions).filter(([, n]) => Number(n) > 0).map(([emoji, n]) => `${emoji} ${n}`).join('  '), { size: 14 });
    meta(item);
  }
  section('Family photos', data.photos.length, 470);
  for (const item of data.photos) { room(470); text(item.caption || 'Family photo', { bold: true }); await photo(item); meta(item); }
  section('Moments and memories', data.moments.length, data.moments[0]?.photoId || data.moments[0]?.asset ? 620 : 130);
  for (const item of data.moments) {
    room(item.photoId || item.asset ? 620 : 130); text([item.when, item.title].filter(Boolean).join(' - '), { size: 20, bold: true });
    text(item.story || ''); await photo(item); meta(item);
  }
  section('Our family around the world', data.people.length, availableWidth / 2 + 65);
  if (data.people.length) {
    const mapHeight = availableWidth / 2;
    room(mapHeight + 40);
    const mapY = y;
    ctx.fillStyle = '#e8f1f4'; ctx.fillRect(MARGIN, mapY, availableWidth, mapHeight);
    const point = ([lon, lat]) => [MARGIN + (lon + 180) / 360 * availableWidth, mapY + (90 - lat) / 180 * mapHeight];
    const polygons = landGeometries.flatMap(geometry => geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates]);
    ctx.fillStyle = '#dfdbca';
    for (const polygon of polygons) {
      ctx.beginPath();
      for (const ring of polygon) ring.forEach((coords, i) => { const [x, yy] = point(coords); if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); });
      ctx.fill('evenodd');
    }
    data.people.forEach((person, i) => {
      if (!Array.isArray(person.coords) || person.coords.length !== 2 || !person.coords.every(Number.isFinite) || Math.abs(person.coords[0]) > 180 || Math.abs(person.coords[1]) > 90) return;
      const [x, yy] = point(person.coords);
      ctx.beginPath(); ctx.arc(x, yy, 7, 0, Math.PI * 2); ctx.fillStyle = '#a94762'; ctx.fill();
      ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#422f35'; ctx.fillText(String(i + 1), Math.min(x + 9, WIDTH - MARGIN - 18), Math.max(mapY + 13, yy - 7));
    });
    y += mapHeight + 12;
    text('Map: Natural Earth, public domain. Locations are approximate; the list below includes every person.', { size: 12, color: '#786970' });
    data.people.forEach((person, i) => {
      room(65); text(`${i + 1}. ${person.name || 'Family'} - ${person.city || 'Location unavailable'}`, { bold: true, gap: 2 });
      if (Array.isArray(person.coords) && person.coords.every(Number.isFinite)) text(`Longitude ${person.coords[0].toFixed(4)}, latitude ${person.coords[1].toFixed(4)}`, { size: 12, color: '#786970' });
    });
  }
  section('Family recipes', data.recipes.length, data.recipes[0]?.photoId || data.recipes[0]?.asset ? 570 : 130);
  for (const item of data.recipes) {
    room(item.photoId || item.asset ? 570 : 130); text(item.name || 'Family recipe', { size: 21, bold: true });
    if (item.why) text(item.why, { color: '#a94762' });
    await photo(item); text(item.recipe || ''); meta(item);
  }
  section('Sealed time capsules', data.capsules.length);
  for (const item of data.capsules) {
    room(95); text(item.title || 'A message from the family', { bold: true });
    text(`Open at age ${item.openAt || '18'}. Message remains sealed.`, { size: 15 }); meta(item);
  }
  const games = data.games || { names: [], quiz: [] };
  section('Baby-name poll', games.names.length);
  for (const item of games.names) {
    text(item.name, { bold: true });
    text(`${item.votes} votes | Suggested by ${item.sender}`, { size: 14 });
  }
  section('Didi quiz', games.quiz.length);
  for (const item of games.quiz) {
    text(item.sender, { size: 20, bold: true });
    quizQuestions.forEach((question, i) => text(`${question}: ${item.answers[i] || 'No answer'}`));
  }
  if (warnings.length) { section('Export notes', warnings.length); for (const warning of warnings) text(warning, { size: 14 }); }
  flushPage();
  return { blob: pdf.output('blob'), pages: page, warnings };
}
