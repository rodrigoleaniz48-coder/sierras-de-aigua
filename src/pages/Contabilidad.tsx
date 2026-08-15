import { PlaceholderPagina } from '../components/PlaceholderPagina'

export function Contabilidad() {
  return (
    <PlaceholderPagina
      titulo="Contabilidad general"
      descripcion="Ingresos y egresos de la empresa (aceituna, envases, etiquetas, servicios, etc.). Solo administración."
      proximo={[
        'Alta de egresos con categoría, IVA y comprobante.',
        'Ingresos derivados automáticamente de ventas.',
        'Estado de resultados simple por período.',
        'Exportación CSV/Excel para pasarle al contador.',
      ]}
    />
  )
}
