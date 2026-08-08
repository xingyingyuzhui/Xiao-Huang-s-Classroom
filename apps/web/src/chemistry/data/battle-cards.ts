/**
 * 元素乱斗 · 共用牌数据
 * 模式乙：Z / 电负性 / 原子半径 三维度
 * 数值为教学用近似值（Pauling 电负性、共价半径 pm 量级）
 */

/** 元素卡定义（数值为教学用近似值） */
export interface BattleElementDef {
  z: number;
  symbol: string;
  name: string;
  block: string;
  en: number;
  radius: number;
  copies?: number;
}

/** 主推 1–36 + 少量常见元素；每种 2 张 */
export const BATTLE_ELEMENTS: BattleElementDef[] = [
  { z: 1, symbol: 'H', name: '氢', block: 's', en: 2.2, radius: 31 },
  { z: 2, symbol: 'He', name: '氦', block: 'noble', en: 0, radius: 28 },
  { z: 3, symbol: 'Li', name: '锂', block: 's', en: 0.98, radius: 128 },
  { z: 4, symbol: 'Be', name: '铍', block: 's', en: 1.57, radius: 96 },
  { z: 5, symbol: 'B', name: '硼', block: 'p', en: 2.04, radius: 84 },
  { z: 6, symbol: 'C', name: '碳', block: 'p', en: 2.55, radius: 76 },
  { z: 7, symbol: 'N', name: '氮', block: 'p', en: 3.04, radius: 71 },
  { z: 8, symbol: 'O', name: '氧', block: 'p', en: 3.44, radius: 66 },
  { z: 9, symbol: 'F', name: '氟', block: 'p', en: 3.98, radius: 57 },
  { z: 10, symbol: 'Ne', name: '氖', block: 'noble', en: 0, radius: 58 },
  { z: 11, symbol: 'Na', name: '钠', block: 's', en: 0.93, radius: 166 },
  { z: 12, symbol: 'Mg', name: '镁', block: 's', en: 1.31, radius: 141 },
  { z: 13, symbol: 'Al', name: '铝', block: 'p', en: 1.61, radius: 121 },
  { z: 14, symbol: 'Si', name: '硅', block: 'p', en: 1.9, radius: 111 },
  { z: 15, symbol: 'P', name: '磷', block: 'p', en: 2.19, radius: 107 },
  { z: 16, symbol: 'S', name: '硫', block: 'p', en: 2.58, radius: 105 },
  { z: 17, symbol: 'Cl', name: '氯', block: 'p', en: 3.16, radius: 102 },
  { z: 18, symbol: 'Ar', name: '氩', block: 'noble', en: 0, radius: 106 },
  { z: 19, symbol: 'K', name: '钾', block: 's', en: 0.82, radius: 203 },
  { z: 20, symbol: 'Ca', name: '钙', block: 's', en: 1.0, radius: 176 },
  { z: 26, symbol: 'Fe', name: '铁', block: 'd', en: 1.83, radius: 132 },
  { z: 29, symbol: 'Cu', name: '铜', block: 'ds', en: 1.9, radius: 132 },
  { z: 30, symbol: 'Zn', name: '锌', block: 'ds', en: 1.65, radius: 122 },
  { z: 35, symbol: 'Br', name: '溴', block: 'p', en: 2.96, radius: 120 },
  { z: 36, symbol: 'Kr', name: '氪', block: 'noble', en: 0, radius: 116 },
  { z: 47, symbol: 'Ag', name: '银', block: 'ds', en: 1.93, radius: 145 },
  { z: 53, symbol: 'I', name: '碘', block: 'p', en: 2.66, radius: 139 },
  { z: 79, symbol: 'Au', name: '金', block: 'ds', en: 2.54, radius: 136 },
];

export const FLIP_COUNT = 4;

/** 对战比较维度：原子序数 / 电负性 / 原子半径 */
export type BattleDimension = 'z' | 'en' | 'radius';

export interface DimensionMeta {
  id: BattleDimension;
  label: string;
  short: string;
  unit: string;
  higherWins: boolean;
}

export const DIMENSIONS: Record<BattleDimension, DimensionMeta> = {
  z: { id: 'z', label: '原子序数 Z', short: '序数', unit: '', higherWins: true },
  en: { id: 'en', label: '电负性 χ', short: '电负性', unit: '', higherWins: true },
  radius: {
    id: 'radius',
    label: '原子半径',
    short: '半径',
    unit: 'pm',
    higherWins: true,
  },
};

export function strengthOf(el: BattleElementDef, dim: BattleDimension): number {
  if (dim === 'en') return el.en;
  if (dim === 'radius') return el.radius;
  return el.z;
}

/** >0 a 更强，<0 b 更强，0 相等 */
export function compareStrength(
  a: BattleElementDef,
  b: BattleElementDef,
  dim: BattleDimension,
): number {
  return strengthOf(a, dim) - strengthOf(b, dim);
}

/** 牌：元素牌（可携带 element）或 FLIP 牌 */
export interface BattleCard {
  uid: string;
  kind: 'element' | 'flip';
  element?: BattleElementDef;
}

/** 构建一副可洗的牌（元素各 2 张 + FLIP） */
export function buildDeck(): BattleCard[] {
  const deck: BattleCard[] = [];
  let n = 0;
  for (const el of BATTLE_ELEMENTS) {
    const copies = el.copies ?? 2;
    for (let i = 0; i < copies; i++) {
      deck.push({
        uid: `el-${el.z}-${i}-${n++}`,
        kind: 'element',
        element: el,
      });
    }
  }
  for (let i = 0; i < FLIP_COUNT; i++) {
    deck.push({ uid: `flip-${i}`, kind: 'flip' });
  }
  return deck;
}

/** Fisher–Yates 洗牌（返回新数组） */
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}
