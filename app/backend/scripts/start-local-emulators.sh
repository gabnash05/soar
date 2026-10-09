#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
PROJECT_ID="${SOAR_EMULATOR_PROJECT_ID:-demo-soar-local}"
FIRESTORE_HOST="${FIRESTORE_EMULATOR_LISTEN_HOST:-127.0.0.1}"
FIRESTORE_PORT="${FIRESTORE_EMULATOR_PORT:-18080}"
FIRESTORE_WEBCHANNEL_PORT="${FIRESTORE_EMULATOR_WEBCHANNEL_PORT:-18081}"
FIRESTORE_WEBSOCKET_PORT="${FIRESTORE_EMULATOR_WEBSOCKET_PORT:-19151}"
STORAGE_HOST="${FIREBASE_STORAGE_EMULATOR_HOST:-127.0.0.1:19199}"
AUTH_HOST="${FIREBASE_AUTH_EMULATOR_HOST:-127.0.0.1:19099}"
FUNCTIONS_PORT="${FUNCTIONS_EMULATOR_PORT:-15001}"
FIRESTORE_JAR="${FIRESTORE_EMULATOR_JAR:-}"
if [[ -z "$FIRESTORE_JAR" ]]; then
  shopt -s nullglob
  firestore_jars=("$HOME"/.cache/firebase/emulators/cloud-firestore-emulator-v*.jar)
  shopt -u nullglob
  if (( ${#firestore_jars[@]} > 0 )); then
    FIRESTORE_JAR="${firestore_jars[-1]}"
  else
    FIRESTORE_JAR="$HOME/.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar"
  fi
fi
JAVA_BIN="${JAVA_BIN:-java}"

if [[ -n "${JAVA_HOME:-}" ]]; then
  JAVA_BIN="$JAVA_HOME/bin/java"
fi

if [[ ! -r "$FIRESTORE_JAR" ]]; then
  echo "Firestore emulator jar not found: $FIRESTORE_JAR" >&2
  echo "Run 'npx firebase setup:emulators:firestore' or set FIRESTORE_EMULATOR_JAR." >&2
  exit 1
fi

if [[ "$FIRESTORE_HOST" != "127.0.0.1" && "$FIRESTORE_HOST" != "localhost" && "$FIRESTORE_HOST" != "::1" ]]; then
  echo "Refusing to start Firestore on non-loopback host: $FIRESTORE_HOST" >&2
  exit 1
fi

cd "$ROOT_DIR"

firestore_log="${SOAR_FIRESTORE_LOG:-$ROOT_DIR/firestore-direct-debug.log}"
rm -f "$firestore_log"

"$JAVA_BIN" \
  -Djava.net.preferIPv4Stack=true \
  -Dgoogle.cloud_firestore.debug_log_level=FINE \
  -Duser.language=en \
  -jar "$FIRESTORE_JAR" \
  --host "$FIRESTORE_HOST" \
  --port "$FIRESTORE_PORT" \
  --webchannel_port "$FIRESTORE_WEBCHANNEL_PORT" \
  --websocket_port "$FIRESTORE_WEBSOCKET_PORT" \
  --database-edition standard \
  --project_id "$PROJECT_ID" \
  --rules "$ROOT_DIR/firestore.rules" \
  --single_project_mode true \
  >"$firestore_log" 2>&1 &
firestore_pid=$!
firebase_pid=""

stop_pid() {
  local pid="$1"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" >/dev/null 2>&1 || true
  fi
}

stop_process_group() {
  local pgid="$1"
  if [[ -n "$pgid" ]] && kill -0 "-$pgid" >/dev/null 2>&1; then
    kill -TERM "-$pgid" >/dev/null 2>&1 || true
    sleep 2
    kill -KILL "-$pgid" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  stop_process_group "$firebase_pid"
  stop_pid "$firestore_pid"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if ! kill -0 "$firestore_pid" >/dev/null 2>&1; then
    echo "Firestore emulator exited during startup. Log follows:" >&2
    sed -n '1,160p' "$firestore_log" >&2 || true
    exit 1
  fi

  if curl -fsS "http://$FIRESTORE_HOST:$FIRESTORE_PORT" >/dev/null 2>&1; then
    break
  fi

  sleep 1
done

if ! kill -0 "$firestore_pid" >/dev/null 2>&1; then
  echo "Firestore emulator is not running. Log follows:" >&2
  sed -n '1,160p' "$firestore_log" >&2 || true
  exit 1
fi

export GCLOUD_PROJECT="$PROJECT_ID"
export FIREBASE_CONFIG="${FIREBASE_CONFIG:-{\"projectId\":\"$PROJECT_ID\",\"storageBucket\":\"$PROJECT_ID.appspot.com\"}}"
export FIRESTORE_EMULATOR_HOST="$FIRESTORE_HOST:$FIRESTORE_PORT"
export FIREBASE_FIRESTORE_EMULATOR_ADDRESS="$FIRESTORE_HOST:$FIRESTORE_PORT"
export SOAR_REGISTER_DIRECT_FIRESTORE=1
export SOAR_DIRECT_FIRESTORE_HOST="$FIRESTORE_HOST"
export SOAR_DIRECT_FIRESTORE_PORT="$FIRESTORE_PORT"
register_hook="$ROOT_DIR/app/backend/scripts/register-direct-firestore.cjs"
export NODE_OPTIONS="${NODE_OPTIONS:-} --require=$register_hook"
export FIREBASE_AUTH_EMULATOR_HOST="$AUTH_HOST"
export FIREBASE_STORAGE_EMULATOR_HOST="$STORAGE_HOST"
export STORAGE_EMULATOR_HOST="http://$STORAGE_HOST"
export SOAR_FIREBASE_WEB_API_KEY="${SOAR_FIREBASE_WEB_API_KEY:-demo-web-api-key}"
export PAYMONGO_SECRET_KEY="${PAYMONGO_SECRET_KEY:-sk_test_emulator_only}"
export PAYMONGO_WEBHOOK_SECRET="${PAYMONGO_WEBHOOK_SECRET:-whsec_emulator_only}"
export PAYMONGO_EXPECTED_LIVEMODE="${PAYMONGO_EXPECTED_LIVEMODE:-false}"
export PAYMENT_SECRET_PEPPER="${PAYMENT_SECRET_PEPPER:-emulator-only-pepper}"
export PAYMENT_SECURE_COOKIES="${PAYMENT_SECURE_COOKIES:-false}"

setsid npx firebase emulators:start \
  --config firebase.local.json \
  --project "$PROJECT_ID" \
  --only auth,functions,storage &
firebase_pid=$!
wait "$firebase_pid"
