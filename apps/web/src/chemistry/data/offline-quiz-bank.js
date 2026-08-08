/**
 * 离线基础练习库 — 高考化学选择题（只读）聚合加载器。
 *
 * 数据/加载边界（B3）：题目数据本体在 offline-questions-part{1,2}.js
 * （AGIEval v1.1 gaokao-chemistry 逐字副本，头注释含筛选规则）；
 * 本文件只做聚合加载与完整性校验，消费方（chem-text 测试等）路径不变。
 */
import { OFFLINE_QUESTIONS_PART1 } from './offline-questions-part1.js';
import { OFFLINE_QUESTIONS_PART2 } from './offline-questions-part2.js';

export const OFFLINE_QUIZ_VERSION = '3.0.0';
export const OFFLINE_QUIZ_BANK_SIZE = 204;

/** 聚合加载：part1 + part2 按原 JSONL 行号顺序拼接（line-0 → line-203）。 */
export const OFFLINE_QUESTIONS = [...OFFLINE_QUESTIONS_PART1, ...OFFLINE_QUESTIONS_PART2];

// 数据完整性合同：聚合数必须与声明一致（数据文件被误改时立即失败，不静默）。
if (OFFLINE_QUESTIONS.length !== OFFLINE_QUIZ_BANK_SIZE) {
  throw new Error(
    `离线题库数据不完整: 期望 ${OFFLINE_QUIZ_BANK_SIZE} 题，实际 ${OFFLINE_QUESTIONS.length} 题`,
  );
}
