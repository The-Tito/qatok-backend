#!/usr/bin/env bash
set -euo pipefail

mode=${1:-}
if [[ "$mode" != smoke && "$mode" != full ]] || [[ $# -ne 2 ]]; then
  printf 'Uso: bash tests/performance/run.sh {smoke|full} DIRECTORIO_RESULTADOS\n' >&2
  exit 2
fi
mkdir -p "$2"
results=$(cd "$2" && pwd)
cd "$(dirname "$0")/../.."
command -v k6 >/dev/null
test -f .env

# Los cargadores y la API prefieren estas variables a las de .env.
export POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=15433 POSTGRES_DB=qatok_benchmark
export MONGO_HOST=127.0.0.1 MONGO_PORT=37018 MONGO_DB=qatok_benchmark
export NEO4J_HOST=127.0.0.1 NEO4J_BOLT_PORT=17688
export API_PORT=14000 NODE_ENV=test DB_TIMEOUT_MS=2000
# Habilitar el login de las cuentas de muestra solo en la carga aislada.
seed_hash=$(node -e 'const seed = require("./database/seed/dataset.json"); process.stdout.write(require("bcrypt").hashSync(seed._meta.contrasena_demo, 10))')
export QATOK_SEED_PASSWORD_HASH="$seed_hash"
project="qatok-benchmark-$$"
compose=(docker compose -p "$project" -f docker-compose.yml -f tests/performance/compose.override.yml)
api_pid=

stop_api() {
  if [[ -n "$api_pid" ]]; then
    kill -TERM "$api_pid" 2>/dev/null || true
    wait "$api_pid" || true
    api_pid=
  fi
}

cleanup() {
  stop_api
  "${compose[@]}" down -v
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"${compose[@]}" up -d --wait

if curl -sS --max-time 1 -o /dev/null "http://127.0.0.1:$API_PORT/" 2>/dev/null; then
  printf 'El puerto de la API de rendimiento ya está ocupado.\n' >&2
  exit 1
fi

run_case() {
  local scenario=$1 vus=$2 iterations=$3 repetition=$4 label ready=0 attempt
  label="$results/$scenario-$vus-$repetition"
  npm run db:relational:reset
  npm run db:document:reset
  npm run db:graph:reset
  node tests/performance/snapshot.mjs > "$label.before.json"

  node --import tsx backend/src/server.ts > "$label.api.log" 2>&1 &
  api_pid=$!
  for ((attempt = 0; attempt < 60; attempt++)); do
    if ! kill -0 "$api_pid" 2>/dev/null; then break; fi
    if curl --fail --silent --max-time 1 "http://127.0.0.1:$API_PORT/api/health" >/dev/null; then
      ready=1
      break
    fi
    sleep 0.25
  done
  if [[ "$ready" -ne 1 ]]; then
    cat "$label.api.log" >&2
    printf 'La API de rendimiento no está lista.\n' >&2
    return 1
  fi

  SCENARIO="$scenario" VUS="$vus" ITERATIONS="$iterations" RESULT_FILE="$label.json" \
    k6 run --quiet tests/performance/benchmark.mjs || failed=1
  if [[ "$scenario" == f2 ]]; then
    # Dar al procesador tiempo para aplicar eventos que la API dejó pendientes.
    for ((attempt = 0; attempt < 10; attempt++)); do
      node tests/performance/snapshot.mjs > "$label.after.json"
      if node -e 'if (require(process.argv[1]).postgres.pending_events) process.exit(1)' "$label.after.json"; then
        break
      fi
      sleep 1
    done
  else
    node tests/performance/snapshot.mjs > "$label.after.json"
  fi
  stop_api
}

failed=0
if [[ "$mode" == smoke ]]; then
  run_case f2 2 4 smoke
  run_case f3a 2 4 smoke
  run_case f3b 2 4 smoke
else
  for repetition in 1 2 3; do
    # Conservar las mediciones aunque k6 reporte errores en una corrida.
    for spec in 'f2 1 100' 'f2 2 200' 'f3a 1 1000' 'f3a 10 1000' 'f3b 1 1000' 'f3b 10 1000'; do
      read -r scenario vus iterations <<< "$spec"
      run_case "$scenario" "$vus" "$iterations" "$repetition"
    done
  done
fi
exit "$failed"
