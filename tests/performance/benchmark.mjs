/* global __ENV, open */
import { check } from 'k6';
import { vu } from 'k6/execution';
import http from 'k6/http';
import { Gauge, Rate, Trend } from 'k6/metrics';

const dataset = JSON.parse(open('../../database/seed/dataset.json'));
const {
  usuario: users,
  evidencia: [evidence],
  comparticion: shares,
} = dataset.relacional;
const owner = users.find((user) => user.id_usuario === evidence.id_usuario);
const students = users.filter((user) => user.rol === 'ESTUDIANTE' && user.estado === 'ACTIVO');
const evidenceShares = shares.filter((share) => share.id_evidencia === evidence.id_evidencia);
const publicShare = evidenceShares.find(
  (share) => share.estado === 'ACTIVA' && !share.fecha_expiracion,
);
const revokedShare = evidenceShares.find((share) => share.estado === 'REVOCADA');

const scenario = __ENV.SCENARIO;
const vus = Number(__ENV.VUS);
const iterations = Number(__ENV.ITERATIONS);
const port = Number(__ENV.API_PORT);
const base = 'http://127.0.0.1:' + port + '/api';
if (!['f2', 'f3a', 'f3b'].includes(scenario)) throw new Error('Define SCENARIO=f2, f3a o f3b.');
if (!Number.isInteger(vus) || vus < 1 || (scenario === 'f2' && vus > students.length)) {
  throw new Error('VUS debe ser un entero válido para el escenario.');
}
if (
  !Number.isInteger(iterations) ||
  iterations < vus ||
  (scenario === 'f2' && iterations % vus !== 0)
) {
  throw new Error('ITERATIONS debe ser >= VUS y, en F2, múltiplo de VUS.');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_PORT debe ser un puerto local válido.');
}

export const options = {
  scenarios: {
    [scenario]: {
      executor: scenario === 'f2' ? 'per-vu-iterations' : 'shared-iterations',
      vus,
      iterations: scenario === 'f2' ? iterations / vus : iterations,
      maxDuration: '2m',
    },
  },
  systemTags: ['status', 'method', 'name', 'scenario', 'check', 'expected_response'],
  summaryTrendStats: ['min', 'max', 'med', 'p(95)', 'p(99)', 'count'],
  thresholds: { checks: ['rate==1'], iterations: ['count==' + iterations] },
};

const operations = {
  f2: ['attempt_start', 'attempt_decision', 'attempt_finish'],
  f3a: ['profile', 'evidence_detail'],
  f3b: ['public_evidence'],
};
const metrics = Object.fromEntries(
  operations[scenario].map((name) => [
    name,
    {
      duration: new Trend(name + '_ms', true),
      errors: new Rate(name + '_errors'),
      pending: scenario === 'f2' ? new Rate(name + '_graph_pending') : null,
    },
  ]),
);
const measurementStart = new Trend('measurement_start_ms');
const measurementEnd = new Gauge('measurement_end_ms');
const fixture = (suffix) => 'e0000000-0000-4000-8000-00000000' + suffix;
const simulationId = fixture('0301');
const first = { step_id: fixture('0401'), option_id: fixture('0501') };
const terminal = { step_id: fixture('0402'), option_id: fixture('0504') };

