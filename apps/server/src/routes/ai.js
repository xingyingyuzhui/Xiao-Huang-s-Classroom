/**
 * AI 路由组合根：保持 /api/ai 前缀与既有接口路径不变。
 * 具体领域接口分别维护在 ai/ 子目录。
 */

const express = require('express');

const router = express.Router();
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
router.use(require('./ai/math'));

module.exports = router;
