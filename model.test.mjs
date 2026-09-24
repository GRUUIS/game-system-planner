import assert from 'node:assert/strict';
import {newProject,makeElement,layoutMind,descendants,markdown,reviewProject} from './public/model.js';
const p=newProject();const e=makeElement('rect',{name:'领取 | 按钮',rule:{action:'点击领取\n刷新状态',condition:'可领取',result:'奖励到账',status:'候选方案'}});p.boards[0].elements.push(e);
assert.ok(markdown(p).includes('领取 \\| 按钮'));assert.ok(markdown(p).includes('点击领取<br>刷新状态'));assert.ok(markdown(p).includes('奖励到账'));
const nodes=layoutMind([{id:'r',parent:null},{id:'a',parent:'r'},{id:'b',parent:'r'},{id:'c',parent:'a'}]);assert.ok(nodes[3].x>nodes[1].x);assert.notEqual(nodes[1].y,nodes[2].y);assert.deepEqual([...descendants(nodes,'a')].sort(),['a','c']);
assert.equal(reviewProject(p).length,3);p.sections.purpose='用途';p.sections.overview='范围';p.sections.rules='规则';assert.deepEqual(reviewProject(p),[]);e.rule.status='待确认';assert.ok(reviewProject(p)[0].includes('规则仍待确认'));
console.log('通过：控件交接导出、导图层级与分支、待确认状态检查。');
