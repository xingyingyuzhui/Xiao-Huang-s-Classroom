/**
 * AI credential / chat binding for account cloud mode.
 */
import { setCloudAiChat } from '../shared/api/cloud-ai-bridge.js';
import { setRosterPersistHandler } from '../sync/roster-store.js';

/**
 * @typedef {object} AccountAiBindingDeps
 * @property {import('./account-session-controller.js').AccountSessionController} session
 * @property {import('../shared/api/cloud-client.ts').CloudClient} client
 * @property {() => void} assertWritable
 * @property {(students: Array<{ id: string, name: string }>) => Promise<void>} enqueueClassRoster
 */

/**
 * @param {AccountAiBindingDeps} deps
 * @returns {() => void} dispose
 */
export function bindAccountAi(deps) {
  const { session, client, assertWritable, enqueueClassRoster } = deps;

  setRosterPersistHandler((students) => {
    assertWritable();
    return enqueueClassRoster(students);
  });

  setCloudAiChat((input) => {
    if (!session.isAuthenticated()) {
      return Promise.reject(new Error('请先登录后再使用云端 AI'));
    }
    return client.chatAi(input);
  });

  return () => {
    setRosterPersistHandler(null);
    setCloudAiChat(null);
  };
}
