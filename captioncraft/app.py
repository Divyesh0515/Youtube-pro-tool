# -*- coding: utf-8 -*-
import httpx._utils as _httpx_utils
_orig_normalize = _httpx_utils.normalize_header_value
def _patched_normalize(value, encoding):
    return _orig_normalize(value, 'latin-1')
_httpx_utils.normalize_header_value = _patched_normalize

import os
import math
import uuid
import subprocess
import tempfile
from pathlib import Path
from flask import Flask, request, jsonify, render_template, send_file
from openai import OpenAI
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).parent.resolve()

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024
app.config['UPLOAD_FOLDER'] = BASE_DIR / 'uploads'
app.config['EXPORT_FOLDER'] = BASE_DIR / 'exports'
app.config['FONTS_FOLDER'] = BASE_DIR / 'fonts'

app.config['UPLOAD_FOLDER'].mkdir(exist_ok=True)
app.config['EXPORT_FOLDER'].mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {'mp4', 'mov', 'avi', 'mkv'}
client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))

STYLES = {
    'mehfil': {
        'name': 'Mehfil', 'tag': 'CLEAN', 'anim': 'slide_up',
        'line1': {'font': 'BebasNeue', 'color': '#00FF44', 'size': 72, 'bold': True, 'case': 'upper'},
        'line2': {'font': 'DancingScript', 'color': '#FF3DAD', 'size': 48, 'bold': False, 'case': 'lower'},
    },
    'hawabaaz': {
        'name': 'Hawabaaz', 'tag': 'CLEAN', 'anim': 'slide_up',
        'line1': {'font': 'BebasNeue', 'color': '#FFD700', 'size': 72, 'bold': True, 'case': 'upper'},
        'line2': {'font': 'DancingScript', 'color': '#FF3DAD', 'size': 48, 'bold': False, 'case': 'lower'},
    },
    'split_line': {
        'name': 'Split Line', 'tag': 'CLEAN', 'anim': 'fade',
        'line1': {'font': 'Anton', 'color': '#FFD700', 'size': 64, 'bold': True, 'case': 'upper'},
        'line2': {'font': 'Montserrat', 'color': '#FFFFFF', 'size': 36, 'bold': False, 'case': 'lower'},
    },
    'hero_emphasis': {
        'name': 'Hero Emphasis', 'tag': 'PREMIUM', 'anim': 'pop',
        'line1': {'font': 'Montserrat', 'color': '#FFFFFF', 'size': 32, 'bold': False, 'case': 'title'},
        'line2': {'font': 'Anton', 'color': '#FF6A00', 'size': 80, 'bold': True, 'case': 'upper'},
    },
    'hero_glow': {
        'name': 'Hero Glow', 'tag': 'PREMIUM', 'anim': 'pop',
        'line1': {'font': 'Montserrat', 'color': '#FFFFFF', 'size': 32, 'bold': False, 'case': 'title'},
        'line2': {'font': 'Anton', 'color': '#00FF44', 'size': 80, 'bold': True, 'case': 'upper', 'glow': True},
    },
    'poetic_stack': {
        'name': 'Poetic Stack', 'tag': 'BLUR-SLIDE', 'anim': 'blur_slide',
        'line1': {'font': 'Anton', 'color': '#FF3DAD', 'size': 60, 'bold': True, 'case': 'upper'},
        'line2': {'font': 'DancingScript', 'color': '#FFFFFF', 'size': 40, 'bold': False, 'case': 'lower'},
    },
    'box_highlight': {
        'name': 'BOX-Highlight', 'tag': 'CLEAN', 'anim': 'pop',
        'line1': {'font': 'Anton', 'color': '#FFFFFF', 'size': 60, 'bold': True, 'case': 'upper'},
        'highlight': {'bg': '#8B5CF6', 'color': '#FFFFFF'},
    },
    'inline_emphasis': {
        'name': 'Inline Emphasis', 'tag': 'CLEAN', 'anim': 'slide_up',
        'line1': {'font': 'Anton', 'color': '#FFFFFF', 'size': 60, 'bold': True, 'case': 'upper'},
        'highlight': {'bg': '#00FF44', 'color': '#000000'},
    },
    'neon_pop': {
        'name': 'Neon Pop', 'tag': 'CLEAN', 'anim': 'pop',
        'line1': {'font': 'Anton', 'color': '#00FFFF', 'size': 64, 'bold': True, 'case': 'upper'},
        'line2': {'font': 'Anton', 'color': '#FFFFFF', 'size': 64, 'bold': True, 'case': 'upper'},
    },
    'bold_bounce': {
        'name': 'Bold Bounce', 'tag': 'CLEAN', 'anim': 'bounce',
        'line1': {'font': 'Anton', 'color': '#FFFFFF', 'size': 68, 'bold': True, 'case': 'upper'},
        'line2': {'font': 'Anton', 'color': '#BF5FFF', 'size': 68, 'bold': True, 'case': 'upper'},
    },
    'caption_joint': {
        'name': 'Caption Joint', 'tag': 'CLEAN', 'anim': 'slide_up',
        'line1': {'font': 'Anton', 'color': '#FF3333', 'size': 68, 'bold': True, 'case': 'upper'},
        'line2': {'font': 'DancingScript', 'color': '#FFFFFF', 'size': 44, 'bold': False, 'case': 'lower'},
    },
    'mrbeast': {
        'name': 'Mr Beast', 'tag': 'VIRAL', 'anim': 'pop',
        'line1': {'font': 'Anton', 'color': '#FFFFFF', 'size': 72, 'bold': True, 'case': 'upper'},
        'highlight': {'bg': '#CC0000', 'color': '#FFFFFF'},
    },
    'raw_archive': {
        'name': 'Raw Archive', 'tag': 'CLEAN', 'anim': 'fade',
        'line1': {'font': 'SpaceMono', 'color': '#FFFFFF', 'size': 40, 'bold': False, 'case': 'none'},
    },
    'fire_drop': {
        'name': 'Fire Drop', 'tag': 'VIRAL', 'anim': 'bounce',
        'line1': {'font': 'Anton', 'color': '#FF6A00', 'size': 76, 'bold': True, 'case': 'upper'},
        'line2': {'font': 'Anton', 'color': '#FFD700', 'size': 56, 'bold': True, 'case': 'upper'},
    },
    'ice_cold': {
        'name': 'Ice Cold', 'tag': 'CLEAN', 'anim': 'slide_up',
        'line1': {'font': 'Anton', 'color': '#00CFFF', 'size': 72, 'bold': True, 'case': 'upper'},
        'line2': {'font': 'Montserrat', 'color': '#FFFFFF', 'size': 38, 'bold': False, 'case': 'title'},
    },
    'purple_rain': {
        'name': 'Purple Rain', 'tag': 'PREMIUM', 'anim': 'pop',
        'line1': {'font': 'Anton', 'color': '#BF5FFF', 'size': 74, 'bold': True, 'case': 'upper'},
        'line2': {'font': 'DancingScript', 'color': '#FF3DAD', 'size': 46, 'bold': False, 'case': 'lower'},
    },
    'gold_rush': {
        'name': 'Gold Rush', 'tag': 'VIRAL', 'anim': 'pop',
        'line1': {'font': 'BebasNeue', 'color': '#FFD700', 'size': 80, 'bold': True, 'case': 'upper'},
        'line2': {'font': 'Montserrat', 'color': '#FFFFFF', 'size': 36, 'bold': False, 'case': 'title'},
    },
}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    return render_template('index.html', styles=STYLES)


