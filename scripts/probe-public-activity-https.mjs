// Read-only diagnostic: fixed public origin, verified TLS, no credentials or uploads.
import https from 'node:https';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

const output = process.argv[2];
if (process.argv.length !== 3 || !isAbsolute(output ?? '')) {
  throw new Error('usage: probe-public-activity-https.mjs <absolute output JSON>');
}
function probe(path) {
  return new Promise(resolve => {
    const started = Date.now();
    const result = { url: `https://morii9961.top${path}`, httpCode: null, tlsVerified: false };
    let ended = false;
    const finish = fields => {
      if (ended) return;
      ended = true;
      clearTimeout(deadline);
      resolve({ ...result, ...fields, elapsedMs: Date.now() - started });
    };
    const request = https.get(result.url, { agent: false, rejectUnauthorized: true }, response => {
      result.httpCode = response.statusCode;
      result.contentType = response.headers['content-type'] ?? null;
      const digest = createHash('sha256');
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) {
          finish({ state: 'body_limit', bytes });
          request.destroy();
        } else digest.update(chunk);
      });
      response.on('end', () => finish({ state: 'http_observed', bytes, bodySha256: digest.digest('hex') }));
      response.on('error', error => finish({ state: 'response_failed', errorCode: error.code ?? 'unknown' }));
    });
    request.on('socket', socket => {
      socket.on('secureConnect', () => {
        result.tlsVerified = socket.authorized;
        result.protocol = socket.getProtocol();
      });
    });
    request.on('error', error => finish({ state: 'connection_failed', errorCode: error.code ?? 'unknown' }));
    const deadline = setTimeout(() => {
      finish({ state: 'deadline_exceeded' });
      request.destroy();
    }, 20000);
  });
}
const report = {
  schemaVersion: 1,
  scope: 'read_only_actual_hostname_https_node_verified_tls',
  observedAt: new Date().toISOString(),
  client: { node: process.version, openssl: process.versions.openssl },
  checks: await Promise.all(['/zh/', '/status-data/current.json'].map(probe)),
  limitations: ['No HTTP status is inferred when the TLS connection fails.', 'This reads public URLs only; it establishes no new producer publication, cutover or receiver deployment.'],
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
