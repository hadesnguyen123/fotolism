@echo off
title Fotolism AI Enhance Tuner (http://127.0.0.1:8010)
cd /d "%~dp0backend"
start "" http://127.0.0.1:8010
python main.py