@app.route('/upload', methods=['POST'])
def upload_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file'}), 400
    file = request.files['video']
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400
    job_id = str(uuid.uuid4())
    filename = f"{job_id}_{secure_filename(file.filename)}"
    filepath = app.config['UPLOAD_FOLDER'] / filename
    file.save(filepath)
    return jsonify({'job_id': job_id, 'filename': filename, 'path': str(filepath)})


@app.route('/transcribe', methods=['POST'])
def transcribe():
    data = request.json
    video_path = Path(data.get('path', ''))
    if not video_path.exists():
        return jsonify({'error': 'Video not found'}), 404

    audio_path = video_path.with_suffix('.mp3')
    try:
        result = subprocess.run([
            'ffmpeg', '-i', str(video_path),
            '-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-q:a', '5',
            str(audio_path), '-y'
        ], capture_output=True, text=True)
        if result.returncode != 0:
            return jsonify({'error': f'Audio extraction failed: {result.stderr[-2000:]}'}), 500

        with open(audio_path, 'rb') as f:
            transcript = client.audio.transcriptions.create(
                model='whisper-1',
                file=f,
                response_format='verbose_json',
                timestamp_granularities=['word', 'segment']
            )

        words = []
        if hasattr(transcript, 'words') and transcript.words:
            for w in transcript.words:
                words.append({
                    'word': w.word.strip(),
                    'start': round(w.start, 3),
                    'end': round(w.end, 3),
                })

        captions = []
        for seg in transcript.segments:
            captions.append({
                'id': seg.id,
                'start': round(seg.start, 3),
                'end': round(seg.end, 3),
                'text': seg.text.strip(),
            })

        return jsonify({'captions': captions, 'words': words})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if audio_path.exists():
            audio_path.unlink()


