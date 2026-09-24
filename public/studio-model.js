import {uid,clone,newProject,makeElement} from './model.js';

export function pageStates(page) {
  return [{id:'default',name:'默认',elements:page.elements,note:page.note||''},...(page.states||[])];
}
export function stateOf(page,id='default') {
  return id==='default'?page:(page.states||[]).find(s=>s.id===id)||page;
}
export function copyState(page,fromId,name) {
  const source=stateOf(page,fromId);
  const next={id:uid(),name,elements:clone(source.elements),note:source.note||''};
  (page.states??=[]).push(next);
  return next;
}
export function allStateBoards(project) {
  return project.boards.flatMap(page=>pageStates(page).map(s=>({...s,name:page.name+' / '+s.name})));
}
export function boundsOf(items) {
  if(!items.length)return {x:0,y:0,w:0,h:0};
  const x=Math.min(...items.map(e=>e.x)),y=Math.min(...items.map(e=>e.y));
  return {x,y,w:Math.max(...items.map(e=>e.x+e.w))-x,h:Math.max(...items.map(e=>e.y+e.h))-y};
}
export function groupSelection(elements,ids) {
  const groups=new Set(elements.filter(e=>ids.includes(e.id)&&e.groupId).map(e=>e.groupId));
  return elements.filter(e=>ids.includes(e.id)||groups.has(e.groupId)).map(e=>e.id);
}
export function isLocked(element,elements) {
  return !!element.locked || !!(element.groupId&&elements.some(e=>e.groupId===element.groupId&&e.locked));
}
export function marqueeSelection(elements,rect) {
  return groupSelection(elements,elements.filter(e=>!e.hidden&&!isLocked(e,elements)&&e.x>=rect.x&&e.y>=rect.y&&e.x+e.w<=rect.x+rect.w&&e.y+e.h<=rect.y+rect.h).map(e=>e.id));
}
export function duplicateElements(elements) {
  const groups=new Map(),ids=new Map(elements.map(e=>[e.id,uid()]));
  return elements.map(e=>{
    const item={...clone(e),id:ids.get(e.id),x:e.x+24,y:e.y+24,locked:false};
    if(e.groupId){if(!groups.has(e.groupId))groups.set(e.groupId,uid());item.groupId=groups.get(e.groupId);}
    return item;
  });
}
export function arrangeElements(elements,ids,mode) {
  const items=elements.filter(e=>ids.includes(e.id)&&!isLocked(e,elements));
  const map=new Map();
  for(const e of items){const key=e.groupId||e.id;if(!map.has(key))map.set(key,[]);map.get(key).push(e);}
  const units=[...map.values()].map(items=>({items,...boundsOf(items)}));
  if(units.length<2)return false;
  const whole=boundsOf(units);
  const move=(unit,dx,dy)=>unit.items.forEach(e=>{e.x+=dx;e.y+=dy;});
  if(mode==='distributeX'||mode==='distributeY'){
    if(units.length<3)return false;
    const axis=mode==='distributeX'?'x':'y',size=axis==='x'?'w':'h';
    units.sort((a,b)=>a[axis]-b[axis]);
    const extent=units.at(-1)[axis]+units.at(-1)[size]-units[0][axis];
    const gap=(extent-units.reduce((n,u)=>n+u[size],0))/(units.length-1);
    let position=units[0][axis];
    for(const u of units){move(u,axis==='x'?position-u.x:0,axis==='y'?position-u.y:0);position+=u[size]+gap;}
  }else for(const u of units){
    const dx=mode==='left'?whole.x-u.x:mode==='right'?whole.x+whole.w-u.x-u.w:mode==='centerX'?whole.x+whole.w/2-u.x-u.w/2:0;
    const dy=mode==='top'?whole.y-u.y:mode==='bottom'?whole.y+whole.h-u.y-u.h:mode==='centerY'?whole.y+whole.h/2-u.y-u.h/2:0;
    move(u,dx,dy);
  }
  return true;
}
export function snapMove(items,dx,dy,others,tolerance=6) {
  const box=boundsOf(items),guides=[];
  function axisSnap(axis,size,delta){
    const anchors=[box[axis]+delta,box[axis]+delta+box[size]/2,box[axis]+delta+box[size]];
    let best=tolerance+1,offset=0,guide;
    for(const other of others)for(const target of [other[axis],other[axis]+other[size]/2,other[axis]+other[size]])for(const anchor of anchors){
      const difference=target-anchor;
      if(Math.abs(difference)<best){best=Math.abs(difference);offset=difference;guide=target;}
    }
    if(best<=tolerance){guides.push({axis,value:guide});return delta+offset;}
    return Math.round((box[axis]+delta)/8)*8-box[axis];
  }
  return {dx:axisSnap('x','w',dx),dy:axisSnap('y','h',dy),guides};
}

