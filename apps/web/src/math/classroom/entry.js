/**
 * 数学课堂 Tab：概念讲解 · 智能出题 · 随机点名
 */

import { aiApi, studentApi } from '../../shared/api/client.js';
import { showAppBubble } from '../../shared/ui/brand-tip.js';
import { MATH_CLASSROOM_TOPICS, MATH_DIFFICULTIES, MATH_GRADES, getMathTopic } from './topics.js';
import { escapeHtml, renderRichMathText } from './render-rich.js';

const $ = (sel) => document.querySelector(sel);

const SECTIONS = [
  {
    id: 'explain',
    title: '概念讲解',
    desc: '选主题 · AI 讲解 · 示范参数推到实验台',
  },
  {
    id: 'quiz',
    title: '智能出题',
    desc: '按主题或当前实验台出题',
  },
  {
    id: 'rollcall',
    title: '随机点名',
    desc: '班级名单与点名',
  },
];

let currentSection = 'explain';
let selectedTopicId = MATH_CLASSROOM_TOPICS[0]?.id || 'quadratic';
let quizBusy = false;
/** @type {{ questions: any[], paperId: string | null, answers: Record<string, number>, revealed: boolean } | null} */
let quizState = null;
/** @type {Array<{ id: string, name: string }>} */
let students = [];
let spinning = false;
let spinTimer = 0;
let inited = false;

/** @type {((tabId: string) => void | Promise<void>) | null} */
let switchLabTab = null;
/** @type {(() => import('../shared/lab-bridge.js').LabSnapshot | null) | null} */
let getLabSnapshot = null;
/** @type {((action: import('../shared/lab-bridge.js').LabAction) => Promise<{ ok: boolean, message?: string }>) | null} */
let applyLabAction = null;

/** @type {string} */
let labContextPreview = '';

function setStatus(el, text, ok) {
  if (!el) return;
  el.textContent = text || '';
  el.className = 'quiz-status' + (text ? (ok === true ? ' is-ok' : ok === false ? ' is-err' : '') : '');
}

function renderNav() {
  const list = $('#mathAiNavList');
  if (!list) return;
  list.innerHTML = SECTIONS.map(
    (s) => `
    <button type="button" class="ai-nav-card${currentSection === s.id ? ' is-active' : ''}" data-math-ai-section="${s.id}" role="listitem">
      <span class="ai-nav-card-title"><strong>${escapeHtml(s.title)}</strong></span>
      <span>${escapeHtml(s.desc)}</span>
    </button>`,
  ).join('');
  list.querySelectorAll('[data-math-ai-section]').forEach((btn) => {
    btn.addEventListener('click', () => selectSection(btn.getAttribute('data-math-ai-section') || 'explain'));
  });
}

function selectSection(id) {
  if (!id) return;
  currentSection = id;
  renderNav();
  const explain = $('#mathAiSectionExplain');
  const quiz = $('#mathAiSectionQuiz');
  const roll = $('#mathAiSectionRollcall');
  if (explain) explain.hidden = id !== 'explain';
  if (quiz) quiz.hidden = id !== 'quiz';
  if (roll) roll.hidden = id !== 'rollcall';
  if (id === 'rollcall') void loadStudents();
}

function renderTopicList() {
  const host = $('#mathExplainTopics');
  if (!host) return;
  host.innerHTML = MATH_CLASSROOM_TOPICS.map((t) => {
    const on = t.id === selectedTopicId;
    return `<button type="button" class="math-topic-chip${on ? ' is-on' : ''}" data-math-topic="${t.id}">
      <strong>${escapeHtml(t.label)}</strong>
      <span>${escapeHtml(t.blurb)}</span>
    </button>`;
  }).join('');
  host.querySelectorAll('[data-math-topic]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedTopicId = btn.getAttribute('data-math-topic') || selectedTopicId;
      renderTopicList();
      syncTopicMeta();
    });
  });
  syncTopicMeta();
}

function syncTopicMeta() {
  const topic = getMathTopic(selectedTopicId);
  const meta = $('#mathExplainTopicMeta');
  const labBtn = $('#btnMathExplainOpenLab');
  if (meta) {
    meta.textContent = topic
      ? `${topic.label} · ${topic.blurb}`
      : '选择左侧主题开始讲解';
  }
  if (labBtn) {
    if (topic?.labTab) {
      labBtn.hidden = false;
      labBtn.textContent = `打开「${topic.labLabel || '实验台'}」`;
      labBtn.dataset.labTab = topic.labTab;
    } else {
      labBtn.hidden = true;
      delete labBtn.dataset.labTab;
    }
  }
}

