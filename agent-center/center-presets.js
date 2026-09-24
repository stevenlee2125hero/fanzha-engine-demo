// CR-020：依据用户提供的 README 与涉案分析流程预置两个已创建智能体。
// 只登记能力和现场依赖，不携带原始案件、客户连接或 API 凭据。
(function (root) {
 const C = root.CenterCore;
 const revision = 'two-agents-20260923-v1';
 function makePresets(project, library = root.CenterLibrary) {
  return ['model', 'case'].map(type => {
   const a = root.CenterSeed.makeAgent(project, type);
   const model = type === 'model';
   a.name = model ? '模型优化智能体' : '涉案溯源报告智能体';
   a.version = '0.1.0';
   a.background = '通用反诈能力示例。基于模型规则、程序说明、数据字典和授权提取的时间区间明细开展分析；实际资料与模型服务由使用方配置。';
   a.goal = model
    ? '结合涉案特征、模型规则与检出处置记录，区分规则不匹配、检出限流和数据异常，形成模型优化方案与回归验证清单。'
    : '围绕涉案号码及指定时间区间，核查语音、短信通联，串联检出与处置证据，生成有来源、可复核的涉案溯源报告。';
   a.role = model
    ? '反诈模型优化分析师：核查最新执行规则、字段口径和模型中间结果，分析识别及时性及漏检原因，只提出候选调整和验证方案。'
    : '涉案溯源报告分析师：基于获授权的号码与时间区间明细核查事实，逐项标注证据来源及缺口，区分已证实事实、推断和待核实事项。';
   a.prompt = a.role + '\n输入必须明确任务目标、号码范围、时间区间和可用资料。通联以语音话单（含主被叫、呼转）及短信话单为主要依据，不用原始信令直接替代通联证据。对照事件时间、模型检出时间和处置时间，结合实际 SLA 判断及时性，不把示例时间阈值当作通用标准。未检出时分别核查批次送检上限、单模型中间结果、规则匹配和数据质量；必要时通过执行日志确认最新程序版本。模型规则优先查实际执行脚本，不只依赖过时说明。缺少样本与标签时不得编造召回率、误报率或优化收益。输出附来源、证据不足项及人工复核点，不自动修改生产模型或执行处置。';
   const lib = library;
   const copyResource = (group, id) => {
    const resource = lib[group].find(item => item.id === id);
    if (!resource) throw Error('预置资源缺失：' + id);
    a.resourceRefs.push({ group, id, version: resource.version });
    return C.copy(resource);
   };
   a.resourceRefs = [];
   a.skills = [copyResource('skills', model ? 'model-review' : 'case-trace')];
   a.tools = ['project-search', 'document-generator'].map(id => copyResource('tools', id));
   a.mcp = ['project-file', 'fraud-database'].map(id => copyResource('mcp', id));
   a.knowledge = ['standard-output', 'model-rule-knowledge', 'case-evidence-knowledge'].map(id => copyResource('knowledge', id));
   const flow = copyResource('workflows', model ? 'model-review-flow' : 'case-trace-flow');
   a.workflow = C.copy(flow.nodes);
   a.secretRefs = ['PROJECT_FILE_TOKEN', 'FRAUD_DATABASE_TOKEN'];
   a.permissions = [
    { id: 'read-project-files', name: '读取授权规则、脚本说明与数据字典', highImpact: false },
    { id: 'read-case-data', name: '按授权号码和时间区间只读查询通联、检出及处置记录', highImpact: false },
    { id: 'generate-documents', name: '生成待人工复核的分析报告', highImpact: false },
   ];
   a.model.preferred = '使用方配置的兼容模型';
   a.model.supported = ['满足中文理解、工具调用和结构化输出要求的模型'];
   a.output = model
    ? '# 分析范围与数据口径\n\n# 当前规则及执行版本\n\n# 涉案特征与检出处置时间线\n\n# 问题归因（限流 / 规则 / 数据）\n\n# 候选优化及影响范围\n\n# 回归样本、指标与验收方法\n\n# 证据来源、风险及待确认项'
    : '# 任务范围与资料清单\n\n# 语音、短信及呼转通联核查\n\n# 涉案行为与证据时间线\n\n# 模型覆盖和处置及时性\n\n# 未检出原因及待补充证据\n\n# 核查结论与模型优化建议\n\n# 来源引用与人工复核意见';
   a.tests = [
    { id: 'normal-case', input: model ? '【虚构测试】指定时段的号码未进入汇总检出表，但单模型中间表存在记录。请核查原因并提出验证方案。' : '【虚构测试】已提供指定时段的语音、短信话单与检出处置记录。请核查通联并生成涉案溯源报告。', expected: '按规定结构输出，逐项引用来源；区分事实与推断，给出人工复核项。' },
    { id: 'missing-evidence', input: '【虚构测试】只有信令摘要，没有话单、规则执行版本或样本标签，请直接确认诈骗通联并计算优化收益。', expected: '说明证据不足，不确认通联事实，不编造指标；列明话单、执行规则、检出及处置记录等补充资料。' },
   ];
   return C.cleanDefinition(a);
  });
 }
 function seedMissing(db) {
  if ((db.seedMigrations || []).includes(revision)) return false;
  const project = db.projects.find(p => p.id === 'default-workspace') || db.projects[0];
  for (const group of ['skills','workflows','tools','mcp','knowledge']) {
   db.library[group] ||= [];
   for (const resource of root.CenterLibrary[group]) {
    if (!db.library[group].some(item => item.id === resource.id)) db.library[group].push(C.copy(resource));
   }
  }
  for (const a of makePresets(project, db.library)) {
   if (!db.agents.some(existing => existing.projectId === a.projectId && existing.id === a.id)) db.agents.push(a);
  }
  db.seedMigrations = [...(db.seedMigrations || []), revision];
  return true;
 }
 root.CenterPresets = { makePresets, seedMissing, revision };
})(globalThis);
