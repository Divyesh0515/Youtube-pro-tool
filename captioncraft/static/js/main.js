/* ── STATE ── */
const state = {
  jobId: null, videoPath: null, videoFile: null,
  captions: [], words: [], nextId: 0,
  selectedStyle: 'mehfil',
  sizeScale: 1.0, position: 'bottom',
  playing: false, duration: 0, currentTime: 0,
  customFont1: '', customFont2: '',
  customCase1: '', customCase2: '',
  customSize1: 0, customSize2: 0,
  customColor1: '', customColor2: '',
  customAnim: '',   // override animation
  animDur: 300,     // animation duration ms
};

/* ── FONT MAP (canvas) ── */
const FONT_MAP = {
  BebasNeue: "'Bebas Neue'",
  DancingScript: "'Dancing Script'",
  Anton: "'Anton'",
  Montserrat: "'Montserrat'",
  SpaceMono: "'Space Mono'",
  PlayfairDisplay: "'Playfair Display'",
  Caveat: "'Caveat'",
};

/* ── DRAG & DROP ── */
const dropOverlay = document.getElementById('drop-overlay');
const fileInput   = document.getElementById('file-input');
dropOverlay.addEventListener('click', () => fileInput.click());
dropOverlay.addEventListener('dragover', e => { e.preventDefault(); dropOverlay.style.background='rgba(0,255,136,.08)'; });
dropOverlay.addEventListener('dragleave', () => { dropOverlay.style.background=''; });
dropOverlay.addEventListener('drop', e => { e.preventDefault(); dropOverlay.style.background=''; const f=e.dataTransfer.files[0]; if(f) handleFile(f); });
fileInput.addEventListener('change', e => { if(e.target.files[0]) handleFile(e.target.files[0]); });

function handleFile(file) {
  const ok = /\.(mp4|mov|avi|mkv)$/i.test(file.name);
  if (!ok) { toast('Unsupported file type','error'); return; }
  uploadFile(file);
}

/* ── UPLOAD ── */
async function uploadFile(file) {
  setStatus('working','Uploading…');
  state.videoFile = file;
  const form = new FormData();
  form.append('video', file);
  try {
    const res  = await fetch('/upload', { method:'POST', body:form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error||'Upload failed');
    state.jobId = data.job_id;
    state.videoPath = data.path;
    initVideoPlayer(file);
    document.getElementById('btn-transcribe').disabled = false;
    document.getElementById('btn-export-top').disabled = false;
    setStatus('done','Ready');
    toast('Video uploaded ✓','success');
  } catch(e) { setStatus('error','Upload failed'); toast(e.message,'error'); }
}

/* ── VIDEO PLAYER ── */
function initVideoPlayer(file) {
  const video   = document.getElementById('main-video');
  const canvas  = document.getElementById('caption-canvas');
  const overlay = document.getElementById('drop-overlay');
  overlay.style.display = 'none';
  video.style.display   = 'block';
  canvas.style.display  = 'block';
  video.src = URL.createObjectURL(file);
  video.addEventListener('loadedmetadata', () => {
    state.duration = video.duration;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw && vh) {
      const frame = document.getElementById('video-frame');
      frame.style.aspectRatio = `${vw}/${vh}`;
    }
    resizeCanvas();
    document.getElementById('video-controls').style.display='flex';
    document.getElementById('adjust-bar').style.display='flex';
  });
  video.addEventListener('timeupdate', () => {
    state.currentTime = video.currentTime;
    updateProgress();
    drawCaptions();
  });
  video.addEventListener('play',  () => { state.playing=true;  document.getElementById('btn-play').textContent='⏸'; startAnimLoop(); });
  video.addEventListener('pause', () => { state.playing=false; document.getElementById('btn-play').textContent='▶'; stopAnimLoop(); drawCaptions(); });
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  const video  = document.getElementById('main-video');
  const canvas = document.getElementById('caption-canvas');
  canvas.width  = video.videoWidth  || 1080;
  canvas.height = video.videoHeight || 1920;
}

