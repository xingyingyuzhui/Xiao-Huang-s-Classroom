/**
 * API 客户端封装
 * 统一管理所有后端 API 调用
 */

import { withAiSubject } from './ai-subject.js';
import { isFeatureEnabled } from '../runtime-config.js';
import {
  readLocalSettings,
  writeLocalSettings,
} from '../persistence/local-settings.js';

const API_BASE = '/api';

function usePublicCloudSettings() {
  return isFeatureEnabled('accountCloudProgram');
}

/**
 * 通用请求方法
 */
async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) {
      throw new Error(
        '无法连接本地服务。若用桌面版请重启应用；若用便携 exe 请勿关闭黑色控制台，并用控制台里的 http://127.0.0.1:端口 打开；不要用本地文件方式打开网页',
      );
    }
    throw new Error(msg || '网络请求失败（请确认后端已启动）');
  }

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // 后端旧进程常返回 HTML「Cannot POST /api/...」
    const snippet = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    throw new Error(
      snippet || `请求失败: ${response.status}（接口可能未部署，请重启后端）`,
    );
  }

  if (!response.ok || !data?.success) {
    const err = new Error(data?.message || `请求失败: ${response.status}`);
    err.status = response.status;
    err.payload = data?.data || null;
    // 限流：拼上重置时间（后端 message 已含，此处保证前端可单独读）
    if (data?.data?.resetLabel && !String(err.message).includes('重置')) {
      err.message = `${err.message}（约 ${data.data.resetLabel} 后重置）`;
    }
    throw err;
  }

  return data.data;
}

/**
 * 分子相关 API
 */
export const moleculeApi = {
  /**
   * 获取排序后的分子列表
   */
  async getList() {
    return request('/molecules');
  },

  /**
   * 获取单个分子
   */
  async getById(id) {
    return request(`/molecules/${id}`);
  },

  /**
   * 新增分子
   */
  async add(molecule) {
    return request('/molecules', {
      method: 'POST',
      body: JSON.stringify(molecule)
    });
  },

  /**
   * 删除分子
   */
  async delete(id) {
    return request(`/molecules/${id}`, {
      method: 'DELETE'
    });
  },

  /**
   * 更新排序
   */
  async reorder(order) {
    return request('/molecules/order', {
      method: 'PUT',
      body: JSON.stringify({ order })
    });
  }
};

/**
 * 化学反应 API
 */
