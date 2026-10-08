// Only coarse location leaves the edge. Never return the visitor's IP address.
export async function onRequestGet({ request }) {
  const cf = request.cf || {};
  const coordinate = (value, limit) => {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= limit
      ? Math.round(number * 10) / 10 : null;
  };
  const longitude = coordinate(cf.longitude, 180);
  const latitude = coordinate(cf.latitude, 90);
  return new Response(JSON.stringify({
    city: typeof cf.city === 'string' ? cf.city.slice(0, 60) : '',
    country: typeof cf.country === 'string' ? cf.country.slice(0, 2) : '',
    coords: longitude !== null && latitude !== null ? [longitude, latitude] : null,
    source: 'cloudflare-ip'
  }), { headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store'
  }});
}
