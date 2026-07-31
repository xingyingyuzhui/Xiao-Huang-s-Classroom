/**
 * 学科概念讲解（课堂 Tab）
 */

const { READY_SUBJECT_IDS } = require('@xiaohuang/subject-settings');
const { callDeepSeekChat } = require('./chat-service');

function resolveSubjectId(subjectId) {
  return READY_SUBJECT_IDS.includes(subjectId) ? subjectId : 'chemistry';
}

function subjectPersona(sid) {
  if (sid === 'math') {
    return {
      role: '高中数学老师',
      domain: '普通高中数学（必修与选择性必修）',
      style: `讲解要求：
1. 先给结论/定义，再给推导或数形结合直觉
2. 关键公式用 LaTeX，行内 $...$，独立公式 $$...$$
3. 指出常见误区 1～2 条
4. 若适合动手探究，末尾用一行「建议实验：」点出可去函数画布/直线与圆/三角函数/数列/立体几何哪一模块验证
5. 中文，条理清晰，控制在 350～700 字；不要 Markdown 一级标题`,
    };
  }
  if (sid === 'physics') {
    return {
      role: '高中物理老师',
      domain: '高中物理',
      style: '用简洁中文讲解概念与公式，控制在 400 字内。',
    };
  }
  if (sid === 'biology') {
    return {
      role: '高中生物老师',
      domain: '高中生物',
      style: '用简洁中文讲解概念，控制在 400 字内。',
    };
  }
  return {
    role: '高中化学老师',
    domain: '高中化学',
    style: '用简洁中文讲解概念与反应原理，控制在 400 字内。',
  };
}

/**
 * @param {{
 *   topic?: string,
 *   focus?: string,
 *   labHint?: string,
 *   subjectId?: string,
 * }} opts
 */
async function explainConcept({
  topic = '',
  focus = '',
  labHint = '',
  subjectId = 'chemistry',
} = {}) {
  const sid = resolveSubjectId(subjectId);
  const persona = subjectPersona(sid);
  const topicText = String(topic || '').trim() || '高中核心概念';
  const focusText = String(focus || '').trim();
  const labText = String(labHint || '').trim();

  const system = `你是一位亲切、严谨的${persona.role}，正在「小黄的教室」为学生做概念讲解。
学科范围：${persona.domain}
${persona.style}
不要输出与教学无关的开场白。`;

  const user = `请讲解主题：${topicText}
${focusText ? `学生特别想搞清：${focusText}` : '请按高考常见要求讲清定义、性质/方法与典型例子。'}
${labText ? `可关联实验台：${labText}` : ''}
请开始讲解。`;

  const { content } = await callDeepSeekChat({
    system,
    user,
    temperature: 0.45,
    max_tokens: 1600,
    kind: 'lesson-explain',
    subjectId: sid,
  });

  let text = String(content || '').trim();
  if (!text) {
    text =
      sid === 'math'
        ? `关于「${topicText}」：先回到定义与条件，再结合图象或特例验证。可在对应实验台动手调参加深理解。`
        : `关于「${topicText}」：请先回顾课本定义与典型例题，再尝试自己复述要点。`;
  }
  // labActions 由前端按主题目录注入（可靠示范动作）；此处只回传提示字段
  return {
    text,
    topic: topicText,
    focus: focusText,
    subjectId: sid,
    /** 提示前端：可应用实验台示范（P1 teacher-action） */
    suggestLab: Boolean(labText) || sid === 'math',
  };
}

module.exports = {
  explainConcept,
};
