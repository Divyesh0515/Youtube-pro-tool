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
  customAnim: '',
  animDur: 300,
  wordHighlight: true,
  highlightColor: '#FFD700',
  glowStrength: 0,
  captionBg: false,
  captionBgColor: '#000000',
  captionBgOpacity: 0.55,
  captionBgPadding: 12,
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
  Poppins: "'Poppins'",
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
  // Reset stale state from previous session
  _resetSessionState();

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
    // Export requires captions — keep disabled until loadCaptions is called
    document.getElementById('btn-export-top').disabled = true;
    setStatus('done','Ready');
    toast('Video uploaded ✓','success');
  } catch(e) { setStatus('error','Upload failed'); toast(e.message,'error'); }
}

function _resetSessionState() {
  state.captions = [];
  state.words = [];
  state.nextId = 0;
  state.duration = 0;
  state.currentTime = 0;
  state.playing = false;
  animState.capId = null;
  animState.startMs = 0;
  stopAnimLoop();
  // Reset caption editor UI
  renderCaptionList();
  document.getElementById('btn-export-top').disabled = true;
  document.getElementById('btn-export-full').disabled = true;
  document.getElementById('download-link').style.display = 'none';
  document.getElementById('export-msg').textContent = '';
  document.getElementById('video-controls').style.display = 'none';
  document.getElementById('adjust-bar').style.display = 'none';
  updateProgress();
}

/* ── VIDEO PLAYER ── */
let _onMeta, _onTime, _onPlay, _onPause, _onSeeked, _onCanPlay, _onResize;
let _prevBlobUrl = null;

function initVideoPlayer(file) {
  const video   = document.getElementById('main-video');
  const canvas  = document.getElementById('caption-canvas');
  const overlay = document.getElementById('drop-overlay');

  // Revoke previous blob URL to avoid memory leak
  if (_prevBlobUrl) { URL.revokeObjectURL(_prevBlobUrl); _prevBlobUrl = null; }

  // Remove old listeners
  if (_onMeta)    video.removeEventListener('loadedmetadata', _onMeta);
  if (_onTime)    video.removeEventListener('timeupdate', _onTime);
  if (_onPlay)    video.removeEventListener('play', _onPlay);
  if (_onPause)   video.removeEventListener('pause', _onPause);
  if (_onSeeked)  video.removeEventListener('seeked', _onSeeked);
  if (_onCanPlay) video.removeEventListener('canplay', _onCanPlay);
  if (_onResize)  window.removeEventListener('resize', _onResize);

  overlay.style.display = 'none';
  video.style.display   = 'block';
  canvas.style.display  = 'block';

  _prevBlobUrl = URL.createObjectURL(file);
  video.src = _prevBlobUrl;

  _onMeta = () => {
    state.duration = video.duration;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw && vh) document.getElementById('video-frame').style.aspectRatio = `${vw}/${vh}`;
    resizeCanvas(video);
    document.getElementById('video-controls').style.display='flex';
    document.getElementById('adjust-bar').style.display='flex';
  };
  // canplay fires after first frame is decoded — get real canvas size if 0×0 on metadata
  _onCanPlay = () => { resizeCanvas(video); };
  _onTime  = () => { state.currentTime = video.currentTime; updateProgress(); drawCaptions(); };
  _onPlay  = () => { state.playing=true;  document.getElementById('btn-play').textContent='⏸'; startAnimLoop(); };
  _onPause = () => { state.playing=false; document.getElementById('btn-play').textContent='▶'; stopAnimLoop(); drawCaptions(); };
  // Reset animation timer on seek so animation replays
  _onSeeked = () => { animState.capId = null; animState.startMs = 0; drawCaptions(); };
  _onResize = () => resizeCanvas(video);

  video.addEventListener('loadedmetadata', _onMeta);
  video.addEventListener('canplay', _onCanPlay);
  video.addEventListener('timeupdate', _onTime);
  video.addEventListener('play',  _onPlay);
  video.addEventListener('pause', _onPause);
  video.addEventListener('seeked', _onSeeked);
  window.addEventListener('resize', _onResize);
}

