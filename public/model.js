export const uid=()=>crypto.randomUUID().slice(0,8);
export const clone=x=>structuredClone(x);
export const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const sections=[
 {id:'purpose',name:'设计目的',hint:'系统解决什么问题？玩家可以执行哪些操作、得到什么反馈？'},
 {id:'overview',name:'功能概述',hint:'按玩家任务拆分模块，明确本期、后续及尚未确定的范围。'},
 {id:'rules',name:'功能详情与公共规则',hint:'在什么条件下，谁执行什么操作，如何处理，产生什么结果？共用逻辑集中定义。'},
 {id:'support',name:'配套需求',hint:'按实际需要补充跳转、红点、引导、音效、美术与埋点；无关项目可省略。'},
 {id:'parameters',name:'参数记录',hint:'写清名称、含义、数值、单位和作用范围。没有确定的数值写“待确认”。'},
 {id:'questions',name:'待确认事项',hint:'区分已知需求、候选方案和待确认决策，说明未决项影响哪个功能。'},
 {id:'acceptance',name:'关键验收情景',hint:'从规则提取正常、限制及状态变化情景：初始条件 → 操作 → 预期结果。'}
];
export const mermaidTemplates={
 flow:'flowchart TD\n  A[系统入口] --> B[主界面]\n  B --> C{满足操作条件？}\n  C -->|是| D[执行操作]\n  D --> E[更新状态并反馈]\n  C -->|否| F[提示未满足条件]\n  E --> B\n  F --> B',
 state:'stateDiagram-v2\n  [*] --> 未开放\n  未开放 --> 可操作: 满足开放条件\n  可操作 --> 已完成: 操作成功\n  已完成 --> [*]',
 sequence:'sequenceDiagram\n  participant P as 玩家\n  participant U as 界面\n  participant S as 系统\n  P->>U: 点击控件\n  U->>S: 发起操作\n  S-->>U: 返回结果与状态\n  U-->>P: 展示反馈'
};
export function makeElement(type,props={}){return {id:uid(),type,name:({frame:'界面框',rect:'矩形',text:'文本',image:'参考图片',stroke:'笔迹'}[type]||type),x:160,y:120,w:180,h:68,text:type==='text'?'双击编辑文本':'',fill:type==='text'?'#35483f':type==='frame'?'#ffffff':'#eef3ef',stroke:'#afc3b7',fontSize:18,radius:12,effect:'none',rule:{action:'',condition:'',result:'',status:'待确认'},...props};}
export function newProject(){return {format:'system-planner-v1',name:'未命名系统',boards:[{id:uid(),name:'主界面',elements:[]}],mind:[{id:'root',parent:null,text:'系统结构',x:120,y:260}],mermaid:mermaidTemplates.flow,sections:Object.fromEntries(sections.map(s=>[s.id,''])),createdAt:new Date().toISOString()};}
export function component(kind,x=170,y=100){
 const add=(type,p)=>makeElement(type,{x,y,...p});
 if(kind==='phone') return [add('frame',{name:'手机界面',w:360,h:640,radius:28})];
 if(kind==='button') return [add('rect',{name:'操作按钮',text:'确认',w:180,h:48,fill:'#587b6c',stroke:'#587b6c',textColor:'#ffffff',fontSize:16})];
 if(kind==='card') return [add('rect',{name:'信息卡片',text:'内容标题\n内容描述',w:260,h:135,fill:'#ffffff',fontSize:17})];
 if(kind==='dialog') return [add('frame',{name:'弹窗',w:300,h:230,radius:20}),add('text',{name:'弹窗标题',text:'提示标题',x:x+35,y:y+28,w:230,h:35}),add('rect',{name:'弹窗确认按钮',text:'确认',x:x+60,y:y+155,w:180,h:45,fill:'#587b6c',textColor:'#ffffff'})];
 if(kind==='input') return [add('rect',{name:'输入框',text:'请输入内容…',w:260,h:45,fill:'#f8faf9',fontSize:14,textColor:'#93a39a'})];
 if(kind==='badge') return [add('rect',{name:'红点提示',text:'1',w:26,h:26,fill:'#d6846c',stroke:'#d6846c',radius:20,textColor:'#ffffff',fontSize:13})];
 return [];
}
export function layoutMind(nodes){
 let leaf=0;
 function place(node,depth){const kids=nodes.filter(n=>n.parent===node.id);node.x=80+depth*245;if(!kids.length){node.y=70+leaf++*95;}else{kids.forEach(n=>place(n,depth+1));node.y=(kids[0].y+kids.at(-1).y)/2;}}
 nodes.filter(n=>!n.parent).forEach(n=>place(n,0));return nodes;
}
export function descendants(nodes,id){const result=new Set([id]);let size;do{size=result.size;for(const n of nodes)if(result.has(n.parent))result.add(n.id);}while(size!==result.size);return result;}
export function elementsBounds(elements){if(!elements.length)return{x:0,y:0,w:1000,h:700};const minX=Math.min(...elements.map(e=>e.x)),minY=Math.min(...elements.map(e=>e.y));return{x:minX-40,y:minY-40,w:Math.max(...elements.map(e=>e.x+e.w))-minX+80,h:Math.max(...elements.map(e=>e.y+e.h))-minY+80};}
export function reviewProject(p){const issues=[];for(const s of sections.slice(0,3))if(!p.sections[s.id].trim())issues.push(`${s.name}尚未填写`);for(const b of p.boards)for(const e of b.elements){if(e.type==='stroke'||e.type==='frame'||e.type==='image')continue;if(!e.rule?.action&&!e.rule?.result)issues.push(`${b.name} / ${e.name}：尚未说明行为或展示内容`);else if(e.rule?.status==='待确认')issues.push(`${b.name} / ${e.name}：规则仍待确认`);}return issues;}
export function markdown(p){let text=`# ${p.name}\n\n`;for(const s of sections)text+=`## ${s.name}\n\n${p.sections[s.id]||'待补充'}\n\n`;text+='## 界面与控件\n\n';for(const b of p.boards){text+=`### ${b.name}\n\n| 编号 | 控件 | 显示或操作 | 条件 | 结果与反馈 | 状态 |\n|---|---|---|---|---|---|\n`;for(const [i,e]of b.elements.entries()){if(e.type==='stroke')continue;const cell=s=>String(s||'待补充').replace(/\|/g,'\\|').replace(/\n/g,'<br>');text+=`| ${i+1} | ${cell(e.name)} | ${cell(e.rule?.action)} | ${cell(e.rule?.condition)} | ${cell(e.rule?.result)} | ${cell(e.rule?.status)} |\n`;}text+='\n';}text+='## 思维导图\n\n';function walk(n,depth){text+=`${'  '.repeat(depth)}- ${n.text.replace(/\n/g,' ')}\n`;p.mind.filter(c=>c.parent===n.id).forEach(c=>walk(c,depth+1));}p.mind.filter(n=>!n.parent).forEach(n=>walk(n,0));return text+`\n## 流程图\n\n\`\`\`mermaid\n${p.mermaid}\n\`\`\`\n`;}
