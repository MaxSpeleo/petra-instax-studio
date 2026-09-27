const N=9;
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const sheet=$('#sheet'), editor=$('#editor'), editorImg=$('#editorImg'), editorWindow=$('#editorWindow');

const defaults=()=>({
  src:null,x:0,y:0,zoom:1,rotation:0,flipX:1,flipY:1,
  brightness:100,contrast:100,saturation:100,warmth:0,vignette:0,sharpness:0,frameStyle:'none',
  preset:'Originale',caption:'',captionSize:20,captionColor:'#3b3535',
  captionAlign:'center',captionFont:'Arial, sans-serif',locked:false,width:0,height:0,history:[],future:[]
});
let slots=Array.from({length:N},defaults);
let current=-1, dragging=false, dragStart=null;

const presets={
  Originale:{b:100,c:100,s:100,sepia:0,gray:0,hue:0},
  Rich:{b:103,c:118,s:125,sepia:0,gray:0,hue:0},
  Natural:{b:101,c:98,s:92,sepia:0,gray:0,hue:0},
  'B&N':{b:102,c:110,s:0,sepia:0,gray:100,hue:0},
  Seppia:{b:103,c:102,s:85,sepia:70,gray:0,hue:0},
  Freddo:{b:101,c:103,s:102,sepia:0,gray:0,hue:190},
  Caldo:{b:104,c:102,s:108,sepia:18,gray:0,hue:0},
  Vintage:{b:105,c:92,s:78,sepia:28,gray:0,hue:0},
  Soft:{b:108,c:88,s:90,sepia:0,gray:0,hue:0},
  'Alto contrasto':{b:100,c:140,s:110,sepia:0,gray:0,hue:0},
  Fade:{b:108,c:82,s:72,sepia:8,gray:0,hue:0}
};

function cssFilter(s){
  const p=presets[s.preset]||presets.Originale;
  const b=s.brightness*p.b/100;
  const c=s.contrast*p.c/100;
  const sat=s.saturation*p.s/100;
  const extraWarm=s.warmth>0?Math.min(45,s.warmth):0;
  const sharpBoost=1+(s.sharpness||0)/500;
  return `brightness(${b}%) contrast(${c*sharpBoost}%) saturate(${sat}%) sepia(${Math.max(p.sepia,extraWarm)}%) grayscale(${p.gray}%) hue-rotate(${p.hue+(s.warmth<0?s.warmth*1.4:0)}deg)`;
}
function transform(s,moveScale=1){return `translate(${s.x*moveScale}px,${s.y*moveScale}px) scale(${s.zoom}) rotate(${s.rotation}deg) scale(${s.flipX},${s.flipY||1})`}
function vignetteStyle(s){return `background:radial-gradient(circle at center,transparent ${Math.max(20,72-(s.vignette||0)*.55)}%,rgba(0,0,0,${(s.vignette||0)/120}) 100%)`}
function frameClass(s){return s.frameStyle&&s.frameStyle!=='none'?` frame-${s.frameStyle}`:''}

