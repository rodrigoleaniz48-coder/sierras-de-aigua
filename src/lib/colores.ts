// Paleta por producto — tonos claros para diferenciar variedades en Stock.
// Verde = Blend suave · Rojo = Blend intenso · Azul = Picual · Amarillo = resto.

export type ColorProducto = {
  card: string   // fondo suave + borde para tarjetas/rows
  fill: string   // gradiente para la barra del tanque
  chip: string   // píldora chica de identificación
  dot: string    // punto de color en lugares chicos
}

const paleta: Record<string, ColorProducto> = {
  verde: {
    card: 'bg-green-50 border-green-200',
    fill: 'bg-gradient-to-t from-green-400 to-green-300',
    chip: 'bg-green-100 text-green-800',
    dot:  'bg-green-400',
  },
  rojo: {
    card: 'bg-red-50 border-red-200',
    fill: 'bg-gradient-to-t from-red-400 to-red-300',
    chip: 'bg-red-100 text-red-800',
    dot:  'bg-red-400',
  },
  azul: {
    card: 'bg-blue-50 border-blue-200',
    fill: 'bg-gradient-to-t from-blue-400 to-blue-300',
    chip: 'bg-blue-100 text-blue-800',
    dot:  'bg-blue-400',
  },
  amarillo: {
    card: 'bg-amber-50 border-amber-200',
    fill: 'bg-gradient-to-t from-amber-400 to-amber-300',
    chip: 'bg-amber-100 text-amber-800',
    dot:  'bg-amber-400',
  },
  gris: {
    card: 'bg-oliva-50 border-oliva-200',
    fill: 'bg-gradient-to-t from-oliva-300 to-oliva-200',
    chip: 'bg-oliva-100 text-oliva-700',
    dot:  'bg-oliva-300',
  },
}

/**
 * Devuelve el color asociado a un producto según su nombre.
 * Vacío / null => gris.
 */
export function colorProducto(nombre?: string | null): ColorProducto {
  if (!nombre) return paleta.gris
  const n = nombre.toLowerCase()
  if (n.includes('suave'))   return paleta.verde
  if (n.includes('intenso')) return paleta.rojo
  if (n.includes('picual'))  return paleta.azul
  return paleta.amarillo
}
