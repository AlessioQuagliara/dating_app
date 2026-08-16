#!/usr/bin/env bash
# deploy.sh — deploy di produzione per bubapp (dating_app) su questa VPS.
#
# Va eseguito SUL SERVER, dalla root del repo (/var/www/dating_app).
# Stack: Flask (gunicorn) + Traefik esterno, orchestrato da docker-compose.prod.yml.
# Il codice viene copiato dentro l'immagine (nessun bind-mount): serve sempre
# un rebuild per far arrivare le modifiche nel container.
#
# Cosa fa:
#   1. (opzionale) git pull dell'ultimo codice da origin
#   2. build dell'immagine con il codice corrente
#   3. up -d dello stack (ricrea solo il container se e' cambiato)
#   4. healthcheck sull'app + stato container
#
# Uso:
#   ./deploy.sh              # build + restart usando il codice GIA' presente sul disco
#   ./deploy.sh --pull       # fa prima 'git pull origin main', poi build + restart
#   ./deploy.sh --no-build   # solo restart, senza rebuild dell'immagine

set -euo pipefail

# Sempre dalla directory dello script (root del repo)
cd "$(dirname "${BASH_SOURCE[0]}")"

PROJECT="bubapp"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
COMPOSE=(docker compose -p "${PROJECT}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}")

DO_PULL=0
DO_BUILD=1
for arg in "$@"; do
  case "${arg}" in
    --pull)     DO_PULL=1 ;;
    --no-build) DO_BUILD=0 ;;
    -h|--help)
      grep '^#' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "Opzione sconosciuta: ${arg}" >&2
      echo "Uso: ./deploy.sh [--pull] [--no-build]" >&2
      exit 2 ;;
  esac
done

# ── Preflight: file indispensabili ──────────────────────────────────────────
if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "FALLITO: ${COMPOSE_FILE} non trovato. Sei nella root del repo?" >&2
  exit 1
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "FALLITO: ${ENV_FILE} mancante. Copia ${ENV_FILE}.example e riempi i valori veri:" >&2
  echo "  cp ${ENV_FILE}.example ${ENV_FILE}" >&2
  echo "Questo script non genera segreti." >&2
  exit 1
fi

if [[ "${DO_PULL}" == "1" ]]; then
  echo "==> git pull origin main"
  # Salvaguardia: se ci sono modifiche locali non committate, git rifiuta il
  # pull in caso di conflitto invece di sovrascriverle silenziosamente.
  git pull origin main
fi

if [[ "${DO_BUILD}" == "1" ]]; then
  echo "==> Build dell'immagine app (nessun downtime: il container resta su finche' non facciamo up)"
  "${COMPOSE[@]}" build app
fi

echo "==> Avvio/aggiornamento dello stack (ricrea solo il container se e' cambiato)"
"${COMPOSE[@]}" up -d

echo "==> Attendo che gunicorn risponda sulla porta 8000 dentro al container"
OK=0
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T app python -c \
    "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/', timeout=3)" \
    >/dev/null 2>&1; then
    OK=1
    break
  fi
  sleep 2
done

if [[ "${OK}" == "1" ]]; then
  echo "OK: l'app risponde su :8000."
else
  echo "AVVISO: nessuna risposta 2xx da / entro il timeout. Controllo se gunicorn e' vivo..."
  if "${COMPOSE[@]}" exec -T app pgrep -f gunicorn >/dev/null 2>&1; then
    echo "OK (parziale): gunicorn e' in esecuzione. Controlla i log se il sito non risponde:"
    echo "  ${COMPOSE[*]} logs -f app"
  else
    echo "FALLITO: gunicorn non risulta in esecuzione nel container."
    echo "Log recenti:"
    "${COMPOSE[@]}" logs --tail 40 app || true
    exit 1
  fi
fi

echo "==> Pulizia immagini dangling (libera spazio, non tocca quelle in uso)"
docker image prune -f >/dev/null 2>&1 || true

echo "==> Stato finale del container"
"${COMPOSE[@]}" ps

echo "==> Fatto."