function render(){
  sheet.innerHTML='';
  slots.forEach((s,i)=>{
    const c=document.createElement('article');
    c.className='card'+(s.locked?' locked':'');
    c.draggable=true;c.dataset.i=i;
    c.innerHTML=`
      <div class="photo-box" data-open="${i}">
        ${s.src?`<img src="${s.src}" style="transform:${transform(s,.756)};filter:${cssFilter(s)}"><div class="vignette" style="${vignetteStyle(s)}"></div><div class="frame-overlay${frameClass(s)}"></div>`:`<div class="placeholder">TOCCA QUI<br>PER INSERIRE<br>LA FOTO</div>`}
      </div>
      <input class="mini-caption" data-caption="${i}" value="${esc(s.caption)}" placeholder="data o breve testo"
        style="font-size:${s.captionSize}px;color:${s.captionColor};text-align:${s.captionAlign};font-family:${s.captionFont||'Arial, sans-serif'}" ${s.locked?'readonly':''}>
      <span class="quality-dot ${qualityClass(s)}" title="${qualityLabel(s)}"></span>
      <div class="card-actions">
        <button data-open="${i}">${s.src?'Modifica':'Foto'}</button>
        <button data-lock="${i}">${s.locked?'Sblocca':'Salva'}</button>
      </div>`;
    sheet.appendChild(c);
  });
  persist();
  renderGallery();
}
function esc(v=''){return v.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function qualityClass(s){
  if(!s.src)return '';
  const min=Math.min(s.width||0,s.height||0);
  return min>=1000?'good':min>=650?'warn':'bad';
}
function qualityLabel(s){
  if(!s.src)return 'Nessuna foto';
  const min=Math.min(s.width||0,s.height||0);
  return min>=1000?'Qualità buona per la stampa':min>=650?'Qualità discreta':'Risoluzione bassa';
}
function persist(){
  try{
    localStorage.setItem('petra-instax-slots',JSON.stringify(slots.map(({history,future,...x})=>x)));
  }catch(e){}
}
function restore(){
  try{
    const a=JSON.parse(localStorage.getItem('petra-instax-slots')||'null');
    if(Array.isArray(a)&&a.length===N)slots=a.map(x=>({...defaults(),...x}));
  }catch(e){}
}
restore();render();

sheet.addEventListener('click',async e=>{
  const open=e.target.closest('[data-open]');
  if(open){const i=+open.dataset.open;if(!slots[i].src){await chooseFile(i)}else openEditor(i);return}
  const lock=e.target.closest('[data-lock]');
  if(lock){const i=+lock.dataset.lock;slots[i].locked=!slots[i].locked;render()}
});
sheet.addEventListener('input',e=>{
  if(e.target.matches('[data-caption]')){const i=+e.target.dataset.caption;slots[i].caption=e.target.value;persist()}
});
sheet.addEventListener('dragstart',e=>{const c=e.target.closest('.card');if(c){c.classList.add('dragging');e.dataTransfer.setData('text/plain',c.dataset.i)}});
sheet.addEventListener('dragend',e=>{const c=e.target.closest('.card');if(c)c.classList.remove('dragging')});
sheet.addEventListener('dragover',e=>e.preventDefault());
sheet.addEventListener('drop',e=>{
  e.preventDefault();const from=+e.dataTransfer.getData('text/plain'),to=+e.target.closest('.card')?.dataset.i;
  if(Number.isInteger(from)&&Number.isInteger(to)&&from!==to){const [x]=slots.splice(from,1);slots.splice(to,0,x);render()}
});

function chooseFile(i){
  return new Promise(resolve=>{
    const input=document.createElement('input');input.type='file';input.accept='image/*';
    input.onchange=async()=>{const f=input.files?.[0];if(!f){resolve();return}
      const data=await fileData(f);
      const im=new Image();im.onload=()=>{slots[i]={...defaults(),src:data,width:im.naturalWidth,height:im.naturalHeight};render();openEditor(i);resolve()};im.src=data;
    };
    input.click();
  });
}
function fileData(file){
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>resolve(r.result);r.readAsDataURL(file)});
}
function snapshot(s){const {history,future,...x}=s;return JSON.parse(JSON.stringify(x))}
function pushHistory(){
  if(current<0)return;const s=slots[current];s.history.push(snapshot(s));if(s.history.length>30)s.history.shift();s.future=[];
}
function undo(){
  const s=slots[current];if(!s?.history.length)return;s.future.push(snapshot(s));const prev=s.history.pop();slots[current]={...s,...prev,history:s.history,future:s.future};syncEditor()
}
function redo(){
  const s=slots[current];if(!s?.future.length)return;s.history.push(snapshot(s));const next=s.future.pop();slots[current]={...s,...next,history:s.history,future:s.future};syncEditor()
}

function openEditor(i){
  current=i;syncEditor();editor.showModal()
}

