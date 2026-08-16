# ---- Stage 1: build Tailwind/daisyUI CSS ----
FROM node:20-slim AS assets
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY app.css ./
COPY templates ./templates
RUN npm run build:css

# ---- Stage 2: python runtime ----
FROM python:3.12-slim
WORKDIR /app

RUN useradd --create-home --shell /bin/bash appuser

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py db.py schema.sql ./
COPY templates ./templates
COPY static ./static
COPY --from=assets /app/static/css/daisyui.css ./static/css/daisyui.css

RUN mkdir -p /app/data && chown -R appuser:appuser /app
USER appuser

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "app:app"]