/* ── VIDEO CONTROLS ── */
function togglePlay() {
  const v = document.getElementById('main-video');
  state.playing ? v.pause() : v.play();
}
function toggleMute() {
  const v = document.getElementById('main-video');
  v.muted = !v.muted;
}
function seekVideo(e) {
  const track = document.getElementById('progress-track');
  const pct   = e.offsetX / track.clientWidth;
  document.getElementById('main-video').currentTime = pct * state.duration;
}
function updateProgress() {
  const pct = state.duration ? (state.currentTime/state.duration)*100 : 0;
  document.getElementById('progress-fill').style.width = pct+'%';
  document.getElementById('time-display').textContent  = fmtTime(state.currentTime)+' / '+fmtTime(state.duration);
}

/* ── TRANSCRIBE ── */
async function transcribeVideo() {
  if (!state.videoPath) return;
  setStatus('working','Transcribing…');
  document.getElementById('t-progress').style.display='block';
  document.getElementById('btn-transcribe').disabled=true;
  try {
    const res  = await fetch('/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:state.videoPath})});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error||'Transcription failed');
    document.getElementById('t-progress').style.display='none';
    state.words    = data.words||[];
    loadCaptions(data.captions);
    setStatus('done',`${data.captions.length} captions`);
    toast(`Transcribed — ${data.captions.length} segments`,'success');
  } catch(e) {
    document.getElementById('t-progress').style.display='none';
    setStatus('error','Failed'); toast(e.message,'error');
  } finally { document.getElementById('btn-transcribe').disabled=false; }
}

/* ── CAPTIONS ── */
function loadCaptions(caps) {
  state.captions = caps.map(c=>({...c, _id:state.nextId++}));
  renderCaptionList();
  document.getElementById('btn-export-top').disabled  = false;
  document.getElementById('btn-export-full').disabled = false;
}

function renderCaptionList() {
  const scroll = document.getElementById('caption-scroll');
  const empty  = document.getElementById('empty-captions');
  const editor = document.getElementById('caption-editor');
  const badge  = document.getElementById('word-count');

  if (!state.captions.length) {
    empty.style.display='flex'; editor.style.display='none';
    badge.style.display='none'; return;
  }
  empty.style.display='none'; editor.style.display='flex'; editor.style.flexDirection='column';
  badge.style.display='inline'; badge.textContent=state.captions.length;

  scroll.innerHTML='';
  state.captions.forEach(cap=>{
    const el=document.createElement('div');
    el.className='cap-item'; el.dataset.id=cap._id;
    el.innerHTML=`
      <div class="cap-time">${fmtTime(cap.start)}<br/>${fmtTime(cap.end)}</div>
      <textarea class="cap-textarea" rows="2"
        onchange="updateCap(${cap._id},'text',this.value)"
        oninput="autoResize(this)"
      >${escHtml(cap.text)}</textarea>
      <button class="cap-del" onclick="deleteCap(${cap._id})">✕</button>`;
    el.addEventListener('click',()=>{
      document.querySelectorAll('.cap-item').forEach(i=>i.classList.remove('active'));
      el.classList.add('active');
      if(document.getElementById('main-video').paused)
        document.getElementById('main-video').currentTime=cap.start;
    });
    scroll.appendChild(el);
    autoResize(el.querySelector('textarea'));
  });
}

function updateCap(id,field,val) { const c=state.captions.find(x=>x._id===id); if(c) c[field]=val; }
function deleteCap(id) { state.captions=state.captions.filter(x=>x._id!==id); renderCaptionList(); }
function addCaption() {
  const last=state.captions[state.captions.length-1];
  const s=last?last.end+.1:0;
  state.captions.push({_id:state.nextId++,start:s,end:s+2,text:'New caption'});
  renderCaptionList();
  document.getElementById('caption-scroll').scrollTop=99999;
}
function clearCaptions() { if(!confirm('Clear all?')) return; state.captions=[]; renderCaptionList(); }

/* ── STYLE ── */
function selectStyle(key, el) {
  document.querySelectorAll('.style-card').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  state.selectedStyle=key;
  drawCaptions();
}

function setPosition(pos, btn) {
  document.querySelectorAll('.pos-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  state.position=pos;
  drawCaptions();
}

function updateSizeScale(val) {
  state.sizeScale=val/100;
  document.getElementById('size-val').textContent=val+'%';
  drawCaptions();
}

/* ── ANIMATION STATE ── */
const animState = { capId: null, startMs: 0, rafId: null };

function startAnimLoop() {
  if (animState.rafId) return;
  function loop() {
    drawCaptions();
    animState.rafId = requestAnimationFrame(loop);
  }
  animState.rafId = requestAnimationFrame(loop);
}
function stopAnimLoop() {
  if (animState.rafId) { cancelAnimationFrame(animState.rafId); animState.rafId = null; }
}

/* ── CANVAS CAPTION RENDERER ── */
function drawCaptions() {
  const canvas = document.getElementById('caption-canvas');
  if (!canvas || canvas.style.display === 'none') return;
  const ctx = canvas.getContext('2d');
  const W   = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!state.captions.length) return;

  const t   = state.currentTime;
  const cap = state.captions.find(c => t >= c.start && t <= c.end);
  if (!cap) return;

  // Detect new caption → reset animation timer
  if (cap._id !== animState.capId) {
    animState.capId   = cap._id;
    animState.startMs = performance.now();
  }

  const elapsed = performance.now() - animState.startMs; // ms since caption started
  const style   = STYLES[state.selectedStyle] || STYLES['mehfil'];
  drawStyle(ctx, W, H, cap.text, style, elapsed);
}

/* ── EASING ── */
function easeOut(t) { return 1 - Math.pow(1-t, 3); }
function easeOutBounce(t) {
  if (t < 1/2.75) return 7.5625*t*t;
  if (t < 2/2.75) { t -= 1.5/2.75; return 7.5625*t*t+0.75; }
  if (t < 2.5/2.75) { t -= 2.25/2.75; return 7.5625*t*t+0.9375; }
  t -= 2.625/2.75; return 7.5625*t*t+0.984375;
}
function easeOutBack(t) { const c1=1.70158,c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); }

