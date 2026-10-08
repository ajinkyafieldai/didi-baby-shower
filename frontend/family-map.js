import * as L from './vendor/leaflet.js';

const maps = new WeakMap();

export function renderFamilyMap(element, people) {
  let state = maps.get(element);
  if (!state) {
    const map = L.map(element, { scrollWheelZoom: false, worldCopyJump: true, maxZoom: 12 }).setView([20, 20], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    const markers = L.layerGroup().addTo(map);
    state = { map, markers, signature: '' };
    maps.set(element, state);
    new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(element);
  }
  state.map.invalidateSize({ pan: false });
  const valid = people.filter(person => Array.isArray(person.coords) && person.coords.length === 2
    && person.coords.every(Number.isFinite) && Math.abs(person.coords[0]) <= 180 && Math.abs(person.coords[1]) <= 90);
  const signature = JSON.stringify(valid.map(({ name, city, coords }) => ({ name, city, coords })));
  if (signature === state.signature) return;
  state.signature = signature;
  state.markers.clearLayers();
  const groups = new Map();
  valid.forEach(person => {
    const key = person.coords.join(',');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(person);
  });
  const bounds = [];
  groups.forEach(group => {
    const [lon, lat] = group[0].coords;
    const label = document.createElement('div');
    group.forEach(person => {
      const line = document.createElement('p');
      line.textContent = `${person.name} · ${person.city || 'Approximate location'}`;
      label.append(line);
    });
    L.circleMarker([lat, lon], { radius: 8, color: '#fffaf2', weight: 2, fillColor: '#b95670', fillOpacity: 1 })
      .bindPopup(label).addTo(state.markers);
    bounds.push([lat, lon]);
  });
  if (bounds.length) state.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 5, animate: false });
}
