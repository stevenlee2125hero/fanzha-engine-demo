(function(root){
 const seed=CenterSeed,p=seed.projects[0],types=['pm','model','case'],defs=types.map(t=>seed.makeAgent(p,t));
 const byId=items=>[...new Map(items.map(x=>[x.id,x])).values()];
 const skills=byId(defs.flatMap(a=>a.skills)).map(s=>({...s,active:true,description:s.content,source:'Mock 公共资源'}));
 const tools=byId(defs.flatMap(a=>a.tools)).map(t=>({...t,version:'1.0.0',active:true,description:t.id==='project-search'?'检索项目资料与业务证据，现场绑定真实数据适配器。':'生成标准业务文档，现场接入现有报告程序。'}));
 const workflows=defs.map((a,i)=>({id:['requirement-flow','model-optimization-flow','case-analysis-flow'][i],name:['需求分析流程','模型优化流程','案情分析流程'][i],version:'1.0.0',active:true,description:'顺序编排：资料查询 → 专业分析 → 人工确认 → 文档输出。',nodes:a.workflow}));
 const mcp=[{id:'project-file',name:'项目文件 MCP',version:'1.0.0',active:true,description:'读取与搜索项目文件；这里只登记能力，不连接现场。',capabilities:['search','read']},{id:'fraud-database',name:'反诈数据 MCP',version:'1.0.0',active:true,description:'只读查询反诈业务数据，真实连接在项目现场绑定。',capabilities:['query-readonly','schema']}];
 const knowledge=[{id:'standard-output',name:'标准反诈输出规范',version:'1.0.0',active:true,description:'可随包交付的通用文档规范。',mode:'package',approved:true,content:'输出结论、依据、风险、验收标准与待确认事项；不能将推断写成事实。'},{id:'project-knowledge',name:'项目资料 RAG',version:'1.0.0',active:true,description:'项目 PRD、建设方案与历史资料的检索要求，现场绑定。',mode:'runtime'},{id:'model-rule-knowledge',name:'模型规则 RAG',version:'1.0.0',active:true,description:'检索模型规则、字段口径和脚本说明，现场绑定。',mode:'runtime'},{id:'case-evidence-knowledge',name:'案情证据 RAG',version:'1.0.0',active:true,description:'按授权任务检索涉案证据，实际案件数据不随包交付。',mode:'runtime'}];

 // 两个预置智能体复用公共能力快照；细化业务流程，不绑定实际数据源。
 const modelSkill={...skills.find(s=>s.id==='model-diagnosis'),id:'model-review',name:'模型覆盖与优化分析'};skills.push(modelSkill);
 modelSkill.content=modelSkill.description='结合规则及最新执行脚本、字段口径、检出/处置时间和模型中间表，区分送检上限、规则不匹配与数据异常；提出候选优化、样本对照和回归验收，不编造效果指标。';
 const caseSkill={...skills.find(s=>s.id==='case-analysis'),id:'case-trace',name:'涉案通联与溯源报告'};skills.push(caseSkill);
 caseSkill.content=caseSkill.description='以语音话单（含呼转）和短信话单核查通联；串联事件、检出和处置时间，核查模型覆盖及漏检原因；逐条引用证据，整理核查结论与待人工复核的报告。';
 const node=(id,title,type,target)=>({id,title,type,target,timeout:type==='human'?3600:120,retry:type==='human'?0:1});
 for(const flow of [{id:'model-review-flow',name:'模型优化核查流程',version:'1.0.0',active:true},{id:'case-trace-flow',name:'涉案溯源报告流程',version:'1.0.0',active:true}]){
  workflows.push(flow);
  const model=flow.id==='model-review-flow',skill=model?'model-review':'case-trace';
  flow.description=model?'资料与规则核查 → 检出处置对照 → 原因分析 → 优化建议 → 人工复核 → 方案输出。':'授权资料核查 → 语音短信通联 → 检出处置对照 → 证据溯源 → 人工复核 → 报告输出。';
  flow.nodes=[
   node('collect','核查授权范围、资料与字段口径','tool','project-search'),
   node('evidence',model?'核查执行规则及检出处置记录':'核查语音、短信及呼转通联','skill',skill),
   node('coverage','分析模型覆盖及时性与未检出原因','skill',skill),
   node('proposal',model?'形成候选优化与回归验证方案':'整理溯源证据与核查结论','skill',skill),
   node('approval','人工复核证据与建议','human',''),
   node('output',model?'生成模型优化建议书':'生成涉案溯源报告','tool','document-generator')
  ];
 }

 root.CenterLibrary={skills,workflows,mcp,knowledge,tools};
})(globalThis);