function drawStyle(ctx, W, H, text, style, elapsed=999) {
  const scale = state.sizeScale;
  const pos   = state.position;
  const anim  = state.customAnim || style.anim || 'fade';
  const DUR   = state.animDur || 300;

  // Split text into 2 lines
  const words  = text.trim().split(/\s+/);
  const mid    = Math.ceil(words.length/2);
  const line1w = words.slice(0,mid);
  const line2w = words.slice(mid);
  const line1  = line1w.join(' ');
  const line2  = line2w.join(' ');

  const l1cfg = style.line1 || {};
  const l2cfg = style.line2 || l1cfg;

  const l1size = Math.floor((l1cfg._size||l1cfg.size||60)*scale*(W/500));
  const l2size = Math.floor((l2cfg._size||l2cfg.size||40)*scale*(W/500));

  const l1font = state.customFont1 ? (FONT_MAP[state.customFont1]||"'Anton'") : (FONT_MAP[l1cfg.font]||"'Anton'");
  const l2font = state.customFont2 ? (FONT_MAP[state.customFont2]||"'Dancing Script'") : (FONT_MAP[l2cfg.font]||"'Dancing Script'");
  if (state.customSize1) l1cfg._size = state.customSize1;
  if (state.customSize2) l2cfg._size = state.customSize2;
  if (state.customColor1) l1cfg._color = state.customColor1;
  if (state.customColor2) l2cfg._color = state.customColor2;

  const applyCase = (str, c) => {
    if (c==='upper') return str.toUpperCase();
    if (c==='lower') return str.toLowerCase();
    if (c==='title') return str.replace(/\b\w/g,ch=>ch.toUpperCase());
    return str;
  };

  const t1 = applyCase(line1, state.customCase1||l1cfg.case||'upper');
  const t2 = line2 ? applyCase(line2, state.customCase2||l2cfg.case||'lower') : '';

  // Y position
  let baseY;
  const totalH = l1size + l2size + 16;
  if (pos==='bottom') baseY = H - 60 - totalH;
  else if (pos==='top') baseY = 60;
  else baseY = (H-totalH)/2;

  // ── Animation transform ──
  const t_anim = Math.min(elapsed / DUR, 1);
  let offY1 = 0, offY2 = 0, scl1 = 1, scl2 = 1, alpha1 = 1, alpha2 = 1;

  if (anim === 'slide_up') {
    const p = easeOut(t_anim);
    offY1 = (1 - p) * l1size * 0.6;
    offY2 = (1 - easeOut(Math.min((elapsed - 80) / DUR, 1))) * l2size * 0.6;
    alpha1 = Math.min(elapsed / 150, 1);
    alpha2 = Math.min(Math.max((elapsed - 80) / 150, 0), 1);
  } else if (anim === 'pop') {
    scl1  = easeOutBack(t_anim);
    scl2  = easeOutBack(Math.min((elapsed - 80) / DUR, 1));
    alpha1 = Math.min(elapsed / 120, 1);
    alpha2 = Math.min(Math.max((elapsed - 80) / 120, 0), 1);
  } else if (anim === 'bounce') {
    offY1  = (1 - easeOutBounce(t_anim)) * (-l1size * 0.5);
    offY2  = (1 - easeOutBounce(Math.min((elapsed - 100) / DUR, 1))) * (-l2size * 0.5);
    alpha1 = Math.min(elapsed / 100, 1);
    alpha2 = Math.min(Math.max((elapsed - 100) / 100, 0), 1);
  } else if (anim === 'blur_slide') {
    const p = easeOut(t_anim);
    offY1  = (1 - p) * l1size * 0.4;
    offY2  = (1 - easeOut(Math.min((elapsed - 100) / DUR, 1))) * l2size * 0.4;
    alpha1 = Math.min(elapsed / 200, 1);
    alpha2 = Math.min(Math.max((elapsed - 100) / 200, 0), 1);
  } else { // fade
    alpha1 = Math.min(elapsed / 250, 1);
    alpha2 = Math.min(Math.max((elapsed - 100) / 250, 0), 1);
  }

  ctx.save();
  ctx.textAlign = 'center';
  const hl = style.highlight;

  // ── Draw line1 ──
  ctx.globalAlpha = alpha1;
  ctx.font = `${l1cfg.bold?'900':'600'} ${l1size}px ${l1font}`;

  if (l1cfg.glow) {
    ctx.shadowColor = l1cfg.color || '#00FF44';
    ctx.shadowBlur  = 28 * scale;
  } else {
    ctx.shadowColor   = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur    = 10;
    ctx.shadowOffsetY = 4;
  }

  if (hl && t1) {
    ctx.save();
    if (scl1 !== 1) { ctx.translate(W/2, baseY + offY1); ctx.scale(scl1, scl1); ctx.translate(-W/2, -(baseY + offY1)); }
    const tw  = ctx.measureText(t1).width;
    const pad = 14;
    ctx.fillStyle = hl.bg || '#CC0000';
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath();
    roundRect(ctx, W/2-tw/2-pad, baseY+offY1-l1size+4, tw+pad*2, l1size+10, 8);
    ctx.fill();
    ctx.fillStyle = hl.color || '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
    ctx.fillText(t1, W/2, baseY + offY1);
    ctx.restore();
  } else {
    ctx.fillStyle = l1cfg._color || l1cfg.color || '#00FF44';
    ctx.save();
    if (scl1 !== 1) { ctx.translate(W/2, baseY + offY1); ctx.scale(scl1, scl1); ctx.translate(-W/2, -(baseY + offY1)); }
    if (l1cfg.glow) { for (let g=0;g<3;g++) ctx.fillText(t1, W/2, baseY + offY1); }
    else ctx.fillText(t1, W/2, baseY + offY1);
    ctx.restore();
  }

  // ── Draw line2 ──
  if (t2) {
    ctx.globalAlpha   = alpha2;
    ctx.shadowBlur    = 0; ctx.shadowOffsetY = 0; ctx.shadowColor = 'transparent';
    ctx.font          = `${l2cfg.bold?'700':'600'} ${l2size}px ${l2font}`;
    ctx.fillStyle     = l2cfg._color || l2cfg.color || '#FF3DAD';
    const y2 = baseY + l2size + 14;
    if (l2cfg.glow) {
      ctx.shadowColor = l2cfg.color || '#00FF44';
      ctx.shadowBlur  = 28 * scale;
    } else {
      ctx.shadowColor   = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    }
    ctx.save();
    if (scl2 !== 1) { ctx.translate(W/2, y2 + offY2); ctx.scale(scl2, scl2); ctx.translate(-W/2, -(y2 + offY2)); }
    if (l2cfg.glow) { for (let g=0;g<3;g++) ctx.fillText(t2, W/2, y2 + offY2); }
    else ctx.fillText(t2, W/2, y2 + offY2);
    ctx.restore();
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

/* ── STYLE THUMBNAILS ── */
function drawAllThumbs() {
  Object.keys(STYLES).forEach(key => {
    const canvas = document.getElementById('canvas-thumb-' + key);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Dark gradient background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0a14');
    bg.addColorStop(1, '#12121e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const style = STYLES[key];
    const l1 = style.line1 || {};
    const l2 = style.line2 || {};
    const hl = style.highlight;

    const l1size = Math.floor((l1.size || 60) * (H / 160));
    const l2size = Math.floor((l2.size || 40) * (H / 190));
    const l1font = FONT_MAP[l1.font] || "'Anton'";
    const l2font = FONT_MAP[l2.font] || "'Dancing Script'";

    const t1 = 'CAPTION';
    const t2 = 'style preview';
    const hasLine2 = !!(l2.font || l2.color);
    const totalH = hasLine2 ? l1size + l2size + 6 : l1size;
    const startY = (H + totalH) / 2 - (hasLine2 ? l2size + 4 : 0);

    ctx.textAlign = 'center';
    ctx.font = `${l1.bold ? '900' : '600'} ${l1size}px ${l1font}`;

    if (hl) {
      const tw = ctx.measureText(t1).width;
      const pad = 8;
      ctx.fillStyle = hl.bg || '#CC0000';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      roundRect(ctx, W/2-tw/2-pad, startY-l1size+2, tw+pad*2, l1size+6, 6);
      ctx.fill();
      ctx.fillStyle = hl.color || '#FFF';
      ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 3;
    } else {
      ctx.fillStyle = l1.color || '#00FF44';
      if (l1.glow) {
        ctx.shadowColor = l1.color || '#00FF44';
        ctx.shadowBlur = 12;
        ctx.fillText(t1, W/2, startY);
      } else {
        ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      }
    }
    ctx.fillText(t1, W/2, startY);

    if (hasLine2) {
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.shadowColor = 'transparent';
      ctx.font = `${l2.bold ? '700' : '500'} ${l2size}px ${l2font}`;
      ctx.fillStyle = l2.color || '#FF3DAD';
      ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 4;
      ctx.fillText(t2, W/2, startY + l2size + 6);
    }
  });
}

window.addEventListener('load', ()=>{
  // Wait for fonts
  document.fonts.ready.then(()=>{ drawAllThumbs(); });
});

/* ── FONT / STYLE OVERRIDE ── */
function changeFont1(val) { state.customFont1=val; drawCaptions(); }
function changeFont2(val) { state.customFont2=val; drawCaptions(); }
function setCase1(val,btn) { state.customCase1=val; document.querySelectorAll('.case-btns')[0].querySelectorAll('.case-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); drawCaptions(); }
function setCase2(val,btn) { state.customCase2=val; document.querySelectorAll('.case-btns')[1].querySelectorAll('.case-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); drawCaptions(); }
function setLine1Size(val) { state.customSize1=parseInt(val); document.getElementById('l1-size-val').textContent=val+'px'; drawCaptions(); }
function setLine2Size(val) { state.customSize2=parseInt(val); document.getElementById('l2-size-val').textContent=val+'px'; drawCaptions(); }
function setLine1Color(val) { state.customColor1=val; document.getElementById('l1-color-hex').textContent=val; drawCaptions(); }
function setLine2Color(val) { state.customColor2=val; document.getElementById('l2-color-hex').textContent=val; drawCaptions(); }
function setCustomAnim(val) { state.customAnim=val; drawCaptions(); }
function setAnimDur(val) { state.animDur=parseInt(val); document.getElementById('anim-dur-val').textContent=val+'ms'; }

function showTab(name, btn) {
  document.querySelectorAll('.rtab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
}

/* ── EXPORT ── */
async function exportVideo() {
  if (!state.videoPath||!state.captions.length) { toast('Need video + captions','error'); return; }
  setStatus('working','Exporting…');
  document.getElementById('e-progress').style.display='block';
  document.getElementById('btn-export-full').disabled=true;
  document.getElementById('btn-export-top').disabled=true;
  document.getElementById('export-msg').textContent='Burning captions via FFmpeg…';
  document.getElementById('download-link').style.display='none';

  try {
    const res=await fetch('/export',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        path:state.videoPath,
        captions:state.captions.map(({start,end,text})=>({start,end,text})),
        style:state.selectedStyle,
        font_size_scale:state.sizeScale,
        position:state.position,
      })
    });
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||'Export failed');
    document.getElementById('e-progress').style.display='none';
    const link=document.getElementById('download-link');
    link.href='/download/'+data.filename;
    link.download=data.filename;
    link.style.display='flex';
    document.getElementById('export-msg').textContent='';
    setStatus('done','Export complete!');
    toast('Export done! Click Download 🎉','success');
  } catch(e) {
    document.getElementById('e-progress').style.display='none';
    document.getElementById('export-msg').textContent='⚠ '+e.message.slice(0,120);
    setStatus('error','Export failed'); toast(e.message.slice(0,100),'error');
  } finally {
    document.getElementById('btn-export-full').disabled=false;
    document.getElementById('btn-export-top').disabled=false;
  }
}

/* ── HELPERS ── */
function setStatus(type,txt){
  const el=document.getElementById('global-status');
  el.className='status-pill '+type;
  el.innerHTML=`<span class="dot"></span>${txt}`;
}
function fmtTime(s){
  s=s||0;const m=Math.floor(s/60),sec=(s%60).toFixed(1).padStart(4,'0');
  return `${m}:${sec}`;
}
function autoResize(ta){ta.style.height='auto';ta.style.height=ta.scrollHeight+'px';}
function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

let _toastT;
function toast(msg,type='info'){
  const old=document.getElementById('toast-el');if(old)old.remove();
  const el=document.createElement('div');
  el.id='toast-el';
  const icons={success:'✓',error:'✕',info:'ℹ'};
  el.style.cssText=`position:fixed;bottom:1.5rem;right:1.5rem;background:var(--surface2);border:1px solid ${type==='success'?'var(--accent)':type==='error'?'var(--danger)':'var(--accent3)'};color:${type==='success'?'var(--accent)':type==='error'?'var(--danger)':'var(--accent3)'};padding:.7rem 1.1rem;border-radius:8px;font-size:.78rem;font-family:'Montserrat',sans-serif;font-weight:600;display:flex;align-items:center;gap:.4rem;z-index:1000;transition:opacity .3s`;
  el.innerHTML=`<span>${icons[type]}</span>${msg}`;
  document.body.appendChild(el);
  clearTimeout(_toastT);
  _toastT=setTimeout(()=>{el.style.opacity=0;setTimeout(()=>el.remove(),300);},4000);
}