function resizeCanvas(video) {
  if (!video) video = document.getElementById('main-video');
  const canvas = document.getElementById('caption-canvas');
  const vw = video.videoWidth  || 0;
  const vh = video.videoHeight || 0;
  if (vw && vh) {
    canvas.width  = vw;
    canvas.height = vh;
  }
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
  const t = state.currentTime || 0;
  const d = state.duration    || 0;
  const pct = d ? (t / d) * 100 : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('time-display').textContent  = fmtTime(t) + ' / ' + fmtTime(d);
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
  // Enable export only once captions exist
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
function clearCaptions() { if(!confirm('Clear all?')) return; state.captions=[]; state.words=[]; renderCaptionList(); }

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
  if (!canvas.width || !canvas.height) return;
  const ctx = canvas.getContext('2d');
  const W   = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!state.captions.length) return;

  const t   = state.currentTime;
  const cap = state.captions.find(c => t >= c.start && t <= c.end);
  if (!cap) return;

  if (cap._id !== animState.capId) {
    animState.capId   = cap._id;
    animState.startMs = performance.now();
  }

  const elapsed = performance.now() - animState.startMs;
  const style   = STYLES[state.selectedStyle] || STYLES['mehfil'];
  const activeWord = state.wordHighlight && state.words.length
    ? (state.words.find(w => t >= w.start && t <= w.end) || null)
    : null;
  drawStyle(ctx, W, H, cap.text, style, elapsed, activeWord);
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

