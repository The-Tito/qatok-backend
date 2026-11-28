# E8. Rendimiento · 27 de noviembre de 2026

**Versión probada** `qatok-backend@d843833`. **Resultado** 24 solicitudes medidas y 0 errores en la corrida corta de F2, F3a y F3b. [Entorno y dataset](README.md#entorno-de-la-corrida) · [Escenarios k6](../../tests/performance/benchmark.mjs)

## Condiciones

- k6 2.4.0 en el host. API local con `NODE_ENV=test` y procesador de sincronización activo. PostgreSQL 16.16, MongoDB 7.0.48 y Neo4j 5.26.33 en Docker.
- Un escenario por corrida, con dos usuarios virtuales y cuatro iteraciones totales en cada escenario. Antes de cada corrida se reconstruyeron las tres bases desde el dataset. La salud y la autenticación se comprobaron antes de la medición.
- Se verificó el estado HTTP y el contenido esperado de cada respuesta. F2 inicia y termina una partida en dos decisiones. F3a consulta el perfil y una evidencia. F3b abre una evidencia mediante un enlace vigente.

## Mediciones

Las latencias son milisegundos por operación. Cada percentil se calcula sobre cuatro solicitudes de la corrida corta.

| Flujo | Operación | Solicitudes | p50 | p95 | p99 | Errores |
|---|---|---:|---:|---:|---:|---:|
| F2 | Iniciar intento | 4 | 59.07 | 138.23 | 143.43 | 0 |
| F2 | Registrar primera decisión | 4 | 13.51 | 15.50 | 15.52 | 0 |
| F2 | Completar intento | 4 | 16.20 | 71.05 | 78.14 | 0 |
| F3a | Consultar perfil | 4 | 68.52 | 128.29 | 128.30 | 0 |
| F3a | Consultar evidencia | 4 | 4.29 | 9.47 | 10.09 | 0 |
| F3b | Consultar evidencia pública | 4 | 4.81 | 6.37 | 6.51 | 0 |

En F2, 11 de las 12 respuestas informaron `PENDING` para la proyección. Al terminar el seguimiento, PostgreSQL tenía **16 eventos aplicados, 0 pendientes y 0 fallidos**. Se agregaron cuatro intentos completados y ocho respuestas. En F3a y F3b los conteos de las tres bases se mantuvieron.

La corrida corta sirve para comprobar los flujos en el commit de entrega. El ensayo de carga del **25 de noviembre**, con el commit y el dataset registrados en su propio informe, documenta 18 corridas y 20 700 solicitudes sin errores. [Informe de carga](rendimiento.md)

## Reproducción

Desde la raíz del backend, con Docker activo, `.env` local y k6 instalado:

```bash
resultados=$(mktemp -d)
bash tests/performance/run.sh smoke "$resultados"
```

El ejecutor usa por defecto los puertos locales 14000, 15433, 37018 y 17688. En esta corrida, el puerto de MongoDB 37018 ya estaba ocupado. Se repitió el comando con una copia temporal del ejecutor que usó 47018 para MongoDB y conservó la misma carga y configuración de los demás componentes. El ejecutor retira los contenedores y volúmenes de su proyecto temporal. [Ejecutor](../../tests/performance/run.sh)