function login(user) {
  const response = http.post(
    base + '/auth/login',
    JSON.stringify({ email: user.correo, password: dataset._meta.contrasena_demo }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (response.status !== 200 || !response.json('token')) {
    throw new Error(
      'Falló la autenticación de la cuenta del dataset (HTTP ' + response.status + ').',
    );
  }
  return response.json('token');
}

export function setup() {
  const health = http.get(base + '/health');
  if (health.status !== 200 || health.json('estado') !== 'OK') {
    throw new Error('La API no reportó los tres motores sanos.');
  }
  if (scenario === 'f2') return { tokens: students.slice(0, vus).map(login) };
  if (scenario === 'f3a') return { token: login(owner) };

  const revoked = http.get(base + '/public/evidence/' + revokedShare.token, {
    tags: { name: 'revoked_share_preflight' },
    responseCallback: http.expectedStatuses(404),
  });
  if (revoked.status !== 404) throw new Error('El enlace revocado debe devolver HTTP 404.');
  return {};
}

function measure(name, method, path, token, payload, expectedStatus, validate) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (payload) headers['Content-Type'] = 'application/json';
  measurementStart.add(Date.now());
  const response = http.request(method, base + path, payload ? JSON.stringify(payload) : null, {
    headers,
    tags: { name },
    redirects: 0,
    timeout: '5s',
  });
  measurementEnd.add(Date.now());

  let body;
  if (response.status === expectedStatus) {
    try {
      body = response.json();
    } catch {
      body = null;
    }
  }
  const metric = metrics[name];
  const graph = body?.synchronization?.graph;
  const validGraph = !metric.pending || graph === 'PENDING' || graph === 'APPLIED';
  const valid = check(response, {
    [name + ' status y respuesta esperados']: () => Boolean(body && validGraph && validate(body)),
  });
  metric.duration.add(response.timings.duration);
  metric.errors.add(!valid);
  if (metric.pending && valid) metric.pending.add(graph === 'PENDING');
  return valid ? body : null;
}

function play(token) {
  const created = measure(
    'attempt_start',
    'POST',
    '/attempts',
    token,
    { simulation_id: simulationId },
    201,
    (body) =>
      Boolean(body.attempt?.id) &&
      body.attempt.status === 'IN_PROGRESS' &&
      body.current_step?.id === first.step_id,
  );
  if (!created) return;

  const path = '/attempts/' + created.attempt.id + '/responses';
  const decision = measure(
    'attempt_decision',
    'POST',
    path,
    token,
    first,
    201,
    (body) => body.response?.sequence === 1 && body.next_step?.id === terminal.step_id,
  );
  if (!decision) return;

  measure(
    'attempt_finish',
    'POST',
    path,
    token,
    terminal,
    201,
    (body) =>
      body.response?.sequence === 2 &&
      body.attempt?.status === 'COMPLETED' &&
      Number.isFinite(body.attempt.score) &&
      body.next_step === null,
  );
}

export default function run(session) {
  if (scenario === 'f2') {
    play(session.tokens[vu.idInTest - 1]);
  } else if (scenario === 'f3a') {
    measure(
      'profile',
      'GET',
      '/profile',
      session.token,
      null,
      200,
      (body) =>
        body.user?.id === owner.id_usuario &&
        body.incomplete_data?.length === 0 &&
        body.pending_sync_count === 0,
    );
    measure(
      'evidence_detail',
      'GET',
      '/evidence/' + evidence.id_evidencia,
      session.token,
      null,
      200,
      (body) =>
        body.evidence?.id === evidence.id_evidencia && Array.isArray(body.content?.decisions),
    );
  } else {
    measure(
      'public_evidence',
      'GET',
      '/public/evidence/' + publicShare.token,
      null,
      null,
      200,
      (body) => body.title === evidence.titulo && Array.isArray(body.content?.decisions),
    );
  }
}

export function handleSummary(data) {
  const start = data.metrics.measurement_start_ms?.values.min;
  const end = data.metrics.measurement_end_ms?.values.max;
  const result = {
    scenario,
    vus,
    iterations: data.metrics.iterations?.values.count,
    expected_iterations: iterations,
    measured_seconds: start && end ? (end - start) / 1000 : null,
    operations: Object.fromEntries(
      operations[scenario].map((name) => {
        const duration = data.metrics[name + '_ms']?.values;
        const failures = data.metrics[name + '_errors']?.values;
        const pending = data.metrics[name + '_graph_pending']?.values;
        return [
          name,
          {
            requests: duration?.count ?? 0,
            errors: failures?.passes ?? 0,
            pending: pending?.passes,
            p50_ms: duration?.med,
            p95_ms: duration?.['p(95)'],
            p99_ms: duration?.['p(99)'],
          },
        ];
      }),
    ),
  };
  const output = JSON.stringify(result, null, 2) + '\n';
  return __ENV.RESULT_FILE ? { [__ENV.RESULT_FILE]: output, stdout: output } : { stdout: output };
}
