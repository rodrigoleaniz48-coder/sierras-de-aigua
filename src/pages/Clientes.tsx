import { PlaceholderPagina } from '../components/PlaceholderPagina'

export function Clientes() {
  return (
    <PlaceholderPagina
      titulo="Clientes"
      descripcion="Base compartida (todos los socios ven). CRM básico + preparado para importar histórico."
      proximo={[
        'Ficha de cliente: contacto, tipo (minorista/mayorista/…), socio asignado.',
        'Historial de compras y frecuencia.',
        'Seguimientos con recordatorios (los que crea marketing también).',
        'Importador de CSV/Excel para cargar el histórico de Google Drive.',
      ]}
    />
  )
}
