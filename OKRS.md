# Sierras de Aiguá — OKRs

Objetivos y resultados clave para ordenar el trabajo de la empresa y del
proyecto. Se revisan cada 2 semanas y se cierran al final del trimestre.

Los OKRs son la traducción priorizada de los pendientes del `ROADMAP.md`:
el roadmap dice **qué** falta, los OKRs dicen **qué de eso vamos a hacer
ahora, cuánto y quién**.

- **Escala de confianza**: 0.1 (arriesgado) — 0.5 (probable) — 0.9 (seguro).
  Cada KR arranca con una estimación y se actualiza al revisar.
- **Escala de logro**: 0.0 → 1.0. Se considera OK a partir de 0.7.
- **Owner**: el socio responsable de mover el KR. No es quien hace todo el
  trabajo, es quien reporta el estado en la revisión quincenal.
- **Cadencia**: check-in cada 2 semanas (lunes). Cierre y retro al final
  del trimestre.

---

## Q4 2026 (setiembre — diciembre)

### O1 · Cerrar el ciclo comercial completo (venta → cobro → entrega)

Que cada venta se pueda vender, cobrar, entregar y reportar sin salir de
la app y sin hojas paralelas.

| # | KR | Meta | Owner | Confianza |
|---|----|------|-------|-----------|
| KR1.1 | Reportes de ventas operativos (por período / socio / producto / cliente + ranking) | 4 reportes con filtros | Rodrigo | 0.5 |
| KR1.2 | Ficha de cliente ampliada con historial de compras y próximo seguimiento | 100 % de clientes con historial visible | Ayelén | 0.7 |
| KR1.3 | Recibo compartible por WhatsApp desde el detalle de venta | Enviado en ≥ 80 % de las ventas del mes de diciembre | Santiago | 0.5 |
| KR1.4 | Edición de ítems de venta sin anular | Flujo funcionando + 0 anulaciones "solo para editar" en diciembre | Rodrigo | 0.3 |
| KR1.5 | Buscador de cliente con autocompletado en el alta de venta | Búsqueda por nombre / teléfono en < 300 ms sobre la base real | Rodrigo | 0.7 |

### O2 · Tener visibilidad financiera real de la empresa

Salir del placeholder de Gastos / Contabilidad y llegar a un estado de
resultados mensual confiable para Rodrigo y Santi.

| # | KR | Meta | Owner | Confianza |
|---|----|------|-------|-----------|
| KR2.1 | Módulo **Mis gastos** funcionando para todos los socios (alta + listado + comprobante) | 100 % de los gastos personales de noviembre cargados en la app | Santiago | 0.7 |
| KR2.2 | Módulo **Contabilidad** con estado de resultados mensual (ingresos vs egresos) | Estado de resultados de octubre y noviembre generados desde la app | Rodrigo | 0.3 |
| KR2.3 | Cálculo de IVA aportado vs recibido (separar venta con / sin factura) | Reporte mensual coincidiendo con lo del contador dentro de ± 2 % | Rodrigo | 0.5 |
| KR2.4 | Export a Excel/CSV de gastos e ingresos para el contador | 1 export mensual entregado en tiempo y forma en oct / nov / dic | Santiago | 0.7 |
| KR2.5 | Comprobantes adjuntos en Supabase Storage | ≥ 80 % de los gastos > $500 con comprobante adjunto | Santiago | 0.5 |

### O3 · Optimizar la operación de stock y producción

Que el stock real y el stock del sistema coincidan siempre, y que
tengamos señales tempranas de faltantes.

| # | KR | Meta | Owner | Confianza |
|---|----|------|-------|-----------|
| KR3.1 | Stock envasado inicial real cargado (Picual, blends envasados, miel, jabón, aceitunas) | Diferencia < 5 % vs conteo físico al 30-sep | Gonzalo | 0.7 |
| KR3.2 | Alertas por email cuando una presentación cae bajo `stock_minimo` | 100 % de faltantes detectados < 24 h después del cruce | Rodrigo | 0.5 |
| KR3.3 | Reporte de rendimiento por campaña (litros producidos → envasados → vendidos) | Reporte disponible para campañas 2024 y 2025 | Rodrigo | 0.3 |
| KR3.4 | Snapshot histórico de contenido en `movimientos_granel` (no depender del tanque actual) | Movimientos anteriores muestran el contenido original en el 100 % de los casos | Rodrigo | 0.5 |
| KR3.5 | Etiquetas de lote imprimibles (QR + datos clave) para depósito | Etiqueta impresa en ≥ 50 % de las envasadas del trimestre | Santiago | 0.3 |

