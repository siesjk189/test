'use strict';
/* story-engine.js — 剧情模式（内置剧本 + 素材覆盖 + 约见联动） */

function isStoryMode(){
  try{const raw=localStorage.getItem('sft_phone_v1');if(!raw)return false;return (JSON.parse(raw).mode||'ai')==='story';}
  catch(e){return false;}
}
window.isStoryMode=isStoryMode;

function getPhoneData(){try{return JSON.parse(localStorage.getItem('sft_phone_v1'))||{};}catch(e){return{};}}
function getBuiltinMaterials(){try{return JSON.parse(localStorage.getItem('sft_phone_builtin_materials')||'[]');}catch(e){return[];}}

function findMaterial(key){
  if(!key)return '';
  const p=getPhoneData();
  const overrides=p.materialOverrides||{};
  if(overrides[key])return overrides[key];
  const builtins=getBuiltinMaterials();
  const hit=builtins.find(m=>m.key===key);
  if(hit)return hit.url;
  if(!key.includes('-')){
    const def=builtins.find(m=>m.key===key+'-默认');
    if(def)return def.url;
    const o=overrides[key+'-默认'];
    if(o)return o;
  }
  return '';
}

function parseStoryScript(text){
  const nodes={root:{id:'root',label:'',lines:[],children:[]}};
  let title='',curId='root';
  for(const raw of String(text||'').split(/\r?\n/)){
    const line=raw.trim();
    if(!line)continue;
    const t=line.match(/^《(.+?)》$/);
    if(t&&!title){title=t[1].trim();continue;}
    const n=line.match(/^(A(?:\.\d+)+)\s*【(.*?)】\s*$/);
    if(n){nodes[n[1]]={id:n[1],label:n[2].trim(),lines:[],children:[]};curId=n[1];continue;}
    nodes[curId].lines.push(line);
  }
  for(const id of Object.keys(nodes)){
    if(id==='root')continue;
    const parts=id.slice(2).split('.').map(Number);
    const parentId=parts.length>1?'A.'+parts.slice(0,-1).join('.'):'root';
    if(nodes[parentId]&&!nodes[parentId].children.includes(id))nodes[parentId].children.push(id);
  }
  for(const id of Object.keys(nodes))nodes[id].children.sort(compareNodeId);
  return {title:title||'未命名剧本',nodes};
}
function compareNodeId(a,b){
  const pa=a.slice(2).split('.').map(Number),pb=b.slice(2).split('.').map(Number);
  for(let i=0;i<Math.max(pa.length,pb.length);i++){const d=(pa[i]||0)-(pb[i]||0);if(d!==0)return d;}
  return 0;
}
function findMergePoint(nodeId,nodes){
  if(!nodeId||nodeId==='root')return null;
  const parts=nodeId.slice(2).split('.').map(Number);
  const mp=[...parts.slice(0,-1),0];
  const mid='A.'+mp.join('.');
  if(mid!==nodeId&&nodes[mid])return mid;
  if(parts.length>1)return findMergePoint('A.'+parts.slice(0,-1).join('.'),nodes);
  return null;
}

function startStoryById(storyId){
  const txt=localStorage.getItem('sft_phone_story_'+storyId);
  if(!txt){console.warn('[story] 剧本内容缺失：',storyId);return;}
  const parsed=parseStoryScript(txt);
  state.storyPlayback={storyId,title:parsed.title,parsed,nodeId:'root',lineIndex:0,currentSprite:null,currentBg:null,bgOverride:null,pendingMap:null};
  persist();
  renderStoryScene();
}
window.startStoryById=startStoryById;

function renderStoryScene(){
  const pb=state.storyPlayback;
  if(!pb||!pb.parsed){renderStoryEmpty();return;}
  const node=pb.parsed.nodes[pb.nodeId];
  if(!node){renderStoryEmpty();return;}
  if(pb.lineIndex>=node.lines.length){
    const choices=node.children.filter(c=>!c.endsWith('.0'));
    if(choices.length){renderStoryChoices(choices);return;}
    const merge=findMergePoint(node.id,pb.parsed.nodes);
    if(merge&&merge!==node.id){pb.nodeId=merge;pb.lineIndex=0;persist();renderStoryScene();}
    else renderStoryEnding();
    return;
  }
  const parsedLine=parseStoryLine(node.lines[pb.lineIndex],pb);
  if(parsedLine.type==='scene'||parsedLine.type==='sprite'){applyStoryCommand(parsedLine,pb);pb.lineIndex++;persist();renderStoryScene();return;}
  if(parsedLine.type==='map'){applyStoryCommand(parsedLine,pb);renderStoryMapPrompt(parsedLine.location);return;}
  applyStoryCommand(parsedLine,pb);
  displayStoryLine(parsedLine,node,pb);
}

function renderStoryEmpty(){
  const sp=$('#sprite');if(sp){sp.style.display='none';sp.removeAttribute('src');}
  $('#dialogueText').textContent='请点击右上角「手机」→ 底部「设置」→ 在剧本列表中选择一个剧本，然后回到这里开始剧情。';
  $('#speaker').hidden=true;$('#progress').textContent='剧情模式 · 未选择剧本';
  $('#choices').hidden=true;$('#storyForm').hidden=true;$('#continueBtn').hidden=true;
  const mapBtn=document.querySelector('[data-action="open-map"]');if(mapBtn)mapBtn.parentElement.style.display='none';
}