function activateTab(name){
  $('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  $('.panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===name));
}
function selectEditorTarget(target){
  editorWindow.classList.toggle('selected-editable',target==='photo');
  const cap=$('#captionInput');
  if(cap) cap.classList.toggle('selected-editable',target==='text');
  activateTab(target==='text'?'text':'position');
}
editorWindow.addEventListener('click',()=>selectEditorTarget('photo'));
$('#captionInput').addEventListener('click',()=>{selectEditorTarget('text');setTimeout(()=>$('#captionInput').focus(),0)});
function syncEditor(){
  if(current<0)return;const s=slots[current];
  editorImg.src=s.src||'';
  editorImg.style.transform=transform(s);editorImg.style.filter=editorWindow.classList.contains('show-before')?'none':cssFilter(s);
  editorWindow.style.setProperty('--vignette',(s.vignette||0)/120);
  const wasSelected=editorWindow.classList.contains('selected-editable');
  const wasBefore=editorWindow.classList.contains('show-before');
  editorWindow.className='instax-window'+frameClass(s)+(wasBefore?' show-before':'')+(wasSelected?' selected-editable':'');
  $('#zoom').value=s.zoom;$('#rotation').value=s.rotation;$('#brightness').value=s.brightness;$('#contrast').value=s.contrast;$('#saturation').value=s.saturation;$('#warmth').value=s.warmth;$('#vignette').value=s.vignette||0;$('#sharpness').value=s.sharpness||0;$('#frameStyle').value=s.frameStyle||'none';
  $('#captionInput').value=s.caption;$('#captionSize').value=s.captionSize;$('#captionColor').value=s.captionColor;$('#captionFont').value=s.captionFont||'Arial, sans-serif';$('#captionInput').style.fontSize=s.captionSize+'px';$('#captionInput').style.color=s.captionColor;$('#captionInput').style.textAlign=s.captionAlign;$('#captionInput').style.fontFamily=s.captionFont||'Arial, sans-serif';
  $('#qualityText').textContent=qualityLabel(s);
  $$('.preset').forEach(b=>b.classList.toggle('active',b.dataset.preset===s.preset));
}
function bindRange(id,key,parse=Number){
  $(id).addEventListener('pointerdown',pushHistory,{passive:true});
  $(id).addEventListener('input',e=>{slots[current][key]=parse(e.target.value);syncEditor()})
}
bindRange('#zoom','zoom',parseFloat);bindRange('#rotation','rotation');bindRange('#brightness','brightness');bindRange('#contrast','contrast');bindRange('#saturation','saturation');bindRange('#warmth','warmth');bindRange('#vignette','vignette');bindRange('#sharpness','sharpness');bindRange('#captionSize','captionSize');

Object.keys(presets).forEach(name=>{
  const b=document.createElement('button');b.type='button';b.className='preset';b.dataset.preset=name;b.textContent=name;
  b.onclick=()=>{pushHistory();slots[current].preset=name;syncEditor()};
  $('#filterPresets').appendChild(b);
});
$$('.tabs button').forEach(b=>b.onclick=()=>{
  $$('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  $$('.panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===b.dataset.tab))
});
$('#rotLeft').onclick=()=>{pushHistory();slots[current].rotation-=90;syncEditor()};
$('#rotRight').onclick=()=>{pushHistory();slots[current].rotation+=90;syncEditor()};
$('#flipH').onclick=()=>{pushHistory();slots[current].flipX*=-1;syncEditor()};
$('#flipV').onclick=()=>{pushHistory();slots[current].flipY=(slots[current].flipY||1)*-1;syncEditor()};
$('#beforeAfter').onclick=()=>{editorWindow.classList.toggle('show-before');syncEditor()};
$('#frameStyle').onchange=e=>{pushHistory();slots[current].frameStyle=e.target.value;syncEditor()};
$('#resetTransform').onclick=()=>{pushHistory();Object.assign(slots[current],{x:0,y:0,zoom:1,rotation:0,flipX:1,flipY:1});syncEditor()};
$('#captionInput').addEventListener('input',e=>{slots[current].caption=e.target.value;syncEditor()});
$('#captionInput').addEventListener('focus',pushHistory,{once:false});
$('#captionColor').oninput=e=>{slots[current].captionColor=e.target.value;syncEditor()};
$('#captionFont').onchange=e=>{pushHistory();slots[current].captionFont=e.target.value;syncEditor()};
$$('[data-align]').forEach(b=>b.onclick=()=>{pushHistory();slots[current].captionAlign=b.dataset.align;syncEditor()});
$('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;

$('#replaceBtn').onclick=()=>$('#replaceFile').click();
$('#deletePhotoBtn').onclick=()=>{
  if(!confirm('Eliminare questa foto dalla miniatura?'))return;
  slots[current]=defaults();
  persist();
  editor.close();
  render();
};
$('#replaceFile').onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;pushHistory();const data=await fileData(f);const im=new Image();im.onload=()=>{Object.assign(slots[current],{src:data,width:im.naturalWidth,height:im.naturalHeight,x:0,y:0,zoom:1,rotation:0,flipX:1,flipY:1});syncEditor()};im.src=data;
};
$('#duplicateBtn').onclick=()=>{
  const empty=slots.findIndex((s,i)=>i!==current&&!s.src);
  if(empty<0){alert('Non ci sono spazi liberi nel foglio A4.');return}
  slots[empty]={...defaults(),...snapshot(slots[current]),locked:false,history:[],future:[]};render();alert('Miniatura duplicata.')
};
$('#deleteBtn').onclick=()=>{if(confirm('Eliminare questa miniatura?')){slots[current]=defaults();editor.close();render()}};
editor.addEventListener('close',()=>{if(current>=0){persist();render()}});

