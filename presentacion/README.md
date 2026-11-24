# Presentación de la propuesta QATO'K

Material para preparar y dar la presentación. Todo se basa en los entregables de `entregables/` y en `docs/KG.json` v1.1.

| Material | Archivo en el repo | Versión en línea |
|---|---|---|
| Guía de estudio | [guia-estudio.md](guia-estudio.md) | [Guía de estudio — Propuesta QATO'K](https://claude.ai/artifact/AAsS7EuZKUoT39dzWBzM2X) (documento editable de Claude Docs) |
| Diapositivas (13) | [diapositivas/](diapositivas/) contiene el deck y el HTML de cada diapositiva con notas del orador | [Propuesta QATO'K — diapositivas](https://claude.ai/artifact/KSFF9u4bSJv8uy3BfmBbG1) |
| Explicación sencilla del proyecto | [qatok-explicado.md](qatok-explicado.md) y [simulacion-ramas.png](simulacion-ramas.png) | [QATO'K explicado](https://claude.ai/artifact/SdgJZVNVamMfLJSwNDKZcy) (documento de Claude Docs) |
| Guion de exposición (máximo 10 minutos, dos expositores) | [guion-exposicion.md](guion-exposicion.md) | [Guion de exposición — QATO'K](https://claude.ai/artifact/AZXz7mngDdLzMrFgSCUXZJ) (documento de Claude Docs) |
| Modelo lógico interactivo (12 pasos animados con botones Anterior y Siguiente; también responde a las flechas del teclado) | `modelo-logico-interactivo.html` (se abre con doble clic en cualquier navegador) | [Modelo lógico QATO'K](https://claude.ai/artifact/Pw4RHJs8ey19vbNXwH5VAB) |
| Diagrama de las tres zonas | `modelo-tres-zonas.png` | — |

Las exportaciones PDF, DOCX y PPTX se guardan en local. Desde la raíz del repositorio, los scripts `node scripts/diapositivas2pdf.js` y `node scripts/diapositivas2pptx.js` generan copias locales de las diapositivas con Playwright y pptxgenjs. Para las guías y el guion, se pueden usar las fuentes Markdown o la exportación del documento en línea.

**Importante:** los enlaces en línea son privados hasta que su dueño los comparta desde el menú *Share* de cada página. Para presentar sin conexión, las diapositivas se descargan como PowerPoint o PDF desde el menú *Share › Export* de la página del deck.

## Orden de las diapositivas

| # | Diapositiva | Sección |
|---|---|---|
| 1 | Portada | La idea |
| 2 | El problema: la brecha entre estudiar y trabajar | La idea |
| 3 | La solución en 5 pasos | La idea |
| 4 | Tres zonas unidas por Habilidad | El modelo y por qué un grafo |
| 5 | Por qué una base de datos orientada a grafos | El modelo y por qué un grafo |
| 6 | Una consulta, un recorrido (C-03) | El modelo y por qué un grafo |
| 7 | Los siete entregables | Entregables |
| 8 | El modelo lógico completo | Entregables |
| 9 | Quién garantiza cada regla (restricciones y cardinalidades) | Entregables |
| 10 | Pruebas de humo en Neo4j: lo esperado contra lo obtenido | Entregables |
| 11 | Decisiones de modelado clave | Decisiones y cierre |
| 12 | Limitaciones conocidas y pendientes | Decisiones y cierre |
| 13 | Conclusión | Decisiones y cierre |

Las diapositivas usan una paleta sin azules (carbón, crema y naranja), como en los documentos .docx.
