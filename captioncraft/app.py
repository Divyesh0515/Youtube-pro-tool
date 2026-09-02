# -*- coding: utf-8 -*-
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
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB
app.config['UPLOAD_FOLDER'] = Path('uploads')
app.config['EXPORT_FOLDER'] = Path('exports')

ALLOWED_EXTENSIONS = {'mp4', 'mov', 'avi', 'mkv'}
_api_key = os.environ.get('OPENAI_API_KEY', '')
client = OpenAI(api_key=_api_key.encode('ascii', errors='ignore').decode('ascii'))

CAPTION_STYLES = {
    'mehfil': {
        'name': 'Mehfil',
        'primary_font': 'BebasNeue',
        'primary_color': '#00FF88',
        'secondary_font': 'DancingScript',
        'secondary_color': '#FF69B4',
        'bg': None,
        'glow': True,
    },
    'hawabaaz': {
        'name': 'Hawabaaz',
        'primary_font': 'Anton',
        'primary_color': '#FFD700',
        'secondary_font': 'DancingScript',
        'secondary_color': '#FF69B4',
        'bg': None,
        'glow': False,
    },
    'mrbeast': {
        'name': 'Mr Beast Style',
        'primary_font': 'Anton',
        'primary_color': '#FFFFFF',
        'pill_bg': '#CC0000',
        'bg': 'pill',
        'glow': False,
    },
    'hero_emphasis': {
        'name': 'Hero Emphasis',
        'label_font': 'Montserrat',
        'label_color': '#FFFFFF',
        'main_font': 'Anton',
        'main_color': '#FF6A00',
        'bg': None,
        'glow': False,
    },
    'hero_glow': {
        'name': 'Hero Glow',
        'primary_font': 'Anton',
        'primary_color': '#00FF88',
        'bg': None,
        'glow': True,
        'glow_color': '#00FF88',
    },
    'poetic_stack': {
        'name': 'Poetic Stack',
        'top_font': 'DancingScript',
        'top_color': '#FF69B4',
        'bottom_font': 'Anton',
        'bottom_color': '#FFFFFF',
        'bg': None,
        'glow': False,
    },
    'split_line': {
        'name': 'Split-Line',
        'primary_font': 'Montserrat',
        'primary_color': '#BF5FFF',
        'secondary_font': 'Montserrat',
        'secondary_color': '#FF69B4',
        'italic': True,
        'bg': None,
        'glow': False,
    },
    'caption_scale': {
        'name': 'Caption Scale',
        'small_font': 'Montserrat',
        'small_color': '#FFFFFF',
        'big_font': 'Anton',
        'big_color': '#00FFFF',
        'bg': None,
        'glow': False,
    },
    'inline_emphasis': {
        'name': 'Inline Emphasis',
        'primary_font': 'Montserrat',
        'primary_color': '#FFFFFF',
        'highlight_color': '#FF69B4',
        'pill_bg': '#FF69B4',
        'bg': 'inline_pill',
        'glow': False,
    },
    'raw_archive': {
        'name': 'Raw Archive',
        'primary_font': 'SpaceMono',
        'primary_color': '#FFFFFF',
        'bg': None,
        'glow': False,
    },
}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    styles = {k: v['name'] for k, v in CAPTION_STYLES.items()}
    return render_template('index.html', styles=styles)


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

    # Extract audio to temp file
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
                timestamp_granularities=['segment']
            )

        captions = []
        for seg in transcript.segments:
            captions.append({
                'id': seg.id,
                'start': round(seg.start, 3),
                'end': round(seg.end, 3),
                'text': seg.text.strip(),
            })

        return jsonify({'captions': captions})
    finally:
        if audio_path.exists():
            audio_path.unlink()


@app.route('/export', methods=['POST'])
def export_video():
    data = request.json
    video_path = Path(data.get('path', ''))
    captions = data.get('captions', [])
    style_key = data.get('style', 'mrbeast')

    if not video_path.exists():
        return jsonify({'error': 'Video not found'}), 404

    style = CAPTION_STYLES.get(style_key, CAPTION_STYLES['mrbeast'])
    job_id = str(uuid.uuid4())

    # Write SRT file
    srt_path = Path(tempfile.mktemp(suffix='.srt'))
    with open(srt_path, 'w', encoding='utf-8') as f:
        for i, cap in enumerate(captions, 1):
            start = _seconds_to_srt(cap['start'])
            end = _seconds_to_srt(cap['end'])
            f.write(f"{i}\n{start} --> {end}\n{cap['text']}\n\n")

    output_path = app.config['EXPORT_FOLDER'] / f"{job_id}_captioned.mp4"

    try:
        filter_str = _build_filter(style, str(srt_path))
        cmd = [
            'ffmpeg', '-i', str(video_path),
            '-vf', filter_str,
            '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
            '-c:a', 'copy',
            str(output_path), '-y'
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            return jsonify({'error': result.stderr[-2000:]}), 500

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


def _build_filter(style, srt_path):
    # Escape path for ffmpeg filter
    srt_escaped = srt_path.replace('\\', '/').replace(':', '\\:')

    base_opts = f"subtitles='{srt_escaped}'"

    name = style.get('name', '')
    font_size = 22
    bold = 1
    outline = 2
    shadow = 0
    primary_color = _hex_to_ass(style.get('primary_color', '#FFFFFF'))
    outline_color = '&H00000000'
    bg_color = '&H00000000'

    if 'mrbeast' in name.lower():
        primary_color = _hex_to_ass('#FFFFFF')
        outline_color = _hex_to_ass('#CC0000')
        outline = 4
        font_size = 26
    elif 'hero glow' in name.lower() or 'hero_glow' in name.lower():
        outline_color = _hex_to_ass('#00FF88')
        outline = 3
        shadow = 2
    elif 'raw archive' in name.lower():
        bold = 0

    force_style = (
        f"FontName={_style_font(style)},"
        f"FontSize={font_size},"
        f"Bold={bold},"
        f"PrimaryColour={primary_color},"
        f"OutlineColour={outline_color},"
        f"BackColour={bg_color},"
        f"Outline={outline},"
        f"Shadow={shadow},"
        f"Alignment=2,"
        f"MarginV=40"
    )

    return f"subtitles='{srt_escaped}':force_style='{force_style}'"


def _style_font(style):
    font_map = {
        'BebasNeue': 'Bebas Neue',
        'DancingScript': 'Dancing Script',
        'Anton': 'Anton',
        'Montserrat': 'Montserrat',
        'SpaceMono': 'Space Mono',
    }
    font_key = style.get('primary_font', style.get('main_font', style.get('top_font', 'Anton')))
    return font_map.get(font_key, font_key)


def _hex_to_ass(hex_color):
    """Convert #RRGGBB to ASS &H00BBGGRR format."""
    h = hex_color.lstrip('#')
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}"


if __name__ == '__main__':
    app.config['UPLOAD_FOLDER'].mkdir(exist_ok=True)
    app.config['EXPORT_FOLDER'].mkdir(exist_ok=True)
    app.run(debug=True, port=5050)