$('#saveSlotBtn').onclick=()=>{
  const s=slots[current];
  const maxX=editorWindow.clientWidth*.72;
  const maxY=editorWindow.clientHeight*.72;
  s.x=Math.max(-maxX,Math.min(maxX,s.x||0));
  s.y=Math.max(-maxY,Math.min(maxY,s.y||0));
  s.zoom=Math.max(1,Math.min(3,s.zoom||1));
  s.locked=false;
  persist();
  editor.close();
  render();
};
$('#downloadJpgBtn').onclick=async()=>{const blob=await exportCurrentBlob('image/jpeg');downloadBlob(blob,'petra-instax-mini.jpg')};
$('#shareBtn').onclick=async()=>{
  const blob=await exportCurrentBlob();const file=new File([blob],'petra-instax-mini.png',{type:'image/png'});
  if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Petra Instax Mini'})}
  else{downloadBlob(blob,'petra-instax-mini.png')}
};

const activePointers=new Map();
let pinchStart=null;
editorWindow.addEventListener('pointerdown',e=>{
  if(current<0)return;
  activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  editorWindow.setPointerCapture(e.pointerId);
  pushHistory();
  if(activePointers.size===1){
    dragging=true;
    dragStart={cx:e.clientX,cy:e.clientY,x:slots[current].x,y:slots[current].y};
    pinchStart=null;
  }else if(activePointers.size===2){
    dragging=false;
    const pts=[...activePointers.values()];
    pinchStart={distance:Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y),zoom:slots[current].zoom};
  }
  e.preventDefault();
});
editorWindow.addEventListener('pointermove',e=>{
  if(!activePointers.has(e.pointerId))return;
  activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(activePointers.size===2&&pinchStart){
    const pts=[...activePointers.values()];
    const d=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);
    slots[current].zoom=Math.max(1,Math.min(3,pinchStart.zoom*(d/pinchStart.distance)));
    syncEditor();e.preventDefault();return;
  }
  if(dragging&&activePointers.size===1){
    slots[current].x=dragStart.x+e.clientX-dragStart.cx;
    slots[current].y=dragStart.y+e.clientY-dragStart.cy;
    syncEditor();e.preventDefault();
  }
});
function endEditorPointer(e){
  activePointers.delete(e.pointerId);
  if(activePointers.size===0){dragging=false;pinchStart=null;persist()}
  else if(activePointers.size===1){
    const [p]=activePointers.values();
    dragging=true;dragStart={cx:p.x,cy:p.y,x:slots[current].x,y:slots[current].y};
    pinchStart=null;
  }
}
editorWindow.addEventListener('pointerup',endEditorPointer);
editorWindow.addEventListener('pointercancel',endEditorPointer);

document.addEventListener('keydown',e=>{
  if(!editor.open||current<0||/INPUT|TEXTAREA/.test(document.activeElement.tagName))return;
  const s=slots[current];let changed=true;pushHistory();
  if(e.key==='ArrowLeft')s.x-=2;else if(e.key==='ArrowRight')s.x+=2;else if(e.key==='ArrowUp')s.y-=2;else if(e.key==='ArrowDown')s.y+=2;else if(e.key==='+')s.zoom=Math.min(3,s.zoom+.05);else if(e.key==='-')s.zoom=Math.max(1,s.zoom-.05);else if(e.key.toLowerCase()==='r')s.rotation+=90;else changed=false;
  if(changed){e.preventDefault();syncEditor()}else s.history.pop()
});