function renderLabActions(topic) {
  const bar = $('#mathExplainLabActions');
  if (!bar) return;
  const actions = topic?.labActions || [];
  if (!actions.length) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }
  bar.hidden = false;
  bar.innerHTML = `
    <p class="math-field-label">应用到实验台（教师示范）</p>
    <div class="math-chip-row math-lab-action-row">
      ${actions
        .map(
          (a, i) =>
            `<button type="button" class="btn ghost btn-sm" data-lab-action-i="${i}">${escapeHtml(
              a.label || '应用示范',
            )}</button>`,
        )
        .join('')}
    </div>
    <p class="quiz-status" id="mathExplainLabActionStatus" aria-live="polite"></p>
  `;
  bar.querySelectorAll('[data-lab-action-i]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const i = Number(btn.getAttribute('data-lab-action-i'));
      const action = actions[i];
      if (!action || !applyLabAction) {
        setStatus($('#mathExplainLabActionStatus'), '实验台桥未就绪', false);
        return;
      }
      setStatus($('#mathExplainLabActionStatus'), '正在应用到实验台…');
      try {
        const res = await applyLabAction(action);
        setStatus(
          $('#mathExplainLabActionStatus'),
          res?.message || (res?.ok ? '已应用' : '应用失败'),
          Boolean(res?.ok),
        );
        if (res?.ok) showAppBubble?.(res.message || '已应用到实验台');
      } catch (err) {
        setStatus($('#mathExplainLabActionStatus'), err?.message || String(err), false);
      }
    });
  });
}

async function runExplain() {
  const topic = getMathTopic(selectedTopicId);
  const focus = /** @type {HTMLTextAreaElement | null} */ ($('#mathExplainFocus'))?.value?.trim() || '';
  const status = $('#mathExplainStatus');
  const body = $('#mathExplainBody');
  const btn = /** @type {HTMLButtonElement | null} */ ($('#btnMathExplain'));
  if (!topic) {
    setStatus(status, '请先选择主题', false);
    return;
  }
  if (btn) btn.disabled = true;
  setStatus(status, '正在生成讲解…');
  if (body) body.innerHTML = '<p class="math-empty">小黄老师板书中…</p>';
  renderLabActions(null);
  try {
    const data = await aiApi.lessonExplain({
      topic: topic.label,
      focus,
      labHint: topic.labTab
        ? `本教室有「${topic.labLabel}」实验台（Tab: ${topic.labTab}），可建议学生动手验证；讲解后可一键把示范参数写到实验台`
        : '',
    });
    if (body) body.innerHTML = renderRichMathText(data?.text || '');
    renderLabActions(topic);
    setStatus(status, '讲解已生成 · 可把示范参数推到实验台', true);
    showAppBubble?.('概念讲解已就绪');
  } catch (err) {
    const msg = err?.message || String(err);
    if (body) body.innerHTML = `<p class="math-empty is-err">${escapeHtml(msg)}</p>`;
    setStatus(status, msg, false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderQuizConfig() {
  const grades = $('#mathQuizGrades');
  const topics = $('#mathQuizTopics');
  const diffs = $('#mathQuizDifficulty');
  if (grades && !grades.dataset.ready) {
    grades.dataset.ready = '1';
    grades.innerHTML = MATH_GRADES.map(
      (g) =>
        `<button type="button" class="quiz-chip is-on" data-math-grade="${g.id}">${g.label}</button>`,
    ).join('');
    grades.querySelectorAll('[data-math-grade]').forEach((btn) => {
      btn.addEventListener('click', () => btn.classList.toggle('is-on'));
    });
  }
  if (topics && !topics.dataset.ready) {
    topics.dataset.ready = '1';
    topics.innerHTML = MATH_CLASSROOM_TOPICS.map(
      (t) =>
        `<button type="button" class="quiz-topic${t.id === 'quadratic' ? ' is-on' : ''}" data-math-qtopic="${escapeHtml(t.label)}">${escapeHtml(t.label)}</button>`,
    ).join('');
    topics.querySelectorAll('[data-math-qtopic]').forEach((btn) => {
      btn.addEventListener('click', () => btn.classList.toggle('is-on'));
    });
  }
  if (diffs && !diffs.dataset.ready) {
    diffs.dataset.ready = '1';
    diffs.innerHTML = MATH_DIFFICULTIES.map(
      (d) =>
        `<button type="button" class="quiz-chip${d.id === 'medium' ? ' is-on' : ''}" data-math-diff="${d.id}" title="${escapeHtml(d.desc)}">${d.label}</button>`,
    ).join('');
    diffs.querySelectorAll('[data-math-diff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        diffs.querySelectorAll('[data-math-diff]').forEach((b) => b.classList.remove('is-on'));
        btn.classList.add('is-on');
      });
    });
  }
  const count = /** @type {HTMLInputElement | null} */ ($('#mathQuizCount'));
  const countLabel = $('#mathQuizCountLabel');
  if (count && countLabel && !count.dataset.bound) {
    count.dataset.bound = '1';
    count.addEventListener('input', () => {
      countLabel.textContent = count.value;
    });
  }
}

