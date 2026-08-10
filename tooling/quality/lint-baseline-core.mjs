/**
 * lint-baseline 核心：稳定文件级指纹与快照 diff（2026-08-10 计划 Task 5）。
 *
 * 指纹 = relativePath :: ruleId :: normalizedMessage :: sha256(context)
 *  - 不保存行号：正常插行/删行不使整表漂移；
 *  - 上下文只折叠空白，不归一化数字、变量名、字符串或路径内容
 *    （`'foo' is not defined` 与 `'bar' is not defined` 是不同问题）；
 *  - parse error 的 ruleId 记为 `(parse-error)`，上下文为错误附近源码；
 *  - 同一指纹多次出现时保留 count。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** 上下文只折叠空白（trim + 连续空白折叠为单个空格），不做任何归一化 */
export function normalizeSourceContext(context) {
  return String(context).trim().replace(/\s+/g, ' ');
}

/**
 * 稳定指纹。message 使用 ESLint message 形状的子集：
 * ruleId / message / line / endLine / column / endColumn（坐标只用于取上下文）。
 */
export function issueFingerprint(root, filePath, message, sourceContext) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  const relativePath = path.relative(root, absolute).split(path.sep).join('/');
  const ruleId = message.ruleId || '(parse-error)';
  const normalizedMessage = String(message.message).trim().replace(/\s+/g, ' ');
  const contextHash = crypto
    .createHash('sha256')
    .update(normalizeSourceContext(sourceContext))
    .digest('hex');
  return [relativePath, ruleId, normalizedMessage, contextHash].join('::');
}

/**
 * 从源码行数组提取违规上下文：
 * 优先取违规 node 对应源码片段（message 的 line/endLine/column/endColumn 范围）；
 * 无法取得精确 node（如 parse error 只有 line/column）时取当前源码行。
 * 无论哪种情况都附加前面最近的 2 个非空行和后面最近的 2 个非空行作为上下文锚点，
 * 使“同一问题搬到不同代码位置”产生不同指纹；插行/删行不改变锚点内容时指纹保持稳定。
 * 不宣称能区分“完全相同代码连同完全相同相邻上下文”在同文件内的纯搬移。
 */
export function extractSourceContext(lines, message) {
  const line = Math.max(1, message.line || 1);
  const endLine = Math.max(line, message.endLine || line);
  const span = lines.slice(line - 1, endLine);
  if (
    span.length === 1 &&
    Number.isInteger(message.column) &&
    Number.isInteger(message.endColumn) &&
    message.endColumn > message.column
  ) {
    const source = span[0];
    span[0] = source.slice(message.column - 1, message.endColumn - 1);
  }
  const before = [];
  for (let i = line - 2; i >= 0 && before.length < 2; i -= 1) {
    if (lines[i].trim() !== '') before.unshift(lines[i]);
  }
  const after = [];
  for (let i = endLine; i < lines.length && after.length < 2; i += 1) {
    if (lines[i].trim() !== '') after.push(lines[i]);
  }
  return [...before, ...span, ...after].join('\n');
}

/**
 * 收集 ESLint JSON 结果（[{filePath, messages}]）为 entries 指纹账本。
 * readFile 可注入（测试用内存 map），默认从磁盘读取源文件。
 */
export function collectEntries(results, root, readFile = fs.readFileSync) {
  const entries = {};
  const perRule = {};
  let total = 0;
  for (const file of results) {
    const absolute = path.isAbsolute(file.filePath)
      ? file.filePath
      : path.join(root, file.filePath);
    let lines;
    try {
      lines = String(readFile(absolute, 'utf8')).split(/\r?\n/);
    } catch {
      lines = [];
    }
    for (const message of file.messages) {
      const context = extractSourceContext(lines, message);
      const fingerprint = issueFingerprint(root, absolute, message, context);
      entries[fingerprint] = (entries[fingerprint] || 0) + 1;
      const ruleId = message.ruleId || '(parse-error)';
      perRule[ruleId] = (perRule[ruleId] || 0) + 1;
      total += 1;
    }
  }
  return { entries, perRule, total };
}

/**
 * diff 快照：current 中任一指纹的 count 超过 baseline 即回归。
 * 删除旧问题（current 缺项）不视为回归；新文件/新 rule/message/新源码上下文
 * 或同指纹 count 增加都会失败。不宣称能够区分“完全相同代码连同完全相同相邻
 * 上下文”在同文件内的纯搬移（该极端情况需先修旧债或升级为 AST anchor）。
 */
export function diffEntries(baseline, current) {
  const regressions = [];
  for (const [fingerprint, count] of Object.entries(current)) {
    const prev = baseline[fingerprint] || 0;
    if (count > prev) regressions.push({ fingerprint, prev, count });
  }
  return regressions;
}
