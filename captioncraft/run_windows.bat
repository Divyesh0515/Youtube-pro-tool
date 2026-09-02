@echo off
title CaptionCraft - AI Caption Studio

echo.
echo  ================================
echo   CaptionCraft - AI Caption Studio
echo  ================================
echo.

REM Set your OpenAI API key here
set OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE

REM Install dependencies
echo [1/3] Installing dependencies...
pip install flask openai werkzeug --quiet

REM Create folders
echo [2/3] Setting up folders...
if not exist uploads mkdir uploads
if not exist exports mkdir exports

REM Start app
echo [3/3] Starting CaptionCraft...
echo.
echo  Open your browser and go to:
echo  http://127.0.0.1:5050
echo.
start "" http://127.0.0.1:5050
python app.py

pause
