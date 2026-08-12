/**
 * Feature-flagged account / sync boot for the web shell.
 * Stable import path — orchestration lives in account-cloud-runtime.js.
 */
export { createAccountCloudRuntime as bootAccountCloud } from './account-cloud-runtime.js';