function parseStoryLine(line,pb){
  let text=line,m;
  m=text.match(/[（(](.+?)立绘出现[）)]/);if(m){pb.currentSprite=m[1].trim();text=text.replace(m[0],'').trim();return{type:'sprite',action:'show',name:pb.currentSprite};}
  m=text.match(/[（(](.+?)立绘消失[）)]/);if(m){pb.currentSprite=null;return{type:'sprite',action:'hide'};}
  m=text.match(/^【场景[：:\-]\s*(.+?)】\s*$/);if(m){pb.currentBg=m[1].trim();return{type:'scene',name:pb.currentBg};}
  m=text.match(/^【地图[：:\-]\s*(.+?)】\s*$/);if(m){return{type:'map',location:m[1].trim()};}
  const dm=text.match(/^([^：:\n]{1,20})[：:](.+)$/);if(dm)return{type:'dialog',speaker:dm[1].trim(),text:dm[2].trim()};
  return{type:'narration',text};
}

function applyStoryCommand(p,pb){
  if(p.type==='scene'){
    const url=findMaterial('场景-'+p.name)||findMaterial(p.name);
    pb.bgOverride=url||null;
  }
}

function displayStoryLine(p,node,pb){
  const sprite=$('#sprite'),bgImg=$('#dynamicBg');
  if(pb.bgOverride){
    if(bgImg.dataset.src!==pb.bgOverride){bgImg.src=pb.bgOverride;bgImg.dataset.src=pb.bgOverride;}
    bgImg.style.display='';bgImg.classList.add('visible');
  }
  if(pb.currentSprite){
    const url=findMaterial(pb.currentSprite+'-默认')||findMaterial(pb.currentSprite+'-正常')||findMaterial(pb.currentSprite);
    if(url){if(sprite.dataset.src!==url){sprite.src=url;sprite.dataset.src=url;}sprite.style.display='block';sprite.classList.add('visible');sprite.classList.remove('silhouette');}
    else sprite.style.display='none';
  }else sprite.style.display='none';
  if(p.type==='dialog'){$('#speaker').hidden=false;$('#speaker').textContent=p.speaker;$('#dialogueText').textContent=p.text;$('#dialogueText').classList.remove('narration');}
  else{$('#speaker').hidden=true;$('#dialogueText').textContent=p.text;$('#dialogueText').classList.add('narration');}
  $('#progress').textContent=`${pb.nodeId==='root'?pb.parsed.title:pb.nodeId} · ${pb.lineIndex+1}/${node.lines.length}`;
  $('#choices').hidden=true;$('#storyForm').hidden=true;
  const isLast=pb.lineIndex>=node.lines.length-1;
  const hasChoices=node.children.filter(c=>!c.endsWith('.0')).length>0;
  const merge=findMergePoint(node.id,pb.parsed.nodes);
  const canMerge=merge&&merge!==node.id;
  $('#continueBtn').hidden=isLast&&(hasChoices||canMerge||(!hasChoices&&!canMerge));
  const mapBtn=document.querySelector('[data-action="open-map"]');if(mapBtn)mapBtn.parentElement.style.display='none';
}

function renderStoryChoices(choiceIds){
  const pb=state.storyPlayback,box=$('#choices');
  box.innerHTML=choiceIds.map(id=>{const c=pb.parsed.nodes[id];if(!c)return '';return `<button class="choice" data-story-choice="${id}"><span class="choice-key"><i>${id.slice(2)}</i></span><span class="choice-text">${escapeHtml(c.label||id)}</span></button>`;}).join('');
  box.hidden=false;$('#storyForm').hidden=true;$('#continueBtn').hidden=true;
  box.querySelectorAll('[data-story-choice]').forEach(btn=>{btn.addEventListener('click',()=>{const id=btn.getAttribute('data-story-choice');pb.nodeId=id;pb.lineIndex=0;persist();renderStoryScene();});});
}

function renderStoryEnding(){
  const pb=state.storyPlayback;
  $('#choices').hidden=true;$('#storyForm').hidden=true;$('#continueBtn').hidden=true;$('#speaker').hidden=true;
  $('#dialogueText').textContent='—— 剧情结束 ——\n\n如需重新选择，请打开手机 → 设置，重新选择剧本或切换回 AI 模式。';
  $('#dialogueText').classList.add('narration');
  $('#progress').textContent=(pb&&pb.title||'剧本')+' · 完';
  const sp=$('#sprite');if(sp){sp.style.display='none';}
}

function renderStoryMapPrompt(locationName){
  const pb=state.storyPlayback;
  openMap();
  setTimeout(()=>{
    const container=document.getElementById('mapContainer');if(!container)return;
    container.querySelectorAll('.map-spot').forEach(spot=>{
      const name=spot.dataset.name;
      if(name!==locationName){spot.style.opacity='0.25';spot.style.pointerEvents='none';spot.style.filter='grayscale(1)';}
      else{spot.style.boxShadow='0 0 0 3px #ffd166, 0 0 30px #ffd166';}
    });
    if(typeof window.toast==='function')window.toast(`请在地图上点击「${locationName}」`);
  },200);
  pb.pendingMap=locationName;
  persist();
}

document.addEventListener('click',(e)=>{
  const btn=e.target.closest('[data-action="continue-story"]');
  if(!btn)return;
  if(!isStoryMode())return;
  e.stopPropagation();e.preventDefault();
  const pb=state.storyPlayback;if(!pb)return;
  const node=pb.parsed.nodes[pb.nodeId];if(!node)return;
  if(pb.lineIndex<node.lines.length-1){pb.lineIndex++;persist();renderStoryScene();}
  else renderStoryScene();
},true);

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}