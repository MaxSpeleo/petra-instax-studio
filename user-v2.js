(() => {
'use strict';

const N=9, W=540, H=860;
const PHOTO={x:40,y:50,w:460,h:620};
const DB_NAME='petra-instax-studio-v2', STORE='slots';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let slots=Array.from({length:N},()=>null), current=0, editingIndex=-1, dirty=false;
let canvas=null, history=[], historyIndex=-1, historyLock=false;
let touchStartX=null;

const els={
  mainImg:$('#mainImg'), empty:$('#mainEmpty'), caption:$('#mainCaption'), slotNo:$('#slotNo'),
  dots:$('#dots'), statusSub:$('#statusSub'), editor:$('#photoEditor'), library:$('#libraryDialog'),
  sheet:$('#sheetDialog'), galleryGrid:$('#galleryGrid'), historyGrid:$('#historyGrid'), a4:$('#a4'),
  file:$('#photoFile'), toast:$('#toast'), directCaption:$('#directCaptionInput')
};

function toast(msg){els.toast.textContent=msg;els.toast.classList.add('show');setTimeout(()=>els.toast.classList.remove('show'),1500)}
function fileData(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}

function openDB(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})};
    req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);
  });
}
async function dbGetAll(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbPut(id,data){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({id,...data});tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function dbDelete(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function dbClear(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
const LS_KEY='petra-instax-v2-fallback';
function lsRead(){try{return JSON.parse(localStorage.getItem(LS_KEY)||'{}')}catch(e){return {}}}
function lsWriteAll(obj){try{localStorage.setItem(LS_KEY,JSON.stringify(obj));return true}catch(e){return false}}
function lsPut(id,data){const all=lsRead();all[id]={id,...data};return lsWriteAll(all)}
function lsDelete(id){const all=lsRead();delete all[id];return lsWriteAll(all)}
function lsClear(){try{localStorage.removeItem(LS_KEY);return true}catch(e){return false}}
async function safePut(id,data){
  try{await dbPut(id,data);return 'indexeddb'}catch(e){console.warn('IndexedDB save failed',e);if(lsPut(id,data))return 'localStorage';throw e}
}
async function safeDelete(id){
  try{await dbDelete(id);lsDelete(id);return 'indexeddb'}catch(e){console.warn('IndexedDB delete failed',e);if(lsDelete(id))return 'localStorage';throw e}
}
async function safeClear(){
  let ok=false;try{await dbClear();ok=true}catch(e){console.warn('IndexedDB clear failed',e)}
  if(lsClear())ok=true;if(!ok)throw new Error('Impossibile svuotare archivio')
}

async function init(){
  try{(await dbGetAll()).forEach(x=>{if(x.id>=0&&x.id<N)slots[x.id]=x})}catch(e){console.warn('IndexedDB load failed',e)}
  const fallback=lsRead();Object.values(fallback).forEach(x=>{if(x&&x.id>=0&&x.id<N&&!slots[x.id])slots[x.id]=x});
  renderMain();renderA4();
}
function currentSlot(){return slots[current]}

function renderMain(){
  const s=currentSlot();
  const savedCount=slots.filter(Boolean).length;
  els.slotNo.textContent=(current+1)+' / '+N;
  if(s?.preview){
    els.mainImg.src=s.preview;els.mainImg.classList.remove('hidden');els.empty.classList.add('hidden');
    els.caption.textContent=s.caption && s.caption!=='Tocca qui per scrivere' ? s.caption : '';
    els.statusSub.textContent='Salvate '+savedCount+' / '+N+' · tocca la stampa per modificarla';
  }else{
    els.mainImg.removeAttribute('src');els.mainImg.classList.add('hidden');els.empty.classList.remove('hidden');
    els.caption.textContent='';els.statusSub.textContent='Salvate '+savedCount+' / '+N+' · casella vuota';
  }
  els.dots.innerHTML=Array.from({length:N},(_,i)=>'<span class="dot '+(i===current?'active':'')+'"></span>').join('');
  renderSidePreviews();
}
function renderSidePreviews(){
  const prev=(current+N-1)%N,next=(current+1)%N;
  for(const [id,i] of [['prevCard',prev],['nextCard',next]]){
    const el=$('#'+id),s=slots[i];
    el.innerHTML=s?.preview?'<img src="'+s.preview+'" alt="">':'';
    el.style.background=s?.preview?'#fff':'#1d2020';
    if(s?.preview){const im=el.querySelector('img');im.style.cssText='width:100%;height:100%;object-fit:cover'}
  }
}
function setCurrent(i){current=(i+N)%N;renderMain()}

$('#prevCard').onclick=()=>setCurrent(current-1);$('#nextCard').onclick=()=>setCurrent(current+1);
$('.carousel').addEventListener('pointerdown',e=>{touchStartX=e.clientX});
$('.carousel').addEventListener('pointerup',e=>{if(touchStartX==null)return;const d=e.clientX-touchStartX;touchStartX=null;if(Math.abs(d)>50)setCurrent(current+(d<0?1:-1))});

async function choosePhoto(targetIndex=current){
  editingIndex=targetIndex;els.file.value='';
  els.file.onchange=async()=>{const f=els.file.files?.[0];if(!f)return;const data=await fileData(f);await openEditor(targetIndex,data)};
  els.file.click();
}

$('#mainCard').onclick=()=>currentSlot()?.preview?openEditor(current):choosePhoto(current);
$('#addPhotoBtn').onclick=()=>currentSlot()?.preview?openEditor(current):choosePhoto(current);
$('#galleryBtn').onclick=()=>openLibrary(false);$('#historyBtn').onclick=()=>openLibrary(true);
$('#sheetBtn').onclick=()=>{renderA4();els.sheet.showModal()};
$('#sheetClose').onclick=()=>els.sheet.close();$('#printA4').onclick=()=>window.print();
$('#clearAllBtn').onclick=async()=>{if(!confirm('Svuotare tutte le 9 miniature?'))return;slots=Array.from({length:N},()=>null);renderMain();renderA4();toast('Foglio svuotato');try{await safeClear()}catch(e){toast('Foglio svuotato solo per questa sessione')}};

function openLibrary(historyMode){
  const grid=historyMode?els.historyGrid:els.galleryGrid;
  $('#galleryPane').classList.toggle('hidden',historyMode);$('#historyPane').classList.toggle('hidden',!historyMode);
  $('#libraryTitle').textContent=historyMode?'Cronologia':'Galleria';
  renderLibraryGrid(grid,historyMode);els.library.showModal();
}
$('#libraryClose').onclick=()=>els.library.close();
function renderLibraryGrid(grid,historyMode){
  const items=slots.map((s,i)=>({s,i})).filter(x=>x.s?.preview);
  if(historyMode)items.sort((a,b)=>(b.s.updatedAt||0)-(a.s.updatedAt||0));
  grid.innerHTML=items.length?'':'<p style="color:#8d9290">Nessuna miniatura salvata.</p>';
  items.forEach(({s,i})=>{
    const b=document.createElement('button');b.className='thumb';b.innerHTML='<img src="'+s.preview+'"><span>Mini '+(i+1)+(s.caption?' · '+escapeHtml(s.caption):'')+'</span>';
    b.onclick=()=>{els.library.close();current=i;renderMain();openEditor(i)};grid.appendChild(b)
  });
}
function escapeHtml(v=''){return v.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

function renderA4(){
  els.a4.innerHTML='';
  for(let i=0;i<N;i++){
    const d=document.createElement('div');d.className='print-slot';
    d.innerHTML=slots[i]?.preview?'<img src="'+slots[i].preview+'" alt="Mini '+(i+1)+'">':'<div class="print-empty">vuoto</div>';
    els.a4.appendChild(d)
  }
}

function ensureCanvas(){
  if(canvas)return;
  canvas=new fabric.Canvas('editorCanvas',{width:W,height:H,backgroundColor:'#f8f6f0',preserveObjectStacking:true,selection:false});
  fabric.Object.prototype.transparentCorners=false;fabric.Object.prototype.cornerColor='#28e0be';fabric.Object.prototype.cornerStyle='circle';fabric.Object.prototype.cornerSize=30;fabric.Object.prototype.borderColor='#28e0be';fabric.Object.prototype.borderScaleFactor=2;
  canvas.on('selection:created',selectionChanged);canvas.on('selection:updated',selectionChanged);canvas.on('selection:cleared',()=>showPanel('photo'));
  canvas.on('object:modified',()=>{dirty=true;recordHistory()});
  canvas.on('text:editing:exited',()=>{dirty=true;const t=getCaption();if(t&&!t.text.trim())setPlaceholder(t);recordHistory()});
  canvas.on('mouse:down',opt=>{
    const pointer=canvas.getPointer(opt.e);
    const t=opt.target;
    if((t&&t.name==='caption') || pointer.y>=675){
      showPanel('text');
      setTimeout(()=>{els.directCaption?.focus();els.directCaption?.select()},30);
    }
  });
  canvas.on('object:moving',e=>{
    const o=e.target;if(o?.name==='photo'){o.left=Math.max(35,Math.min(505,o.left));o.top=Math.max(45,Math.min(675,o.top))}
  });
}
function selectionChanged(e){const t=e.selected?.[0]||canvas.getActiveObject();if(!t)return;showPanel(t.name==='caption'?'text':'photo')}

function baseObjects(){
  canvas.clear();canvas.backgroundColor='#f8f6f0';
  const cap=new fabric.Textbox('Tocca qui per scrivere',{left:50,top:700,width:440,fontSize:34,fontFamily:'Arial',fill:'#aaa6a0',textAlign:'center',originX:'left',originY:'top',name:'caption',isPlaceholder:true,editable:false,selectable:false,evented:false});
  cap.setControlsVisibility({mt:false,mb:false,ml:true,mr:true,tl:false,tr:false,bl:false,br:false,mtr:false});
  canvas.add(cap);canvas.requestRenderAll();
}
function setPlaceholder(t){t.text='Tocca qui per scrivere';t.fill='#aaa6a0';t.isPlaceholder=true}
function getPhoto(){return canvas?.getObjects().find(o=>o.name==='photo')}
function getCaption(){return canvas?.getObjects().find(o=>o.name==='caption')}
function syncDirectCaption(){
  const t=getCaption(); if(!t||!els.directCaption)return;
  t.set({editable:false,selectable:false,evented:false});
  const isPlaceholder=!!t.isPlaceholder || t.text==='Tocca qui per scrivere';
  els.directCaption.value=isPlaceholder?'':t.text||'';
  els.directCaption.placeholder='Tocca qui per scrivere';
  els.directCaption.style.fontFamily=t.fontFamily||'Arial';
  els.directCaption.style.fontSize=Math.max(14,Math.round((t.fontSize||34)*.42))+'px';
  els.directCaption.style.color=isPlaceholder?'#99958f':(t.fill||'#252626');
  els.directCaption.style.textAlign=t.textAlign||'center';
}
function applyDirectCaptionValue(){
  const t=getCaption(); if(!t||!els.directCaption)return;
  const value=els.directCaption.value;
  if(value.trim()){
    t.text=value;t.fill=$('#fontColor').value||'#252626';t.isPlaceholder=false;
  }else{
    setPlaceholder(t);
  }
  canvas.requestRenderAll();dirty=true;
}

async function addPhoto(src){
  const existing=getPhoto();if(existing)canvas.remove(existing);
  return new Promise((res,rej)=>{
    fabric.Image.fromURL(src,img=>{
      const scale=Math.max(PHOTO.w/img.width,PHOTO.h/img.height);
      img.set({left:270,top:360,originX:'center',originY:'center',scaleX:scale,scaleY:scale,name:'photo',originalSrc:src,photoPreset:'original',petraBrightness:0,petraContrast:0});
      img.clipPath=new fabric.Rect({left:PHOTO.x,top:PHOTO.y,width:PHOTO.w,height:PHOTO.h,absolutePositioned:true,fill:'#000',selectable:false,evented:false});
      canvas.add(img);canvas.sendToBack(img);canvas.setActiveObject(img);canvas.requestRenderAll();dirty=true;recordHistory();res()
    },{crossOrigin:null});
  })
}

async function openEditor(i,newSrc=null){
  ensureCanvas();editingIndex=i;history=[];historyIndex=-1;historyLock=true;
  const s=slots[i];
  if(s?.state){
    await new Promise(res=>canvas.loadFromJSON(s.state,()=>{canvas.renderAll();res()}));
    const cap=getCaption();if(cap&&cap.isPlaceholder===undefined&&cap.text==='Tocca qui per scrivere')cap.isPlaceholder=true;
  }else baseObjects();
  historyLock=false;recordHistory(true);dirty=!!newSrc;
  if(newSrc)await addPhoto(newSrc);
  $('#editorMeta').textContent='Mini '+(i+1)+' di '+N;
  syncDirectCaption();
  els.editor.showModal();showPanel(getPhoto()?'photo':'text');
}
function closeEditor(){
  if(dirty&&!confirm('Uscire senza salvare le modifiche?'))return;
  els.editor.close();editingIndex=-1;dirty=false
}
$('#editorClose').onclick=closeEditor;

function serialize(){return canvas.toJSON(['name','originalSrc','photoPreset','petraBrightness','petraContrast','isPlaceholder'])}
function recordHistory(force=false){
  if(historyLock)return;const snap=JSON.stringify(serialize());
  if(!force&&history[historyIndex]===snap)return;
  history=history.slice(0,historyIndex+1);history.push(snap);if(history.length>20)history.shift();historyIndex=history.length-1;
}
async function loadHistory(idx){if(idx<0||idx>=history.length)return;historyLock=true;await new Promise(res=>canvas.loadFromJSON(history[idx],()=>{canvas.renderAll();res()}));historyLock=false;historyIndex=idx;dirty=true;syncDirectCaption()}
$('#undoBtn').onclick=()=>loadHistory(historyIndex-1);$('#redoBtn').onclick=()=>loadHistory(historyIndex+1);

function showPanel(name){
  $$('.context-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.panel===name));
  $$('.panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===name));
}
$$('.context-tabs button').forEach(b=>b.onclick=()=>showPanel(b.dataset.panel));

$('#replacePhoto').onclick=()=>{els.file.value='';els.file.onchange=async()=>{const f=els.file.files?.[0];if(f){await addPhoto(await fileData(f));showPanel('photo')}};els.file.click()};
$('#deletePhoto').onclick=()=>{const p=getPhoto();if(!p)return;if(confirm('Eliminare la foto da questa miniatura?')){canvas.remove(p);canvas.discardActiveObject();canvas.requestRenderAll();dirty=true;recordHistory();showPanel('text')}};
$('#rotateLeft').onclick=()=>modifyPhoto(p=>p.rotate((p.angle||0)-90));
$('#rotateRight').onclick=()=>modifyPhoto(p=>p.rotate((p.angle||0)+90));
$('#flipPhoto').onclick=()=>modifyPhoto(p=>p.set('flipX',!p.flipX));
$('#resetPhoto').onclick=()=>{const p=getPhoto();if(!p)return;const base=Math.max(PHOTO.w/p.width,PHOTO.h/p.height);p.set({left:270,top:360,angle:0,flipX:false,flipY:false,scaleX:base,scaleY:base});p.setCoords();canvas.requestRenderAll();dirty=true;recordHistory()};
function modifyPhoto(fn){const p=getPhoto();if(!p)return;fn(p);p.setCoords();canvas.setActiveObject(p);canvas.requestRenderAll();dirty=true;recordHistory()}

$('#zoomPhoto').oninput=e=>{const p=getPhoto();if(!p)return;const base=Math.max(PHOTO.w/p.width,PHOTO.h/p.height);const z=parseFloat(e.target.value);p.scale(base*z);p.setCoords();canvas.requestRenderAll();dirty=true};
$('#zoomPhoto').onchange=recordHistory;

$('#fontFamily').onchange=e=>{const t=getCaption();if(!t)return;t.set('fontFamily',e.target.value);canvas.requestRenderAll();dirty=true;syncDirectCaption();recordHistory()};
$('#fontSize').oninput=e=>{const t=getCaption();if(!t)return;t.set('fontSize',+e.target.value);canvas.requestRenderAll();dirty=true;syncDirectCaption()};
$('#fontSize').onchange=recordHistory;
$('#fontColor').oninput=e=>{const t=getCaption();if(!t)return;t.set('fill',e.target.value);if(els.directCaption?.value.trim())t.isPlaceholder=false;canvas.requestRenderAll();dirty=true;syncDirectCaption()};
$('#fontColor').onchange=recordHistory;
$('[data-align]').forEach(b=>b.onclick=()=>{const t=getCaption();if(!t)return;t.set('textAlign',b.dataset.align);canvas.requestRenderAll();dirty=true;syncDirectCaption();recordHistory()});
$('#deleteText').onclick=()=>{const t=getCaption();if(!t)return;setPlaceholder(t);if(els.directCaption)els.directCaption.value='';canvas.discardActiveObject();canvas.requestRenderAll();dirty=true;syncDirectCaption();recordHistory()};

$('#filterPreset').onchange=e=>{const p=getPhoto();if(!p)return;p.photoPreset=e.target.value;applyPhotoFilters(p);dirty=true;recordHistory()};
$('#brightness').oninput=e=>{const p=getPhoto();if(!p)return;p.petraBrightness=+e.target.value;applyPhotoFilters(p);dirty=true};
$('#brightness').onchange=recordHistory;
$('#contrast').oninput=e=>{const p=getPhoto();if(!p)return;p.petraContrast=+e.target.value;applyPhotoFilters(p);dirty=true};
$('#contrast').onchange=recordHistory;
function applyPhotoFilters(p){
  const F=fabric.Image.filters,fs=[];
  const preset=p.photoPreset||'original';
  if(preset==='bw')fs.push(new F.Grayscale());
  if(preset==='sepia')fs.push(new F.Sepia());
  if(preset==='warm'){fs.push(new F.Sepia());fs.push(new F.Saturation({saturation:.15}))}
  if(preset==='vivid')fs.push(new F.Saturation({saturation:.28}));
  if(p.petraBrightness)fs.push(new F.Brightness({brightness:(p.petraBrightness||0)/100}));
  if(p.petraContrast)fs.push(new F.Contrast({contrast:(p.petraContrast||0)/100}));
  p.filters=fs;p.applyFilters();canvas.requestRenderAll()
}

if(els.directCaption){
  els.directCaption.addEventListener('pointerdown',e=>e.stopPropagation());
  els.directCaption.addEventListener('click',e=>{e.stopPropagation();showPanel('text')});
  els.directCaption.addEventListener('input',()=>{applyDirectCaptionValue();syncDirectCaption()});
  els.directCaption.addEventListener('change',()=>recordHistory());
  els.directCaption.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();els.directCaption.blur()}});
}

async function saveEditor(){
  try{
    applyDirectCaptionValue();
    const p=getPhoto();
    if(!p){toast('Inserisci prima una foto');showPanel('photo');return}
    canvas.discardActiveObject();canvas.requestRenderAll();

    const cap=getCaption(),wasPlaceholder=cap?.isPlaceholder,oldVisible=cap?.visible;
    if(wasPlaceholder&&cap)cap.visible=false;
    const preview=canvas.toDataURL({format:'png',multiplier:.5,quality:.92});
    if(cap)cap.visible=oldVisible!==false;
    canvas.requestRenderAll();

    const state=serialize();
    const caption=cap&&!wasPlaceholder?cap.text:'';
    const data={state,preview,caption,updatedAt:Date.now()};

    // Update UI first: the button must feel alive immediately.
    slots[editingIndex]={id:editingIndex,...data};
    current=editingIndex;dirty=false;
    els.editor.close();renderMain();renderA4();toast('Salvato');

    const savedId=editingIndex;
    const backend=await safePut(savedId,data);
    console.info('Saved with',backend);
    const nextEmpty=slots.findIndex((s,idx)=>idx>savedId&&!s);
    if(nextEmpty>=0){current=nextEmpty;renderMain()}
  }catch(e){
    console.error('Save failed',e);
    toast('Errore salvataggio');
  }
}
let actionLock=false;
async function runSaveAction(e){
  e?.preventDefault?.();e?.stopPropagation?.();
  if(actionLock)return;
  actionLock=true;
  const btn=$('#saveEditor');btn?.classList.add('tap-ok');
  try{await saveEditor()}finally{
    setTimeout(()=>btn?.classList.remove('tap-ok'),180);
    setTimeout(()=>{actionLock=false},220);
  }
}
$('#saveEditor').addEventListener('pointerup',runSaveAction);
$('#saveEditor').addEventListener('click',e=>{if(e.detail===0)runSaveAction(e)});

async function deleteCurrentMini(){
  if(editingIndex<0)return;
  if(!confirm('Eliminare completamente questa miniatura?'))return;
  const id=editingIndex;
  slots[id]=null;dirty=false;els.editor.close();current=id;renderMain();renderA4();toast('Miniatura eliminata');
  try{await safeDelete(id)}catch(e){console.error('Delete failed',e);toast('Eliminata solo per questa sessione')}
}
async function runDeleteAction(e){
  e?.preventDefault?.();e?.stopPropagation?.();
  if(actionLock)return;
  actionLock=true;
  const btn=$('#deleteMini');btn?.classList.add('tap-ok');
  try{await deleteCurrentMini()}finally{
    setTimeout(()=>btn?.classList.remove('tap-ok'),180);
    setTimeout(()=>{actionLock=false},220);
  }
}
$('#deleteMini').addEventListener('pointerup',runDeleteAction);
$('#deleteMini').addEventListener('click',e=>{if(e.detail===0)runDeleteAction(e)});

window.addEventListener('keydown',e=>{if(e.key==='Escape'&&els.editor.open&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')){e.preventDefault();closeEditor()}});
window.addEventListener('error',e=>{console.error(e.error||e.message);});
init();
})();