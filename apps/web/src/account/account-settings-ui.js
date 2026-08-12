/**
 * Lazily-loaded account settings UI surface (settings + class + guest).
 * Single dynamic entry so Vite emits one chunk instead of three.
 */
export { createAccountSettingsController, getDesktopAccountApi, mapDesktopSession } from './account-settings-controller.js';
export { createClassController } from './class-controller.js';
export { createGuestCopyController } from './guest-copy-controller.js';
