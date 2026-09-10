#!/usr/bin/env bash
# Render build command. Migrations run at start time instead (see render.yaml),
# so the database lives in the container that serves traffic.
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
