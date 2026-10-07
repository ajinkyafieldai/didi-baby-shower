export async function onRequestGet(context) {
  const cf = context.request.cf || {};

  const city = typeof cf.city === "string" ? cf.city.trim() : "";
  const region = typeof cf.region === "string" ? cf.region.trim() : "";
  const country = typeof cf.country === "string" ? cf.country.trim() : "";

  // Cloudflare's request metadata is IP-derived, not browser GPS. We expose
  // only city-level identity plus deliberately rounded coordinates so the
  // Family Map stays coarse and never requests precise device location.
  const latitude = Number(cf.latitude);
  const longitude = Number(cf.longitude);
  const coords = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? [Number(longitude.toFixed(1)), Number(latitude.toFixed(1))]
    : null;

  return Response.json(
    {
      city: city || null,
      region: region || null,
      country: country || null,
      coords
    },
    {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Vary": "CF-IPCountry"
      }
    }
  );
}