function drawStyle(ctx, W, H, text, style, elapsed=999, activeWord=null) {
  const scale = state.sizeScale;
  const pos   = state.position;
  const anim  = state.customAnim || style.anim || 'fade';
  const DUR   = state.animDur || 300;

  const l1cfg = Object.assign({}, style.line1 || {});
  const hasLine2Style = !!(style.line2 && (style.line2.font || style.line2.color));
  const l2cfg = hasLine2Style ? Object.assign({}, style.line2) : null;

  if (state.customSize1)  l1cfg.size  = state.customSize1;
  if (state.customColor1) l1cfg.color = state.customColor1;
  if (l2cfg && state.customSize2)  l2cfg.size  = state.customSize2;
  if (l2cfg && state.customColor2) l2cfg.color = state.customColor2;

  const words = text.trim().split(/\s+/);
  let line1w, line2w;
  if (hasLine2Style && words.length > 1) {
    const mid = Math.ceil(words.length / 2);
    line1w = words.slice(0, mid);
    line2w = words.slice(mid);
  } else {
    line1w = words;
    line2w = [];
  }
  const line1 = line1w.join(' ');
  const line2 = line2w.join(' ');

  const applyCase = (str, c) => {
    if (c==='upper') return str.toUpperCase();
    if (c==='lower') return str.toLowerCase();
    if (c==='title') return str.replace(/\b\w/g,ch=>ch.toUpperCase());
    return str;
  };

  const t1 = applyCase(line1, state.customCase1||l1cfg.case||'upper');
  const t2 = (l2cfg && line2) ? applyCase(line2, state.customCase2||l2cfg.case||'lower') : '';

  const baseDim = Math.min(W, H);
  let l1size = Math.floor((l1cfg.size||60)*scale*(baseDim/1000));
  let l2size = l2cfg ? Math.floor((l2cfg.size||40)*scale*(baseDim/1000)) : 0;

  const l1font = state.customFont1 ? (FONT_MAP[state.customFont1]||"'Anton'") : (FONT_MAP[l1cfg.font]||"'Anton'");
  const l2font = l2cfg ? (state.customFont2 ? (FONT_MAP[state.customFont2]||"'Dancing Script'") : (FONT_MAP[l2cfg.font]||"'Dancing Script'")) : "'Dancing Script'";

  const maxW = W * 0.90;
  ctx.font = `${l1cfg.bold?'900':'700'} ${l1size}px ${l1font}`;
  while (l1size > 18 && ctx.measureText(t1).width > maxW) l1size = Math.floor(l1size * 0.93);
  if (t2 && l2cfg) {
    ctx.font = `${l2cfg.bold?'700':'600'} ${l2size}px ${l2font}`;
    while (l2size > 14 && ctx.measureText(t2).width > maxW) l2size = Math.floor(l2size * 0.93);
  }

  const marginV = Math.round(H * 0.05);
  const gap = Math.round(l1size * 0.15);
  let y1, y2;
  if (pos === 'bottom') {
    y2 = t2 ? H - marginV : 0;
    y1 = t2 ? y2 - l2size - gap : H - marginV;
  } else if (pos === 'top') {
    y1 = marginV + l1size;
    y2 = y1 + l2size + gap;
  } else {
    const totalH = l1size + (t2 ? l2size + gap : 0);
    y1 = (H - totalH) / 2 + l1size;
    y2 = y1 + l2size + gap;
  }
  const baseY = y1;

  const t_anim = Math.min(elapsed / DUR, 1);
  let offY1 = 0, offY2 = 0, scl1 = 1, scl2 = 1, alpha1 = 1, alpha2 = 1;
  const t2p = (delay) => Math.min(Math.max((elapsed - delay) / DUR, 0), 1);

  if (anim === 'slide_up') {
    offY1 = (1 - easeOut(t_anim)) * l1size * 0.6;
    offY2 = (1 - easeOut(t2p(80))) * l2size * 0.6;
    alpha1 = Math.min(elapsed / 150, 1);
    alpha2 = Math.min(Math.max((elapsed - 80) / 150, 0), 1);
  } else if (anim === 'pop') {
    scl1  = easeOutBack(t_anim);
    scl2  = easeOutBack(t2p(80));
    alpha1 = Math.min(elapsed / 120, 1);
    alpha2 = Math.min(Math.max((elapsed - 80) / 120, 0), 1);
  } else if (anim === 'bounce') {
    offY1 = (1 - easeOutBounce(t_anim)) * (-l1size * 0.5);
    offY2 = (1 - easeOutBounce(t2p(100))) * (-l2size * 0.5);
    alpha1 = Math.min(elapsed / 100, 1);
    alpha2 = Math.min(Math.max((elapsed - 100) / 100, 0), 1);
  } else if (anim === 'blur_slide') {
    offY1 = (1 - easeOut(t_anim)) * l1size * 0.4;
    offY2 = (1 - easeOut(t2p(100))) * l2size * 0.4;
    alpha1 = Math.min(elapsed / 200, 1);
    alpha2 = Math.min(Math.max((elapsed - 100) / 200, 0), 1);
    // Actual blur for blur_slide — reduces from max to 0 as animation completes
    const blurPx1 = Math.round((1 - t_anim) * 8);
    const blurPx2 = Math.round((1 - t2p(100)) * 8);
    ctx.filter = blurPx1 > 0 ? `blur(${blurPx1}px)` : 'none';
    // Restored to none per-line below in save/restore blocks
  } else {
    alpha1 = Math.min(elapsed / 250, 1);
    alpha2 = Math.min(Math.max((elapsed - 100) / 250, 0), 1);
  }

  ctx.save();
  ctx.textAlign = 'center';
  const hl = style.highlight;
  const strokeW = Math.max(2, baseDim / 300);
  const glowOverride = state.glowStrength > 0;

  // ── Caption Background ──
  if (state.captionBg) {
    const pad = state.captionBgPadding;
    ctx.font = `${l1cfg.bold?'900':'700'} ${l1size}px ${l1font}`;
    const tw1 = ctx.measureText(t1).width;
    let tw2 = 0;
    if (t2 && l2cfg) {
      ctx.font = `${l2cfg.bold?'700':'600'} ${l2size}px ${l2font}`;
      tw2 = ctx.measureText(t2).width;
    }
    const maxTW = Math.max(tw1, tw2);
    const blockTop = pos === 'top'
      ? y1 - l1size - pad
      : pos === 'center'
        ? y1 - l1size - pad
        : (t2 ? y1 - l1size - pad : y1 - l1size - pad);
    const blockH = l1size + (t2 ? l2size + gap : 0) + pad * 2;
    const bgR = parseInt(state.captionBgColor.slice(1,3),16);
    const bgG = parseInt(state.captionBgColor.slice(3,5),16);
    const bgB = parseInt(state.captionBgColor.slice(5,7),16);
    ctx.save();
    ctx.globalAlpha = state.captionBgOpacity;
    ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath();
    roundRect(ctx, W/2 - maxTW/2 - pad, blockTop, maxTW + pad*2, blockH, 10);
    ctx.fill();
    ctx.restore();
  }

  // helper: lighten a hex color
  function lightenHex(hex, amt=0.55) {
    // Accept only #rrggbb format; fallback to white tint if malformed
    const clean = (hex||'').replace('#','');
    if (clean.length !== 6) return `rgba(255,255,255,${amt})`;
    const r=parseInt(clean.slice(0,2),16), g=parseInt(clean.slice(2,4),16), b=parseInt(clean.slice(4,6),16);
    const lr=Math.round(r+(255-r)*amt), lg=Math.round(g+(255-g)*amt), lb=Math.round(b+(255-b)*amt);
    return `rgb(${lr},${lg},${lb})`;
  }

  // helper: draw text with stroke outline + vertical gradient
  function drawTextPremium(txt, x, y, fillColor, isGlow, glowColor, isBold, fontSize) {
    const sz = fontSize || l1size;
    const grad = ctx.createLinearGradient(0, y - sz, 0, y + sz * 0.1);
    grad.addColorStop(0, lightenHex(fillColor, 0.5));
    grad.addColorStop(0.5, fillColor);
    grad.addColorStop(1, fillColor);

    ctx.save();
    if (isGlow || glowOverride) {
      const gc = glowColor || fillColor;
      const gb = glowOverride ? state.glowStrength * (baseDim/500) : 28 * scale;
      ctx.shadowColor = gc; ctx.shadowBlur = gb; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = grad;
      for (let g=0;g<3;g++) ctx.fillText(txt, x, y);
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.88)';
      ctx.lineWidth   = strokeW * 2.2;
      ctx.lineJoin    = 'round';
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 12;
      ctx.shadowOffsetY = Math.ceil(strokeW*1.8); ctx.shadowOffsetX = 0;
      ctx.strokeText(txt, x, y);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.shadowOffsetX = 0;
      ctx.fillStyle = grad;
      ctx.fillText(txt, x, y);
    }
    ctx.restore();
  }

  // ── Draw line1 ──
  ctx.globalAlpha = alpha1;
  ctx.font = `${l1cfg.bold?'900':'700'} ${l1size}px ${l1font}`;
  const l1baseColor = l1cfg.color || '#00FF44';

  if (hl && hl.bg && t1) {
    ctx.save();
    ctx.filter = 'none';
    if (scl1 !== 1) { ctx.translate(W/2, baseY+offY1); ctx.scale(scl1,scl1); ctx.translate(-W/2,-(baseY+offY1)); }
    const tw = ctx.measureText(t1).width;
    const pad = 14;
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.shadowOffsetX = 0;
    ctx.fillStyle = hl.bg;
    ctx.beginPath();
    roundRect(ctx, W/2-tw/2-pad, baseY+offY1-l1size+4, tw+pad*2, l1size+10, 8);
    ctx.fill();
    ctx.fillStyle = hl.color || '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 0;
    ctx.fillText(t1, W/2, baseY+offY1);
    ctx.restore();
  } else {
    ctx.save();
    if (anim === 'blur_slide') {
      const blurPx1 = Math.round((1 - t_anim) * 8);
      ctx.filter = blurPx1 > 0 ? `blur(${blurPx1}px)` : 'none';
    }
    if (scl1 !== 1) { ctx.translate(W/2,baseY+offY1); ctx.scale(scl1,scl1); ctx.translate(-W/2,-(baseY+offY1)); }
    if (activeWord && line1w.length > 0) {
      ctx.textAlign = 'left';
      drawLineWithHighlight(ctx, line1w.map(w=>applyCase(w, state.customCase1||l1cfg.case||'upper')), activeWord, W/2, baseY+offY1, l1size, state.highlightColor, l1baseColor, l1font, l1cfg.bold, strokeW, lightenHex, drawTextPremium);
      ctx.textAlign = 'center';
    } else {
      drawTextPremium(t1, W/2, baseY+offY1, l1baseColor, l1cfg.glow, l1cfg.color, l1cfg.bold, l1size);
    }
    ctx.restore();
  }

  // ── Draw line2 ──
  if (t2 && l2cfg) {
    const l2baseColor = l2cfg.color || '#FF3DAD';
    ctx.globalAlpha = alpha2;
    ctx.font = `${l2cfg.bold?'700':'700'} ${l2size}px ${l2font}`;
    ctx.save();
    if (anim === 'blur_slide') {
      const blurPx2 = Math.round((1 - t2p(100)) * 8);
      ctx.filter = blurPx2 > 0 ? `blur(${blurPx2}px)` : 'none';
    }
    if (scl2 !== 1) { ctx.translate(W/2,y2+offY2); ctx.scale(scl2,scl2); ctx.translate(-W/2,-(y2+offY2)); }
    if (activeWord && line2w.length > 0) {
      ctx.textAlign = 'left';
      drawLineWithHighlight(ctx, line2w.map(w=>applyCase(w, state.customCase2||l2cfg.case||'lower')), activeWord, W/2, y2+offY2, l2size, state.highlightColor, l2baseColor, l2font, l2cfg.bold, strokeW, lightenHex, drawTextPremium);
      ctx.textAlign = 'center';
    } else {
      drawTextPremium(t2, W/2, y2+offY2, l2baseColor, l2cfg.glow, l2cfg.color, l2cfg.bold, l2size);
    }
    ctx.restore();
  }

  ctx.restore();
}

