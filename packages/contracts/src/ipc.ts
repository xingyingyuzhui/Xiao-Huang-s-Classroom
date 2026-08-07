import { z } from 'zod';

/** Electron IPC Schema（spec §12.1）：preload 只暴露 allowlist 内 channel。 */
export const ipcChannelSchema = z.enum(['app:get-version', 'app:open-devtools', 'app:relaunch']);

export const ipcRequestSchema = z.object({
  channel: ipcChannelSchema,
  payload: z.unknown(),
});

export type IpcChannel = z.infer<typeof ipcChannelSchema>;
