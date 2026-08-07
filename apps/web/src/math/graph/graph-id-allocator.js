/**
 * GraphIdAllocator：从整个文档建立 collision-proof id allocator。
 *
 * 文档是 id 唯一真值：扫描 functions/points/constructions 全部已占用 id，
 * 任何 record 类型都不重名。不规则 id（如用户导入的 'curve-A'）不阻塞分配。
 * 加载/import/reset 后必须 reseed，保证新对象不与已加载对象重名。
 */

/** 提取前缀型 id 的最大序号（f1/f2/… → 2；U1/U4 → 4；C8 → 8）。每次调用全新扫描。 */
function maxSeqFor(prefix) {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  return (ids) => {
    let max = 0;
    for (const id of ids) {
      const m = re.exec(id);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    return max;
  };
}

/**
 * @param {any} document
 * @returns {{
 *   nextFunctionId: () => string,
 *   nextPointId: () => string,
 *   nextConstructionId: () => string,
 *   reseed: (document: any) => void,
 * }}
 */
export function createGraphIdAllocator(document) {
  let fnMax = 0;
  let pointMax = 0;
  let constrMax = 0;

  const fnSeq = maxSeqFor('f');
  const pointSeq = maxSeqFor('U');
  const constrSeq = maxSeqFor('C');

  function scan(doc) {
    const fnIds = (doc?.functions || []).map((f) => f?.id).filter(Boolean);
    const pointIds = (doc?.points || []).map((p) => p?.id).filter(Boolean);
    const constrIds = (doc?.constructions || []).map((c) => c?.id).filter(Boolean);
    fnMax = fnSeq(fnIds);
    pointMax = pointSeq(pointIds);
    constrMax = constrSeq(constrIds);
  }

  function reseed(doc) {
    scan(doc);
  }

  scan(document);

  return {
    nextFunctionId() {
      fnMax += 1;
      return `f${fnMax}`;
    },
    nextPointId() {
      pointMax += 1;
      return `U${pointMax}`;
    },
    nextConstructionId() {
      constrMax += 1;
      return `C${constrMax}`;
    },
    reseed,
  };
}
