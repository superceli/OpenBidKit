// 目录生成 V2 的持久 Agent 任务标识，仅由技术方案业务层使用。
const OUTLINE_AGENT_TASK_KEY = 'technical-plan-outline-generation';
// 投标模版提取使用独立普通 Session 和持久工作区。
const TEMPLATE_EXTRACTION_AGENT_TASK_KEY = 'technical-plan-template-extraction';

module.exports = {
  OUTLINE_AGENT_TASK_KEY,
  TEMPLATE_EXTRACTION_AGENT_TASK_KEY,
};
