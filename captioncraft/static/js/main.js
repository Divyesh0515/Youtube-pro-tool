/* ── STATE ─────────────────────────────── */
let state = {
  jobId: null,
  videoPath: null,
  filename: null,
  selectedStyle: 'mrbeast',
  captions: [],
  nextId: 0,
};

/* ── DRAG & DROP ─────────────────────────── */
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

function handleFile(file) {
  const allowed = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
  if (!allowed.includes(file.type) && !file.name.match(/\.(mp4|mov|avi|mkv)$/i)) {
    toast('Unsupported file type', 'error');
    return;
  }
  uploadFile(file);
}

/* ── UPLOAD ─────────────────────────────── */
async function uploadFile(file) {
  setStatus('working', 'Uploading…');
  showProgress('upload-progress', true);
  animateProgress('upload-fill', 0, 90, 1200);

  const form = new FormData();
  form.append('video', file);

  try {
    const res = await fetch('/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    state.jobId = data.job_id;
    state.videoPath = data.path;
    state.filename = data.filename;

    animateProgress('upload-fill', 90, 100, 300);
    setTimeout(() => showProgress('upload-progress', false), 600);

    // Show file info
    const info = document.getElementById('file-info');
    info.textContent = `✓ ${file.name}  (${formatBytes(file.size)})`;
    info.style.display = 'block';

    // Video preview
    const wrap = document.getElementById('video-preview-wrap');
    const vid = document.getElementById('video-preview');
    vid.src = URL.createObjectURL(file);
    wrap.style.display = 'block';

    document.getElementById('btn-transcribe').disabled = false;
    setStatus('done', 'Video ready');
    toast('Video uploaded successfully', 'success');
  } catch (err) {
    showProgress('upload-progress', false);
    setStatus('error', 'Upload failed');
    toast(err.message, 'error');
  }
}

/* ── TRANSCRIBE ─────────────────────────── */
async function transcribeVideo() {
  if (!state.videoPath) return;

  setStatus('working', 'Transcribing…');
  showProgress('transcribe-progress', true);
  animateProgress(document.querySelector('#transcribe-progress .progress-fill'), 0, 85, 8000);
  document.getElementById('btn-transcribe').disabled = true;

  try {
    const res = await fetch('/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: state.videoPath }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Transcription failed');

    showProgress('transcribe-progress', false);
    loadCaptions(data.captions);
    setStatus('done', `${data.captions.length} captions generated`);
    toast(`Transcription complete — ${data.captions.length} segments`, 'success');
  } catch (err) {
    showProgress('transcribe-progress', false);
    setStatus('error', 'Transcription failed');
    toast(err.message, 'error');
  } finally {
    document.getElementById('btn-transcribe').disabled = false;
  }
}

/* ── CAPTIONS ─────────────────────────── */
function loadCaptions(captions) {
  state.captions = captions.map(c => ({ ...c, _id: state.nextId++ }));
  renderCaptions();
  document.getElementById('btn-export').disabled = false;
}

function renderCaptions() {
  const list = document.getElementById('caption-list');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('cap-count');
  const addBtn = document.getElementById('btn-add-cap');
  const clearBtn = document.getElementById('btn-clear-caps');

  if (state.captions.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'flex';
    count.style.display = 'none';
    addBtn.style.display = 'none';
    clearBtn.style.display = 'none';
    document.getElementById('btn-export').disabled = true;
    return;
  }

  empty.style.display = 'none';
  list.style.display = 'flex';
  count.style.display = 'inline';
  count.textContent = state.captions.length;
  addBtn.style.display = 'inline-flex';
  clearBtn.style.display = 'inline-flex';
  document.getElementById('btn-export').disabled = !state.videoPath;

  list.innerHTML = '';
  state.captions.forEach((cap, i) => {
    const item = document.createElement('div');
    item.className = 'caption-item';
    item.dataset.id = cap._id;

    const timeLabel = `${fmtTime(cap.start)} → ${fmtTime(cap.end)}`;

    item.innerHTML = `
      <div class="caption-time">${timeLabel}</div>
      <textarea class="caption-text-input" rows="1"
        onchange="updateCaption(${cap._id}, 'text', this.value)"
        oninput="autoResize(this)"
      >${escHtml(cap.text)}</textarea>
      <button class="caption-del" onclick="deleteCaption(${cap._id})" title="Remove">✕</button>
    `;
    list.appendChild(item);

    // Auto-resize
    const ta = item.querySelector('textarea');
    autoResize(ta);
  });
}

function updateCaption(id, field, value) {
  const cap = state.captions.find(c => c._id === id);
  if (cap) cap[field] = value;
}

function deleteCaption(id) {
  state.captions = state.captions.filter(c => c._id !== id);
  renderCaptions();
}

function addCaption() {
  const last = state.captions[state.captions.length - 1];
  const start = last ? last.end + 0.1 : 0;
  state.captions.push({ _id: state.nextId++, start, end: start + 2, text: 'New caption' });
  renderCaptions();
  // scroll to bottom
  const list = document.getElementById('caption-list');
  list.scrollTop = list.scrollHeight;
}

function clearCaptions() {
  if (!confirm('Clear all captions?')) return;
  state.captions = [];
  renderCaptions();
}

/* ── STYLE ─────────────────────────────── */
function selectStyle(btn) {
  document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.selectedStyle = btn.dataset.style;
}

/* ── EXPORT ─────────────────────────────── */
async function exportVideo() {
  if (!state.videoPath || state.captions.length === 0) {
    toast('Need a video and captions to export', 'error');
    return;
  }

  setStatus('working', 'Exporting…');
  showProgress('export-progress', true);
  animateProgress(document.querySelector('#export-progress .progress-fill'), 0, 80, 15000);
  document.getElementById('btn-export').disabled = true;
  document.getElementById('export-status').textContent = 'Burning captions via FFmpeg…';
  document.getElementById('download-link').style.display = 'none';

  const payload = {
    path: state.videoPath,
    captions: state.captions.map(({ start, end, text }) => ({ start, end, text })),
    style: state.selectedStyle,
  };

  try {
    const res = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Export failed');

    animateProgress(document.querySelector('#export-progress .progress-fill'), 80, 100, 400);
    setTimeout(() => showProgress('export-progress', false), 600);

    const link = document.getElementById('download-link');
    link.href = `/download/${data.filename}`;
    link.download = data.filename;
    link.style.display = 'inline-flex';

    document.getElementById('export-status').textContent = '';
    setStatus('done', 'Export complete');
    toast('Export complete! Click Download to save.', 'success');
  } catch (err) {
    showProgress('export-progress', false);
    setStatus('error', 'Export failed');
    document.getElementById('export-status').textContent = '⚠ ' + err.message.slice(0, 120);
    toast(err.message.slice(0, 120), 'error');
  } finally {
    document.getElementById('btn-export').disabled = false;
  }
}

/* ── HELPERS ─────────────────────────────── */
function setStatus(type, text) {
  const el = document.getElementById('global-status');
  el.className = `status-badge status-${type}`;
  const dot = type === 'working' ? '<span class="dot pulse"></span>' : '<span class="dot"></span>';
  el.innerHTML = `${dot} ${text}`;
}

function showProgress(id, show) {
  const el = typeof id === 'string' ? document.getElementById(id) : id.closest('.progress-bar');
  if (el) el.style.display = show ? 'block' : 'none';
}

function animateProgress(elOrId, from, to, duration) {
  const fill = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!fill) return;
  const start = Date.now();
  function tick() {
    const t = Math.min((Date.now() - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    fill.style.width = (from + (to - from) * ease) + '%';
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, '0');
  return `${m}:${sec}`;
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${msg}`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(100%)'; el.style.transition = '0.3s'; setTimeout(() => el.remove(), 300); }, 4000);
}
