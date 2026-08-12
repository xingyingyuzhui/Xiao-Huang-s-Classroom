/**
 * AI 路由组合根：保持 /api/ai 前缀与既有接口路径不变。
 * 具体领域接口分别维护在 ai/ 子目录。
 *
 * Public web (CHEM_LAB_BIND=0.0.0.0, not Electron/pkg): refuse all /api/ai.
 * Keys must not be sent to lab; use POST /api/cloud/v1/ai/chat instead.
 * Electron / pkg may keep local provider keys for offline classroom AI.
 */

const express = require('express');
const { isElectron, isPkg } = require('../paths');

const router = express.Router();

function isPublicLabDeployment() {
  if (isElectron() || isPkg()) return false;
  const bind = String(process.env.CHEM_LAB_BIND || '').trim();
  return bind === '0.0.0.0' || bind === '::' || bind === '*';
}

function refusePublicAi(_req, res, next) {
  if (!isPublicLabDeployment()) return next();
  res.status(403).json({
    success: false,
    message: '公网请使用云端 AI（需登录）。实验室进程不接收或保存 API Key。',
  });
}

router.use(refusePublicAi);
router.use(require('./ai/molecules')({ callDeepSeekChat: require('../services/ai/chat-service').callDeepSeekChat }));
router.use(
  require('./ai/quiz')({
    generateQuiz: require('../services/ai/quiz-service').generateQuiz,
    generateHint: require('../services/ai/quiz-service').generateHint,
    generateExplain: require('../services/ai/quiz-service').generateExplain,
    explainFallback: require('../services/ai/quiz-service').explainFallback,
    scoreQuiz: require('../services/ai/quiz-service').scoreQuiz,
    summarizeQuiz: require('../services/ai/quiz-service').summarizeQuiz,
    reserveCall: require('../utils/quiz-assist-limit').reserveCall,
    releaseCall: require('../utils/quiz-assist-limit').releaseCall,
  }),
);
router.use(require('./ai/lesson')({ explainConcept: require('../services/ai/lesson-service').explainConcept }));
router.use(
  require('./ai/chemistry')({
    generateTip: require('../services/chemistry/ai-service').generateTip,
    tipLocalFallback: require('../services/chemistry/ai-service').tipLocalFallback,
    generateReaction: require('../services/chemistry/ai-service').generateReaction,
    generateStoich: require('../services/chemistry/ai-service').generateStoich,
    generateLab: require('../services/chemistry/ai-service').generateLab,
    generateBalanceStepTip: require('../services/chemistry/ai-service').generateBalanceStepTip,
    generateBalance: require('../services/chemistry/ai-service').generateBalance,
  }),
);
router.use(require('./ai/math')({ generateMathFunction: require('../services/ai/math-fn-service').generateMathFunction }));

module.exports = router;
