/**
 * Phase 3: AI keys are cloud-only. Settings save must never persist apiKey
 * via settingsApi.update; UI must not echo stored plaintext.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import root from '../helpers/repo-root.js';

const settingsSrc = fs.readFileSync(
  path.join(root, 'apps/web/src/shared/ui/settings.js'),
  'utf8',
);
const indexHtml = fs.readFileSync(path.join(root, 'apps/web/index.html'), 'utf8');
const clientSrc = fs.readFileSync(
  path.join(root, 'apps/web/src/shared/api/cloud-client.ts'),
  'utf8',
);

describe('settings AI cloud-only contracts', () => {
  it('save path never writes apiKey through settingsApi / saveSubjectSettingsPatch', () => {
    const saveHandler = settingsSrc.slice(settingsSrc.indexOf("btnSaveAi?.addEventListener('click'"));
    expect(saveHandler).toContain('saveSubjectSettingsPatch(subjectId, {');
    expect(saveHandler).toContain('setAiCredential');
    expect(saveHandler).not.toMatch(/saveSubjectSettingsPatch\([^)]*apiKey/);
    expect(saveHandler).toMatch(/ai:\s*\{\s*apiBase:[\s\S]*model,/);
    expect(saveHandler).not.toMatch(/ai:\s*\{[\s\S]*apiKey:\s*key/);
    expect(settingsSrc).not.toMatch(/settingsApi\.update\([^)]*apiKey/);
  });

  it('key input never echoes stored plaintext', () => {
    expect(settingsSrc).toMatch(/if \(apiKey\) apiKey\.value = ''/);
    expect(settingsSrc).not.toMatch(/apiKey\.value = slice\.ai\?\.apiKey/);
    expect(indexHtml).toMatch(/id="aiApiKey"/);
    expect(indexHtml).toMatch(/type="password"/);
    expect(indexHtml).toMatch(/id="aiCredentialStatus"/);
    expect(indexHtml).toMatch(/离线时云端 AI 不可用/);
  });

  it('migrates leftover keys then strips local plaintext; failure is not success', () => {
    expect(settingsSrc).toContain('extractLeftoverApiKeys');
    expect(settingsSrc).toContain('migrateLeftoverAiKeys');
    expect(settingsSrc).toContain('persistStrippedLocalAiKeys');
    expect(settingsSrc).toContain('sanitizeTeacherSettingsPayload');
    expect(settingsSrc).toContain('本地密钥未能迁到云端，未删除本机明文');
    expect(settingsSrc).not.toMatch(/console\.(log|info|debug|warn)\([^)]*apiKey/);
  });

  it('cloud client exposes chat proxy', () => {
    expect(clientSrc).toContain("this.request('POST', '/ai/chat'");
    expect(clientSrc).toContain('async chatAi(');
  });
});
