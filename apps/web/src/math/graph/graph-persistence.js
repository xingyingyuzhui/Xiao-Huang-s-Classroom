/**
 * GraphPersistence：自动保存、恢复与安全导入导出。
 *
 * - storage 由调用方注入（fake 可测），纯逻辑层不触碰浏览器全局。
 * - load 与 importJson 共用同一套 parse-with-limits / migrate / validate / normalize。
 * - 时间戳由注入 now() 生成。
 */

import {
  GRAPH_DOCUMENT_VERSION,
  createDefaultGraphDocument,
  normalizeGraphDocument,
  toSerializableGraphDocument,
} from './graph-document.js';
import { migrateGraphDocument } from './graph-document-migrations.js';

export const GRAPH_STORAGE_KEY = 'xiaohuang:math:graph-document:v2';

/** 旧 V1 storage key：读到时迁移写入 V2 后清理 */
export const GRAPH_STORAGE_KEY_V1 = 'xiaohuang:math:graph-document:v1';

export const GRAPH_IMPORT_LIMITS = {
  maxBytes: 1024 * 1024,
  maxDepth: 12,
  maxFunctions: 50,
  maxPoints: 500,
  maxConstructions: 500,
  maxStrokePoints: 50000,
  maxStringLength: 10000,
};

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** @param {string} code @param {string} message */
function failure(code, message) {
  return { ok: false, code, message };
}

/** @param {any} document */
function success(document) {
  return { ok: true, document };
}

/**
 * 深度/字符串长度/危险键检查（不构造对象，防原型污染）。
 * @param {any} value
 * @param {number} [depth]
 * @param {string} [path]
 */
function checkTree(value, depth = 0, path = 'root') {
  if (depth > GRAPH_IMPORT_LIMITS.maxDepth) {
    return failure('INVALID_DOCUMENT', '文档嵌套过深');
  }
  if (typeof value === 'string' && value.length > GRAPH_IMPORT_LIMITS.maxStringLength) {
    return failure('INVALID_DOCUMENT', '文档字符串过长', path);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const check = checkTree(value[i], depth + 1, `${path}[${i}]`);
      if (!check.ok) return check;
    }
    return { ok: true };
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (DANGEROUS_KEYS.has(key)) {
        return failure('INVALID_DOCUMENT', '文档包含危险键', `${path}.${key}`);
      }
      const check = checkTree(value[key], depth + 1, `${path}.${key}`);
      if (!check.ok) return check;
    }
  }
  return { ok: true };
}

/** @param {any} document */
function enforceObjectLimits(document) {
  if ((document.functions?.length || 0) > GRAPH_IMPORT_LIMITS.maxFunctions) {
    return failure('DOCUMENT_TOO_LARGE', '函数数量超限');
  }
  if ((document.points?.length || 0) > GRAPH_IMPORT_LIMITS.maxPoints) {
    return failure('DOCUMENT_TOO_LARGE', '点数量超限');
  }
  if ((document.constructions?.length || 0) > GRAPH_IMPORT_LIMITS.maxConstructions) {
    return failure('DOCUMENT_TOO_LARGE', '构造数量超限');
  }
  const strokePoints = (document.annotations?.strokes || []).reduce(
    (sum, stroke) => sum + (stroke.points?.length || 0),
    0,
  );
  if (strokePoints > GRAPH_IMPORT_LIMITS.maxStrokePoints) {
    return failure('DOCUMENT_TOO_LARGE', '批注点数量超限');
  }
  return { ok: true };
}

/**
 * 解析文本 → 迁移 → 限制检查 → normalize（storage load 与 file import 共用）。
 * @param {string} text
 * @param {{ now?: () => string }} [options]
 */
