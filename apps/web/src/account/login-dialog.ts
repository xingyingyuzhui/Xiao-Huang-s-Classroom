import { AppError } from '@xiaohuang/domain-core';
import { createDialog, createButton, createInput } from '@xiaohuang/ui';
import type { CloudClient } from '../shared/api/cloud-client.js';

export type LoginDialogResult = {
  accountId: string;
  displayName: string;
  accessToken: string;
  expiresAt: number;
} | null;

export async function showLoginDialog(cloudClient: CloudClient): Promise<LoginDialogResult> {
  return new Promise<LoginDialogResult>((resolve) => {
    let resolved = false;
    const finish = (result: LoginDialogResult) => {
      if (resolved) return;
      resolved = true;
      dialog.update({ open: false });
      dialog.dispose();
      overlay.remove();
      resolve(result);
    };

    const dialog = createDialog({ title: '登录', open: true });

    const form = document.createElement('form');
    form.className = 'account-login-form';

    const usernameLabel = document.createElement('label');
    usernameLabel.className = 'account-login-label';
    usernameLabel.textContent = '用户名';
    const usernameInput = createInput({ placeholder: '用户名' });
    usernameLabel.appendChild(usernameInput.element);
    form.appendChild(usernameLabel);

    const passwordLabel = document.createElement('label');
    passwordLabel.className = 'account-login-label';
    passwordLabel.textContent = '密码';
    const passwordEl = document.createElement('input');
    passwordEl.type = 'password';
    passwordEl.className = 'ui-input';
    passwordEl.placeholder = '密码';
    passwordLabel.appendChild(passwordEl);
    form.appendChild(passwordLabel);

    const errorEl = document.createElement('div');
    errorEl.className = 'account-login-error';
    errorEl.hidden = true;
    form.appendChild(errorEl);

    const actions = document.createElement('div');
    actions.className = 'account-login-actions';

    const cancelBtn = createButton({ label: '取消' });
    cancelBtn.element.addEventListener('click', () => finish(null));

    const loginBtn = createButton({ label: '登录', variant: 'primary' });
    loginBtn.element.setAttribute('type', 'submit');

    actions.appendChild(cancelBtn.element);
    actions.appendChild(loginBtn.element);
    form.appendChild(actions);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      errorEl.hidden = true;
      const username = (usernameInput.element as HTMLInputElement).value.trim();
      const password = passwordEl.value;
      if (!username || !password) {
        errorEl.textContent = '请填写用户名和密码';
        errorEl.hidden = false;
        return;
      }
      loginBtn.update({ disabled: true, label: '登录中...' });
      try {
        const result = await cloudClient.login(username, password);
        finish(result);
      } catch (e) {
        loginBtn.update({ disabled: false, label: '登录' });
        errorEl.textContent = '用户名或密码错误';
        errorEl.hidden = false;
      }
    });

    dialog.element.appendChild(form);
    dialog.on('close', () => finish(null));

    const overlay = document.createElement('div');
    overlay.className = 'account-login-overlay';
    overlay.appendChild(dialog.element);
    document.body.appendChild(overlay);
  });
}
