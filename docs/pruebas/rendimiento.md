# Pruebas de conectividad y rendimiento

Medición del 25 de noviembre de 2026 para el [issue #17](https://github.com/The-Tito/qatok-backend/issues/17). Base del backend `9850111` con el registro de conectividad y los scripts de medición de esta rama. Contrato HTTP 0.6.0.

## Conectividad

El paso **Pruebas de integración (3 bases)** de [CI](../../.github/workflows/ci.yml) ejecuta [la prueba de salud](../../tests/integration/conectividad.test.ts). Esta comprueba HTTP 200 con los tres motores sanos y HTTP 503 al configurar mal Neo4j o apuntar a un puerto de PostgreSQL sin servicio. El caso sano registra el estado y la latencia de cada motor.

```bash
CI=true npm run test:integration
```

La ejecución local con `CI=true` pasó 88 pruebas de integración. El registro del caso sano fue PostgreSQL **21 ms**, MongoDB **20 ms** y Neo4j **22 ms**. El [workflow de referencia](https://github.com/The-Tito/qatok-backend/actions/runs/45353915115) pasó sobre `9850111`. El registro nuevo queda pendiente de observar en GitHub Actions tras publicar el cambio.

## Entorno y reproducibilidad

- Mac Apple M4 Pro (12 núcleos, 24 GiB de RAM), macOS 27.2.1 arm64. Docker Engine 29.9.2, Compose 5.6.1, VM de 12 CPU y 7.75 GiB de RAM. Node.js 26.10.0 y k6 2.4.0 (darwin/arm64).
- PostgreSQL 16.16, MongoDB 7.0.48 y Neo4j 5.26.33. La API y k6 corrieron en el host contra las bases en Docker. La API usó `NODE_ENV=test` con el registro HTTP silenciado y el procesador de sincronización activo. Los servicios de desarrollo permanecieron levantados en su proyecto independiente.
- Fuente de datos [`database/seed/dataset.json`](../../database/seed/dataset.json), SHA-256 `3de3a7c2ca70140ae48b4edd49aefa49b3ab1bc7b3bccf4c1068d83b1120f652`. Cada corrida reconstruyó las tres bases del proyecto temporal.

Ejecuta estos comandos desde la raíz del backend con Docker iniciado y k6 disponible.

```bash
npm ci
npm run setup:env
resultados=$(mktemp -d)
bash tests/performance/run.sh smoke "$resultados/smoke"
bash tests/performance/run.sh full "$resultados/full"
```

El ejecutor usa un proyecto Compose temporal y recarga el dataset antes de cada corrida. Usa los puertos locales 14000, 15433, 37018 y 17688. Guardará JSON de cada medición y conteos de las bases antes y después. Al salir detiene la API de la prueba y retira los contenedores y volúmenes que creó.

## Diseño de carga

- **F2.** Una cuenta del dataset por usuario virtual (VU). Cada iteración inicia un intento y elige dos opciones fijas del escenario publicado. Exige HTTP 201 para las tres operaciones, la secuencia esperada y el estado final `COMPLETED`, con puntuación. Registra las respuestas con `synchronization.graph=PENDING` y mide el volumen final con hasta diez capturas separadas por pausas de un segundo. El conteo termina antes si ya no hay pendientes.
- **F3a.** Los VU comparten la cuenta dueña de la evidencia. Cada iteración consulta el perfil y el detalle. Se exige HTTP 200, perfil completo, cola sin pendientes para la cuenta y la evidencia esperada.
- **F3b.** Cada iteración consulta el mismo enlace vigente y comprueba HTTP 200 y la instantánea. La preparación verifica que el enlace revocado responda HTTP 404.
- Cada nivel tiene tres corridas secuenciales. El chequeo de salud, el inicio de sesión y la comprobación del enlace revocado se hacen antes de medir. La tasa usa las solicitudes medidas entre el inicio de la primera petición y el término de la última. Los percentiles usan `http_req_duration` de cada operación. Se cuenta como error un fallo de transporte, estado HTTP inesperado o respuesta que incumple la comprobación del flujo. k6 devuelve error si fallan las comprobaciones o falta alguna iteración.

## Resultados

**18 corridas, 20 700 solicitudes medidas y 0 errores.**

Las latencias están en milisegundos. Cada percentil de la tabla es la mediana de los tres valores por corrida. Los conteos suman las tres corridas.

| Flujo | VU | Operación | Solicitudes | p50 | p95 | p99 | Errores | Grafo pendiente |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F2 | 1 | Iniciar intento | 300 | 7.84 | 11.15 | 13.38 | 0 | 1 |
| F2 | 1 | Primera decisión | 300 | 7.88 | 11.16 | 17.23 | 0 | 1 |
| F2 | 1 | Decisión final | 300 | 13.07 | 17.37 | 19.70 | 0 | 0 |
| F2 | 2 | Iniciar intento | 600 | 6.75 | 10.36 | 24.92 | 0 | 597 |
| F2 | 2 | Primera decisión | 600 | 5.79 | 10.29 | 13.23 | 0 | 600 |
| F2 | 2 | Decisión final | 600 | 6.79 | 15.66 | 23.29 | 0 | 600 |
| F3a | 1 | Consultar perfil | 3000 | 2.40 | 3.41 | 4.32 | 0 | — |
| F3a | 1 | Detalle de evidencia | 3000 | 1.21 | 1.76 | 2.23 | 0 | — |
| F3a | 10 | Consultar perfil | 3000 | 4.97 | 7.07 | 12.99 | 0 | — |
| F3a | 10 | Detalle de evidencia | 3000 | 3.17 | 4.83 | 6.11 | 0 | — |
| F3b | 1 | Abrir enlace público | 3000 | 0.90 | 1.39 | 1.81 | 0 | — |
| F3b | 10 | Abrir enlace público | 3000 | 1.81 | 3.11 | 8.72 | 0 | — |

| Flujo | VU | Iteraciones por corrida | Solicitudes/s (mediana) | Solicitudes/s (mín. a máx.) |
| --- | --- | --- | --- | --- |
| F2 | 1 | 100 | 93.87 | 65.47 a 108.97 |
| F2 | 2 | 200 | 251.05 | 224.47 a 273.35 |
| F3a | 1 | 1000 | 486.97 | 468.60 a 517.33 |
| F3a | 10 | 1000 | 2169.20 | 1912.05 a 2244.67 |
| F3b | 1 | 1000 | 975.61 | 957.85 a 1011.12 |
| F3b | 10 | 1000 | 4716.98 | 4566.21 a 4739.34 |

### Volumen antes y después

PostgreSQL empezó con 3 usuarios, 3 habilidades, 3 simulaciones (2 publicadas), 1 evidencia y 3 comparticiones. MongoDB mantuvo 0 borradores, 2 revisiones publicadas y 1 instantánea. F3a y F3b conservaron los conteos iniciales.

| Dato | Inicio | F2 final, 1 VU | F2 final, 2 VU |
| --- | --- | --- | --- |
| Intentos (total / completados) | 4 / 3 | 104 / 103 | 204 / 203 |
| Respuestas | 5 | 205 | 405 |
| Eventos aplicados | 0 | 400 | 567 a 623 |
| Eventos pendientes | 0 | 0 | 177 a 233 |
| Eventos fallidos | 0 | 0 | 0 |
| Nodos / relaciones en Neo4j | 34 / 53 | 334 / 853 | 462 a 504 / 1192 a 1304 |

F2 devolvió `PENDING` en **1 799 respuestas (66.6 %)**. Con 1 VU, los 400 eventos de cada corrida quedaron aplicados. Con 2 VU quedaron **177 a 233 eventos pendientes de 800** en la última captura, con cero fallidos. Los rangos reflejan los conteos finales de las tres corridas y la cola seguía activa al tomar esas capturas. Con 2 VU subió el rendimiento HTTP y la respuesta final fue más rápida, mientras la cola acumuló trabajo. Las solicitudes por segundo reflejan las respuestas de la API.

El dataset pequeño, los recursos compartidos de la máquina y el límite de dos cuentas para F2 acotan la interpretación. F3 repite lecturas de una sola cuenta, evidencia o enlace. El rendimiento refleja esa localidad de datos. El issue carece de un objetivo de latencia, por lo que las métricas sirven como línea base local.

<details>
<summary>Resultados por corrida y operación</summary>

| Flujo | VU | Corrida | Operación | Solicitudes | p50 ms | p95 ms | p99 ms | Errores | Pendientes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F2 | 1 | 1 | Iniciar intento | 100 | 10.59 | 16.00 | 20.45 | 0 | 0 |
| F2 | 1 | 1 | Primera decisión | 100 | 10.85 | 15.78 | 21.23 | 0 | 0 |
| F2 | 1 | 1 | Decisión final | 100 | 18.64 | 28.02 | 33.19 | 0 | 0 |
| F2 | 1 | 2 | Iniciar intento | 100 | 7.84 | 11.15 | 13.01 | 0 | 1 |
| F2 | 1 | 2 | Primera decisión | 100 | 7.88 | 11.16 | 17.23 | 0 | 1 |
| F2 | 1 | 2 | Decisión final | 100 | 13.07 | 17.37 | 19.70 | 0 | 0 |
| F2 | 1 | 3 | Iniciar intento | 100 | 6.93 | 8.89 | 13.38 | 0 | 0 |
| F2 | 1 | 3 | Primera decisión | 100 | 7.02 | 9.29 | 12.53 | 0 | 0 |
| F2 | 1 | 3 | Decisión final | 100 | 11.32 | 14.56 | 16.15 | 0 | 0 |
| F2 | 2 | 1 | Iniciar intento | 200 | 7.94 | 12.37 | 24.92 | 0 | 199 |
| F2 | 2 | 1 | Primera decisión | 200 | 5.79 | 11.90 | 13.23 | 0 | 200 |
| F2 | 2 | 1 | Decisión final | 200 | 6.79 | 19.24 | 23.29 | 0 | 200 |
| F2 | 2 | 2 | Iniciar intento | 200 | 6.41 | 9.53 | 24.97 | 0 | 199 |
| F2 | 2 | 2 | Primera decisión | 200 | 5.45 | 9.04 | 12.35 | 0 | 200 |
| F2 | 2 | 2 | Decisión final | 200 | 6.19 | 13.53 | 24.53 | 0 | 200 |
| F2 | 2 | 3 | Iniciar intento | 200 | 6.75 | 10.36 | 23.90 | 0 | 199 |
| F2 | 2 | 3 | Primera decisión | 200 | 6.15 | 10.29 | 13.61 | 0 | 200 |
| F2 | 2 | 3 | Decisión final | 200 | 6.89 | 15.66 | 16.86 | 0 | 200 |
| F3a | 1 | 1 | Consultar perfil | 1000 | 2.53 | 3.41 | 4.32 | 0 | — |
| F3a | 1 | 1 | Detalle de evidencia | 1000 | 1.28 | 1.76 | 2.23 | 0 | — |
| F3a | 1 | 2 | Consultar perfil | 1000 | 2.40 | 3.63 | 4.65 | 0 | — |
| F3a | 1 | 2 | Detalle de evidencia | 1000 | 1.21 | 1.87 | 2.69 | 0 | — |
| F3a | 1 | 3 | Consultar perfil | 1000 | 2.33 | 3.23 | 4.21 | 0 | — |
| F3a | 1 | 3 | Detalle de evidencia | 1000 | 1.16 | 1.67 | 2.19 | 0 | — |
| F3a | 10 | 1 | Consultar perfil | 1000 | 5.70 | 8.60 | 13.06 | 0 | — |
| F3a | 10 | 1 | Detalle de evidencia | 1000 | 3.51 | 5.37 | 7.41 | 0 | — |
| F3a | 10 | 2 | Consultar perfil | 1000 | 4.93 | 6.98 | 12.99 | 0 | — |
| F3a | 10 | 2 | Detalle de evidencia | 1000 | 2.98 | 4.70 | 6.11 | 0 | — |
| F3a | 10 | 3 | Consultar perfil | 1000 | 4.97 | 7.07 | 11.82 | 0 | — |
| F3a | 10 | 3 | Detalle de evidencia | 1000 | 3.17 | 4.83 | 5.95 | 0 | — |
| F3b | 1 | 1 | Abrir enlace público | 1000 | 0.90 | 1.39 | 1.95 | 0 | — |
| F3b | 1 | 2 | Abrir enlace público | 1000 | 0.88 | 1.30 | 1.77 | 0 | — |
| F3b | 1 | 3 | Abrir enlace público | 1000 | 0.90 | 1.41 | 1.81 | 0 | — |
| F3b | 10 | 1 | Abrir enlace público | 1000 | 1.81 | 3.11 | 10.59 | 0 | — |
| F3b | 10 | 2 | Abrir enlace público | 1000 | 1.91 | 3.03 | 8.64 | 0 | — |
| F3b | 10 | 3 | Abrir enlace público | 1000 | 1.77 | 3.13 | 8.72 | 0 | — |

</details>

## Rutas medidas

| Operación | Ruta |
| --- | --- |
| Iniciar intento | `POST /api/attempts` |
| Primera decisión | `POST /api/attempts/:id/responses` |
| Decisión final | `POST /api/attempts/:id/responses` |
| Consultar perfil | `GET /api/profile` |
| Detalle de evidencia | `GET /api/evidence/:id` |
| Abrir enlace público | `GET /api/public/evidence/:token` |
