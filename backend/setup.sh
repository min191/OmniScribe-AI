#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

printf '%s\n' 'Backend setup complete.'
printf '%s\n' 'Run: .venv/bin/python -m uvicorn main:app --reload --port 8000'