// Draw text line with one word highlighted (karaoke), non-active words get full premium styling
function drawLineWithHighlight(ctx, words, activeWord, x, y, size, hlColor, baseColor, font, bold, strokeW, lightenHex, drawTextPremium) {
  const activeNorm = activeWord ? activeWord.word.trim().toLowerCase().replace(/[^a-z0-9]/g,'') : '';
  // Use same bold weight as main rendering
  const weight = bold ? '900' : '700';
  ctx.font = `${weight} ${size}px ${font}`;
  const totalW = ctx.measureText(words.join(' ')).width;
  let curX = x - totalW / 2;

  words.forEach((word, i) => {
    const ww = ctx.measureText(word).width;
    const spaceW = i < words.length-1 ? ctx.measureText(' ').width : 0;
    const norm = word.toLowerCase().replace(/[^a-z0-9]/g,'');
    const isActive = norm === activeNorm && activeNorm !== '';

    if (isActive) {
      const pad = size * 0.1;
      ctx.save();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.shadowOffsetX = 0;
      ctx.fillStyle = hlColor;
      ctx.beginPath();
      roundRect(ctx, curX - pad, y - size + 2, ww + pad*2, size + 8, 5);
      ctx.fill();
      const contrastColor = isLightColor(hlColor) ? '#000000' : '#FFFFFF';
      ctx.fillStyle = contrastColor;
      ctx.fillText(word, curX, y);
      ctx.restore();
    } else {
      // Draw non-active words with the same premium stroke+gradient as normal text
      ctx.save();
      // Stroke outline
      ctx.strokeStyle = 'rgba(0,0,0,0.88)';
      ctx.lineWidth   = strokeW * 2.2;
      ctx.lineJoin    = 'round';
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 10;
      ctx.shadowOffsetY = Math.ceil(strokeW*1.5); ctx.shadowOffsetX = 0;
      ctx.strokeText(word, curX, y);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.shadowOffsetX = 0;
      // Gradient fill
      const grad = ctx.createLinearGradient(0, y - size, 0, y + size * 0.1);
      grad.addColorStop(0, lightenHex(baseColor, 0.5));
      grad.addColorStop(0.5, baseColor);
      grad.addColorStop(1, baseColor);
      ctx.fillStyle = grad;
      ctx.fillText(word, curX, y);
      ctx.restore();
    }
    curX += ww + spaceW;
  });
}