@app.route('/export', methods=['POST'])
def export_video():
    data = request.json
    video_path = Path(data.get('path', ''))
    captions = data.get('captions', [])
    style_key = data.get('style', 'mehfil')
    font_size_scale = float(data.get('font_size_scale', 1.0))
    position = data.get('position', 'bottom')
    custom = data.get('custom', {})
    word_by_word = data.get('word_by_word', False)
    words_data = data.get('words', [])

    if not video_path.exists():
        return jsonify({'error': 'Video not found'}), 404

    style = STYLES.get(style_key, STYLES['mehfil'])
    job_id = str(uuid.uuid4())

    drag_x       = int(data.get('drag_x', 0))
    drag_y       = int(data.get('drag_y', 0))
    line_gap_extra = int(data.get('line_gap_extra', 0))

    # Probe video dimensions for proper ASS PlayRes
    probe = subprocess.run([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'csv=p=0', str(video_path)
    ], capture_output=True, text=True)
    vid_w, vid_h = 1080, 1920
    if probe.returncode == 0 and probe.stdout.strip():
        parts = probe.stdout.strip().split(',')
        if len(parts) == 2:
            try:
                vid_w, vid_h = int(parts[0]), int(parts[1])
            except ValueError:
                pass

    with tempfile.NamedTemporaryFile(suffix='.ass', delete=False, mode='w', encoding='utf-8') as tf:
        ass_path = tf.name
        if word_by_word and words_data:
            ass_content = _build_ass_word_by_word(
                words_data, style, font_size_scale, position, custom, vid_w, vid_h,
                drag_x, drag_y
            )
        else:
            ass_content = _build_ass(
                captions, style, font_size_scale, position, custom, vid_w, vid_h,
                drag_x, drag_y, line_gap_extra
            )
        tf.write(ass_content)

    output_path = app.config['EXPORT_FOLDER'] / f"{job_id}_captioned.mp4"

    try:
        # Use ass filter (not subtitles) for full ASS support including fontsdir
        fonts_dir = str((BASE_DIR / 'fonts').resolve())
        ass_escaped = ass_path.replace('\\', '/').replace(':', '\\:')
        fonts_escaped = fonts_dir.replace('\\', '/').replace(':', '\\:')
        filter_str = f"ass='{ass_escaped}':fontsdir='{fonts_escaped}'"

        cmd = [
            'ffmpeg', '-i', str(video_path),
            '-vf', filter_str,
            '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
            '-c:a', 'copy',
            str(output_path), '-y'
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            return jsonify({'error': result.stderr[-3000:]}), 500

        return jsonify({'export_id': job_id, 'filename': output_path.name})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try:
            Path(ass_path).unlink(missing_ok=True)
        except Exception:
            pass


@app.route('/download/<filename>')
def download(filename):
    filepath = app.config['EXPORT_FOLDER'] / filename
    if not filepath.exists():
        return jsonify({'error': 'File not found'}), 404
    return send_file(str(filepath), as_attachment=True)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _apply_case(text, case):
    if case == 'upper': return text.upper()
    if case == 'lower': return text.lower()
    if case == 'title': return text.title()
    return text


def _hex_to_ass(hex_color, alpha=0):
    """Convert #RRGGBB to ASS &HAABBGGRR format."""
    h = hex_color.lstrip('#')
    if len(h) != 6:
        h = 'FFFFFF'
    r, g, b = h[0:2], h[2:4], h[4:6]
    aa = f'{alpha:02X}'
    return f"&H{aa}{b}{g}{r}"


def _get_font_name(font_key, custom_font=None):
    """Return font name as it should appear in ASS FontName field."""
    font_display = {
        'BebasNeue':      'Bebas Neue',
        'DancingScript':  'Dancing Script',
        'Anton':          'Anton',
        'Montserrat':     'Montserrat',
        'SpaceMono':      'Space Mono',
        'PlayfairDisplay':'Playfair Display',
        'Caveat':         'Caveat',
        'Poppins':        'Poppins',
    }
    key = custom_font or font_key or 'Anton'
    return font_display.get(key, key)


def _ass_time(seconds):
    """Convert seconds to ASS time format H:MM:SS.cc"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    cs = int((s - int(s)) * 100)
    return f"{h}:{m:02d}:{int(s):02d}.{cs:02d}"


def _build_ass(captions, style, scale, position, custom, vid_w, vid_h,
               drag_x=0, drag_y=0, line_gap_extra=0):
    """Build a full ASS subtitle file matching the canvas preview styling."""
    line1_cfg = style.get('line1', {})
    line2_cfg = style.get('line2', {})
    highlight  = style.get('highlight') or {}
    has_line2  = bool(line2_cfg and (line2_cfg.get('font') or line2_cfg.get('color')))
    has_highlight = bool(highlight and highlight.get('bg'))

    # Font sizes scaled exactly like canvas: size * scale * min(W,H)/1000
    base_dim = min(vid_w, vid_h)
    font1  = _get_font_name(line1_cfg.get('font', 'Anton'), custom.get('font1'))
    size1  = max(10, int((custom.get('size1') or line1_cfg.get('size', 60)) * scale * base_dim / 1000))
    color1 = custom.get('color1') or line1_cfg.get('color', '#FFFFFF')
    bold1  = 1 if line1_cfg.get('bold', True) else 0
    case1  = custom.get('case1') or line1_cfg.get('case', 'upper')

    font2  = _get_font_name(line2_cfg.get('font', 'Anton'), custom.get('font2')) if has_line2 else font1
    size2  = max(10, int((custom.get('size2') or line2_cfg.get('size', 40)) * scale * base_dim / 1000)) if has_line2 else size1
    color2 = (custom.get('color2') or line2_cfg.get('color', '#FFFFFF')) if has_line2 else color1
    bold2  = (1 if line2_cfg.get('bold') else 0) if has_line2 else bold1
    case2  = (custom.get('case2') or line2_cfg.get('case', 'lower')) if has_line2 else case1

    glow_strength = custom.get('glow_strength', 0)

    # Gap between lines: same formula as canvas (15% of size1 + lineGapExtra scaled)
    gap_px = int(size1 * 0.15) + int(line_gap_extra * base_dim / 500)

    # ASS alignment codes: 2=bottom-center, 5=center, 8=top-center
    align_map = {'bottom': 2, 'center': 5, 'top': 8}
    alignment = align_map.get(position, 2)

    # MarginV base (5% of height), adjusted by drag_y
    # For bottom: L2 (visual bottom) has smaller MarginV, L1 (visual top) has larger
    # drag_y positive = captions move DOWN = smaller MarginV (ASS bottom ref)
    mv_base = round(vid_h * 0.05)
    if position == 'bottom':
        mv_L2  = max(0, mv_base - drag_y)           # line2 is visual bottom
        mv_L1  = mv_L2 + size2 + gap_px             # line1 sits above line2
    elif position == 'top':
        mv_L1  = max(0, mv_base + drag_y)
        mv_L2  = mv_L1 + size1 + gap_px
        # For top alignment use align=8; L1 on top, L2 below
    else:  # center
        mv_L1 = max(0, -drag_y)
        mv_L2 = mv_L1 + size1 + gap_px

    # Horizontal drag: use \pos override tag when non-zero
    cx = vid_w // 2 + drag_x
    def pos_tag(y_ref):
        if drag_x == 0:
            return ''
        return r'{\pos(' + str(cx) + ',' + str(y_ref) + r')}'

    # Approximate Y positions for \pos tag (needed when drag_x != 0)
    # For bottom alignment: y_bottom_of_text = vid_h - MarginV
    y_L2_ass = vid_h - mv_L2
    y_L1_ass = vid_h - mv_L1

    # Outline & shadow approximating canvas stroke
    if has_highlight:
        border_style1 = 3; outline1 = 0; shadow1 = 0
        back_color1 = _hex_to_ass(highlight['bg'])
        primary1    = _hex_to_ass(highlight.get('color', '#FFFFFF'))
    elif line1_cfg.get('glow') or glow_strength > 0:
        border_style1 = 1; outline1 = 3; shadow1 = 2
        back_color1 = _hex_to_ass('#000000', alpha=0x80)
        primary1    = _hex_to_ass(color1)
    else:
        border_style1 = 1; outline1 = 3; shadow1 = 1
        back_color1 = _hex_to_ass('#000000', alpha=0x80)
        primary1    = _hex_to_ass(color1)

    outline_color1 = _hex_to_ass('#000000')
    border_style2  = 1; outline2 = 2; shadow2 = 1
    primary2       = _hex_to_ass(color2)
    outline_color2 = _hex_to_ass('#000000')
    back_color2    = _hex_to_ass('#000000', alpha=0x80)

    lines = []
    lines.append('[Script Info]')
    lines.append('ScriptType: v4.00+')
    lines.append('Collisions: Normal')
    lines.append(f'PlayResX: {vid_w}')
    lines.append(f'PlayResY: {vid_h}')
    lines.append('ScaledBorderAndShadow: yes')
    lines.append('')
    lines.append('[V4+ Styles]')
    lines.append('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding')

    def style_line(name, font, size, primary, outline_c, back_c, bold, border_st, outline, shadow, align, mv):
        return (f'Style: {name},{font},{size},{primary},&H000000FF,'
                f'{outline_c},{back_c},{bold},0,0,0,100,100,0,0,'
                f'{border_st},{outline},{shadow},{align},10,10,{mv},1')

    lines.append(style_line('L1', font1, size1, primary1, outline_color1, back_color1,
                             bold1, border_style1, outline1, shadow1, alignment, mv_L1))
    if has_line2:
        lines.append(style_line('L2', font2, size2, primary2, outline_color2, back_color2,
                                 bold2, border_style2, outline2, shadow2, alignment, mv_L2))

    lines.append('')
    lines.append('[Events]')
    lines.append('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text')

    for cap in captions:
        start = _ass_time(cap['start'])
        end   = _ass_time(cap['end'])
        text  = cap['text'].strip()
        words = text.split()

        if has_line2 and len(words) > 1:
            mid   = math.ceil(len(words) / 2)
            text1 = _apply_case(' '.join(words[:mid]), case1)
            text2 = _apply_case(' '.join(words[mid:]), case2)
            lines.append(f'Dialogue: 0,{start},{end},L1,,0,0,0,,{pos_tag(y_L1_ass)}{text1}')
            lines.append(f'Dialogue: 1,{start},{end},L2,,0,0,0,,{pos_tag(y_L2_ass)}{text2}')
        else:
            text1 = _apply_case(text, case1)
            lines.append(f'Dialogue: 0,{start},{end},L1,,0,0,0,,{pos_tag(y_L1_ass)}{text1}')

    return '\n'.join(lines)


def _build_ass_word_by_word(words_data, style, scale, position, custom, vid_w, vid_h,
                            drag_x=0, drag_y=0):
    """Build ASS file where each word pops in individually (CapCut style)."""
    line1_cfg  = style.get('line1', {})
    highlight  = style.get('highlight') or {}
    has_highlight = bool(highlight and highlight.get('bg'))

    # Font size scaled like canvas: size * scale * min(W,H)/1000
    # Also cap single-word size at 55% of vid_w (mirrors JS cap)
    base_dim = min(vid_w, vid_h)
    font1  = _get_font_name(line1_cfg.get('font', 'Anton'), custom.get('font1'))
    size1  = max(10, int((custom.get('size1') or line1_cfg.get('size', 60)) * scale * base_dim / 1000))
    # Cap: estimate max char count ~5 chars wide, cap so one word won't exceed 55% vid_w
    max_size_for_single = int(vid_w * 0.55 / 5)  # rough px-per-char estimate
    size1 = min(size1, max_size_for_single)

    color1 = custom.get('color1') or line1_cfg.get('color', '#FFFFFF')
    bold1  = 1 if line1_cfg.get('bold', True) else 0
    case1  = custom.get('case1') or line1_cfg.get('case', 'upper')

    align_map = {'bottom': 2, 'center': 5, 'top': 8}
    alignment = align_map.get(position, 2)
    mv_base   = round(vid_h * 0.05)
    margin_v  = max(0, mv_base - drag_y) if position == 'bottom' else max(0, mv_base + drag_y)

    if has_highlight:
        border_style = 3; outline = 0; shadow = 0
        back_color = _hex_to_ass(highlight['bg'])
        primary    = _hex_to_ass(highlight.get('color', '#FFFFFF'))
    else:
        border_style = 1; outline = 3; shadow = 1
        back_color = _hex_to_ass('#000000', alpha=0x80)
        primary    = _hex_to_ass(color1)

    outline_color = _hex_to_ass('#000000')

    # Horizontal drag via \pos
    cx = vid_w // 2 + drag_x
    y_ref = vid_h - margin_v
    pos_prefix = r'{\pos(' + str(cx) + ',' + str(y_ref) + r')}' if drag_x != 0 else ''

    lines = []
    lines.append('[Script Info]')
    lines.append('ScriptType: v4.00+')
    lines.append(f'PlayResX: {vid_w}')
    lines.append(f'PlayResY: {vid_h}')
    lines.append('ScaledBorderAndShadow: yes')
    lines.append('')
    lines.append('[V4+ Styles]')
    lines.append('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding')
    lines.append(f'Style: W,{font1},{size1},{primary},&H000000FF,{outline_color},{back_color},'
                 f'{bold1},0,0,0,100,100,0,0,{border_style},{outline},{shadow},{alignment},10,10,{margin_v},1')
    lines.append('')
    lines.append('[Events]')
    lines.append('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text')

    for w in words_data:
        start = _ass_time(w['start'])
        end   = _ass_time(w['end'])
        word  = _apply_case(w['word'], case1)
        # pop effect: scale from 120% to 100%
        text  = pos_prefix + r'{\t(\fscx120\fscy120,\fscx100\fscy100)}' + word
        lines.append(f'Dialogue: 0,{start},{end},W,,0,0,0,,{text}')

    return '\n'.join(lines)


if __name__ == '__main__':
    app.run(debug=True, port=5050)
