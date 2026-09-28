(() => {
'use strict';

const N=9, W=540, H=860;
const PHOTO={x:40,y:50,w:460,h:620};
const params=new URLSearchParams(location.search);
const WORKSPACE=(params.get('workspace')||'owner').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64)||'owner';
const DB_NAME=WORKSPACE==='owner'?'petra-instax-studio-v2':'petra-instax-studio-v2-'+WORKSPACE, STORE='slots';
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
const LS_KEY=WORKSPACE==='owner'?'petra-instax-v2-fallback':'petra-instax-v2-fallback-'+WORKSPACE;
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
$('#sheetClose').onclick=()=>els.sheet.close();$('#printA4').onclick=()=>{renderA4();window.print()};
async function savePdfA4(){
  try{
    const filled=slots.filter(s=>s?.preview).length;
    if(!filled){toast('Aggiungi almeno una miniatura');return}
    const JsPDF=window.jspdf?.jsPDF;
    if(!JsPDF){toast('Modulo PDF non disponibile');return}
    const pdf=new JsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
    const left=16, top=12.5, colStep=62, rowStep=93;
    pdf.setDrawColor(185,185,185);
    pdf.setLineWidth(.15);
    if(pdf.setLineDashPattern)pdf.setLineDashPattern([1,1],0);
    for(let i=0;i<N;i++){
      const col=i%3,row=Math.floor(i/3);
      const x=left+col*colStep,y=top+row*rowStep;
      pdf.rect(x,y,54,86);
      const s=slots[i];
      if(s?.preview)pdf.addImage(s.preview,'JPEG',x,y,54,86,undefined,'FAST');
    }
    pdf.save('Petra-Foto-A4.pdf');
    toast('PDF salvato');
  }catch(e){
    console.error('PDF export failed',e);
    toast('Errore creazione PDF');
  }
}
$('#savePdfA4').onclick=savePdfA4;
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
function getFrameObjects(){return canvas?.getObjects().filter(o=>o.name==='frame')||[]}
function currentFrameStyle(){return getFrameObjects()[0]?.frameStyle||'classic'}
function updateFrameButtons(style=currentFrameStyle()){
  $('.frame-option').forEach(b=>b.classList.toggle('active',b.dataset.frame===style));
}
function clearFrameObjects(){getFrameObjects().forEach(o=>canvas.remove(o))}
function frameRect(opts,style){
  const o=new fabric.Rect({...opts,selectable:false,evented:false,name:'frame',frameStyle:style,strokeWidth:0});
  canvas.add(o);canvas.sendToBack(o);return o;
}
function frameText(text,left,top,fill,style,size=18,weight='bold'){
  const o=new fabric.Text(text,{left,top,fontSize:size,fontFamily:'Arial',fontWeight:weight,fill,selectable:false,evented:false,name:'frame',frameStyle:style,originX:'center',originY:'center'});
  canvas.add(o);canvas.sendToBack(o);return o;
}
function frameDot(left,top,fill,style,r=5){
  const o=new fabric.Circle({left,top,radius:r,fill,selectable:false,evented:false,name:'frame',frameStyle:style,originX:'center',originY:'center'});
  canvas.add(o);canvas.sendToBack(o);return o;
}
function frameLine(points,stroke,style,width=3){
  const o=new fabric.Line(points,{stroke,strokeWidth:width,selectable:false,evented:false,name:'frame',frameStyle:style});
  canvas.add(o);canvas.sendToBack(o);return o;
}
function frameBars(fill,style){
  frameRect({left:0,top:0,width:W,height:PHOTO.y,fill},style);
  frameRect({left:0,top:PHOTO.y,width:PHOTO.x,height:PHOTO.h,fill},style);
  frameRect({left:PHOTO.x+PHOTO.w,top:PHOTO.y,width:W-(PHOTO.x+PHOTO.w),height:PHOTO.h,fill},style);
  frameRect({left:0,top:PHOTO.y+PHOTO.h,width:W,height:H-(PHOTO.y+PHOTO.h),fill},style);
}
function frameSegments(colors,style){
  const topY=0,bottomY=PHOTO.y+PHOTO.h;
  const count=9,segW=W/count;
  for(let i=0;i<count;i++){
    frameRect({left:i*segW,top:topY,width:segW+1,height:PHOTO.y,fill:colors[i%colors.length]},style);
    frameRect({left:i*segW,top:bottomY,width:segW+1,height:H-bottomY,fill:colors[(i+2)%colors.length]},style);
  }
  const countY=7,segH=PHOTO.h/countY;
  for(let i=0;i<countY;i++){
    frameRect({left:0,top:PHOTO.y+i*segH,width:PHOTO.x,height:segH+1,fill:colors[(i+1)%colors.length]},style);
    frameRect({left:PHOTO.x+PHOTO.w,top:PHOTO.y+i*segH,width:W-(PHOTO.x+PHOTO.w),height:segH+1,fill:colors[(i+3)%colors.length]},style);
  }
}
function restoreFrameLayering(){
  const p=getPhoto(),cap=getCaption();
  if(p)canvas.bringToFront(p);
  if(cap)canvas.bringToFront(cap);
}
function applyFrame(style='classic',record=true){
  clearFrameObjects();
  const white='#f8f6f0';
  if(style==='black'){
    frameBars('#151515',style);
  }else if(style==='hearts'){
    frameBars(white,style);
    [70,150,230,310,390,470].forEach((x,i)=>frameText(i%2?'♡':'♥',x,24,i%2?'#f49ab2':'#e84f77',style,i%2?18:20));
    [120,230,340,450,560].forEach((y,i)=>{frameText(i%2?'♡':'♥',19,y,'#ee6d92',style,16);frameText(i%2?'♥':'♡',521,y,'#f29bb4',style,16)});
    [70,145,385,465].forEach((x,i)=>frameText(i%2?'♡':'♥',x,823,'#ec6d92',style,18));
  }else if(style==='confetti'){
    frameBars('#fffdf8',style);
    const cols=['#74c9ef','#f7cb58','#ee9eb4','#89d8b7','#b897df'];
    const pts=[[62,23,6],[118,18,4],[178,28,5],[250,18,7],[330,27,4],[400,19,6],[475,26,5],[18,130,5],[20,240,7],[18,355,4],[20,500,6],[520,145,6],[520,280,4],[520,430,7],[520,590,5],[60,817,6],[125,835,4],[205,812,7],[330,832,5],[410,812,7],[480,835,4]];
    pts.forEach((p,i)=>frameDot(p[0],p[1],cols[i%cols.length],style,p[2]));
    [92,284,452].forEach((x,i)=>frameText(i===1?'★':'♥',x,825,cols[(i+2)%cols.length],style,17));
  }else if(style==='rainbow'){
    frameSegments(['#ff819d','#ffd765','#b7ec81','#78e1d8','#77b7f5','#b38bdf','#f29ad2'],style);
  }else if(style==='marble'){
    frameBars('#cfe9fa',style);
    const gold='#d7b36c';
    [[0,20,170,0],[100,48,240,0],[320,48,470,0],[365,860,500,695],[0,790,160,690],[0,175,38,145],[0,395,38,360],[502,230,540,195],[502,520,540,480]].forEach(p=>frameLine(p,gold,style,2));
    [[25,0,70,50],[210,0,250,50],[410,0,445,50],[0,700,40,655],[500,720,540,680]].forEach(p=>frameLine(p,'#ffffff',style,3));
  }else if(style==='stars'){
    frameBars('#fff8e8',style);
    const cols=['#d5a11b','#b7c9f5','#ef9db4','#c6a5e9'];
    [65,135,205,275,345,415,485].forEach((x,i)=>frameText(i%2?'★':'✦',x,24,cols[i%cols.length],style,i%2?15:21));
    [125,255,385,520,620].forEach((y,i)=>{frameText('★',19,y,cols[(i+1)%cols.length],style,16);frameText('✦',521,y,cols[(i+2)%cols.length],style,18)});
    [75,150,390,470].forEach((x,i)=>frameText(i%2?'✦':'★',x,825,cols[(i+3)%cols.length],style,19));
  }else if(style==='comic'){
    frameBars('#ffd923',style);
    frameRect({left:165,top:0,width:165,height:PHOTO.y,fill:'#18a9e8'},style);
    frameRect({left:330,top:0,width:210,height:PHOTO.y,fill:'#ef4145'},style);
    frameRect({left:0,top:PHOTO.y,width:PHOTO.x,height:210,fill:'#18a9e8'},style);
    frameRect({left:0,top:PHOTO.y+210,width:PHOTO.x,height:205,fill:'#ef4145'},style);
    frameRect({left:PHOTO.x+PHOTO.w,top:PHOTO.y+80,width:40,height:220,fill:'#ef4145'},style);
    frameText('★',88,24,'#111',style,24);
    frameText('!',470,24,'#fff',style,27);
    frameText('!!',520,210,'#fff',style,22);
    frameText('★',20,585,'#111',style,22);
    frameText('!',455,815,'#111',style,30);
  }else if(style==='airmail'){
    frameBars('#fffdf9',style);
    const colors=['#e92835','#173f84'];
    const step=48;
    for(let x=0,i=0;x<W;x+=step,i++){
      frameRect({left:x-4,top:3,width:30,height:11,angle:-28,fill:colors[i%2]},style);
      frameRect({left:x-4,top:836,width:30,height:11,angle:-28,fill:colors[(i+1)%2]},style);
    }
    for(let y=70,i=0;y<700;y+=64,i++){
      frameRect({left:4,top:y,width:30,height:10,angle:-28,fill:colors[i%2]},style);
      frameRect({left:507,top:y,width:30,height:10,angle:-28,fill:colors[(i+1)%2]},style);
    }
  }else if(style==='petra'){
    frameBars('#fff0da',style);
    const cols=['#efabb9','#8fceb5','#f0c465','#b9acd9'];
    const dots=[[60,24,6],[110,18,4],[165,30,5],[380,18,5],[430,28,7],[485,18,4],[18,125,5],[20,260,4],[18,420,6],[20,590,4],[520,145,5],[520,330,6],[520,560,4],[68,812,5],[115,833,4],[390,825,6],[455,810,4]];
    dots.forEach((p,i)=>frameDot(p[0],p[1],cols[i%cols.length],style,p[2]));
    [90,450].forEach((x,i)=>frameText(i?'♡':'♥',x,825,cols[i],style,17));
    frameText('PETRA',270,825,'#d4868b',style,18,'bold');
    frameText('☾',470,800,'#e5b76b',style,25);
  }
  restoreFrameLayering();
  canvas.requestRenderAll();
  updateFrameButtons(style);
  dirty=true;
  if(record)recordHistory();
}
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
  updateFrameButtons();
  els.editor.showModal();showPanel(getPhoto()?'photo':'text');
}
function closeEditor(){
  if(dirty&&!confirm('Uscire senza salvare le modifiche?'))return;
  els.editor.close();editingIndex=-1;dirty=false
}
$('#editorClose').onclick=closeEditor;