export function parseAndValidateDocument(text, options = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return failure('INVALID_DOCUMENT', '文件不是有效的函数画布项目');
  }
  if (text.length > GRAPH_IMPORT_LIMITS.maxBytes) {
    return failure('DOCUMENT_TOO_LARGE', '项目内容过大，请精简后重试');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failure('INVALID_DOCUMENT', '文件不是有效的函数画布项目');
  }
  const treeCheck = checkTree(parsed);
  if (!treeCheck.ok) return treeCheck;
  const limitsCheck = enforceObjectLimits(parsed);
  if (!limitsCheck.ok) return limitsCheck;
  const migrated = migrateGraphDocument(parsed);
  if (!migrated.ok) return migrated;
  const normalized = normalizeGraphDocument(migrated.document, options);
  if (!normalized.ok) return normalized;
  return success(normalized.document);
}

/**
 * @param {{
 *   storage: { getItem: (key: string) => string | null, setItem: (key: string, value: string) => void, removeItem: (key: string) => void },
 *   key?: string,
 *   wait?: number,
 *   now?: () => string,
 *   setTimeout?: (fn: () => void, ms: number) => any,
 *   clearTimeout?: (id: any) => void,
 * }} options
 */
export function createGraphPersistence(options) {
  const storage = options.storage;
  const key = options.key || GRAPH_STORAGE_KEY;
  const wait = Number.isFinite(options.wait) ? options.wait : 300;
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const setTimer = typeof options.setTimeout === 'function' ? options.setTimeout : (fn, ms) => setTimeout(fn, ms);
  const clearTimer = typeof options.clearTimeout === 'function' ? options.clearTimeout : (id) => clearTimeout(id);

  /** @type {any | null} */
  let pendingDocument = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  let disposed = false;
  /** @type {{ ok: boolean, code?: string, message?: string }} */
  let lastStatus = { ok: true };

  /**
   * 从 storage 加载并规范化；解析失败回退默认文档但保留错误。
   * 优先读 V2 key；V1 key 存在且可迁移时写入 V2 后清理旧 key。
   * @returns {{ ok: boolean, document: any, error?: { code: string, message: string } }}
   */
  function load() {
    let raw = null;
    let usedV1 = false;
    try {
      raw = storage.getItem(key);
      if (raw == null && key !== GRAPH_STORAGE_KEY_V1) {
        const v1Raw = storage.getItem(GRAPH_STORAGE_KEY_V1);
        if (v1Raw != null) {
          raw = v1Raw;
          usedV1 = true;
        }
      }
    } catch {
      lastStatus = { ok: false, code: 'STORAGE_UNAVAILABLE', message: '无法读取自动保存' };
      return {
        ok: false,
        document: createDefaultGraphDocument({ now }),
        error: { code: 'STORAGE_UNAVAILABLE', message: '无法读取自动保存' },
      };
    }
    if (!raw) {
      return { ok: true, document: createDefaultGraphDocument({ now }) };
    }
    const parsed = parseAndValidateDocument(raw, { now });
    if (!parsed.ok) {
      lastStatus = { ok: false, code: parsed.code, message: parsed.message };
      return {
        ok: false,
        document: createDefaultGraphDocument({ now }),
        error: { code: parsed.code, message: parsed.message },
      };
    }
    if (usedV1) {
      // V1 迁移成功：写 V2 key 并清理旧 key
      try {
        storage.setItem(key, JSON.stringify(toSerializableGraphDocument(parsed.document)));
        storage.removeItem(GRAPH_STORAGE_KEY_V1);
      } catch {
        /* 迁移写入失败不阻断本次会话 */
      }
    }
    lastStatus = { ok: true };
    return { ok: true, document: parsed.document };
  }

  /** @param {any} document */
  function scheduleSave(document) {
    pendingDocument = document;
    if (timer != null) clearTimeout(timer);
    timer = setTimer(() => {
      timer = null;
      flush();
    }, wait);
  }

  /**
   * 立即写盘；quota/security 错误降级为内存态并返回状态。
   * @returns {{ ok: boolean, code?: string, message?: string }}
   */
  function flush() {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    if (!pendingDocument) return lastStatus;
    const doc = pendingDocument;
    pendingDocument = null;
    try {
      storage.setItem(key, JSON.stringify(toSerializableGraphDocument(doc)));
      lastStatus = { ok: true };
    } catch {
      lastStatus = { ok: false, code: 'STORAGE_UNAVAILABLE', message: '无法自动保存；当前内容仍保留在本次会话中' };
    }
    return lastStatus;
  }

  function clear() {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    pendingDocument = null;
    try {
      storage.removeItem(key);
    } catch {
      /* */
    }
    lastStatus = { ok: true };
  }

  /**
   * 导出当前文档为 JSON 文本。
   * @param {any} document
   */
  function exportJson(document) {
    return JSON.stringify(toSerializableGraphDocument(document), null, 2);
  }

  /**
   * 导入 JSON 文本；失败不覆盖当前文档。
   * @param {string} text
   * @returns {{ ok: boolean, document?: any, code?: string, message?: string }}
   */
  function importJson(text) {
    return parseAndValidateDocument(text, { now });
  }

  function dispose() {
    disposed = true;
    flush();
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
  }

  return { load, scheduleSave, flush, clear, exportJson, importJson, dispose, getStatus: () => lastStatus };
}

