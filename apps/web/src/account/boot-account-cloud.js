/**
 * Feature-flagged account / sync boot for the web shell.
 * Stable import path — orchestration lives in account-cloud-runtime.js.
 */
import { createAccountCloudRuntime } from './account-cloud-runtime.js';

/**
 * @returns {Promise<object | null>}
 */
export async function bootAccountCloud() {
  return createAccountCloudRuntime();
}
