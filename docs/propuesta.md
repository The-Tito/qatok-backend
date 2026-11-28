# E1. Propuesta de aplicación · QATO'K

QATO'K es una aplicación web de simulaciones laborales breves. El estudiante toma decisiones ante situaciones como un correo difícil, una reunión con prioridades en conflicto o una interrupción de servicio. Cada elección produce una consecuencia y retroalimentación. Al terminar, el estudiante puede consultar su progreso por habilidad y generar una evidencia del recorrido.

## Problema

Los estudiantes próximos a egresar y los recién egresados con poca experiencia laboral tienen pocas oportunidades para practicar cómo responder a situaciones de trabajo, observar las consecuencias de sus decisiones y explicar qué habilidades pusieron en práctica. Por ejemplo, saber cómo redactar un correo en clase aporta una base, pero responder a un cliente molesto también exige decidir qué información pedir y qué compromiso asumir.

## Usuarios y necesidades

| Usuario | Necesidad |
|---|---|
| Estudiante universitario próximo a egresar o recién egresado | Practicar en sesiones cortas, retomar una partida, recibir retroalimentación concreta, reconocer fortalezas y áreas de mejora y compartir evidencia de su recorrido. |
| Administrador | Gestionar el catálogo de habilidades y preparar escenarios con pasos, opciones y consecuencias. Validar el recorrido antes de publicar una versión y retirar del catálogo las simulaciones que ya no deben iniciar partidas nuevas. |
| Persona que recibe un enlace | Consultar la evidencia que el estudiante decidió compartir mientras el enlace esté vigente. |

## Objetivo general

Facilitar la transición al entorno laboral mediante simulaciones en las que el estudiante practique decisiones, reciba retroalimentación, observe su evolución y pueda mostrar evidencia de lo que hizo.

## Alcance y operaciones prioritarias

La entrega incluye una interfaz web adaptable, una API REST y las tres bases coordinadas por el backend. Los escenarios usan contenido preparado por administración y opciones definidas en cada paso. Quedan fuera de esta entrega la generación de diálogos libres mediante IA, la certificación oficial de competencias y los procesos de contratación.

| Flujo | Operaciones |
|---|---|
| **F1 · Cuentas, catálogo y administración** | Crear y gestionar una cuenta, iniciar sesión, consultar el catálogo publicado y administrar habilidades y simulaciones. Administración puede guardar borradores, publicar una revisión, desactivar una simulación o eliminar un borrador. |
| **F2 · Jugar** | Iniciar, retomar o abandonar un intento. Elegir una opción, ver su consecuencia y retroalimentación y completar la partida cuando la opción sea terminal. |
| **F3a · Perfil y evidencias** | Consultar nivel, evolución, fortalezas, áreas de mejora, recomendaciones y recorrido de decisiones. Generar una evidencia de un intento completado, editar su título o visibilidad y eliminarla. |
| **F3b · Compartir** | Crear o revocar enlaces a evidencias propias y consultar la vista compartida con un enlace vigente. |

## Datos necesarios

| Datos del dominio | Representación en la aplicación |
|---|---|
| Usuarios y roles, habilidades, metadatos de simulaciones, intentos, respuestas, registros de evidencia y enlaces | Registros de PostgreSQL con identificadores, referencias, estados y permisos. La asociación entre una simulación y cada habilidad registra su peso y nivel esperado. |
| Pasos, opciones, consecuencias y retroalimentación | Documentos de MongoDB con un contexto según el tipo de paso. La revisión publicada conserva el contenido que se usó durante la partida. |
| Contenido de una evidencia | Instantánea en MongoDB con el escenario, las decisiones y la retroalimentación del intento. PostgreSQL conserva su titularidad y los enlaces. |
| Conexiones entre simulaciones, pasos, opciones, intentos, habilidades y evidencias | Proyección en Neo4j que permite consultar recorridos, recomendaciones y evolución. |

## Justificación de las tres bases y prueba de suficiencia

| Modelo | Operación verificable | Capacidad que aporta |
|---|---|---|
| **Relacional · PostgreSQL** | `POST /api/attempts/:attemptId/responses`. Una respuesta terminal registra la decisión, cierra el intento y agrega los eventos de sincronización en una transacción. | Las claves y restricciones protegen la integridad del intento. La transacción confirma juntos la decisión, el cierre y los eventos, o revierte los tres. [Pruebas del modelo relacional](../tests/integration/relacional.test.ts) |
| **Documental · MongoDB** | `PUT /api/admin/simulations/:simulationId/content`. Al guardar un borrador, se valida como una unidad el contenido anidado. Por ejemplo, un correo tiene remitente y asunto y un incidente lleva una cronología de eventos. | Cada tipo de paso admite su propio contexto dentro del mismo documento. La revisión publicada permite recuperar juntos los textos, las opciones y sus consecuencias. [Pruebas del modelo documental](../tests/integration/documental.test.ts) |
| **Grafo · Neo4j** | `GET /api/profile/recommendations`. La consulta C-01 conecta el progreso del estudiante con las habilidades por reforzar y las simulaciones que las entrenan. | Las relaciones permiten recorrer y combinar el progreso, las habilidades y el catálogo para producir recomendaciones. [Consulta C-01](../database/graph/queries/C-01-recomendaciones.cypher) · [Pruebas del perfil](../tests/integration/profile.test.ts) |

## Ejemplo integrado

Al jugar un escenario, el backend identifica en PostgreSQL el intento y la revisión publicada. Lee en MongoDB el paso, valida la opción y devuelve su consecuencia y retroalimentación. PostgreSQL guarda la decisión y el evento que actualiza la proyección de Neo4j. Al consultar el perfil, la API combina los datos de la cuenta, las recomendaciones del grafo y el contenido de las evidencias recientes. Si la proyección sigue en proceso, la API informa que está pendiente y conserva la decisión confirmada. [Prueba de juego y perfil](../tests/integration/profile.test.ts) · [Arquitectura](arquitectura.md) · [Matriz de propiedad](modelos/matriz-propiedad.md)

La propuesta sigue los apartados 4.1, 4.2 y 7.1 de la guía y se basa en el dominio y el contrato vigentes. [Guía del proyecto](../context/guia/Guia_Proyecto_Final_Bases_Datos.pdf) · [KG v1.2](KG.json) · [Contrato de la API](api/contrato-v0.md)