function collectQuizConfig() {
  const grades = [...document.querySelectorAll('#mathQuizGrades .quiz-chip.is-on')].map((el) =>
    Number(el.getAttribute('data-math-grade')),
  );
  const topics = [...document.querySelectorAll('#mathQuizTopics .quiz-topic.is-on')].map((el) =>
    el.getAttribute('data-math-qtopic') || '',
  );
  const diffBtn = document.querySelector('#mathQuizDifficulty .quiz-chip.is-on');
  const difficulty = diffBtn?.getAttribute('data-math-diff') || 'medium';
  const count = Number(/** @type {HTMLInputElement | null} */ ($('#mathQuizCount'))?.value || 5);
  return {
    grades: grades.length ? grades : [1, 2, 3],
    topics: topics.filter(Boolean),
    difficulty,
    count,
  };
}

function showQuizView(which) {
  const config = $('#mathQuizConfig');
  const paper = $('#mathQuizPaper');
  const result = $('#mathQuizResult');
  if (config) config.hidden = which !== 'config';
  if (paper) paper.hidden = which !== 'paper';
  if (result) result.hidden = which !== 'result';
}

function renderQuizPaper() {
  const host = $('#mathQuizQuestions');
  if (!host || !quizState) return;
  host.innerHTML = quizState.questions
    .map((q, i) => {
      const opts = (q.options || [])
        .map(
          (opt, j) => `
        <label class="quiz-option">
          <input type="radio" name="math-q-${escapeHtml(q.id || String(i))}" value="${j}" ${
            quizState.answers[q.id] === j ? 'checked' : ''
          } />
          <span>${escapeHtml(String.fromCharCode(65 + j))}. ${escapeHtml(String(opt))}</span>
        </label>`,
        )
        .join('');
      return `
      <article class="quiz-question" data-qid="${escapeHtml(q.id || String(i))}">
        <h4>${i + 1}. <span class="math-quiz-stem">${escapeHtml(q.stem || '')}</span></h4>
        <p class="quiz-paper-meta">${escapeHtml(q.knowledge || '')}</p>
        <div class="quiz-options">${opts}</div>
        <div class="quiz-q-actions">
          <button type="button" class="btn ghost btn-sm" data-math-hint="${escapeHtml(q.id || String(i))}">提示</button>
        </div>
        <p class="quiz-status" data-math-hint-out="${escapeHtml(q.id || String(i))}"></p>
      </article>`;
    })
    .join('');

  host.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.addEventListener('change', () => {
      const name = input.getAttribute('name') || '';
      const qid = name.replace(/^math-q-/, '');
      quizState.answers[qid] = Number(/** @type {HTMLInputElement} */ (input).value);
    });
  });
  host.querySelectorAll('[data-math-hint]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const qid = btn.getAttribute('data-math-hint');
      const q = quizState?.questions.find((x) => x.id === qid);
      const out = host.querySelector(`[data-math-hint-out="${CSS.escape(qid || '')}"]`);
      if (!q || !out) return;
      out.textContent = '获取提示中…';
      try {
        const data = await aiApi.quizHint({
          stem: q.stem,
          options: q.options,
          knowledge: q.knowledge,
        });
        out.textContent = data?.text || q.hint || '再读题干中的已知与所求。';
        out.className = 'quiz-status is-ok';
      } catch (err) {
        out.textContent = err?.message || q.hint || '提示失败';
        out.className = 'quiz-status is-err';
      }
    });
  });
}

