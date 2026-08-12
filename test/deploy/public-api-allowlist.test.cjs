/**
 * Public nginx allowlist: cloud-server is the only public data plane.
 * Lab Express (:3001) must not be proxied on the public edge.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const CONF_PATH = path.join(root, 'deploy/nginx/xiaohuang.conf');

function extractLocations(conf) {
  /** @type {Record<string, string>} */
  const bodies = {};
  const re = /location\s+(\S+)\s*\{/g;
  let m;
  while ((m = re.exec(conf))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < conf.length && depth > 0) {
      if (conf[i] === '{') depth += 1;
      else if (conf[i] === '}') depth -= 1;
      i += 1;
    }
    bodies[m[1]] = conf.slice(start, i - 1);
  }
  return bodies;
}

describe('public nginx API allowlist', () => {
  const conf = fs.readFileSync(CONF_PATH, 'utf8');
  const locs = extractLocations(conf);

  it('proxies /api/cloud/ to cloud-server :3000', () => {
    assert.ok(locs['/api/cloud/'], 'location /api/cloud/ must exist');
    assert.match(locs['/api/cloud/'], /proxy_pass\s+http:\/\/127\.0\.0\.1:3000\b/);
    assert.doesNotMatch(locs['/api/cloud/'], /3001/);
  });

  it('exposes /livez publicly via cloud-server', () => {
    assert.ok(locs['/livez'], 'location /livez must exist');
    assert.match(locs['/livez'], /proxy_pass\s+http:\/\/127\.0\.0\.1:3000\b/);
    assert.doesNotMatch(locs['/livez'], /deny\s+all/);
  });

  it('restricts /readyz to loopback (no public schema leak)', () => {
    assert.ok(locs['/readyz'], 'location /readyz must exist');
    assert.match(locs['/readyz'], /allow\s+127\.0\.0\.1\s*;/);
    assert.match(locs['/readyz'], /deny\s+all\s*;/);
    assert.match(locs['/readyz'], /proxy_pass\s+http:\/\/127\.0\.0\.1:3000\b/);
  });

  it('does not proxy a public catch-all /api/ to lab :3001', () => {
    assert.doesNotMatch(
      conf,
      /location\s+\/api\/\s*\{[^}]*proxy_pass\s+http:\/\/127\.0\.0\.1:3001/s,
      'public location /api/ must not proxy_pass to lab :3001',
    );
    const api = locs['/api/'];
    assert.ok(api, 'location /api/ must exist so unmatched /api/* do not fall through to SPA');
    assert.doesNotMatch(api, /proxy_pass/);
    assert.doesNotMatch(api, /3001/);
    assert.match(api, /return\s+40[14]\b/, 'unmatched public /api/* must 404 or 401');
  });

  it('keeps SPA location /', () => {
    assert.ok(locs['/'], 'location / must exist');
    assert.match(locs['/'], /try_files\s+\$uri\s+\$uri\/\s+\/index\.html/);
  });
});