function isLightColor(hex) {
  const h = (hex||'').replace('#','');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return (r*299 + g*587 + b*114) / 1000 > 128;
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

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0a14');
    bg.addColorStop(1, '#12121e');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    const style = STYLES[key];
    const l1 = style.line1 || {};
    const l2 = style.line2 || {};
    const hl = style.highlight;

    let l1size = Math.floor((l1.size || 60) * (H / 160));
    let l2size = Math.floor((l2.size || 40) * (H / 190));
    const l1font = FONT_MAP[l1.font] || "'Anton'";
    const l2font = FONT_MAP[l2.font] || "'Dancing Script'";
    const strokeW = Math.max(1.5, W / 200);

    const t1 = 'CAPTION';
    const t2 = 'style preview';
    const hasLine2 = !!(l2.font || l2.color);
    const totalH = hasLine2 ? l1size + l2size + 8 : l1size;
    const startY = (H + totalH) / 2 - (hasLine2 ? l2size + 4 : 0);

    ctx.textAlign = 'center';

    function thumbGrad(color, y, sz) {
      const h = (color||'').replace('#','');
      if (h.length !== 6) return color || '#fff';
      const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
      const lr=Math.round(r+(255-r)*0.55), lg=Math.round(g+(255-g)*0.55), lb=Math.round(b+(255-b)*0.55);
      const grd = ctx.createLinearGradient(0, y-sz, 0, y+sz*0.1);
      grd.addColorStop(0, `rgb(${lr},${lg},${lb})`);
      grd.addColorStop(0.5, color);
      grd.addColorStop(1, color);
      return grd;
    }

    ctx.font = `${l1.bold ? '900' : '700'} ${l1size}px ${l1font}`;

    if (hl && hl.bg) {
      const tw = ctx.measureText(t1).width;
      const pad = 8;
      ctx.fillStyle = hl.bg; ctx.shadowBlur = 0;
      ctx.beginPath(); roundRect(ctx, W/2-tw/2-pad, startY-l1size+2, tw+pad*2, l1size+6, 6); ctx.fill();
      ctx.fillStyle = hl.color || '#FFF';
      ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 3;
      ctx.fillText(t1, W/2, startY);
      ctx.shadowBlur = 0;
    } else if (l1.glow) {
      ctx.shadowColor = l1.color||'#00FF44'; ctx.shadowBlur = 14;
      ctx.fillStyle = thumbGrad(l1.color||'#00FF44', startY, l1size);
      for(let g=0;g<2;g++) ctx.fillText(t1, W/2, startY);
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = strokeW*2; ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.strokeText(t1, W/2, startY);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = thumbGrad(l1.color||'#00FF44', startY, l1size);
      ctx.fillText(t1, W/2, startY);
    }

    if (hasLine2) {
      ctx.font = `${l2.bold ? '700' : '500'} ${l2size}px ${l2font}`;
      const y2 = startY + l2size + 6;
      if (l2.glow) {
        ctx.shadowColor = l2.color||'#00FF44'; ctx.shadowBlur = 10;
        ctx.fillStyle = thumbGrad(l2.color||'#00FF44', y2, l2size);
        for(let g=0;g<2;g++) ctx.fillText(t2, W/2, y2);
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = strokeW*1.5; ctx.lineJoin='round';
        ctx.shadowColor='rgba(0,0,0,0.6)'; ctx.shadowBlur=4; ctx.shadowOffsetY=1;
        ctx.strokeText(t2, W/2, y2);
        ctx.shadowBlur=0; ctx.shadowOffsetY=0;
        ctx.fillStyle = thumbGrad(l2.color||'#FF3DAD', y2, l2size);
        ctx.fillText(t2, W/2, y2);
      }
    }
  });
}