function refreshLabContextPreview() {
  const el = $('#mathQuizLabContext');
  const snap = getLabSnapshot?.() || null;
  if (!el) return;
  if (!snap) {
    labContextPreview = '';
    el.textContent = '当前没有可读的实验台状态（先打开函数画布等 Tab 并操作一下）。';
    return;
  }
  labContextPreview = [
    `实验台：${snap.label}`,
    snap.summary,
    snap.formula ? `公式：${snap.formula}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  el.textContent = labContextPreview;
}

/**
 * @param {{ useLab?: boolean, forceTopics?: string[] }} [opts]
 */
async function generateMathQuiz(opts = {}) {
  if (quizBusy) return;
  quizBusy = true;
  const status = $('#mathQuizConfigStatus');
  const btn = /** @type {HTMLButtonElement | null} */ ($('#btnMathQuizGenerate'));
  const btnLab = /** @type {HTMLButtonElement | null} */ ($('#btnMathQuizFromLab'));
  if (btn) btn.disabled = true;
  if (btnLab) btnLab.disabled = true;
  setStatus(status, '正在出题…');
  try {
    const cfg = collectQuizConfig();
    let topics = opts.forceTopics?.length ? opts.forceTopics : cfg.topics;
    let labContext = '';
    if (opts.useLab) {
      refreshLabContextPreview();
      const snap = getLabSnapshot?.();
      if (!snap) throw new Error('请先在实验台操作，再按实验台出题');
      const { snapshotToQuizContext } = await import('../shared/lab-bridge.js');
      labContext = snapshotToQuizContext(snap);
      if (!topics.length) topics = [snap.label];
    }
    const data = await aiApi.quizGenerate({
      grades: cfg.grades.map((g) => MATH_GRADES.find((x) => x.id === g)?.label || String(g)),
      topics,
      difficulty: cfg.difficulty,
      count: cfg.count,
      labContext: labContext || undefined,
    });
    const questions = Array.isArray(data?.questions) ? data.questions : [];
    if (!questions.length) throw new Error('未生成题目，请重试');
    quizState = {
      questions,
      paperId: data.paperId || null,
      answers: {},
      revealed: false,
    };
    renderQuizPaper();
    showQuizView('paper');
    const meta = $('#mathQuizPaperMeta');
    if (meta) {
      meta.textContent = `${questions.length} 题 · ${cfg.difficulty} · ${
        opts.useLab ? '绑定实验台 · ' : ''
      }${topics.slice(0, 3).join('、') || '综合'}`;
    }
    setStatus(status, '', true);
  } catch (err) {
    setStatus(status, err?.message || String(err), false);
  } finally {
    quizBusy = false;
    if (btn) btn.disabled = false;
    if (btnLab) btnLab.disabled = false;
  }
}

function submitMathQuiz() {
  if (!quizState) return;
  const list = $('#mathQuizResultList');
  const scoreLine = $('#mathQuizScoreLine');
  let correct = 0;
  const rows = quizState.questions.map((q, i) => {
    const picked = quizState.answers[q.id];
    const ok = picked === q.answer;
    if (ok) correct += 1;
    const ans = typeof q.answer === 'number' ? String.fromCharCode(65 + q.answer) : '?';
    const yours =
      typeof picked === 'number' ? String.fromCharCode(65 + picked) : '未作答';
    return `<div class="quiz-result-item ${ok ? 'is-ok' : 'is-bad'}">
      <strong>${i + 1}. ${escapeHtml(q.stem || '')}</strong>
      <p>你的答案：${yours} · 正确：${ans}</p>
      <p class="quiz-paper-meta">${escapeHtml(q.explain || q.knowledge || '')}</p>
    </div>`;
  });
  if (list) list.innerHTML = rows.join('');
  if (scoreLine) {
    scoreLine.textContent = `正确 ${correct} / ${quizState.questions.length}（${Math.round(
      (correct / Math.max(1, quizState.questions.length)) * 100,
    )}%）`;
  }
  quizState.revealed = true;
  showQuizView('result');
}

async function loadStudents() {
  const list = $('#mathRollcallStudentList');
  try {
    const data = await studentApi.getList();
    students = Array.isArray(data) ? data : data?.students || [];
  } catch {
    students = [];
  }
  if (list) {
    list.innerHTML = students.length
      ? students
          .map(
            (s) =>
              `<li><span>${escapeHtml(s.name)}</span><button type="button" class="btn ghost btn-sm" data-math-rm="${escapeHtml(s.id)}">删除</button></li>`,
          )
          .join('')
      : '<li class="math-empty">暂无名单，先添加学生</li>';
    list.querySelectorAll('[data-math-rm]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-math-rm');
        if (!id) return;
        try {
          await studentApi.remove(id);
          await loadStudents();
        } catch (err) {
          setStatus($('#mathRollcallStatus'), err?.message || '删除失败', false);
        }
      });
    });
  }
}

async function addStudent() {
  const input = /** @type {HTMLInputElement | null} */ ($('#mathRollcallNameInput'));
  const name = input?.value?.trim();
  if (!name) return;
  try {
    await studentApi.add(name);
    if (input) input.value = '';
    await loadStudents();
  } catch (err) {
    setStatus($('#mathRollcallStatus'), err?.message || '添加失败', false);
  }
}

function spinRollcall() {
  if (spinning) return;
  if (!students.length) {
    setStatus($('#mathRollcallStatus'), '请先添加名单', false);
    return;
  }
  spinning = true;
  const nameEl = $('#mathRollcallCardName');
  const again = $('#btnMathRollcallAgain');
  let i = 0;
  const start = Date.now();
  window.clearInterval(spinTimer);
  spinTimer = window.setInterval(() => {
    const s = students[i % students.length];
    if (nameEl) nameEl.textContent = s.name;
    i += 1;
    if (Date.now() - start > 1600) {
      window.clearInterval(spinTimer);
      const winner = students[Math.floor(Math.random() * students.length)];
      if (nameEl) nameEl.textContent = winner.name;
      setStatus($('#mathRollcallStatus'), `请 ${winner.name} 回答`, true);
      spinning = false;
      if (again) again.hidden = false;
    }
  }, 70);
}

function bindOnce() {
  const root = $('#panel-math-ai');
  if (!root || root.dataset.mathClassroomBound) return;
  root.dataset.mathClassroomBound = '1';

  $('#btnMathExplain')?.addEventListener('click', () => void runExplain());
  $('#btnMathExplainOpenLab')?.addEventListener('click', () => {
    const tab = /** @type {HTMLElement} */ ($('#btnMathExplainOpenLab'))?.dataset?.labTab;
    if (tab && switchLabTab) void switchLabTab(tab);
  });
  $('#btnMathQuizGenerate')?.addEventListener('click', () => void generateMathQuiz({ useLab: false }));
  $('#btnMathQuizFromLab')?.addEventListener('click', () => void generateMathQuiz({ useLab: true }));
  $('#btnMathQuizRefreshLab')?.addEventListener('click', () => refreshLabContextPreview());
  $('#btnMathQuizBackConfig')?.addEventListener('click', () => showQuizView('config'));
  $('#btnMathQuizSubmit')?.addEventListener('click', () => submitMathQuiz());
  $('#btnMathQuizAgain')?.addEventListener('click', () => {
    showQuizView('config');
    void generateMathQuiz({ useLab: Boolean(labContextPreview) });
  });
  $('#btnMathRollcallAdd')?.addEventListener('click', () => void addStudent());
  $('#btnMathRollcallSpin')?.addEventListener('click', () => spinRollcall());
  $('#btnMathRollcallAgain')?.addEventListener('click', () => spinRollcall());
  $('#mathRollcallNameInput')?.addEventListener('keydown', (ev) => {
    if (/** @type {KeyboardEvent} */ (ev).key === 'Enter') {
      ev.preventDefault();
      void addStudent();
    }
  });

}

/**
 * @param {{
 *   switchTab?: (tabId: string) => void | Promise<void>,
 *   getLabSnapshot?: () => import('../shared/lab-bridge.js').LabSnapshot | null,
 *   applyLabAction?: (action: import('../shared/lab-bridge.js').LabAction) => Promise<{ ok: boolean, message?: string }>,
 * }} [opts]
 */
export function initMathClassroom(opts = {}) {
  switchLabTab = typeof opts.switchTab === 'function' ? opts.switchTab : null;
  getLabSnapshot = typeof opts.getLabSnapshot === 'function' ? opts.getLabSnapshot : null;
  applyLabAction = typeof opts.applyLabAction === 'function' ? opts.applyLabAction : null;
  if (!inited) {
    inited = true;
    bindOnce();
    renderNav();
    renderTopicList();
    renderQuizConfig();
    selectSection('explain');
    showQuizView('config');
    refreshLabContextPreview();
  } else {
    renderNav();
    selectSection(currentSection);
    refreshLabContextPreview();
  }
}

export function disposeMathClassroom() {
  window.clearInterval(spinTimer);
  spinning = false;
}
