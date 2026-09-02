# CaptionCraft

AI-powered caption studio — upload a video, auto-transcribe with Whisper, edit the timeline, pick a style, export with burned-in captions.

## Requirements

- Python 3.10+
- FFmpeg installed and on `PATH`
- OpenAI API key

## Setup

```bash
cd captioncraft
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...
python app.py
```

Open `http://localhost:5050` in your browser.

## Caption Styles

| Key | Name | Description |
|-----|------|-------------|
| `mehfil` | Mehfil | Green neon Bebas Neue + pink Dancing Script |
| `hawabaaz` | Hawabaaz | Gold bold + pink cursive |
| `mrbeast` | Mr Beast Style | White Anton + red pill background |
| `hero_emphasis` | Hero Emphasis | Small label + big orange Anton |
| `hero_glow` | Hero Glow | Green neon glow Anton |
| `poetic_stack` | Poetic Stack | Pink Dancing Script + white Anton stacked |
| `split_line` | Split-Line | Purple Montserrat + pink italic |
| `caption_scale` | Caption Scale | Tiny word + huge cyan word |
| `inline_emphasis` | Inline Emphasis | Pink highlighted pill word |
| `raw_archive` | Raw Archive | Space Mono monospace |

## Notes

- Uploads go to `uploads/`, exports go to `exports/`
- FFmpeg must have access to system fonts for custom font rendering
- For best results with custom fonts, install Bebas Neue, Dancing Script, Anton, Montserrat, Space Mono on your system