window.addEventListener('load', ()=>{
  document.fonts.ready.then(()=>{ drawAllThumbs(); });
});

/* ── FONT / STYLE OVERRIDE ── */
function changeFont1(val) { state.customFont1=val; drawCaptions(); }
function changeFont2(val) { state.customFont2=val; drawCaptions(); }

// Use IDs instead of positional DOM index to avoid ordering bugs
function setCase1(val,btn) {
  state.customCase1=val;
  document.getElementById('case-btns-1').querySelectorAll('.case-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  drawCaptions();
}
function setCase2(val,btn) {
  state.customCase2=val;
  document.getElementById('case-btns-2').querySelectorAll('.case-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  drawCaptions();
}

function setLine1Size(val) { state.customSize1=parseInt(val); document.getElementById('l1-size-val').textContent=val+'px'; drawCaptions(); }
function setLine2Size(val) { state.customSize2=parseInt(val); document.getElementById('l2-size-val').textContent=val+'px'; drawCaptions(); }
function setLine1Color(val) { state.customColor1=val; document.getElementById('l1-color-hex').textContent=val; drawCaptions(); }
function setLine2Color(val) { state.customColor2=val; document.getElementById('l2-color-hex').textContent=val; drawCaptions(); }
function setCustomAnim(val) { state.customAnim=val; drawCaptions(); }
function setAnimDur(val) { state.animDur=parseInt(val); document.getElementById('anim-dur-val').textContent=val+'ms'; }
function toggleWordHighlight(el) { state.wordHighlight=el.checked; drawCaptions(); }
function setHighlightColor(val) { state.highlightColor=val; document.getElementById('hl-color-hex').textContent=val; drawCaptions(); }
function setGlowStrength(val) { state.glowStrength=parseInt(val); document.getElementById('glow-val').textContent=val==0?'Off':val; drawCaptions(); }
function toggleCaptionBg(el) { state.captionBg=el.checked; drawCaptions(); }
function setCaptionBgColor(val) { state.captionBgColor=val; document.getElementById('bg-color-hex').textContent=val; drawCaptions(); }
function setCaptionBgOpacity(val) { state.captionBgOpacity=val/100; document.getElementById('bg-opacity-val').textContent=val+'%'; drawCaptions(); }

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

  // Build custom overrides to send to backend
  const custom = {
    font1:        state.customFont1  || null,
    font2:        state.customFont2  || null,
    color1:       state.customColor1 || null,
    color2:       state.customColor2 || null,
    size1:        state.customSize1  || null,
    size2:        state.customSize2  || null,
    case1:        state.customCase1  || null,
    case2:        state.customCase2  || null,
    glow_strength: state.glowStrength,
  };

  try {
    const res=await fetch('/export',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        path:state.videoPath,
        captions:state.captions.map(({start,end,text})=>({start,end,text})),
        style:state.selectedStyle,
        font_size_scale:state.sizeScale,
        position:state.position,
        custom,
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
  s = isFinite(s) ? (s||0) : 0;
  const m=Math.floor(s/60), sec=Math.floor(s%60).toString().padStart(2,'0');
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