async function exportCurrentBlob(type='image/png'){
  const s=slots[current],canvas=document.createElement('canvas');canvas.width=638;canvas.height=1016;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  const win={x:47,y:59,w:544,h:733};
  ctx.save();ctx.beginPath();ctx.rect(win.x,win.y,win.w,win.h);ctx.clip();
  const img=await loadImage(s.src);
  ctx.filter=cssFilter(s);
  const base=Math.max(win.w/img.width,win.h/img.height)*s.zoom;
  const w=img.width*base,h=img.height*base;
  const moveScale=win.w/230;
  ctx.translate(win.x+win.w/2+s.x*moveScale,win.y+win.h/2+s.y*moveScale);ctx.rotate(s.rotation*Math.PI/180);ctx.scale(s.flipX,s.flipY||1);
  ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();ctx.filter='none';
  if((s.vignette||0)>0){const g=ctx.createRadialGradient(win.x+win.w/2,win.y+win.h/2,win.w*.18,win.x+win.w/2,win.y+win.h/2,win.w*.68);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${(s.vignette||0)/120})`);ctx.fillStyle=g;ctx.fillRect(win.x,win.y,win.w,win.h)}
  drawFrame(ctx,s,win);
  ctx.fillStyle=s.captionColor;ctx.font=`${Math.round(s.captionSize*2.3)}px ${s.captionFont||'Arial, sans-serif'}`;ctx.textAlign=s.captionAlign==='left'?'left':s.captionAlign==='right'?'right':'center';
  const tx=s.captionAlign==='left'?47:s.captionAlign==='right'?591:319;ctx.fillText(s.caption,tx,900,544);
  return new Promise(res=>canvas.toBlob(res,type,type==='image/jpeg'?.94:undefined))
}
function drawFrame(ctx,s,win){
  if(!s.frameStyle||s.frameStyle==='none')return;
  ctx.save();ctx.lineWidth=s.frameStyle==='classic'?10:6;
  ctx.strokeStyle=s.frameStyle==='black'?'#111':s.frameStyle==='soft'?'rgba(255,255,255,.85)':'#f5f0ea';
  ctx.strokeRect(win.x+ctx.lineWidth/2,win.y+ctx.lineWidth/2,win.w-ctx.lineWidth,win.h-ctx.lineWidth);ctx.restore()
}
function loadImage(src){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src})}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

$('#printBtn').onclick=()=>window.print();
$('#clearAllBtn').onclick=()=>{if(confirm('Svuotare tutte le 9 miniature?')){slots=Array.from({length:N},defaults);render()}};

/* simple visual UI editor */
let uiEdit=false;
const uiEditBtn=$('#uiEditBtn');
const uiEditorPanel=$('#uiEditor');
const uiDone=$('#uiDone');
const heroTitle=$('#heroTitle');
const heroSubtitle=$('#heroSubtitle');
const heroPhoto=$('#heroPhoto');
const heroBg=$('#heroBg');
const uiPhotoFile=$('#uiPhotoFile');
const uiBgFile=$('#uiBgFile');
const uiColor=$('#uiColor');

if(uiEditBtn){
  uiEditBtn.onclick=()=>{
    uiEdit=!uiEdit;
    document.body.classList.toggle('ui-editing',uiEdit);
    if(uiEditorPanel) uiEditorPanel.hidden=!uiEdit;
    if(heroTitle) heroTitle.contentEditable=uiEdit;
    if(heroSubtitle) heroSubtitle.contentEditable=uiEdit;
  };
}
if(uiDone) uiDone.onclick=()=>{if(uiEditBtn)uiEditBtn.click();saveUi()};
if(heroTitle) heroTitle.oninput=saveUi;
if(heroSubtitle) heroSubtitle.oninput=saveUi;
if(uiPhotoFile) uiPhotoFile.onchange=async e=>{const f=e.target.files?.[0];if(f&&heroPhoto){heroPhoto.src=await fileData(f);saveUi()}};
if(uiBgFile) uiBgFile.onchange=async e=>{const f=e.target.files?.[0];if(f&&heroBg){heroBg.style.backgroundImage=`url("${await fileData(f)}")`;heroBg.style.opacity='.35';saveUi()}};
if(uiColor) uiColor.oninput=e=>{document.documentElement.style.setProperty('--accent2',e.target.value);saveUi()};

function saveUi(){try{
  if(!uiEditBtn)return;
  const geo={};
  ['heroPhoto','heroTitle','heroSubtitle','heroBadges'].forEach(id=>{
    const el=$('#'+id);if(!el)return;
    geo[id]={left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height,fontSize:el.style.fontSize,position:el.style.position}
  });
  localStorage.setItem('petra-instax-ui',JSON.stringify({
    title:heroTitle?.textContent||'',
    subtitle:heroSubtitle?.textContent||'',
    photo:heroPhoto?.src||'',
    bg:heroBg?.style.backgroundImage||'',
    bgOpacity:heroBg?.style.opacity||'',
    color:uiColor?.value||'',
    geo
  }))
}catch(e){}}

function loadUi(){try{
  const u=JSON.parse(localStorage.getItem('petra-instax-ui')||'null');if(!u)return;
  if(heroTitle)heroTitle.textContent=u.title||'Petra Foto';
  if(heroSubtitle)heroSubtitle.textContent=u.subtitle||'';
  if(u.photo&&heroPhoto)heroPhoto.src=u.photo;
  if(u.bg&&heroBg){heroBg.style.backgroundImage=u.bg;heroBg.style.opacity=u.bgOpacity||'.35'}
  if(u.color){if(uiColor)uiColor.value=u.color;document.documentElement.style.setProperty('--accent2',u.color)}
  Object.entries(u.geo||{}).forEach(([id,g])=>{const el=$('#'+id);if(!el)return;['left','top','width','height','fontSize','position'].forEach(k=>{if(g[k])el.style[k]=g[k]})})
}catch(e){}}
loadUi();

const params=new URLSearchParams(location.search);
const dedicatedEditor=document.body.dataset.appMode==='editor' || location.pathname.endsWith('/editor.html') || params.get('mode')==='edit';
if(dedicatedEditor && uiEditBtn){
  setTimeout(()=>{
    if(!uiEdit) uiEditBtn.click();
    document.body.classList.add('editor-link-mode');
  },0);
}

function renderGallery(){
  const g=$('#gallery'); if(!g)return;
  g.innerHTML='';
  const filled=slots.map((s,i)=>({s,i})).filter(x=>x.s.src);
  $('#galleryCount').textContent=`${filled.length} miniature`;
  filled.forEach(({s,i})=>{
    const b=document.createElement('button');b.type='button';b.className='gallery-item';
    b.innerHTML=`<div class="gallery-thumb"><img src="${s.src}" style="transform:${transform(s,.756)};filter:${cssFilter(s)}"></div><span>${esc(s.caption)||'Miniatura '+(i+1)}</span>`;
    b.onclick=()=>openEditor(i);g.appendChild(b);
  });
}

let uiDrag=null;
function enableUiVisualEdit(){
  if(!uiEditBtn)return;
  ['heroPhoto','heroTitle','heroSubtitle','heroBadges'].forEach(id=>{
    const el=$('#'+id); if(!el)return;
    el.style.touchAction='none';
    el.addEventListener('pointerdown',e=>{
      if(!uiEdit||e.target.isContentEditable)return;
      uiDrag={el,x:e.clientX,y:e.clientY,left:el.offsetLeft,top:el.offsetTop};
      el.setPointerCapture(e.pointerId);e.preventDefault();
    });
    el.addEventListener('pointermove',e=>{
      if(!uiDrag||uiDrag.el!==el)return;
      el.style.position='relative';
      el.style.left=(uiDrag.left+e.clientX-uiDrag.x)+'px';
      el.style.top=(uiDrag.top+e.clientY-uiDrag.y)+'px';
    });
    el.addEventListener('pointerup',()=>{uiDrag=null;saveUi()});
    el.addEventListener('wheel',e=>{
      if(!uiEdit)return;e.preventDefault();
      const f=e.deltaY<0?1.06:.94;
      if(id==='heroPhoto'){el.style.width=Math.max(60,el.offsetWidth*f)+'px';el.style.height=Math.max(60,el.offsetHeight*f)+'px'}
      else{const fs=parseFloat(getComputedStyle(el).fontSize)||16;el.style.fontSize=Math.max(10,fs*f)+'px'}
      saveUi()
    },{passive:false});
  })
}
enableUiVisualEdit();
