/**
 * CI entry: root `npm test` only globs test/shared/*.cjs.
 * Implementation lives in test/deploy (Phase 1 public-route contract).
 */
require('../deploy/public-api-allowlist.test.cjs');
