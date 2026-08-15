interface Props {
  titulo: string
  descripcion: string
  proximo: string[]
}

export function PlaceholderPagina({ titulo, descripcion, proximo }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-oliva-900">{titulo}</h1>
        <p className="text-sm text-oliva-700 mt-1">{descripcion}</p>
      </div>
      <div className="card p-5">
        <div className="text-xs uppercase tracking-wide text-oliva-600 mb-2">Próximas funciones</div>
        <ul className="list-disc pl-5 text-sm text-oliva-800 space-y-1">
          {proximo.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