export { GRAPH_DOCUMENT_VERSION };

/**
 * 画布项目 UI 控制器：JSON 导入/导出、重置（按钮 + 文件选择 + 下载）。
 * DOM 归 controller；解析/限额/迁移逻辑全在 graph-persistence 的纯函数里。
 *
 * @param {{
 *   persistence: any,
 *   store: () => any,
 *   history: () => any,
 *   defaultDocument: () => any,
 *   confirm: (message: string, opts?: any) => Promise<boolean>,
 *   alert: (message: string, opts?: any) => Promise<void>,
 *   pickJsonFile: () => Promise<string | null>,
 *   downloadText: (filename: string, text: string) => void,
 * }} context
 */
export function createGraphPersistenceController(context) {
  const {
    persistence,
    store,
    history,
    defaultDocument,
    confirm,
    alert,
    pickJsonFile,
    downloadText,
  } = context;

  /** @param {string} title */
  function projectFileName(title) {
    const base = String(title || '函数画布')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/[\u0000-\u001f]/g, '')
      .trim()
      .slice(0, 60);
    return `${base || '函数画布'}.json`;
  }

  /**
   * 导入：成功 → 替换文档 + 清空历史（不能 undo 回另一个项目）+ 重 seed allocator；
   * 失败（含 runtime 拒绝 replace）不改变 document/history/allocator。
   */
  async function importJson() {
    const text = await pickJsonFile();
    if (text == null) return;
    const result = persistence.importJson(text);
    if (!result.ok) {
      await alert(result.message || '文件不是有效的函数画布项目', { title: '导入失败' });
      return;
    }
    const replaceResult = store().replaceDocumentResult(result.document);
    if (!replaceResult.ok) {
      await alert('导入内容无法在当前画布中渲染，已取消导入', { title: '导入失败' });
      return;
    }
    history().clear();
    store().reseedAllocator?.(replaceResult.document);
    persistence.scheduleSave(replaceResult.document);
  }

  /** 导出：只读，不改变历史。 */
  function exportJson() {
    const doc = store()?.getDocument();
    if (!doc) return;
    downloadText(projectFileName(doc.title), persistence.exportJson(doc));
  }

  /** 重置：一条可撤销的 document/replace，清空旧 redo。 */
  async function reset() {
    const ok = await confirm('将清空当前画布并恢复默认函数，是否继续？', {
      title: '重置画布',
      okText: '重置',
      cancelText: '取消',
    });
    if (!ok) return;
    store().replaceDocument(defaultDocument());
  }

  return { importJson, exportJson, reset, projectFileName };
}