export function startPreview(boardId,stateId='default') {
  return {boardId,stateId,overlays:[],history:[]};
}
export function activePreviewView(session) {return session.overlays.at(-1)||session;}
export function transitionPreview(project,session,action) {
  const next=clone(session),active=activePreviewView(next);
  const page=project.boards.find(b=>b.id===active.boardId);
  if(!action||action.type==='none')return next;
  if(action.type==='back'){
    if(next.overlays.length)next.overlays.pop();
    else if(next.history.length){const old=next.history.pop();Object.assign(next,old);}
    return next;
  }
  if(action.type==='closeOverlay'){next.overlays.pop();return next;}
  if(action.type==='setState'){
    if(!pageStates(page).some(s=>s.id===action.targetStateId))throw Error('目标状态已被删除，请重新配置交互');
    active.stateId=action.targetStateId;return next;
  }
  const target=project.boards.find(b=>b.id===action.targetBoardId);
  if(!target)throw Error('目标页面已被删除，请重新配置交互');
  const targetStateId=action.targetStateId||'default';
  if(!pageStates(target).some(s=>s.id===targetStateId))throw Error('目标状态已被删除，请重新配置交互');
  if(action.type==='openOverlay')next.overlays.push({boardId:target.id,stateId:targetStateId});
  if(action.type==='navigate'){
    next.history.push({boardId:next.boardId,stateId:next.stateId,overlays:clone(next.overlays)});
    next.boardId=target.id;next.stateId=targetStateId;next.overlays=[];
  }
  return next;
}
export function interactionLabel(project,page,action) {
  if(!action||action.type==='none')return '无';
  if(action.type==='back')return '返回';
  if(action.type==='closeOverlay')return '关闭弹窗';
  const target=action.type==='setState'?page:project.boards.find(b=>b.id===action.targetBoardId);
  const state=target&&pageStates(target).find(s=>s.id===(action.targetStateId||'default'));
  return ({navigate:'跳转',openOverlay:'打开弹窗',setState:'切换状态'}[action.type]||'交互')+' → '+(target?.name||'页面已删除')+' / '+(state?.name||'状态已删除');
}

export function interactiveExample(){
 const p=newProject();p.name='交互与状态 · 使用示例';
 const home=p.boards[0];home.name='签到首页';
 const popup={id:uid(),name:'奖励说明弹窗',elements:[]},records={id:uid(),name:'领取记录',elements:[]};
 p.boards.push(popup,records);
 const add=(page,type,props)=>{const e=makeElement(type,props);page.elements.push(e);return e;};
 const frame=page=>add(page,'frame',{name:'页面背景',x:60,y:30,w:360,h:600,fill:'#ffffff',stroke:'#c7d7cc',radius:24,locked:true});
 const text=(page,label,x,y,size=17)=>add(page,'text',{name:label,text:label,x,y,w:290,h:55,fontSize:size,fill:'#587060'});
 const button=(page,label,x,y,action)=>add(page,'rect',{name:label,text:label,x,y,w:288,h:48,fill:'#587b6c',textColor:'#ffffff',fontSize:16,interaction:action,rule:{action:'点击'+label,condition:'此状态可用',result:'见点击交互配置',status:'候选方案'}});
 frame(home);text(home,'每日签到',90,66,27);text(home,'一个可以点起来的策划原型',90,115,13);
 const group=uid();
 add(home,'rect',{name:'奖励卡片背景',groupId:group,x:94,y:194,w:288,h:146,fill:'#eef4ef',stroke:'#d2dfd5'});
 const reward=text(home,'今日奖励\n◇\n奖励内容待配置',135,211,19);reward.groupId=group;
 const claim=button(home,'领取奖励',94,377,{type:'none'});
 button(home,'奖励说明',94,443,{type:'openOverlay',targetBoardId:popup.id,targetStateId:'default'}).fill='#87a592';
 button(home,'查看记录',94,509,{type:'navigate',targetBoardId:records.id,targetStateId:'default'}).fill='#9eaca3';
 const claimed=copyState(home,'default','已领取');claimed.note='领取完成后，领取按钮显示“已领取”并不可点击。其他入口保持可用。';
 const claimedButton=claimed.elements.find(e=>e.id===claim.id);claimedButton.text='已领取';claimedButton.disabled=true;claimedButton.fill='#a0aaa4';
 claim.interaction={type:'setState',targetStateId:claimed.id};
 home.note='示例状态，奖励数值、刷新时间和实际资格规则均待确认。';
 add(popup,'frame',{name:'弹窗背景',x:0,y:0,w:300,h:240,fill:'#ffffff',radius:20,locked:true});
 text(popup,'奖励说明',30,24,23);text(popup,'这里用于演示弹窗。\n正式奖励规则需要策划填写。',22,82,14);
 const close=button(popup,'知道了',40,170,{type:'closeOverlay'});close.w=220;
 frame(records);text(records,'领取记录',90,68,26);text(records,'暂无更多记录\n\n此页面用于演示跳转与返回。',90,170,17);
 button(records,'返回上一页',94,510,{type:'back'});
 p.sections.purpose='【使用示例】演示布局组合、状态切换、弹窗、跳转和返回。所有规则都是候选方案。';
 p.sections.overview='首页 → 领取后状态；首页 → 奖励说明弹窗；首页 → 领取记录 → 返回。';
 p.sections.rules='点击领取奖励切换到“已领取”状态。已领取状态下领取按钮不可点击。预览过程不会修改设计稿。';
 p.sections.questions='奖励配置、领取资格、周期刷新、红点规则待确认。';
 return p;
}
