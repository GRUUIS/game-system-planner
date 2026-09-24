import {uid,clone,esc,sections,mermaidTemplates,makeElement,newProject,component,layoutMind,descendants,elementsBounds,reviewProject,markdown} from './model.js';
import {standalone,savedLabel,loadProject,persistProject,exportFile,getMermaid} from './storage.js';
import {pageStates,stateOf,copyState,allStateBoards,boundsOf,groupSelection,isLocked,marqueeSelection,duplicateElements,arrangeElements,snapMove,startPreview,activePreviewView,transitionPreview,interactionLabel,interactiveExample} from './studio-model.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let project=newProject(),boardId=project.boards[0].id,view='canvas',tool='select',selected=[],selectedNode='root',inspectorTab='properties';
let camera={x:0,y:0,z:1},mindCamera={x:0,y:0,z:1},undoStack=[],redoStack=[],gesture=null,clipboard=null,space=false,saveTimer,saveChain=Promise.resolve(),revision=0,mermaidLib,mermaidSVG='',mermaidRenderedSource='',renderToken=0;
let stateId='default',snapGuides=[],previewSession=null,previewOrigin=null;
const baseBoard=()=>project.boards.find(b=>b.id===boardId)||project.boards[0];
const board=()=>stateOf(baseBoard(),stateId);
const currentElement=()=>board().elements.find(e=>e.id===selected[0]);
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),2700);}
function snapshot(){undoStack.push(JSON.stringify(project));if(undoStack.length>60)undoStack.shift();redoStack=[];updateUndo();}
function change(fn,{render=true}={}){snapshot();fn();changed();if(render)renderAll();}
function changed(){revision++;$('#save-status').textContent='保存中…';clearTimeout(saveTimer);saveTimer=setTimeout(save,450);updateFooter();}
function save(){const data=clone(project),rev=revision;saveChain=saveChain.catch(()=>{}).then(async()=>{await persistProject(data);if(rev===revision)$('#save-status').textContent=savedLabel;}).catch(e=>{$('#save-status').textContent='保存失败';toast(`${e.message}，请使用“保存项目文件”`);});return saveChain;}
window.addEventListener('beforeunload',e=>{if($('#save-status').textContent==='保存中…'||$('#save-status').textContent==='保存失败'){e.preventDefault();e.returnValue='';}});
function updateUndo(){$('#undo').disabled=!undoStack.length;$('#redo').disabled=!redoStack.length;}
function undo(redo=false){const from=redo?redoStack:undoStack,to=redo?undoStack:redoStack;if(!from.length)return;to.push(JSON.stringify(project));project=JSON.parse(from.pop());if(!project.boards.some(b=>b.id===boardId))boardId=project.boards[0].id;selected=selected.filter(id=>board().elements.some(e=>e.id===id));if(!project.mind.some(n=>n.id===selectedNode))selectedNode=project.mind[0].id;changed();renderAll();if(view==='mermaid')renderMermaid();}
function updateFooter(){$('#footer-left').textContent=view==='canvas'?`${board().name} · ${board().elements.length} 个对象${selected.length?' · 已选 '+selected.length+' 个':''}`:view==='mind'?`${project.mind.length} 个主题`:view==='spec'?`${sections.filter(s=>project.sections[s.id].trim()).length} / ${sections.length} 栏已填写`:'Mermaid · 本地渲染';}
function setView(next){view=next;$$('#view-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$$('.view').forEach(v=>v.classList.toggle('active',v.id===view+'-view'));$('#view-title').textContent={canvas:'UI 画布',mind:'思维导图',mermaid:'Mermaid 流程图',spec:'系统策划案'}[view];$('#view-eyebrow').textContent={canvas:'INTERFACE',mind:'STRUCTURE',mermaid:'FLOW & STATES',spec:'SYSTEM SPECIFICATION'}[view];$('#export-view').style.display=view==='spec'?'none':'';renderAll();if(view==='mermaid')renderMermaid();}
function renderAll(){$('#project-name').value=project.name;renderStateToolbar();renderLeft();renderCanvas();renderMind();if(view==='spec')renderSpec();if(view==='mermaid')$('#mermaid-source').value=project.mermaid;renderInspector();updateUndo();updateFooter();}
function renderLeft(){
 if(view==='canvas'){$('#left-context').innerHTML=`<div class="section-heading">界面页面<button id="add-board" title="新增页面">＋</button></div>${project.boards.map(b=>`<div class="page-row ${b.id===boardId?'active':''}"><button data-board="${b.id}" title="双击重命名">▱　${esc(b.name)}</button>${project.boards.length>1?`<button class="remove-page" data-remove-board="${b.id}">×</button>`:''}</div>`).join('')}<div class="section-heading" style="margin-top:27px">组件库</div><div class="component-grid">${[['phone','▯','手机框'],['button','▰','按钮'],['card','▤','卡片'],['dialog','▣','弹窗'],['input','▭','输入框'],['badge','•','红点']].map(([id,icon,name])=>`<button data-component="${id}"><b>${icon}</b>${name}</button>`).join('')}</div><div class="layers"><div class="section-heading">图层 <span>${board().elements.length}</span></div>${[...board().elements].reverse().map(e=>`<button class="layer ${selected.includes(e.id)?'active':''}" data-layer="${e.id}"><span>${board().elements.indexOf(e)+1}</span>${esc(e.name)}</button>`).join('')||'<p class="small-text" style="padding:0 12px">从组件开始，或拖入参考图。</p>'}</div>`;
 $('#add-board').onclick=()=>{const b={id:uid(),name:`界面 ${project.boards.length+1}`,elements:[]};change(()=>{project.boards.push(b);boardId=b.id;stateId='default';selected=[];camera={x:0,y:0,z:1};});};
 $$('[data-board]').forEach(b=>{b.onclick=()=>{boardId=b.dataset.board;stateId='default';selected=[];fitCanvas();renderAll();};b.ondblclick=()=>editText('页面名称',baseBoard().name,value=>change(()=>baseBoard().name=value));});
 $$('[data-remove-board]').forEach(b=>b.onclick=()=>confirmAction('删除这个界面？','可以通过撤回恢复。',()=>change(()=>{project.boards=project.boards.filter(p=>p.id!==b.dataset.removeBoard);boardId=project.boards[0].id;selected=[];})));
 $$('[data-component]').forEach(b=>b.onclick=()=>{const x=(80-camera.x)/camera.z,y=(50-camera.y)/camera.z;const items=component(b.dataset.component,x,y);change(()=>{board().elements.push(...items);selected=items.map(e=>e.id);inspectorTab='properties';});setTool('select');});
 $$('[data-layer]').forEach(b=>b.onclick=event=>{const ids=event.altKey?[b.dataset.layer]:groupSelection(board().elements,[b.dataset.layer]);selected=event.shiftKey?[...new Set([...selected,...ids])]:ids;inspectorTab='properties';renderAll();});
 }else if(view==='spec'){$('#left-context').innerHTML='<div class="section-heading">策划目录</div>'+sections.map((s,i)=>`<button class="doc-nav" data-section="${s.id}"><span>0${i+1}</span>${s.name}</button>`).join('')+'<button class="doc-nav" data-section="controls"><span>08</span>界面控件表</button>';$$('[data-section]').forEach(b=>b.onclick=()=>$('#section-'+b.dataset.section).scrollIntoView({behavior:'smooth',block:'start'}));}
 else if(view==='mind'){$('#left-context').innerHTML='<div class="section-heading">结构工具</div><button class="doc-nav" id="mind-to-doc">将主题复制到功能概述</button><div class="info-card"><strong>从结构到规则</strong><p>先拆分玩家任务，再标注入口、状态和结果。主题结构可作为功能概述草稿。</p></div>';$('#mind-to-doc').onclick=()=>{const text=[];function walk(n,d){text.push('  '.repeat(d)+'- '+n.text);project.mind.filter(c=>c.parent===n.id).forEach(c=>walk(c,d+1));}project.mind.filter(n=>!n.parent).forEach(n=>walk(n,0));change(()=>project.sections.overview+=(project.sections.overview?'\n\n':'')+text.join('\n'));toast('已追加到功能概述');};}
 else $('#left-context').innerHTML='<div class="section-heading">图文配合</div><div class="info-card"><strong>流程说明跳转</strong><p>用流程图表达条件分支，用策划正文说明处理细节和公共规则。</p></div><div class="info-card"><strong>源码随项目保存</strong><p>支持 flowchart、stateDiagram、sequenceDiagram 等 Mermaid 语法。</p></div>';
}
function textSVG(e){const lines=String(e.text||'').split('\n'),size=e.fontSize||18;const isText=e.type==='text',x=isText?6:e.w/2,y=isText?size+4:e.h/2-(lines.length-1)*size*.7;return `<text x="${x}" y="${y}" font-family="Microsoft YaHei, sans-serif" font-size="${size}" fill="${esc(isText?e.fill:(e.textColor||'#42574d'))}" text-anchor="${isText?'start':'middle'}" dominant-baseline="${isText?'auto':'middle'}">${lines.map((l,i)=>`<tspan x="${x}" dy="${i?size*1.4:0}">${esc(l)}</tspan>`).join('')}</text>`;}
function elementSVG(e,index,{exporting=false,badges=true}={}){if(exporting&&e.hidden)return '';let shape='';if(e.type==='rect'||e.type==='frame')shape=`<rect width="${e.w}" height="${e.h}" rx="${e.radius||0}" fill="${esc(e.fill)}" stroke="${esc(e.stroke)}" stroke-width="${e.type==='frame'?1.5:1}"/>${textSVG(e)}`;if(e.type==='text')shape=`<rect width="${e.w}" height="${e.h}" fill="transparent"/>${textSVG(e)}`;if(e.type==='image')shape=`<image href="${esc(e.src)}" width="${e.w}" height="${e.h}" preserveAspectRatio="none"/>`;if(e.type==='stroke'){const d=e.points.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' ');shape=`<path d="${d}" fill="none" stroke="transparent" stroke-width="18"/><path d="${d}" fill="none" stroke="${esc(e.stroke)}" stroke-width="${e.penWidth||3}" stroke-linecap="round" stroke-linejoin="round"/>`;}
 const badge=badges&&e.type!=='stroke'?`<g pointer-events="none"><rect x="-8" y="-8" width="21" height="18" rx="5" fill="${e.locked?'#9199a1':'#587b6c'}"/><text x="2.5" y="5" fill="white" font-size="10" text-anchor="middle" font-family="sans-serif">${index+1}</text></g>`:'';
 return `<g data-id="${e.id}" transform="translate(${e.x} ${e.y})" opacity="${e.hidden ? .18 : e.disabled ? .48 : 1}"><g class="${e.effect&&e.effect!=='none'?'effect-'+esc(e.effect):''}">${shape}</g>${badge}</g>`;
}
function renderCanvas(){
 const svg=$('#canvas-svg');
 const selection=selected.map(id=>{
   const e=board().elements.find(o=>o.id===id);if(!e)return '';
   const locked=isLocked(e,board().elements);
   return '<g><rect class="selection-box" x="'+(e.x-3)+'" y="'+(e.y-3)+'" width="'+(e.w+6)+'" height="'+(e.h+6)+'" fill="none" stroke="'+(locked?'#9da4af':'#5f9c80')+'" stroke-width="'+1.5/camera.z+'"/>'+(selected.length===1&&e.type!=='stroke'&&!locked?'<rect data-resize="'+e.id+'" x="'+(e.x+e.w-5/camera.z)+'" y="'+(e.y+e.h-5/camera.z)+'" width="'+10/camera.z+'" height="'+10/camera.z+'" fill="white" stroke="#5f9c80" style="cursor:nwse-resize"/>':'')+'</g>';
 }).join('');
 const marquee=gesture?.type==='marquee'?'<rect class="selection-box" x="'+gesture.rect.x+'" y="'+gesture.rect.y+'" width="'+gesture.rect.w+'" height="'+gesture.rect.h+'" fill="#79ae8c22" stroke="#5f9c80" stroke-width="'+1/camera.z+'"/>':'';
 const guides=snapGuides.map(g=>'<line class="selection-box" '+(g.axis==='x'?'x1="'+g.value+'" x2="'+g.value+'" y1="'+(-camera.y/camera.z)+'" y2="'+((svg.clientHeight-camera.y)/camera.z)+'"':'y1="'+g.value+'" y2="'+g.value+'" x1="'+(-camera.x/camera.z)+'" x2="'+((svg.clientWidth-camera.x)/camera.z)+'"')+' stroke="#ce985b" stroke-width="'+1/camera.z+'" stroke-dasharray="4 3"/>').join('');
 svg.innerHTML='<g transform="translate('+camera.x+' '+camera.y+') scale('+camera.z+')">'+board().elements.map((e,i)=>elementSVG(e,i)).join('')+selection+marquee+guides+'</g>';
 $('#zoom-fit').textContent=Math.round(camera.z*100)+'%';
 svg.style.cursor=space||tool==='hand'?'grab':tool==='select'?'default':tool==='text'?'text':'crosshair';
}

function point(event,svg,cam){const r=svg.getBoundingClientRect();return{x:(event.clientX-r.left-cam.x)/cam.z,y:(event.clientY-r.top-cam.y)/cam.z};}
function setTool(t){tool=t;$$('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));renderCanvas();}
function fitBounds(bounds,stage,cam){const r=stage.getBoundingClientRect();cam.z=Math.min((r.width-70)/bounds.w,(r.height-70)/bounds.h,1.4);cam.z=Math.max(.1,cam.z);cam.x=(r.width-bounds.w*cam.z)/2-bounds.x*cam.z;cam.y=(r.height-bounds.h*cam.z)/2-bounds.y*cam.z;}
function fitCanvas(){if(!board().elements.length){camera={x:0,y:0,z:1};return;}fitBounds(elementsBounds(board().elements),$('#canvas-stage'),camera);renderCanvas();}
function scaleCanvas(factor){const r=$('#canvas-stage').getBoundingClientRect(),nx=r.width/2,ny=r.height/2,old=camera.z;camera.z=Math.min(4,Math.max(.15,camera.z*factor));camera.x=nx-(nx-camera.x)*camera.z/old;camera.y=ny-(ny-camera.y)*camera.z/old;renderCanvas();}
const canvas=$('#canvas-svg');
canvas.onpointerdown=e=>{
 if(e.button!==0&&e.button!==1)return;
 canvas.focus();const p=point(e,canvas,camera);canvas.setPointerCapture(e.pointerId);
 if(tool==='hand'||space||e.button===1){gesture={type:'pan',sx:e.clientX,sy:e.clientY,x:camera.x,y:camera.y};return;}
 const resize=e.target.closest('[data-resize]'),hit=e.target.closest('[data-id]');
 if(tool==='eraser'){snapshot();gesture={type:'erase'};eraseAt(e);return;}
 if(tool==='marquee'||(tool==='select'&&!hit&&!resize)){
   gesture={type:'marquee',p,rect:{...p,w:0,h:0},original:e.shiftKey?[...selected]:[]};
   if(!e.shiftKey)selected=[];renderCanvas();return;
 }
 if(tool==='select'){
   if(resize){const item=currentElement();if(isLocked(item,board().elements))return;snapshot();gesture={type:'resize',p,base:clone(item)};return;}
   inspectorTab='properties';const id=hit.dataset.id;
   const ids=e.altKey?[id]:groupSelection(board().elements,[id]);
   if(e.shiftKey)selected=ids.every(x=>selected.includes(x))?selected.filter(x=>!ids.includes(x)):[...new Set([...selected,...ids])];
   else if(!selected.includes(id)||e.altKey)selected=ids;
   else selected=[...new Set([...selected,...ids])];
   gesture={type:'move',p,base:board().elements.filter(x=>selected.includes(x.id)&&!isLocked(x,board().elements)).map(clone),started:false};renderAll();return;
 }
 snapshot();const item=makeElement(tool==='pen'?'stroke':tool,{x:p.x,y:p.y,w:1,h:1});
 if(tool==='pen'){item.points=[[0,0]];item.stroke='#587b6c';}
 if(tool==='text'){item.w=220;item.h=45;item.text='双击编辑文本';}
 board().elements.push(item);selected=[item.id];gesture={type:tool==='pen'?'drawPen':'drawShape',p,id:item.id};renderCanvas();
};
function eraseAt(e){const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-id]');if(!hit)return;const item=board().elements.find(o=>o.id===hit.dataset.id);if(item?.type==='stroke'&&!isLocked(item,board().elements)){board().elements=board().elements.filter(o=>o.id!==item.id);selected=selected.filter(id=>id!==item.id);renderCanvas();}}
canvas.onpointermove=e=>{
 if(!gesture)return;const p=point(e,canvas,camera),g=gesture;
 if(g.type==='pan'){camera.x=g.x+e.clientX-g.sx;camera.y=g.y+e.clientY-g.sy;renderCanvas();return;}
 if(g.type==='erase'){eraseAt(e);return;}
 if(g.type==='marquee'){
   g.rect={x:Math.min(p.x,g.p.x),y:Math.min(p.y,g.p.y),w:Math.abs(p.x-g.p.x),h:Math.abs(p.y-g.p.y)};
   selected=[...new Set([...g.original,...marqueeSelection(board().elements,g.rect)])];renderCanvas();return;
 }
 if(g.type==='move'){
   if(!g.base.length)return;let dx=p.x-g.p.x,dy=p.y-g.p.y;
   if(!g.started&&Math.abs(dx)+Math.abs(dy)>2){snapshot();g.started=true;}
   if(g.started){
     if($('#snap-enabled').checked&&!e.altKey){const s=snapMove(g.base,dx,dy,board().elements.filter(x=>!selected.includes(x.id)&&!x.hidden),6/camera.z);dx=s.dx;dy=s.dy;snapGuides=s.guides;}else snapGuides=[];
     for(const base of g.base){const item=board().elements.find(x=>x.id===base.id);item.x=Math.round(base.x+dx);item.y=Math.round(base.y+dy);}
   }
 }
 if(g.type==='resize'){const item=currentElement();item.w=Math.max(15,Math.round(g.base.w+p.x-g.p.x));item.h=e.shiftKey?item.w*g.base.h/g.base.w:Math.max(15,Math.round(g.base.h+p.y-g.p.y));}
 if(g.type==='drawShape'){const item=currentElement();if(item.type!=='text'){item.x=Math.min(p.x,g.p.x);item.y=Math.min(p.y,g.p.y);item.w=Math.max(1,Math.abs(p.x-g.p.x));item.h=Math.max(1,Math.abs(p.y-g.p.y));}}
 if(g.type==='drawPen'){const item=currentElement();item.points.push([p.x-g.p.x,p.y-g.p.y]);}
 renderCanvas();
};
function finishGesture(){
 if(!gesture)return;const g=gesture;gesture=null;snapGuides=[];
 if(g.type==='pan')return;
 if(g.type==='marquee'){inspectorTab='properties';renderAll();return;}
 if(g.type==='move'&&!g.started)return;
 if(g.type==='drawShape'){const item=currentElement();if(item.w<8||item.h<8){item.w=item.type==='frame'?320:160;item.h=item.type==='frame'?560:80;}setTool('select');}
 if(g.type==='drawPen'){const item=currentElement(),xs=item.points.map(p=>p[0]),ys=item.points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys);item.x+=minX;item.y+=minY;item.points=item.points.map(p=>[p[0]-minX,p[1]-minY]);item.w=Math.max(1,Math.max(...xs)-minX);item.h=Math.max(1,Math.max(...ys)-minY);}
 changed();renderAll();
}
canvas.onpointerup=finishGesture;canvas.onpointercancel=finishGesture;
canvas.ondblclick=e=>{const hit=e.target.closest('[data-id]');if(!hit)return;selected=[hit.dataset.id];const item=currentElement();if(item.type==='image'||item.type==='stroke'||isLocked(item,board().elements))return;editText('编辑文字',item.text,value=>change(()=>item.text=value),true);};

canvas.onwheel=e=>{e.preventDefault();const r=canvas.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top,old=camera.z;camera.z=Math.max(.15,Math.min(4,old*Math.exp(-e.deltaY*.001)));camera.x=px-(px-camera.x)*camera.z/old;camera.y=py-(py-camera.y)*camera.z/old;renderCanvas();};
function deleteSelected(){const ids=selected.filter(id=>{const e=board().elements.find(x=>x.id===id);return e&&!isLocked(e,board().elements);});if(!ids.length)return;change(()=>{board().elements=board().elements.filter(e=>!ids.includes(e.id));selected=selected.filter(id=>!ids.includes(id));});}
function duplicateSelected(){const items=duplicateElements(board().elements.filter(e=>selected.includes(e.id)));if(!items.length)return;change(()=>{board().elements.push(...items);selected=items.map(e=>e.id);});}
async function uploadImages(files){const images=[];for(const file of files){if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)){toast('请选择 PNG、JPG、WebP 或 GIF 图片');continue;}if(file.size>15*1024*1024){toast('单张图片请小于 15 MB');continue;}const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});const img=new Image();img.src=src;await img.decode();const w=Math.min(500,img.naturalWidth),h=w*img.naturalHeight/img.naturalWidth;images.push(makeElement('image',{name:file.name,src,w,h,x:(50-camera.x)/camera.z+images.length*25,y:(45-camera.y)/camera.z+images.length*25}));}if(images.length){change(()=>{board().elements.push(...images);selected=images.map(e=>e.id);});toast('图片已加入，随项目保存在本地');}}
$('#canvas-stage').ondragover=e=>{e.preventDefault();};$('#canvas-stage').ondrop=e=>{e.preventDefault();uploadImages([...e.dataTransfer.files]).catch(e=>toast('图片读取失败：'+e.message));};
function renderInspectorBase(){
 $('#properties-tab').classList.toggle('active',inspectorTab==='properties');$('#guide-tab').classList.toggle('active',inspectorTab==='guide');
 if(inspectorTab==='guide'){renderGuide();return;}
 if(view==='mind'){const n=project.mind.find(n=>n.id===selectedNode);$('#inspector-content').innerHTML=`<h3>主题属性</h3><label>主题内容</label><textarea id="node-text" rows="3">${esc(n?.text||'')}</textarea><label>父主题</label><select id="node-parent"><option value="">中心主题</option>${project.mind.filter(m=>!descendants(project.mind,selectedNode).has(m.id)).map(m=>`<option value="${m.id}" ${n?.parent===m.id?'selected':''}>${esc(m.text)}</option>`).join('')}</select><div class="info-card"><strong>主题操作</strong><p>Tab 添加子主题，Enter 添加同级主题。拖动调整位置，整理布局会重新排列全部节点。</p></div>`;let nodeEditing=false;$('#node-text').oninput=e=>{if(!nodeEditing){snapshot();nodeEditing=true;}n.text=e.target.value||'未命名主题';changed();renderMind();};$('#node-text').onblur=()=>nodeEditing=false;$('#node-parent').value=n?.parent||'';$('#node-parent').onchange=e=>{if(!n.parent){toast('中心主题不能改为其他主题的子节点');renderInspector();return;}if(!e.target.value){toast('仅保留一个中心主题');renderInspector();return;}change(()=>n.parent=e.target.value);};return;}
 if(view==='spec'||view==='mermaid'){renderGuide();return;}
 const e=currentElement();
 if(!e){$('#inspector-content').innerHTML='<div class="empty-props"><div class="empty-illustration"></div><h3 style="text-align:center">选中对象，定义它的行为</h3><p class="small-text">在画布上选择控件，可调整外观、添加特效示意，并填写操作条件与结果。</p><div class="info-card"><strong>图与表自动关联</strong><p>图中编号对应策划案的控件表。更改控件名称或规则，导出时会一起更新。</p></div></div>';return;}
 if(selected.length>1){$('#inspector-content').innerHTML=`<h3>已选择 ${selected.length} 个对象</h3><p class="small-text">拖动任一选中对象可整体移动。</p><button class="wide" id="align-left">左对齐</button><button class="wide" id="align-top">顶对齐</button><button class="wide" id="duplicate">复制对象</button><button class="wide danger" id="delete-element">删除所选</button>`;$('#align-left').onclick=()=>change(()=>{const items=board().elements.filter(x=>selected.includes(x.id)),min=Math.min(...items.map(x=>x.x));items.forEach(x=>x.x=min);});$('#align-top').onclick=()=>change(()=>{const items=board().elements.filter(x=>selected.includes(x.id)),min=Math.min(...items.map(x=>x.y));items.forEach(x=>x.y=min);});$('#duplicate').onclick=duplicateSelected;$('#delete-element').onclick=deleteSelected;return;}
 const numeric=(key,label)=>`<div><label>${label}</label><input type="number" data-prop="${key}" value="${Math.round(e[key]||0)}" ${['w','h','fontSize'].includes(key)?'min="1"':''}></div>`;
 $('#inspector-content').innerHTML=`<h3><span style="color:#92a397;font-size:11px">${String(board().elements.indexOf(e)+1).padStart(2,'0')} / </span>控件属性</h3><label>控件名称</label><input data-prop="name" value="${esc(e.name)}"><div class="field-grid">${numeric('x','X 位置')}${numeric('y','Y 位置')}${e.type!=='stroke'?numeric('w','宽度')+numeric('h','高度'):''}</div>${!['image','stroke'].includes(e.type)?`<label>显示文字</label><textarea data-prop="text" rows="2">${esc(e.text)}</textarea><div class="field-grid">${numeric('fontSize','字号')}${numeric('radius','圆角')}</div><div class="field-grid"><div><label>${e.type==='text'?'文字颜色':'填充'}</label><input type="color" data-prop="fill" value="${esc(e.fill)}"></div><div><label>边框</label><input type="color" data-prop="stroke" value="${esc(e.stroke)}"></div></div>${e.type!=='text'?`<label>文字颜色</label><input type="color" data-prop="textColor" value="${esc(e.textColor||'#42574d')}">`:''}`:''}<label>特效示意</label><select data-prop="effect">${[['none','无'],['pulse','呼吸闪烁'],['glow','发光提示'],['bounce','上下浮动'],['shake','左右摇动']].map(([v,n])=>`<option value="${v}" ${e.effect===v?'selected':''}>${n}</option>`).join('')}</select><div style="display:flex;gap:5px;margin-top:15px"><button id="forward">上移一层</button><button id="backward">下移一层</button></div>${e.type!=='stroke'?`<h4>关联规则</h4><label>规则状态</label><select data-rule="status">${['待确认','候选方案','已确认'].map(s=>`<option ${e.rule?.status===s?'selected':''}>${s}</option>`).join('')}</select><label>显示或操作</label><textarea data-rule="action" rows="2" placeholder="展示什么数据，或执行什么操作">${esc(e.rule?.action)}</textarea><label>触发 / 可用条件</label><textarea data-rule="condition" rows="2" placeholder="在哪些条件下出现或可以操作">${esc(e.rule?.condition)}</textarea><label>结果与反馈</label><textarea data-rule="result" rows="3" placeholder="状态怎样变化，玩家看到什么">${esc(e.rule?.result)}</textarea>`:''}<button id="duplicate" class="wide">复制控件</button><button id="delete-element" class="wide danger">删除控件</button>`;
 $$('[data-prop]').forEach(input=>{let editing=false;input.oninput=()=>{const key=input.dataset.prop;let value=input.type==='number'?Number(input.value):input.value;if(['w','h','fontSize'].includes(key))value=Math.max(1,value);if(key==='radius')value=Math.max(0,value);if(!editing){snapshot();editing=true;}e[key]=value;changed();renderCanvas();renderLeft();};input.onblur=()=>editing=false;});
 $$('[data-rule]').forEach(input=>{let editing=false;input.oninput=()=>{if(!editing){snapshot();editing=true;}e.rule??={};e.rule[input.dataset.rule]=input.value;changed();};input.onblur=()=>editing=false;});
 $('#forward').onclick=()=>change(()=>{const i=board().elements.indexOf(e);if(i<board().elements.length-1)[board().elements[i],board().elements[i+1]]=[board().elements[i+1],e];});
 $('#backward').onclick=()=>change(()=>{const i=board().elements.indexOf(e);if(i>0)[board().elements[i],board().elements[i-1]]=[board().elements[i-1],e];});
 $('#duplicate').onclick=duplicateSelected;$('#delete-element').onclick=deleteSelected;
}
function renderGuide(){const filled=sections.filter(s=>project.sections[s.id].trim()).length;$('#inspector-content').innerHTML=`<h3>从想法到交接</h3><p class="small-text">依据 game-system-spec 组织内容。按系统需要取舍栏目。</p><div class="progress-track"><i style="width:${filled/sections.length*100}%"></i></div>${sections.map((s,i)=>`<button class="guide-step ${project.sections[s.id].trim()?'done':''}" data-guide="${s.id}"><span class="step-num">${project.sections[s.id].trim()?'✓':i+1}</span><span><strong>${s.name}</strong><p>${s.hint}</p></span></button>`).join('')}<button class="primary wide" id="review">检查待补充内容</button><div class="guide-note">“已填写”只记录是否有内容，不代表规则已经正确。候选方案、待确认项与已知需求应分开。</div>`;$$('[data-guide]').forEach(b=>b.onclick=()=>{setView('spec');$('#section-'+b.dataset.guide).scrollIntoView({behavior:'smooth',block:'start'});});$('#review').onclick=()=>showReview();}
function showReview(){const issues=reviewProject({...project,boards:allStateBoards(project)});openDialog(`<h2>交接检查</h2><p>检查必填信息和规则状态；不替代对规则矛盾、玩法及程序实现的判断。</p>${issues.length?'<ul>'+issues.map(i=>`<li>${esc(i)}</li>`).join('')+'</ul>':'<p>设计目的、功能概述、详情已有内容，控件规则未发现待补充提示。仍需人工确认图文一致及规则可执行。</p>'}`);}
function renderMind(){const nodes=project.mind;$('#mind-svg').innerHTML=`<g transform="translate(${mindCamera.x} ${mindCamera.y}) scale(${mindCamera.z})">${nodes.filter(n=>n.parent).map(n=>{const p=nodes.find(p=>p.id===n.parent);if(!p)return'';return `<path d="M${p.x+175} ${p.y+25} C${(p.x+175+n.x)/2} ${p.y+25},${(p.x+175+n.x)/2} ${n.y+25},${n.x} ${n.y+25}" fill="none" stroke="#b5c9bd" stroke-width="2"/>`;}).join('')}${nodes.map(n=>`<g data-node="${n.id}" transform="translate(${n.x} ${n.y})" style="cursor:move"><rect width="175" height="50" rx="11" fill="${!n.parent?'#587b6c':'#fff'}" stroke="${n.id===selectedNode?'#78a18c':'#d8e3dc'}" stroke-width="${n.id===selectedNode?3:1}"/><text x="87.5" y="29" text-anchor="middle" font-family="Microsoft YaHei,sans-serif" font-size="13" fill="${!n.parent?'white':'#4b6155'}">${esc(n.text.length>11?n.text.slice(0,11)+'…':n.text)}</text><title>${esc(n.text)}</title></g>`).join('')}</g>`;}
function addNode(sibling=false){const parent=project.mind.find(n=>n.id===selectedNode)||project.mind[0];const n={id:uid(),parent:sibling?(parent.parent||parent.id):parent.id,text:'新主题',x:parent.x+245,y:parent.y+80};change(()=>{project.mind.push(n);selectedNode=n.id;layoutMind(project.mind);});fitMind();editText('主题内容',n.text,value=>change(()=>n.text=value));}
function deleteNode(){const node=project.mind.find(n=>n.id===selectedNode);if(!node?.parent){toast('中心主题不能删除');return;}change(()=>{const ids=descendants(project.mind,node.id);project.mind=project.mind.filter(n=>!ids.has(n.id));selectedNode=node.parent;});}
function fitMind(){fitBounds(elementsBounds(project.mind.map(n=>({...n,w:175,h:50}))),$('#mind-stage'),mindCamera);renderMind();}
let mindGesture;
$('#mind-svg').onpointerdown=e=>{if(e.button!==0&&e.button!==1)return;$('#mind-svg').focus();$('#mind-svg').setPointerCapture(e.pointerId);const hit=e.target.closest('[data-node]'),p=point(e,$('#mind-svg'),mindCamera);if(hit&&!space&&e.button===0){selectedNode=hit.dataset.node;const n=project.mind.find(n=>n.id===selectedNode);mindGesture={type:'move',p,n,base:{x:n.x,y:n.y},started:false};renderMind();renderInspector();}else mindGesture={type:'pan',sx:e.clientX,sy:e.clientY,x:mindCamera.x,y:mindCamera.y};};
$('#mind-svg').onpointermove=e=>{if(!mindGesture)return;const g=mindGesture;if(g.type==='pan'){mindCamera.x=g.x+e.clientX-g.sx;mindCamera.y=g.y+e.clientY-g.sy;}else{const p=point(e,$('#mind-svg'),mindCamera);if(!g.started&&Math.abs(p.x-g.p.x)+Math.abs(p.y-g.p.y)>2){snapshot();g.started=true;}if(g.started){g.n.x=g.base.x+p.x-g.p.x;g.n.y=g.base.y+p.y-g.p.y;}}renderMind();};
$('#mind-svg').onpointerup=()=>{if(mindGesture?.started)changed();mindGesture=null;};$('#mind-svg').onpointercancel=$('#mind-svg').onpointerup;
$('#mind-svg').ondblclick=e=>{const hit=e.target.closest('[data-node]');if(hit){const n=project.mind.find(n=>n.id===hit.dataset.node);editText('主题内容',n.text,value=>change(()=>n.text=value));}};
$('#mind-svg').onwheel=e=>{e.preventDefault();const r=$('#mind-svg').getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,z=mindCamera.z;mindCamera.z=Math.max(.15,Math.min(3,z*Math.exp(-e.deltaY*.001)));mindCamera.x=x-(x-mindCamera.x)*mindCamera.z/z;mindCamera.y=y-(y-mindCamera.y)*mindCamera.z/z;renderMind();};
function renderSpec(){const rows=allStateBoards(project).map(b=>`<h4>${esc(b.name)}</h4><table><thead><tr><th>编号 / 控件</th><th>显示或操作</th><th>条件与结果</th><th>状态</th></tr></thead><tbody>${b.elements.map((e,i)=>e.type==='stroke'?'':`<tr><td>${i+1}. ${esc(e.name)}</td><td>${esc(e.rule?.action||'待补充')}</td><td>${esc((e.rule?.condition||'条件待补充')+'\n'+(e.rule?.result||'结果待补充'))}</td><td>${esc(e.rule?.status||'待确认')}</td></tr>`).join('')}</tbody></table>`).join('');$('#spec-content').innerHTML=`<div class="doc-cover"><h2>${esc(project.name)}</h2><p>系统策划案 / 内容随项目保存</p></div>${sections.map((s,i)=>`<section class="doc-section" id="section-${s.id}"><h3><span style="color:#adbbb2;margin-right:12px">0${i+1}</span>${s.name}</h3><p class="prompt">${s.hint}</p><textarea data-doc="${s.id}" placeholder="在这里整理${s.name}…">${esc(project.sections[s.id])}</textarea></section>`).join('')}<section class="doc-section" id="section-controls"><h3>08　界面控件表</h3><p class="prompt">从 UI 画布中的编号与关联规则自动汇总，选中控件即可修改。</p>${rows}</section><section class="doc-section"><h3>状态与交互说明</h3>${stateSpecHTML()}</section>`;
 $$('[data-doc]').forEach(input=>{let editing=false;input.oninput=()=>{if(!editing){snapshot();editing=true;}project.sections[input.dataset.doc]=input.value;changed();};input.onblur=()=>{editing=false;renderInspector();};});}
