(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const idPattern=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const versionPattern=/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
  const FORMAT='agent-center-preview/1';
  const json=x=>JSON.stringify(x,null,2);
  const check=(value,message)=>{if(!value)throw new Error(message);};
  function compareVersions(a,b){check(versionPattern.test(a)&&versionPattern.test(b),'版本格式应为 x.y.z');const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
  async function digest(text){check(root.crypto?.subtle,'当前浏览器不支持摘要计算，请通过 localhost 访问原型');const bytes=new TextEncoder().encode(text);return [...new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
  function validateDefinition(value){
    check(value&&typeof value==='object'&&!Array.isArray(value),'智能体定义无效');
    const a=copy(value);
    for(const key of ['id','projectId'])check(typeof a[key]==='string'&&idPattern.test(a[key])&&a[key].length<=80,`${key} 格式无效`);
    for(const key of ['name','goal','role','prompt','background','output'])check(typeof a[key]==='string'&&a[key].trim()&&a[key].length<=20000,`${key} 不能为空或过长`);
    check(a.name.length<=70,'智能体名称最多 70 字');
    check(versionPattern.test(a.version),'版本格式应为 x.y.z，例如 1.2.0');
    for(const group of ['skills','workflow','knowledge','tools','mcp','permissions','secretRefs','tests']){
      check(Array.isArray(a[group])&&a[group].length<=50,`${group} 应为最多 50 项的数组`);
    }
    for(const group of ['skills','workflow','knowledge','tools','mcp','permissions','tests']){
      const seen=new Set();a[group].forEach(x=>{check(x&&typeof x==='object'&&typeof x.id==='string'&&idPattern.test(x.id)&&x.id.length<=80&&!seen.has(x.id),`${group} 的标识无效或重复`);seen.add(x.id);});
    }
    check(a.skills.length&&a.workflow.length&&a.tests.length,'Skill、Workflow 和测试用例至少各一项');
    a.skills.forEach(s=>check(typeof s.name==='string'&&s.name.trim()&&typeof s.content==='string'&&s.content.trim()&&versionPattern.test(s.version),'Skill 名称、版本与内容必须完整'));
    a.tools.forEach(t=>check(typeof t.name==='string'&&t.name.trim()&&t.inputSchema?.type==='object'&&t.outputSchema?.type==='object','Tool 需要名称与输入输出对象 Schema'));
    a.workflow.forEach(n=>{
      check(['skill','tool','human'].includes(n.type),'本期只支持顺序 Skill、Tool 与人工确认节点');
      check(typeof n.title==='string'&&n.title.trim()&&Number.isInteger(n.timeout)&&n.timeout>=1&&n.timeout<=3600&&Number.isInteger(n.retry)&&n.retry>=0&&n.retry<=3,'流程节点名称、超时或重试次数无效');
      if(n.type==='skill')check(a.skills.some(s=>s.id===n.target),'Workflow 引用了不存在的 Skill');
      if(n.type==='tool')check(a.tools.some(t=>t.id===n.target),'Workflow 引用了不存在的 Tool');
    });
    a.knowledge.forEach(k=>{check(['package','runtime'].includes(k.mode)&&typeof k.name==='string','知识类型无效');if(k.mode==='package')check(typeof k.content==='string'&&k.content.trim()&&typeof k.approved==='boolean','随包知识需要正文和审批标记');else check(!k.content,'现场知识只能声明要求，不能包含正文');});
    a.mcp.forEach(m=>check(typeof m.name==='string'&&Array.isArray(m.capabilities)&&m.capabilities.every(c=>typeof c==='string'),'MCP 依赖定义无效'));
    a.permissions.forEach(p=>check(typeof p.name==='string'&&typeof p.highImpact==='boolean','权限要求无效'));
    a.secretRefs.forEach(s=>check(typeof s==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(s),'Secret 只能填写大写引用名称，不能填写实际密钥'));
    check(new Set(a.secretRefs).size===a.secretRefs.length,'Secret 引用不能重复');
    a.tests.forEach(t=>check(typeof t.input==='string'&&t.input.trim()&&typeof t.expected==='string'&&t.expected.trim(),'测试输入与预期不能为空'));
    check(a.model&&Number.isInteger(a.model.minContext)&&a.model.minContext>=1024&&a.model.minContext<=2000000,'模型上下文要求无效');
    for(const key of ['chinese','toolCalling','structuredOutput','jsonSchema','multiTurn'])check(typeof a.model[key]==='boolean','模型能力必须为布尔值');
    check(typeof a.model.preferred==='string'&&Array.isArray(a.model.supported)&&a.model.supported.every(s=>typeof s==='string'),'模型偏好与支持列表格式无效');
    check(a.memory&&['none','task','session','project'].includes(a.memory.mode)&&Number.isInteger(a.memory.retentionDays)&&a.memory.retentionDays>=0,'Memory 策略无效');
    check(a.evaluation&&Number.isFinite(a.evaluation.minScore)&&a.evaluation.minScore>=0&&a.evaluation.minScore<=100,'评分阈值应为 0–100');
    return a;
  }
  function cleanDefinition(raw){
    const a=validateDefinition(raw);
    // An allowlist excludes runtime bindings, logs, memory records and undeclared keys.
    return {id:a.id,projectId:a.projectId,name:a.name,version:a.version,goal:a.goal,role:a.role,prompt:a.prompt,background:a.background,output:a.output,
      skills:a.skills.map(s=>({id:s.id,name:s.name,version:s.version,content:s.content})),
      workflow:a.workflow.map(n=>({id:n.id,title:n.title,type:n.type,target:n.type==='human'?'':n.target,timeout:n.timeout,retry:n.retry})),
      knowledge:a.knowledge.map(k=>k.mode==='package'?{id:k.id,name:k.name,mode:k.mode,content:k.content,approved:k.approved}:{id:k.id,name:k.name,mode:k.mode}),
      tools:a.tools.map(t=>({id:t.id,name:t.name,inputSchema:copy(t.inputSchema),outputSchema:copy(t.outputSchema)})),mcp:a.mcp.map(m=>({id:m.id,name:m.name,capabilities:[...m.capabilities]})),permissions:a.permissions.map(p=>({id:p.id,name:p.name,highImpact:p.highImpact})),secretRefs:[...a.secretRefs],tests:a.tests.map(t=>({id:t.id,input:t.input,expected:t.expected})),
      resourceRefs:Array.isArray(a.resourceRefs)?a.resourceRefs.filter(r=>r&&['skills','workflows','mcp','knowledge','tools'].includes(r.group)&&typeof r.id==='string'&&idPattern.test(r.id)&&versionPattern.test(r.version)).map(r=>({group:r.group,id:r.id,version:r.version})):[],model:{preferred:a.model.preferred,supported:[...a.model.supported],minContext:a.model.minContext,chinese:a.model.chinese,toolCalling:a.model.toolCalling,structuredOutput:a.model.structuredOutput,jsonSchema:a.model.jsonSchema,multiTurn:a.model.multiTurn},memory:{mode:a.memory.mode,retentionDays:a.memory.retentionDays},evaluation:{minScore:a.evaluation.minScore}};
  }
  const fingerprint=a=>digest(json(cleanDefinition(a)));
  function structuralChecks(raw){
    let a;
    try{a=validateDefinition(raw);}catch(e){return [{name:'配置结构与引用',status:'blocked',detail:e.message}];}
    const packed=a.knowledge.filter(k=>k.mode==='package');
    return [{name:'项目与身份',status:'pass',detail:'项目、目标、角色与 System Prompt 完整'},{name:'Skill 与 Workflow',status:'pass',detail:`${a.skills.length} 个 Skill，${a.workflow.length} 个节点，引用有效`},{name:'Tool 与模型要求',status:'pass',detail:'已声明工具契约与最低模型能力；真实连通性待现场验证'},{name:'知识交付范围',status:packed.every(k=>k.approved)?'pass':'blocked',detail:packed.every(k=>k.approved)?'随包知识已标记批准；现场知识只交付要求':'存在未批准的随包知识'},{name:'测试与输出',status:'pass',detail:`${a.tests.length} 个测试用例，已配置输出要求`},{name:'Secret 隔离',status:'pass',detail:'使用 Secret 引用；导出采用字段白名单，仍需人工审查自由文本'}];
  }
  function sensitiveText(text){return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{18,}|(?:password|api[_ -]?key|access[_ -]?token)\s*[:=]\s*["']?[A-Za-z0-9/+_-]{12,}/i.test(text);}
  function makeFiles(a,report){
    const files={'agent.json':json(a),'prompts/system.md':a.prompt,'workflows/main.json':json({id:'main',version:'1.0.0',nodes:a.workflow}),'mcp/requirements.json':json(a.mcp),'knowledge/runtime.json':json(a.knowledge.filter(k=>k.mode==='runtime')),'schemas/output.schema.json':json({type:'object',required:['summary','evidence','openQuestions'],properties:{summary:{type:'string'},evidence:{type:'array'},openQuestions:{type:'array'}}}),'evaluations/cases.json':json(a.tests),'evaluations/report.json':json(report),'assets/output-template.md':a.output};
    for(const s of a.skills)files[`skills/${s.id}/SKILL.md`]=`---\nname: ${s.id}\ndescription: ${JSON.stringify(s.name)}\n---\n\n${s.content}\n`;
    for(const t of a.tools)files[`tools/${t.id}.json`]=json(t);
    for(const k of a.knowledge.filter(k=>k.mode==='package'))files[`knowledge/package/${k.id}.md`]=k.content;
    return files;
  }
  async function buildPackage(definition,project,report,existing=[]){
    const a=cleanDefinition(definition);
    check(project?.id===a.projectId,'项目归属不一致');
    const blocked=structuralChecks(a).filter(c=>c.status==='blocked');check(!blocked.length,blocked[0]?.detail);
    const hash=await fingerprint(a);
    check(report?.definitionDigest===hash&&report.mode==='prototype'&&report.passed===true,'配置已变化或尚未通过当前版本的原型发布检查');
    check(report.score>=a.evaluation.minScore,'人工评分未达到阈值');
    check(!existing.some(p=>p.projectId===a.projectId&&p.agentId===a.id&&p.version===a.version),'该版本已打包，请创建新的版本号');
    const files=makeFiles(a,report);check(!Object.values(files).some(sensitiveText),'检测到疑似密钥，请移除后重新打包');
    const minimum={...a.model};delete minimum.preferred;delete minimum.supported;
    const manifest={formatVersion:'1.0',project:{id:project.id,name:project.name},agent:{id:a.id,projectId:a.projectId,name:a.name,version:a.version},entrypoint:'agent.json',runtime:{agent:'1.0.0',skill:'1.0.0',workflow:'1.0.0',capabilities:['sequence','skill-call','tool-call','human-approval','retry','timeout','error-exit']},model:{preferred:a.model.preferred,supported:a.model.supported,minimum},skills:a.skills.map(s=>({id:s.id,version:s.version,path:`skills/${s.id}/SKILL.md`})),workflows:[{id:'main',version:'1.0.0',path:'workflows/main.json'}],tools:a.tools.map(t=>({id:t.id,schemaPath:`tools/${t.id}.json`,required:true})),mcp:a.mcp.map(m=>({id:m.id,capabilities:m.capabilities,required:true})),permissions:a.permissions.map(p=>({id:p.id,purpose:p.name,highImpact:p.highImpact})),secrets:a.secretRefs.map(name=>({name,purpose:'现场凭据引用',required:true})),knowledge:{package:a.knowledge.filter(k=>k.mode==='package').map(k=>({id:k.id,path:`knowledge/package/${k.id}.md`,approvalRef:'prototype-approval'})),runtime:a.knowledge.filter(k=>k.mode==='runtime').map(k=>({id:k.id,required:true,purpose:k.name}))},network:a.mcp.map(m=>({serviceRef:m.id,required:true})),files:[]};
    for(const [path,content] of Object.entries(files))manifest.files.push({path,size:new TextEncoder().encode(content).length,sha256:await digest(content)});
    const payload={format:FORMAT,manifest,files};return {...payload,packageDigest:await digest(json(payload))};
  }
  async function parsePackage(text,projectId){
    check(typeof text==='string'&&new TextEncoder().encode(text).length<=5*1024*1024,'原型包超过 5 MB 限制');
    let pkg;try{pkg=JSON.parse(text);}catch(e){throw Error('文件不是有效的 .agent 原型包（JSON 容器）；正式 ZIP 支持在设计阶段');}
    check(pkg?.format===FORMAT,'包格式不兼容，只接受 agent-center-preview/1 原型包');
    check(pkg.manifest?.formatVersion==='1.0'&&pkg.manifest.project?.id===projectId,'包版本不支持或目标项目不匹配');
    check(pkg.files&&typeof pkg.files==='object'&&!Array.isArray(pkg.files)&&Array.isArray(pkg.manifest.files)&&pkg.manifest.files.length<=200,'交付包文件清单无效');
    const payload={format:pkg.format,manifest:pkg.manifest,files:pkg.files};
    check(typeof pkg.packageDigest==='string'&&await digest(json(payload))===pkg.packageDigest,'包摘要校验失败，内容可能损坏或已被修改');
    const paths=new Set();
    for(const file of pkg.manifest.files){
      check(typeof file.path==='string'&&/^[a-zA-Z0-9_./-]+$/.test(file.path)&&!file.path.startsWith('/')&&!file.path.split('/').some(p=>p==='..'||!p)&&!paths.has(file.path),'包中存在危险或重复路径');paths.add(file.path);
      const content=pkg.files[file.path];check(typeof content==='string','包中缺少文件：'+file.path);
      check(new TextEncoder().encode(content).length===file.size&&await digest(content)===file.sha256,'文件完整性校验失败：'+file.path);
    }
    check(Object.keys(pkg.files).length===paths.size,'包中存在未声明的文件');
    check(pkg.manifest.entrypoint==='agent.json'&&paths.has('agent.json'),'Agent 入口缺失');
    const a=cleanDefinition(JSON.parse(pkg.files['agent.json']));
    check(a.projectId===projectId&&a.id===pkg.manifest.agent?.id&&a.projectId===pkg.manifest.agent?.projectId&&a.version===pkg.manifest.agent?.version,'Manifest 与 Agent 定义不一致');
    const report=JSON.parse(pkg.files['evaluations/report.json']||'null');
    check(report?.mode==='prototype'&&report.passed===true&&report.definitionDigest===await fingerprint(a)&&report.score>=a.evaluation.minScore,'评测记录缺失或不对应当前定义');
    // Rebuild the canonical manifest and resources to detect omitted requirements or changed logic.
    const canonical=await buildPackage(a,pkg.manifest.project,report);
    check(json(canonical.manifest)===json(pkg.manifest)&&json(canonical.files)===json(pkg.files),'包资源或依赖声明与智能体定义不一致');
    return {pkg,definition:a};
  }
  const profiles={
    modern:{id:'modern',name:'兼容模型服务（演示）',chinese:true,toolCalling:true,structuredOutput:true,jsonSchema:true,multiTurn:true,minContext:128000},
    limited:{id:'limited',name:'基础对话模型（能力不足示例）',chinese:true,toolCalling:false,structuredOutput:false,jsonSchema:false,multiTurn:true,minContext:8000}
  };
  function dependencies(pkg,definition,bindings={},environment={compatible:true,network:true}){
    const a=validateDefinition(definition),m=pkg.manifest,list=[];
    const row=(name,status,detail,category)=>list.push({name,status,detail,category});
    row('包与目标项目','pass',`${m.project.name} / ${m.agent.name} / v${m.agent.version}`,'随包交付');
    row('文件完整性与声明','pass','导入时已校验 SHA-256、资源引用和定义一致性','随包交付');
    row('来源签名','warning','原型包未签名，仅支持本地评审；正式环境需受信任签名','随包交付');
    row('Agent / Skill / Workflow Runtime',environment.compatible?'pass':'blocked',environment.compatible?'模拟平台能力满足最低版本 1.0.0':'模拟环境缺少兼容 Workflow Runtime','平台能力');
    row('Model Gateway / Tool / MCP / RAG',environment.compatible?'pass':'blocked',environment.compatible?'模拟基础服务已就绪；不代表真实服务探测':'平台服务不满足要求','平台能力');
    row('权限 / Secret / 日志服务',environment.compatible?'pass':'blocked','使用本地能力登记演示，真实服务待接入','平台能力');
    const chosen=profiles[bindings.model];
    const supported=chosen&&['chinese','toolCalling','structuredOutput','jsonSchema','multiTurn'].every(k=>!a.model[k]||chosen[k])&&chosen.minContext>=a.model.minContext;
    row('模型能力',!chosen?'binding':supported?'pass':'blocked',!chosen?'请选择模型服务':supported?'所选演示模型声明满足最低能力':'工具调用、结构化输出或上下文不满足要求','现场绑定');
    for(const t of a.tools)row('Tool · '+t.name,bindings.tools?.[t.id]?'pass':'binding',bindings.tools?.[t.id]?'已选择模拟适配器':'请选择标准能力适配器','现场绑定');
    for(const r of a.mcp)row('MCP · '+r.name,bindings.mcp?.[r.id]?'pass':'binding',bindings.mcp?.[r.id]?'已选择模拟 MCP 连接':'请选择现场 MCP 连接','现场绑定');
    for(const k of a.knowledge.filter(k=>k.mode==='runtime'))row('知识 · '+k.name,bindings.knowledge?.[k.id]?'pass':'binding',bindings.knowledge?.[k.id]?'已选择项目知识库（演示）':'请选择项目现场知识库','现场绑定');
    for(const p of a.permissions)row('权限 · '+p.name,bindings.permissions?.includes(p.id)?'pass':'binding',p.highImpact?'高影响权限，需单独确认授权':'需项目管理员确认授权（演示）','现场绑定');
    for(const s of a.secretRefs)row('Secret · '+s,bindings.secrets?.[s]?'pass':'binding',bindings.secrets?.[s]?'已选择模拟 Secret 引用；未读取实际值':'请选择 Secret 服务中的引用','现场绑定');
    row('网络依赖',environment.network?'pass':'blocked',environment.network?'模拟内网服务可达；不需要访问中央工作台':'模拟项目网络不可达','平台能力');
    return list;
  }
  function installable(checks){return checks.length>0&&checks.every(c=>['pass','warning'].includes(c.status));}
  function preserveBindings(a,old){return {model:old.model||'',tools:Object.fromEntries(a.tools.filter(x=>old.tools?.[x.id]).map(x=>[x.id,old.tools[x.id]])),mcp:Object.fromEntries(a.mcp.filter(x=>old.mcp?.[x.id]).map(x=>[x.id,old.mcp[x.id]])),knowledge:Object.fromEntries(a.knowledge.filter(x=>x.mode==='runtime'&&old.knowledge?.[x.id]).map(x=>[x.id,old.knowledge[x.id]])),permissions:a.permissions.filter(x=>old.permissions?.includes(x.id)).map(x=>x.id),secrets:Object.fromEntries(a.secretRefs.filter(x=>old.secrets?.[x]).map(x=>[x,old.secrets[x]]))};}
  root.CenterCore={copy,json,digest,fingerprint,validateDefinition,cleanDefinition,compareVersions,structuralChecks,buildPackage,parsePackage,dependencies,installable,preserveBindings,profiles,FORMAT};
  if(typeof module!=='undefined')module.exports=root.CenterCore;
})(globalThis);