export const reactionApi = {
  async getList(moleculeId) {
    const q = moleculeId
      ? `?moleculeId=${encodeURIComponent(moleculeId)}`
      : '';
    return request(`/reactions${q}`);
  },

  async getById(id) {
    return request(`/reactions/${id}`);
  },

  async add(payload) {
    return request('/reactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async remove(id) {
    return request(`/reactions/${id}`, { method: 'DELETE' });
  },
};

/**
 * 设置相关 API
 */
export const settingsApi = {
  /**
   * 获取设置。
   * Public cloud: device-local only (no anonymous lab /api/settings).
   * Electron / flag-off: lab Express on /api.
   */
  async get() {
    if (usePublicCloudSettings()) {
      return readLocalSettings();
    }
    return request('/settings');
  },

  /**
   * 更新设置。
   * Public cloud writes local device prefs; Electron still hits lab /api.
   */
  async update(settings) {
    if (usePublicCloudSettings()) {
      return writeLocalSettings(settings);
    }
    return request('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }
};

/**
 * 课堂点名名单
 */
export const studentApi = {
  async getList() {
    return request('/students');
  },
  async add(name) {
    return request('/students', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },
  async importNames(names, mode = 'append') {
    return request('/students/import', {
      method: 'POST',
      body: JSON.stringify({ names, mode }),
    });
  },
  async update(id, name) {
    return request(`/students/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  },
  async remove(id) {
    return request(`/students/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};

/**
 * AI 相关 API
 */
export const aiApi = {
  async generate(prompt) {
    return request('/ai/generate', {
      method: 'POST',
      body: JSON.stringify(withAiSubject({ prompt })),
    });
  },

  async reaction(payload) {
    return request('/ai/reaction', {
      method: 'POST',
      body: JSON.stringify(withAiSubject(payload)),
    });
  },

  async labGenerate(prompt) {
    return request('/ai/lab', {
      method: 'POST',
      body: JSON.stringify(withAiSubject({ prompt })),
    });
  },

  async stoich(payload) {
    return request('/ai/stoich', {
      method: 'POST',
      body: JSON.stringify(withAiSubject(payload)),
    });
  },

  async balance(payload) {
    return request('/ai/balance', {
      method: 'POST',
      body: JSON.stringify(withAiSubject(payload)),
    });
  },

  async tip() {
    return request('/ai/tip', {
      method: 'POST',
      body: JSON.stringify(withAiSubject({})),
    });
  },

  async quizGenerate(payload) {
    return request('/ai/quiz/generate', {
      method: 'POST',
      body: JSON.stringify(withAiSubject(payload)),
    });
  },

  async quizHint(payload) {
    return request('/ai/quiz/hint', {
      method: 'POST',
      body: JSON.stringify(withAiSubject(payload)),
    });
  },

  async quizExplain(payload) {
    return request('/ai/quiz/explain', {
      method: 'POST',
      body: JSON.stringify(withAiSubject(payload)),
    });
  },

  async quizSummary(payload) {
    return request('/ai/quiz/summary', {
      method: 'POST',
      body: JSON.stringify(withAiSubject(payload)),
    });
  },

  async quizScore(payload = {}) {
    return request('/ai/quiz/score', {
      method: 'POST',
      body: JSON.stringify(withAiSubject(payload)),
    });
  },

  /** 课堂概念讲解 */
  async lessonExplain(payload) {
    return request('/ai/lesson/explain', {
      method: 'POST',
      body: JSON.stringify(withAiSubject(payload)),
    });
  },

  /**
   * 函数画布：AI 生成函数（preset / custom）
   * @param {string} prompt
   */
  async mathFnGenerate(prompt) {
    return request('/ai/math/function', {
      method: 'POST',
      body: JSON.stringify(withAiSubject({ prompt })),
    });
  },
};

/**
 * 练习历史 / 错题本
 */
export const quizApi = {
  async stats() {
    return request('/quiz/stats');
  },
  async saveSession(payload) {
    return request('/quiz/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async wrongBook() {
    return request('/quiz/wrong-book');
  },
  /** 错题本重练作答；做对自动出本 */
  async attemptWrong(id, chosen) {
    return request(`/quiz/wrong-book/${encodeURIComponent(id)}/attempt`, {
      method: 'POST',
      body: JSON.stringify({ chosen }),
    });
  },
  async saveSummary(id, summary) {
    return request(`/quiz/sessions/${encodeURIComponent(id)}/summary`, {
      method: 'PATCH',
      body: JSON.stringify({ summary }),
    });
  },
};

/**
 * 离线题库 API
 */
export const offlineQuizApi = {
  /** 获取可用年份 */
  async years() {
    return request('/offline-quiz/years');
  },
  /** 获取题库列表（不含答案），支持分页 */
  async list(year, page = 1, pageSize = 20) {
    const params = new URLSearchParams();
    if (year) params.set('year', year);
    params.set('page', page);
    params.set('pageSize', pageSize);
    return request(`/offline-quiz/list?${params}`);
  },
  /** 生成离线练习（不含答案） */
  async generate(payload) {
    return request('/offline-quiz/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  /** 提交离线练习答案 */
  async submit(payload) {
    return request('/offline-quiz/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

/**
 * 知识掌握地图 API
 */
export const masteryApi = {
  async summary() {
    return request('/mastery');
  },
};

/**
 * 实验探究 API（可编辑脚本 / 预习 / 导入导出）
 */
export const labsApi = {
  async list() {
    return request('/labs');
  },
  async get(id) {
    return request(`/labs/${encodeURIComponent(id)}`);
  },
  async create(payload) {
    return request('/labs', { method: 'POST', body: JSON.stringify(payload) });
  },
  async update(id, payload) {
    return request(`/labs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  async remove(id) {
    return request(`/labs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async reorder(ids) {
    return request('/labs/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },
  async resetBuiltin() {
    return request('/labs/reset-builtin', { method: 'POST', body: '{}' });
  },
  async resetOne(id) {
    return request(`/labs/${encodeURIComponent(id)}/reset`, {
      method: 'POST',
      body: '{}',
    });
  },
  async exportPack() {
    return request('/labs/export');
  },
  async importPack(data) {
    return request('/labs/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

/**
 * 备课包 API
 */
export const lessonPackApi = {
  async list() {
    return request('/lesson-packs');
  },
  async get(id) {
    return request(`/lesson-packs/${encodeURIComponent(id)}`);
  },
  async create(payload) {
    return request('/lesson-packs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async update(id, payload) {
    return request(`/lesson-packs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  async remove(id) {
    return request(`/lesson-packs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  async exportData(id) {
    return request(`/lesson-packs/${encodeURIComponent(id)}/export`);
  },
  async importData(data) {
    return request('/lesson-packs/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

/**
 * 配平脚本 API
 */
export const balanceScriptsApi = {
  async list() {
    return request('/balance-scripts');
  },
  async get(id) {
    return request(`/balance-scripts/${encodeURIComponent(id)}`);
  },
  async create(payload) {
    return request('/balance-scripts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async update(id, payload) {
    return request(`/balance-scripts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  async remove(id) {
    return request(`/balance-scripts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  /** 列表拖拽排序（ids 须覆盖全部脚本） */
  async reorder(ids) {
    return request('/balance-scripts/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },
  async reset(id) {
    return request(`/balance-scripts/${encodeURIComponent(id)}/reset`, {
      method: 'POST',
      body: '{}',
    });
  },
  /** 导出全部配平脚本为 JSON 包 */
  async exportPack() {
    return request('/balance-scripts/export');
  },
  /** 导入配平包（不覆盖已有 id） */
  async importPack(data) {
    return request('/balance-scripts/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ───────────────────────── API v2（Program 5 Task 5.4） ─────────────────────────

/**
 * v2 请求：统一 { success, data|error, requestId } 响应；与 v1 同一 service。
 * 首个 v2 端点：subject-settings（GET）。
 * @param {string} url
 * @returns {Promise<{ ok: true, data: any, requestId: string } | { ok: false, error: { code: string, message: string }, requestId: string }>}
 */
export async function apiV2Get(url) {
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    return { ok: false, error: { code: 'NETWORK_OFFLINE', message: '网络不可用' }, requestId: '' };
  }
  let json;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: { code: 'INTERNAL_UNKNOWN', message: '响应不是 JSON' }, requestId: '' };
  }
  if (json && json.success === true) {
    return { ok: true, data: json.data, requestId: json.requestId };
  }
  return {
    ok: false,
    error: json?.error ?? { code: 'INTERNAL_UNKNOWN', message: '未知错误' },
    requestId: json?.requestId ?? '',
  };
}