async function renderMermaid(){const token=++renderToken,source=project.mermaid;$('#mermaid-status').textContent='正在渲染…';try{if(!mermaidLib){mermaidLib=await getMermaid();mermaidLib.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',themeVariables:{primaryColor:'#edf4ef',primaryTextColor:'#405b4c',primaryBorderColor:'#9bb9a6',lineColor:'#95ac9e',fontFamily:'Microsoft YaHei, sans-serif'},flowchart:{htmlLabels:false},suppressErrorRendering:true});}const result=await mermaidLib.render('flow-'+uid(),source);if(token!==renderToken)return;mermaidSVG=result.svg;mermaidRenderedSource=source;$('#mermaid-preview').innerHTML=result.svg;$('#mermaid-status').textContent='已更新';}catch(e){if(token!==renderToken)return;mermaidSVG='';mermaidRenderedSource='';$('#mermaid-preview').innerHTML=`<div class="info-card"><strong>流程图暂未生成</strong><p style="white-space:pre-wrap">${esc(e.message||e)}</p></div>`;$('#mermaid-status').textContent='请检查语法';}}
let mermaidEdit=false;$('#mermaid-source').oninput=e=>{if(!mermaidEdit){snapshot();mermaidEdit=true;}project.mermaid=e.target.value;changed();$('#mermaid-status').textContent='源码已修改 · 刷新预览';};$('#mermaid-source').onblur=()=>mermaidEdit=false;
$('#render-mermaid').onclick=renderMermaid;$('#mermaid-template').onchange=e=>{const key=e.target.value;if(!key)return;confirmAction('替换当前流程图源码？','当前内容可以通过撤回恢复。',()=>{change(()=>project.mermaid=mermaidTemplates[key]);renderMermaid();});e.target.value='';};
function openDialog(html){$('#dialog-content').innerHTML=html;if(!$('#dialog').open)$('#dialog').showModal();}
function editText(title,value,onSave,multi=false){openDialog(`<h2>${esc(title)}</h2>${multi?`<textarea id="text-editor" style="width:100%" rows="5">${esc(value)}</textarea>`:`<input id="text-editor" style="width:100%" value="${esc(value)}">`}<button id="text-save" class="primary wide">确定</button>`);const input=$('#text-editor');input.focus();input.select();const submit=()=>{onSave(input.value);$('#dialog').close();};$('#text-save').onclick=submit;input.onkeydown=e=>{if(e.key==='Enter'&&(!multi||e.ctrlKey)){e.preventDefault();submit();}};}
function confirmAction(title,description,action){openDialog(`<h2>${esc(title)}</h2><p>${esc(description)}</p><button class="primary wide" id="confirm-action">继续</button>`);$('#confirm-action').onclick=()=>{$('#dialog').close();action();};}
async function download(name,text,type='text/plain'){try{const result=await exportFile(name,text,type);toast(result.message);return result.fileName;}catch(e){toast('导出失败：'+e.message);return null;}}
const fileName=()=>project.name.replace(/[<>:"/\\|?*]/g,'_')||'系统策划';
const effectCSS='.effect-pulse{animation:pulse 1.6s ease-in-out infinite}.effect-glow{filter:drop-shadow(0 0 7px #deb46b)}.effect-bounce{animation:bounce 1.5s ease-in-out infinite;transform-box:fill-box;transform-origin:center}.effect-shake{animation:shake 1.4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}@keyframes pulse{50%{opacity:.4}}@keyframes bounce{50%{transform:translateY(-8px)}}@keyframes shake{15%,35%{transform:rotate(-3deg)}25%,45%{transform:rotate(3deg)}55%{transform:rotate(0)}}';
function boardSVG(b){const bounds=elementsBounds(b.elements);return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(bounds.w)}" height="${Math.ceil(bounds.h)}" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}"><style>${effectCSS}</style><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}" fill="#f8faf9"/>${b.elements.map((e,i)=>elementSVG(e,i,{exporting:true})).join('')}</svg>`;}
function mindSVG(){const b=elementsBounds(project.mind.map(n=>({...n,w:175,h:50})));const svg=$('#mind-svg').cloneNode(true);svg.setAttribute('viewBox',`${b.x} ${b.y} ${b.w} ${b.h}`);svg.setAttribute('width',b.w);svg.setAttribute('height',b.h);svg.firstElementChild.removeAttribute('transform');svg.removeAttribute('id');return svg.outerHTML;}
async function exportCurrent(){if(view==='canvas')download(fileName()+'-'+board().name+'.svg',boardSVG(board()),'image/svg+xml');if(view==='mind')download(fileName()+'-思维导图.svg',mindSVG(),'image/svg+xml');if(view==='mermaid'){if(mermaidRenderedSource!==project.mermaid)await renderMermaid();if(mermaidSVG)download(fileName()+'-流程图.svg',mermaidSVG,'image/svg+xml');else toast('先修正流程图语法再导出');}}
async function exportHTML(){if(mermaidRenderedSource!==project.mermaid)await renderMermaid();const controlTables=allStateBoards(project).map(b=>`<section><h2>${esc(b.name)}</h2>${boardSVG(b)}<table><thead><tr><th>编号</th><th>控件</th><th>显示或操作</th><th>条件</th><th>结果</th><th>状态</th></tr></thead><tbody>${b.elements.map((e,i)=>e.type==='stroke'?'':`<tr><td>${i+1}</td><td>${esc(e.name)}</td><td>${esc(e.rule?.action||'待补充')}</td><td>${esc(e.rule?.condition||'待补充')}</td><td>${esc(e.rule?.result||'待补充')}</td><td>${esc(e.rule?.status||'待确认')}</td></tr>`).join('')}</tbody></table></section>`).join('');const html=`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>${esc(project.name)}</title><style>body{font:14px/1.9 "Microsoft YaHei",sans-serif;color:#30473b;max-width:1050px;margin:50px auto;padding:0 35px}h1{font-size:32px}h2{margin-top:38px;border-bottom:1px solid #dce7df;padding-bottom:10px;font-size:21px}p,td{white-space:pre-wrap}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #dce7df;padding:10px;text-align:left;vertical-align:top}th{background:#edf4ee}svg{width:100%;height:auto;max-height:760px;margin:20px 0}pre{white-space:pre-wrap;background:#f3f6f3;padding:18px}small{color:#90a092}button{padding:10px 18px;border:0;background:#587b6c;color:white;border-radius:6px;float:right;cursor:pointer}@media print{button{display:none}body{margin:0;padding:0}h2{break-after:avoid}tr,svg{break-inside:avoid}section{break-before:auto}*{animation:none!important}}</style><button onclick="window.print()">打印 / 另存为 PDF</button><h1>${esc(project.name)}</h1><small>系统策划案 · ${new Date().toLocaleDateString('zh-CN')}</small>${sections.map(s=>`<section><h2>${s.name}</h2><p>${esc(project.sections[s.id]||'待补充')}</p></section>`).join('')}<h2>界面原型与控件说明</h2>${controlTables}<h2>状态与交互说明</h2>${stateSpecHTML()}<h2>思维导图</h2>${mindSVG()}<h2>流程图</h2>${mermaidSVG||'<p>当前 Mermaid 语法未能生成图，请依据下方源码检查。</p>'}<details open><summary>流程图源码</summary><pre>${esc(project.mermaid)}</pre></details></html>`;await download(fileName()+'-交接文档.html',html,'text/html');}
function exportMenu(){openDialog('<h2>导出交接</h2><p>图片、规则、结构和正文一起交付。</p><p id="export-location"></p><div class="export-list"><button id="export-html">完整交接文档 · HTML<small>包含全部界面、图片、控件规则、导图和流程图。浏览器可打印成 PDF。</small></button><button id="export-md">策划正文 · Markdown<small>包含控件规则、主题结构与 Mermaid 源码。画布图片请用完整交接文档导出。</small></button><button id="export-json">可编辑项目 · .sysplan<small>包含原始图片、全部页面、规则和正文，可重新导入编辑。</small></button></div>');$('#export-location').textContent=standalone?'文件交给浏览器下载，可在浏览器下载列表中找到。':'文件保存到工具目录的 exports 文件夹。';$('#export-html').onclick=()=>{exportHTML().catch(e=>toast(e.message));$('#dialog').close();};$('#export-md').onclick=()=>{download(fileName()+'.md',markdown({...project,boards:allStateBoards(project)})+stateSpecMarkdown());$('#dialog').close();};$('#export-json').onclick=()=>{download(fileName()+'.sysplan',JSON.stringify(project,null,2),'application/json');$('#dialog').close();};}
function showHelp(){openDialog('<h2>你的本地策划工作台</h2><p id="help-storage"></p><ul><li>UI 画布：上传或拖入图片；选择对象拖动位置，右下角调整大小；Shift 多选或保持缩放比例。</li><li>按 V 选择、M 框选、F 画框、R 矩形、T 文本、P 画笔、E 橡皮、H 平移；按住空格临时平移。橡皮擦除整条笔迹。</li><li>滚轮缩放；点击缩放百分比适应全部内容。Ctrl + Z 撤回，Ctrl + Shift + Z 重做。</li><li>Delete 删除；Ctrl + D 复制；Ctrl + C / V 复制粘贴画布对象；方向键微调，Shift + 方向键移动 10 像素。</li><li>布局：Ctrl + G 组合，Ctrl + Shift + G 取消组合；工具栏可锁定、对齐和等间距分布。Alt 临时关闭吸附或单选组内控件。</li><li>界面状态：复制整页为独立状态，再调整显示、禁用及布局；各状态不会自动同步修改。</li><li>交互预览：在控件属性中配置跳转、弹窗、返回或切换状态，点击右上角预览。退出后不改变设计稿。</li><li>思维导图：Tab 子主题，Enter 同级主题，双击改名；选中主题可调整父主题。</li><li>特效是可播放的视觉示意，随 SVG 和 HTML 一起导出；打印时为静态。</li><li>“策划引导”依据系统策划 skill 提供栏目和待补充检查。此版未接入 AI，也不读取 XMind 原生文件。</li></ul><p>建议在宽度 1100 像素以上的桌面窗口使用；窄窗口会收起右侧属性栏。</p>');$('#help-storage').textContent=standalone?'双击 index.html 即可使用。草稿自动保存在当前浏览器；用“保存项目文件”导出 .sysplan，之后可重新打开。移动 index.html、切换浏览器或清除浏览器数据前，请先保存项目文件。':'数据自动保存在 data/project.json。点击“保存项目文件”或导出后，文件保存在 exports 文件夹。';}
$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$$('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('#properties-tab').onclick=()=>{inspectorTab='properties';renderInspector();};$('#guide-tab').onclick=()=>{inspectorTab='guide';renderInspector();};
$('#undo').onclick=()=>undo();$('#redo').onclick=()=>undo(true);$('#zoom-in').onclick=()=>scaleCanvas(1.15);$('#zoom-out').onclick=()=>scaleCanvas(1/1.15);$('#zoom-fit').onclick=fitCanvas;
$('#add-child').onclick=()=>addNode();$('#add-sibling').onclick=()=>addNode(true);$('#layout-mind').onclick=()=>{change(()=>layoutMind(project.mind));fitMind();};$('#delete-node').onclick=deleteNode;$('#fit-mind').onclick=fitMind;
let nameEditing=false;$('#project-name').oninput=e=>{if(!nameEditing){snapshot();nameEditing=true;}project.name=e.target.value.trim()||'未命名系统';changed();};$('#project-name').onblur=()=>{nameEditing=false;if(view==='spec')renderSpec();};
$('#upload-image').onclick=()=>$('#image-input').click();$('#image-input').onchange=e=>{uploadImages([...e.target.files]).catch(e=>toast(e.message));e.target.value='';};
$('#save-project').onclick=()=>download(fileName()+'.sysplan',JSON.stringify(project,null,2),'application/json');$('#open-project').onclick=()=>$('#project-input').click();
$('#project-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const next=JSON.parse(await file.text());if(next.format!=='system-planner-v1'||!next.boards?.length||!next.mind?.length||!next.sections)throw Error('请选择本工具导出的 .sysplan 项目文件');confirmAction('打开这个项目？','当前项目会被替换。可以通过撤回恢复；也建议先保存项目文件。',()=>{change(()=>{project=next;boardId=project.boards[0].id;selected=[];selectedNode=project.mind[0].id;});fitCanvas();if(view==='mermaid')renderMermaid();toast('已打开项目');});}catch(err){toast(err.message);}e.target.value='';};
$('#new-project').onclick=()=>confirmAction('新建空白项目？','当前项目可以通过撤回恢复，长期保留请先保存项目文件。',()=>{change(()=>{project=newProject();boardId=project.boards[0].id;selected=[];selectedNode='root';camera={x:0,y:0,z:1};mindCamera={x:0,y:0,z:1};});setView('canvas');});
$('#export').onclick=exportMenu;$('#export-view').onclick=()=>exportCurrent().catch(e=>toast(e.message));$('#help').onclick=showHelp;$('#close-dialog').onclick=()=>$('#dialog').close();
document.addEventListener('keydown',e=>{if($('#preview-dialog').open)return;const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==='s'&&!$('#dialog').open){e.preventDefault();download(fileName()+'.sysplan',JSON.stringify(project,null,2),'application/json');return;}if($('#dialog').open||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable)return;if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);return;}if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();undo(true);return;}if(e.code==='Space'){e.preventDefault();space=true;renderCanvas();return;}if(view==='canvas'){
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelected();}
 if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateSelected();}
 if(mod&&e.key.toLowerCase()==='c'){e.preventDefault();clipboard=board().elements.filter(x=>selected.includes(x.id)).map(clone);toast('已复制所选对象');}
 if(mod&&e.key.toLowerCase()==='v'&&clipboard){e.preventDefault();const items=duplicateElements(clipboard);change(()=>{board().elements.push(...items);selected=items.map(x=>x.id);});}
 if(e.key.startsWith('Arrow')&&selected.length){e.preventDefault();change(()=>{const amount=e.shiftKey?10:1;for(const item of board().elements.filter(x=>selected.includes(x.id)&&!isLocked(x,board().elements))){if(e.key==='ArrowLeft')item.x-=amount;if(e.key==='ArrowRight')item.x+=amount;if(e.key==='ArrowUp')item.y-=amount;if(e.key==='ArrowDown')item.y+=amount;}});}
 if(!mod){const t={v:'select',m:'marquee',f:'frame',r:'rect',t:'text',p:'pen',e:'eraser',h:'hand'}[e.key.toLowerCase()];if(t)setTool(t);}
 }else if(view==='mind'){if(e.key==='Tab'){e.preventDefault();addNode();}if(e.key==='Enter'){e.preventDefault();addNode(true);}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteNode();}}
});document.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;renderCanvas();}});window.addEventListener('blur',()=>{space=false;});
document.addEventListener('paste',e=>{if(view!=='canvas'||['INPUT','TEXTAREA'].includes(e.target.tagName))return;const images=[...e.clipboardData.items].filter(i=>i.type.startsWith('image/')).map(i=>i.getAsFile());if(images.length){e.preventDefault();uploadImages(images).catch(e=>toast(e.message));}});
async function init(){if(standalone){$('.local-tag').textContent='离线版';$('#save-project').title='保存 .sysplan 文件；浏览器草稿不能代替项目文件';$('#save-status').title='草稿保存在当前浏览器，换浏览器或移动文件后请重新打开 .sysplan 项目';}try{const saved=await loadProject();if(saved){project=saved;boardId=project.boards[0].id;selectedNode=project.mind[0].id;}$('#save-status').textContent=savedLabel;renderAll();if(saved)fitCanvas();else{inspectorTab='guide';renderInspector();}changed();}catch(e){$('#save-status').textContent='读取失败';openDialog(`<h2>项目读取失败</h2><p>${esc(e.message)}。${standalone?'请通过“打开项目”选择之前保存的 .sysplan 文件。':'请检查 data/project.json，或通过“打开项目”选择之前保存的副本。'}当前页面不会自动覆盖原项目。</p>`);renderAll();}}
function renderStateToolbar(){
 const page=baseBoard();
 if(!pageStates(page).some(s=>s.id===stateId))stateId='default';
 $('#page-state').innerHTML=pageStates(page).map(s=>`<option value="${s.id}" ${s.id===stateId?'selected':''}>${esc(s.name)}</option>`).join('');
 $('#remove-state').disabled=stateId==='default';
 const items=board().elements.filter(e=>selected.includes(e.id));
 $('#group-elements').disabled=items.length<2||items.some(e=>isLocked(e,board().elements));
 $('#ungroup-elements').disabled=!items.some(e=>e.groupId)||items.some(e=>isLocked(e,board().elements));
 $('#lock-elements').disabled=!items.length;
 $('#lock-elements').textContent=items.some(e=>isLocked(e,board().elements))?'解锁':'锁定';
 $('#arrange-elements').disabled=items.length<2;
}
function groupObjects(){
 const ids=groupSelection(board().elements,selected),items=board().elements.filter(e=>ids.includes(e.id));
 if(items.length<2||items.some(e=>isLocked(e,board().elements)))return;
 change(()=>{const id=uid();items.forEach(e=>e.groupId=id);selected=ids;});
}
function ungroupObjects(){
 const ids=groupSelection(board().elements,selected),items=board().elements.filter(e=>ids.includes(e.id));
 if(items.some(e=>isLocked(e,board().elements)))return;
 change(()=>items.forEach(e=>delete e.groupId));
}
function lockObjects(){
 const ids=groupSelection(board().elements,selected),items=board().elements.filter(e=>ids.includes(e.id));
 if(!items.length)return;const unlock=items.some(e=>isLocked(e,board().elements));
 change(()=>{items.forEach(e=>e.locked=!unlock);selected=ids;});
}
function arrangeObjects(mode){
 const probe=clone(board().elements);
 if(!arrangeElements(probe,selected,mode)){toast(mode.startsWith('distribute')?'等间距需要至少三个未锁定的对象或组合':'请选中至少两个未锁定的对象或组合');return;}
 change(()=>arrangeElements(board().elements,selected,mode));
}
function renderInspector(){renderInspectorBase();renderStudioInspector();}
function renderStudioInspector(){
 if(view!=='canvas'||inspectorTab!=='properties')return;
 const items=board().elements.filter(e=>selected.includes(e.id));
 if(!items.length)return;
 if($('#align-left'))$('#align-left').onclick=()=>arrangeObjects('left');
 if($('#align-top'))$('#align-top').onclick=()=>arrangeObjects('top');
 if(items.length!==1)return;
 const e=items[0],locked=isLocked(e,board().elements);
 $$('[data-prop]').forEach(input=>input.disabled=locked);
 for(const id of ['forward','backward','delete-element'])if($('#'+id))$('#'+id).disabled=locked;
 const section=document.createElement('section');section.className='studio-properties';
 section.innerHTML=`<div class="current-state">${esc(baseBoard().name)} / ${esc(stateId==='default'?'默认':board().name)}${e.groupId?' · 组合成员':''}${locked?' · 布局已锁定':''}</div><div class="state-flags"><label><input id="element-hidden" type="checkbox" ${e.hidden?'checked':''}>在此状态隐藏</label><label><input id="element-disabled" type="checkbox" ${e.disabled?'checked':''}>不可点击</label></div><details id="interaction-details" ${e.interaction&&e.interaction.type!=='none'?'open':''}><summary>点击交互 <span>${e.interaction&&e.interaction.type!=='none'?'已配置':'未配置'}</span></summary><label>点击后执行</label><select id="interaction-type">${[['none','无'],['navigate','跳转页面'],['openOverlay','打开弹窗'],['closeOverlay','关闭弹窗'],['back','返回'],['setState','切换当前页状态']].map(([value,label])=>`<option value="${value}" ${e.interaction?.type===value?'selected':''}>${label}</option>`).join('')}</select><div id="interaction-target"></div></details>`;
 $('#inspector-content').prepend(section);
 $('#element-hidden').onchange=event=>change(()=>e.hidden=event.target.checked);
 $('#element-disabled').onchange=event=>change(()=>e.disabled=event.target.checked);
 $('#interaction-type').onchange=event=>change(()=>{
   const type=event.target.value,target=type==='setState'?baseBoard():project.boards.find(b=>b.id!==boardId)||baseBoard();
   e.interaction={type,targetBoardId:target.id,targetStateId:type==='setState'?(pageStates(target)[1]?.id||'default'):'default'};
 });
 const action=e.interaction;
 if(!action||!['navigate','openOverlay','setState'].includes(action.type))return;
 const target=action.type==='setState'?baseBoard():project.boards.find(b=>b.id===action.targetBoardId);
 $('#interaction-target').innerHTML=(action.type==='setState'?'':`<label>目标页面</label><select id="interaction-board"><option value="">选择页面…</option>${project.boards.map(b=>`<option value="${b.id}" ${b.id===action.targetBoardId?'selected':''}>${esc(b.name)}</option>`).join('')}</select>`)+`<label>目标状态</label><select id="interaction-state"><option value="">选择状态…</option>${target?pageStates(target).map(s=>`<option value="${s.id}" ${s.id===(action.targetStateId||'default')?'selected':''}>${esc(s.name)}</option>`).join(''):''}</select>`;
 if($('#interaction-board'))$('#interaction-board').onchange=event=>change(()=>{action.targetBoardId=event.target.value;action.targetStateId='default';});
 $('#interaction-state').onchange=event=>change(()=>action.targetStateId=event.target.value);
}
function editStateDetails(){
 const state=board();
 openDialog(`<h2>状态说明</h2>${stateId!=='default'?`<label>状态名称</label><input id="state-name-editor" class="wide" value="${esc(state.name)}">`:'<p>默认状态</p>'}<label>与其他状态的差异规则</label><textarea id="state-note-editor" class="wide" rows="5" placeholder="例如：领取成功后，奖励显示已领取，按钮不可点击。">${esc(state.note||'')}</textarea><button id="save-state-details" class="primary wide">保存</button>`);
 $('#save-state-details').onclick=()=>{const name=$('#state-name-editor')?.value.trim(),note=$('#state-note-editor').value;change(()=>{if(stateId!=='default')state.name=name||state.name;state.note=note;});$('#dialog').close();};
}
function stateSpecHTML(){
 return project.boards.map(page=>pageStates(page).map(s=>{
   const rows=s.elements.filter(e=>e.hidden||e.disabled||(e.interaction&&e.interaction.type!=='none')).map(e=>`<tr><td>${esc(e.name)}</td><td>${e.hidden?'隐藏':'显示'} / ${e.disabled?'不可点击':'可点击'}</td><td>${esc(interactionLabel(project,page,e.interaction))}</td></tr>`).join('');
   return `<h4>${esc(page.name)} / ${esc(s.name)}</h4><p>${esc(s.note||'未填写差异说明')}</p>${rows?`<table><thead><tr><th>控件</th><th>状态</th><th>点击交互</th></tr></thead><tbody>${rows}</tbody></table>`:''}`;
 }).join('')).join('');
}
function stateSpecMarkdown(){
 let text='\n## 状态与交互\n\n';
 for(const page of project.boards)for(const s of pageStates(page)){
   text+=`### ${page.name} / ${s.name}\n\n${s.note||'差异规则待补充'}\n\n`;
   for(const e of s.elements)if(e.hidden||e.disabled||(e.interaction&&e.interaction.type!=='none'))text+=`- ${e.name}：${e.hidden?'隐藏':'显示'}，${e.disabled?'不可点击':'可点击'}；${interactionLabel(project,page,e.interaction)}\n`;
   text+='\n';
 }
 return text;
}
function previewBoardSVG(page,state){
 const visible=state.elements.filter(e=>!e.hidden);
 const bounds=elementsBounds(visible);
 const hotspots=$('#preview-hotspots').checked?visible.filter(e=>!e.disabled&&e.interaction&&e.interaction.type!=='none').map(e=>`<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="#78a78325" stroke="#5f9777" stroke-dasharray="5 3" pointer-events="none"/>`).join(''):'';
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}" style="aspect-ratio:${bounds.w}/${bounds.h}" aria-label="${esc(page.name)}交互预览">${state.elements.map((e,i)=>elementSVG(e,i,{exporting:true,badges:false})).join('')}${hotspots}</svg>`;
}
function renderPreview(){
 const active=activePreviewView(previewSession),activePage=project.boards.find(b=>b.id===active.boardId),activeState=stateOf(activePage,active.stateId);
 $('#preview-location').textContent=activePage.name+' / '+(active.stateId==='default'?'默认':activeState.name);
 const page=project.boards.find(b=>b.id===previewSession.boardId),state=stateOf(page,previewSession.stateId);
 $('#preview-stage').innerHTML=`<div class="preview-page ${previewSession.overlays.length?'preview-underlay':''}">${previewBoardSVG(page,state)}</div>`+previewSession.overlays.map((entry,i)=>{const p=project.boards.find(b=>b.id===entry.boardId);return `<div class="preview-overlay ${i<previewSession.overlays.length-1?'preview-underlay':''}"><div class="preview-popup">${previewBoardSVG(p,stateOf(p,entry.stateId))}</div></div>`;}).join('');
 $('#preview-back').disabled=!previewSession.history.length&&!previewSession.overlays.length;
 const top=previewSession.overlays.length?$('#preview-stage .preview-overlay:last-child'):$('#preview-stage .preview-page');
 top.querySelectorAll('[data-id]').forEach(g=>{
   const e=activeState.elements.find(x=>x.id===g.dataset.id);
   g.style.cursor=!e.disabled&&e.interaction&&e.interaction.type!=='none'?'pointer':'default';
   g.onclick=()=>{
     if(e.disabled){$('#preview-feedback').textContent=e.name+'：当前状态不可点击';return;}
     if(!e.interaction||e.interaction.type==='none'){$('#preview-feedback').textContent=e.name+'：未配置点击交互';return;}
     try{previewSession=transitionPreview(project,previewSession,e.interaction);renderPreview();$('#preview-feedback').textContent=e.name+' · '+interactionLabel(project,activePage,e.interaction);}catch(error){$('#preview-feedback').textContent=error.message;}
   };
 });
}
$('#page-state').onchange=event=>{stateId=event.target.value;selected=[];gesture=null;snapGuides=[];renderAll();};
$('#add-state').onclick=()=>editText('新状态名称','新状态',name=>{if(!name.trim())return;change(()=>{const state=copyState(baseBoard(),stateId,name.trim());stateId=state.id;selected=[];});});
$('#edit-state').onclick=editStateDetails;
$('#remove-state').onclick=()=>{if(stateId==='default')return;confirmAction('删除当前状态？','可以撤回恢复。指向此状态的交互需要重新配置。',()=>change(()=>{baseBoard().states=baseBoard().states.filter(s=>s.id!==stateId);stateId='default';selected=[];}));};
$('#group-elements').onclick=groupObjects;$('#ungroup-elements').onclick=ungroupObjects;$('#lock-elements').onclick=lockObjects;
$('#arrange-elements').onchange=event=>{const mode=event.target.value;if(mode)arrangeObjects(mode);event.target.value='';};
$('#preview-start').onclick=()=>{previewOrigin={boardId:baseBoard().id,stateId};previewSession=startPreview(previewOrigin.boardId,previewOrigin.stateId);$('#preview-feedback').textContent='点击控件演示交互，设计稿保持原样';$('#preview-dialog').showModal();renderPreview();};
$('#preview-close').onclick=()=>$('#preview-dialog').close();
$('#preview-reset').onclick=()=>{previewSession=startPreview(previewOrigin.boardId,previewOrigin.stateId);renderPreview();$('#preview-feedback').textContent='已恢复预览起点';};
$('#preview-back').onclick=()=>{previewSession=transitionPreview(project,previewSession,{type:'back'});renderPreview();};
$('#preview-hotspots').onchange=renderPreview;
$('#open-interaction-example').onclick=()=>confirmAction('打开交互使用示例？','当前项目可以撤回恢复；如需长期保留，请先保存项目文件。',()=>{change(()=>{project=interactiveExample();boardId=project.boards[0].id;stateId='default';selected=[];selectedNode='root';});setView('canvas');fitCanvas();});
document.addEventListener('keydown',event=>{
 if($('#preview-dialog').open||$('#dialog').open||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
 if(view==='canvas'&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='g'){event.preventDefault();event.stopImmediatePropagation();if(event.shiftKey)ungroupObjects();else groupObjects();}
},true);
init();


