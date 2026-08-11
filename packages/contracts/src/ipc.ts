import { z } from 'zod';

/** Electron IPC Schema：preload 只暴露 allowlist 内 channel。 */
export const ipcChannelSchema = z.enum([
  'app:get-version',
  'app:open-devtools',
  'app:relaunch',
  'account:list-saved',
  'account:login',
  'account:remove-card',
  'account:refresh-session',
  'account:logout',
]);

export const ipcRequestSchema = z.object({
  channel: ipcChannelSchema,
  payload: z.unknown(),
});

export type IpcChannel = z.infer<typeof ipcChannelSchema>;
