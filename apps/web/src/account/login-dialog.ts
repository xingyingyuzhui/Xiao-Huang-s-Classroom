import type { CloudClient } from '../shared/api/cloud-client.js';

export type LoginDialogResult = {
  accountId: string;
  displayName: string;
  accessToken: string;
  expiresAt: number;
  avatarUrl?: string | null;
} | null;

export async function showLoginDialog(cloudClient: CloudClient): Promise<LoginDialogResult> {
  return new Promise<LoginDialogResult>((resolve) => {
    let resolved = false;
    const finish = (result: LoginDialogResult) => {
      if (resolved) return;
      resolved = true;
      overlay.remove();
      resolve(result);
    };

    const overlay = document.createElement('div');
    overlay.className = 'account-login-overlay';

    const panel = document.createElement('div');
    panel.className = 'account-login-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');

    const title = document.createElement('h2');
    title.textContent = '登录';
    panel.appendChild(title);

    const form = document.createElement('form');
    form.className = 'account-login-form';

    const usernameLabel = document.createElement('label');
    usernameLabel.className = 'account-login-label';
    usernameLabel.textContent = '用户名';
    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.className = 'ui-input';
    usernameInput.placeholder = '用户名';
    usernameLabel.appendChild(usernameInput);
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

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => finish(null));

    const loginBtn = document.createElement('button');
    loginBtn.type = 'submit';
    loginBtn.textContent = '登录';

    actions.appendChild(cancelBtn);
    actions.appendChild(loginBtn);
    form.appendChild(actions);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      errorEl.hidden = true;
      const username = usernameInput.value.trim();
      const password = passwordEl.value;
      if (!username || !password) {
        errorEl.textContent = '请填写用户名和密码';
        errorEl.hidden = false;
        return;
      }
      loginBtn.disabled = true;
      loginBtn.textContent = '登录中...';
      try {
        const result = await cloudClient.login(username, password);
        finish(result);
      } catch (e) {
        loginBtn.disabled = false;
        loginBtn.textContent = '登录';
        const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
        const message =
          e && typeof e === 'object' && 'message' in e ? String((e as { message?: string }).message) : '';
        if (code === 'AUTH_INVALID_CREDENTIALS' || /密码|凭据|credential/i.test(message)) {
          errorEl.textContent = '用户名或密码错误';
        } else if (code === 'VALIDATION_SCHEMA') {
          errorEl.textContent = '登录请求无效，请刷新页面后重试';
        } else if (code === 'AUTH_RATE_LIMITED') {
          errorEl.textContent = '尝试过多，请稍后再试';
        } else {
          errorEl.textContent = message ? `登录失败：${message}` : '登录失败，请检查网络后重试';
        }
        errorEl.hidden = false;
      }
    });

    panel.appendChild(form);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') finish(null);
    });
    usernameInput.focus();
  });
}
