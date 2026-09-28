const assert = require('node:assert/strict');
const test = require('node:test');
const { securityHeaders } = require('../src/util');

test('CSP allows the Cloudflare Web Analytics beacon without broadening other sources', () => {
  const headers = new Map();
  const res = {
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    removeHeader(name) { headers.delete(name.toLowerCase()); },
  };
  let nextCalled = false;

  securityHeaders({}, res, () => { nextCalled = true; });

  const directives = new Map(
    headers.get('content-security-policy').split('; ').map((directive) => {
      const [name, ...sources] = directive.split(' ');
      return [name, sources];
    })
  );

  assert.equal(nextCalled, true);
  assert.deepEqual(directives.get('script-src'), [
    "'self'", "'unsafe-inline'", 'https://static.cloudflareinsights.com',
  ]);
  assert.deepEqual(directives.get('default-src'), ["'self'"]);
  // Automatically injected Cloudflare beacons report to this site's /cdn-cgi/rum.
  assert.ok(directives.get('connect-src').includes("'self'"));
});
