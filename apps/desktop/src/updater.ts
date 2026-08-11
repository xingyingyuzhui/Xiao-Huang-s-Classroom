/**
 * Auto-updater skeleton (electron-updater).
 *
 * Actual wiring requires packaged builds; this module is a no-op in
 * dev mode and provides the hook points for integration testing.
 */
import { app } from 'electron';

export type UpdaterOptions = {
  feedUrl: string;
  onUpdateAvailable?: (info: { version: string }) => void;
  onUpdateDownloaded?: (info: { version: string }) => void;
  onError?: (error: Error) => void;
  /** Called before quit-and-install so the app can flush local data. */
  onBeforeInstall?: () => void | Promise<void>;
};

const CHECK_DELAY_MS = 60_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000;

interface MinimalAutoUpdater {
  setFeedURL(options: { provider: string; url: string }): void;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, listener: (...args: never[]) => void): void;
  checkForUpdates(): Promise<unknown>;
}

export function setupUpdater(options: UpdaterOptions): void {
  if (!app.isPackaged) return;

  let autoUpdater: MinimalAutoUpdater | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ autoUpdater } = require('electron-updater') as { autoUpdater: MinimalAutoUpdater });
  } catch {
    return;
  }

  autoUpdater.setFeedURL({ provider: 'generic', url: options.feedUrl });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info: { version: string }) => {
    options.onUpdateAvailable?.({ version: info.version });
  });

  autoUpdater.on('update-downloaded', (info: { version: string }) => {
    options.onUpdateDownloaded?.({ version: info.version });
  });

  autoUpdater.on('error', (err: Error) => {
    options.onError?.(err);
  });

  setTimeout(() => {
    autoUpdater!.checkForUpdates().catch(() => {});
    setInterval(() => {
      autoUpdater!.checkForUpdates().catch(() => {});
    }, CHECK_INTERVAL_MS);
  }, CHECK_DELAY_MS);
}