### O4 · Empoderar al equipo con datos y autogestión

Que cada socio entre a la app y vea lo suyo sin tener que preguntar; y
que Rodrigo/Santi puedan administrar usuarios sin SQL.

| # | KR | Meta | Owner | Confianza |
|---|----|------|-------|-----------|
| KR4.1 | Dashboard real con KPIs (ventas del mes, ventas por socio, granel disponible, stock bajo, envíos pendientes) | 7 KPIs vivos, cargados en < 2 s | Rodrigo | 0.5 |
| KR4.2 | Alta de Santi, Gonzalo y Ayelén como usuarios reales con su rol correcto | 3/3 con login propio antes del 15-set | Rodrigo | 0.9 |
| KR4.3 | Gestión de usuarios desde la UI (crear / cambiar rol / desactivar) | 0 operaciones de usuarios hechas por SQL después del 1-nov | Rodrigo | 0.5 |
| KR4.4 | Registro de auditoría (quién cambió qué y cuándo) sobre ventas, stock y precios | Auditoría activa en las 3 tablas críticas | Rodrigo | 0.3 |
| KR4.5 | Recuperación y cambio de contraseña desde la propia app | Flujo probado por los 4 socios | Rodrigo | 0.7 |

### O5 · Institucionalizar la gestión de tareas del proyecto

Que el roadmap deje de ser una lista de deseos y pase a ser un plan con
cadencia, dueños y métrica de avance. Este OKR es "meta": mejora el
manejo de las tareas de la empresa.

| # | KR | Meta | Owner | Confianza |
|---|----|------|-------|-----------|
| KR5.1 | Check-in quincenal (lunes) de OKRs y roadmap con los 4 socios | 6/6 reuniones del trimestre hechas (< 30 min) | Santiago | 0.9 |
| KR5.2 | Cada pendiente del roadmap tiene owner y prioridad (P0/P1/P2) | 100 % de los ítems `[ ]` etiquetados antes del 15-set | Rodrigo | 0.9 |
| KR5.3 | Métrica de flujo: tareas cerradas vs abiertas del trimestre | ≥ 60 % de los P0 cerrados al 20-dic | Rodrigo | 0.5 |
| KR5.4 | Registro de decisiones (ADR corto) por cambio transversal | 1 ADR por cada decisión que afecte más de un área | Santiago | 0.5 |
| KR5.5 | Retro trimestral de OKRs escrita y guardada en el repo | 1 retro al 20-dic con score por KR y lecciones | Rodrigo | 0.9 |

---

## Reglas del juego

1. **No más de 5 objetivos por trimestre**. Si aparece algo nuevo que
   entra a un objetivo, se agrega como KR; si no encaja, se apunta al
   roadmap y se decide en la próxima planificación.
2. **KR sin número no es KR**. Todo KR se puede medir en la fecha de
   cierre con un sí / no o un porcentaje.
3. **Un pendiente del roadmap sin owner no arranca**. La única forma de
   que algo se mueva es que alguien lo tome.
4. **La confianza baja no descalifica**. Un KR 0.3 puede quedarse si
   es estratégico — pero se acepta que puede no cerrarse.
5. **Todo lo que no está en OKRs sigue en el roadmap** como backlog. Los
   OKRs son el foco del trimestre, no toda la lista.

---

## Cadencia

- **Check-in quincenal (lunes, 30 min)**: cada owner reporta score y
  confianza actual por KR. Sin discusión de solución — solo estado.
- **Ajuste mensual (último lunes del mes, 60 min)**: se decide si algún
  KR cambia de owner, se re-prioriza o se descarta.
- **Cierre trimestral (última semana, 90 min)**: score final, retro
  escrita, propuesta de OKRs del trimestre siguiente.

---

## Cómo se relaciona con el roadmap

- Los OKRs no reemplazan al `ROADMAP.md`. El roadmap es el estado del
  proyecto por área; los OKRs son el compromiso del trimestre.
- Cuando un KR se cierra, el pendiente correspondiente del roadmap se
  marca como hecho.
- Cuando aparece trabajo nuevo, va primero al roadmap. Recién en el
  próximo trimestre se decide si entra a OKRs.
