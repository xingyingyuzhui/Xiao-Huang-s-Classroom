import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountSessionController } from '../../apps/web/src/account/account-session-controller.js';
import { RememberedAccountStore } from '../../apps/web/src/account/remembered-account-store.js';
import { createFakeStorage } from '@xiaohuang/test-kit';

describe('AccountSessionController', () => {
  let ctrl: AccountSessionController;

  beforeEach(() => {
    ctrl = new AccountSessionController();
  });

  it('starts with null session', () => {
    expect(ctrl.getSession()).toBeNull();
    expect(ctrl.isAuthenticated()).toBe(false);
    expect(ctrl.getAccessToken()).toBeNull();
  });

  it('setSession stores and notifies', () => {
    const listener = vi.fn();
    ctrl.subscribe(listener);
    const session = {
      accountId: 'a1',
      displayName: 'Test',
      accessToken: 'tok',
      expiresAt: Date.now() + 60000,
      avatarUrl: null,
    };
    ctrl.setSession(session);
    expect(ctrl.getSession()).toBe(session);
    expect(listener).toHaveBeenCalledWith(session);
  });

  it('clearSession clears and notifies', () => {
    const listener = vi.fn();
    ctrl.setSession({
      accountId: 'a1',
      displayName: 'Test',
      accessToken: 'tok',
      expiresAt: Date.now() + 60000,
      avatarUrl: null,
    });
    ctrl.subscribe(listener);
    ctrl.clearSession();
    expect(ctrl.getSession()).toBeNull();
    expect(listener).toHaveBeenCalledWith(null);
  });

  it('getAccessToken returns null when expired', () => {
    ctrl.setSession({
      accountId: 'a1',
      displayName: 'Test',
      accessToken: 'tok',
      expiresAt: Date.now() - 1000,
      avatarUrl: null,
    });
    expect(ctrl.getAccessToken()).toBeNull();
    expect(ctrl.isAuthenticated()).toBe(false);
  });

  it('getAccessToken returns token when valid', () => {
    ctrl.setSession({
      accountId: 'a1',
      displayName: 'Test',
      accessToken: 'tok123',
      expiresAt: Date.now() + 60000,
      avatarUrl: null,
    });
    expect(ctrl.getAccessToken()).toBe('tok123');
  });

  it('persists session to provided storage and hydrates', () => {
    const storage = createFakeStorage();
    const first = new AccountSessionController(storage);
    const session = {
      accountId: 'a1',
      displayName: 'Test',
      accessToken: 'tok',
      expiresAt: Date.now() + 60_000,
      avatarUrl: null,
    };
    first.setSession(session);
    const second = new AccountSessionController(storage);
    expect(second.isAuthenticated()).toBe(true);
    expect(second.getAccessToken()).toBe('tok');
    second.clearSession();
    expect(storage.getItem('xh-account-session') == null).toBe(true);
  });

  it('does not hydrate expired stored session', () => {
    const storage = createFakeStorage();
    storage.setItem(
      'xh-account-session',
      JSON.stringify({
        accountId: 'a1',
        displayName: 'Test',
        accessToken: 'tok',
        expiresAt: Date.now() - 1000,
        avatarUrl: null,
      }),
    );
    const ctrl = new AccountSessionController(storage);
    expect(ctrl.getSession()).toBeNull();
  });

  it('unsubscribe stops notifications', () => {
    const listener = vi.fn();
    const unsub = ctrl.subscribe(listener);
    unsub();
    ctrl.setSession({
      accountId: 'a1',
      displayName: 'Test',
      accessToken: 'tok',
      expiresAt: Date.now() + 60000,
      avatarUrl: null,
    });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('RememberedAccountStore', () => {
  let storage: ReturnType<typeof createFakeStorage>;
  let store: RememberedAccountStore;

  beforeEach(() => {
    storage = createFakeStorage();
    store = new RememberedAccountStore(storage);
  });

  it('list returns empty initially', () => {
    expect(store.list()).toEqual([]);
  });

  it('remember stores and retrieves account', () => {
    store.remember({ accountId: 'a1', displayName: 'Alice', avatarUrl: null, lastUsedAt: 100 });
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].accountId).toBe('a1');
  });

  it('list sorted by lastUsedAt descending', () => {
    store.remember({ accountId: 'a1', displayName: 'Alice', avatarUrl: null, lastUsedAt: 100 });
    store.remember({ accountId: 'a2', displayName: 'Bob', avatarUrl: null, lastUsedAt: 200 });
    const list = store.list();
    expect(list[0].accountId).toBe('a2');
    expect(list[1].accountId).toBe('a1');
  });

  it('remember upserts existing account', () => {
    store.remember({ accountId: 'a1', displayName: 'Alice', avatarUrl: null, lastUsedAt: 100 });
    store.remember({ accountId: 'a1', displayName: 'Alice Updated', avatarUrl: 'url', lastUsedAt: 300 });
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].displayName).toBe('Alice Updated');
  });

  it('forget removes account', () => {
    store.remember({ accountId: 'a1', displayName: 'Alice', avatarUrl: null, lastUsedAt: 100 });
    store.forget('a1');
    expect(store.list()).toEqual([]);
  });

  it('getLastUsed returns most recent', () => {
    store.remember({ accountId: 'a1', displayName: 'Alice', avatarUrl: null, lastUsedAt: 100 });
    store.remember({ accountId: 'a2', displayName: 'Bob', avatarUrl: null, lastUsedAt: 200 });
    expect(store.getLastUsed()?.accountId).toBe('a2');
  });

  it('only stores metadata, no token fields in storage', () => {
    store.remember({ accountId: 'a1', displayName: 'Alice', avatarUrl: null, lastUsedAt: 100 });
    const raw = storage.getItem('xiaohuang:remembered-accounts')!;
    const parsed = JSON.parse(raw);
    expect(parsed[0]).not.toHaveProperty('accessToken');
    expect(parsed[0]).not.toHaveProperty('password');
    expect(Object.keys(parsed[0]).sort()).toEqual(['accountId', 'avatarUrl', 'displayName', 'lastUsedAt']);
  });
});
