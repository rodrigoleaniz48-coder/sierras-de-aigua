import { PlaceholderPagina } from '../components/PlaceholderPagina'

export function Gastos() {
  return (
    <PlaceholderPagina
      titulo="Mis gastos"
      descripcion="Cada socio carga sus gastos personales del mes. Todos ven los del resto (transparencia)."
      proximo={[
        'Alta rápida desde celular: categoría, monto, foto del comprobante.',
        'Resumen mensual por socio y por categoría.',
        'Filtros por período y exportación CSV.',
      ]}
    />
  )
}
