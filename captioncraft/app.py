# -*- coding: utf-8 -*-
import httpx._utils as _httpx_utils
_orig_normalize = _httpx_utils.normalize_header_value
def _patched_normalize(value, encoding):
    return _orig_normalize(value, 'latin-1')
_httpx_utils.normalize_header_value = _patched_normalize

import os
import json
import uuid
import subprocess
import tempfile
from pathlib import Path
from flask import Flask, request, jsonify, render_template, send_file
from openai import OpenAI
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024
app.config['UPLOAD_FOLDER'] = Path('uploads')
app.config['EXPORT_FOLDER'] = Path('exports')
app.config['FONTS_FOLDER'] = Path('fonts')

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
        subprocess.run([
            'ffmpeg', '-i', str(video_path),
            '-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-q:a', '5',
            str(audio_path), '-y'
        ], check=True, capture_output=True)

        with open(audio_path, 'rb') as f:
            transcript = client.audio.transcriptions.create(
                model='whisper-1',
                file=f,
                response_format='verbose_json',
                timestamp_granularities=['word', 'segment']
            )

        # Build word-level captions
        words = []
        if hasattr(transcript, 'words') and transcript.words:
            for w in transcript.words:
                words.append({
                    'word': w.word.strip(),
                    'start': round(w.start, 3),
                    'end': round(w.end, 3),
                })

        # Build segment captions
        captions = []
        for seg in transcript.segments:
            captions.append({
                'id': seg.id,
                'start': round(seg.start, 3),
                'end': round(seg.end, 3),
                'text': seg.text.strip(),
            })

        return jsonify({'captions': captions, 'words': words})
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
    position = data.get('position', 'bottom')  # bottom / center / top

    if not video_path.exists():
        return jsonify({'error': 'Video not found'}), 404

    style = STYLES.get(style_key, STYLES['mehfil'])
    job_id = str(uuid.uuid4())

    srt_path = Path(tempfile.mktemp(suffix='.srt'))
    with open(srt_path, 'w', encoding='utf-8') as f:
        for i, cap in enumerate(captions, 1):
            start = _seconds_to_srt(cap['start'])
            end = _seconds_to_srt(cap['end'])
            f.write(f"{i}\n{start} --> {end}\n{cap['text']}\n\n")

    output_path = app.config['EXPORT_FOLDER'] / f"{job_id}_captioned.mp4"

    try:
        filter_str = _build_ffmpeg_filter(style, str(srt_path), font_size_scale, position)
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
    finally:
        if srt_path.exists():
            srt_path.unlink()


@app.route('/download/<filename>')
def download(filename):
    filepath = app.config['EXPORT_FOLDER'] / filename
    if not filepath.exists():
        return jsonify({'error': 'File not found'}), 404
    return send_file(str(filepath), as_attachment=True)


def _seconds_to_srt(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _get_font_path(font_name):
    font_map = {
        'BebasNeue': 'fonts/BebasNeue.ttf',
        'DancingScript': 'fonts/DancingScript.ttf',
        'Anton': 'fonts/Anton.ttf',
        'Montserrat': 'fonts/Montserrat.ttf',
        'SpaceMono': 'fonts/SpaceMono.ttf',
    }
    path = font_map.get(font_name, 'fonts/Anton.ttf')
    # Make absolute path and escape for ffmpeg
    abs_path = str(Path(path).absolute()).replace('\\', '/').replace(':', '\\:')
    return abs_path


def _hex_to_ass(hex_color):
    h = hex_color.lstrip('#')
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}"


def _build_ffmpeg_filter(style, srt_path, scale=1.0, position='bottom'):
    srt_escaped = srt_path.replace('\\', '/').replace(':', '\\:')

    margin_map = {'bottom': 60, 'center': 0, 'top': 60}
    alignment_map = {'bottom': 2, 'center': 5, 'top': 8}

    margin_v = margin_map.get(position, 60)
    alignment = alignment_map.get(position, 2)

    line1 = style.get('line1', {})
    font_path = _get_font_path(line1.get('font', 'Anton'))
    font_size = int(line1.get('size', 60) * scale)
    color = _hex_to_ass(line1.get('color', '#FFFFFF'))
    bold = 1 if line1.get('bold', True) else 0
    outline_color = '&H00000000'
    outline = 2
    shadow = 0

    if line1.get('glow'):
        outline_color = _hex_to_ass(line1.get('color', '#00FF44'))
        outline = 3
        shadow = 2

    highlight = style.get('highlight', {})
    if highlight:
        outline_color = _hex_to_ass(highlight.get('bg', '#CC0000'))
        outline = 8

    force_style = (
        f"FontName={line1.get('font', 'Anton')},"
        f"FontSize={font_size},"
        f"Bold={bold},"
        f"PrimaryColour={color},"
        f"OutlineColour={outline_color},"
        f"Outline={outline},"
        f"Shadow={shadow},"
        f"Alignment={alignment},"
        f"MarginV={margin_v}"
    )

    return f"subtitles='{srt_escaped}':force_style='{force_style}'"


if __name__ == '__main__':
    app.config['UPLOAD_FOLDER'].mkdir(exist_ok=True)
    app.config['EXPORT_FOLDER'].mkdir(exist_ok=True)
    app.run(debug=True, port=5050)