function serialize(){return canvas.toJSON(['name','originalSrc','photoPreset','petraBrightness','petraContrast','isPlaceholder','frameStyle'])}
function recordHistory(force=false){
  if(historyLock)return;const snap=JSON.stringify(serialize());
  if(!force&&history[historyIndex]===snap)return;
  history=history.slice(0,historyIndex+1);history.push(snap);if(history.length>20)history.shift();historyIndex=history.length-1;
}
async function loadHistory(idx){if(idx<0||idx>=history.length)return;historyLock=true;await new Promise(res=>canvas.loadFromJSON(history[idx],()=>{canvas.renderAll();res()}));historyLock=false;historyIndex=idx;dirty=true;syncDirectCaption();updateFrameButtons()}
$('#undoBtn').onclick=()=>loadHistory(historyIndex-1);$('#redoBtn').onclick=()=>loadHistory(historyIndex+1);

function showPanel(name){
  $$('.context-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.panel===name));
  $$('.panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===name));
}
$('.context-tabs button').forEach(b=>b.onclick=()=>showPanel(b.dataset.panel));
$('.frame-option').forEach(b=>b.onclick=()=>{applyFrame(b.dataset.frame);showPanel('frame')});

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
$$('[data-align]').forEach(b=>b.onclick=()=>{const t=getCaption();if(!t)return;t.set('textAlign',b.dataset.align);canvas.requestRenderAll();dirty=true;syncDirectCaption();recordHistory()});
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
    const preview=canvas.toDataURL({format:'jpeg',multiplier:638/W,quality:.94});
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
$('#saveEditor').onclick=async e=>{
  e.preventDefault();
  await saveEditor();
};

async function deleteCurrentMini(){
  if(editingIndex<0)return;
  if(!confirm('Eliminare completamente questa miniatura?'))return;
  const id=editingIndex;
  slots[id]=null;
  dirty=false;
  els.editor.close();
  current=id;
  renderMain();
  renderA4();
  toast('Miniatura eliminata');
  try{await safeDelete(id)}catch(e){console.error('Delete failed',e);toast('Eliminata solo per questa sessione')}
}
$('#deleteMini').onclick=async e=>{
  e.preventDefault();
  await deleteCurrentMini();
};

window.addEventListener('keydown',e=>{if(e.key==='Escape'&&els.editor.open&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')){e.preventDefault();closeEditor()}});
window.addEventListener('error',e=>{console.error(e.error||e.message);});
init();
})();