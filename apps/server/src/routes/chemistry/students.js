/**
 * B2 迁移桥：权威源为 src/routes/chemistry/students.ts（tsup CJS 产物）。
 * 本桥直接导出 createStudentsRouter 工厂（组合根注入 db 查询）。
 */
module.exports = require('../../../dist/routes/chemistry/students.js').createStudentsRouter;
