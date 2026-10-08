import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/location.js';

const response = await onRequestGet({ request: { cf: {
  city: 'Mumbai', country: 'IN', longitude: '72.8777', latitude: '19.0760',
  postalCode: '400001', ip: '192.0.2.1'
} } });
assert.equal(response.headers.get('cache-control'), 'private, no-store');
assert.deepEqual(await response.json(), {
  city: 'Mumbai', country: 'IN', coords: [72.9, 19.1], source: 'cloudflare-ip'
});
for (const cf of [undefined, {}, { longitude: '', latitude: '' }, { longitude: '181', latitude: '12' }, { longitude: 'NaN', latitude: '91' }]) {
  assert.equal((await (await onRequestGet({ request: { cf } })).json()).coords, null);
}
assert.deepEqual((await (await onRequestGet({ request: { cf: { longitude: '0', latitude: '0' } } })).json()).coords, [0, 0]);
console.log('Verified coarse rounding, zero coordinates, invalid and absent location, privacy fields, and no shared caching.');
