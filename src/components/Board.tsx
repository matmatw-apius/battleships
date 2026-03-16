import { useState, useCallback } from 'react'

// Typy stanu pojedynczego pola planszy
export type CellState = 'empty' | 'ship' | 'hit' | 'miss'

// Struktura jednego pola
export type Cell = {
  row: number
  col: number
  state: CellState
}

type BoardProps = {
  cells: Cell[][]
  onCellClick: (row: number, col: number) => void
}

// Litery oznaczające wiersze (A–J)
const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

// Klasy Tailwind dla każdego stanu pola
function getCellClass(state: CellState): string {
  switch (state) {
    case 'empty': return 'bg-pink-300 hover:bg-pink-400'
    case 'ship':  return 'bg-gray-400 hover:bg-gray-500'
    case 'hit':   return 'bg-red-500 hover:bg-red-600'
    case 'miss':  return 'bg-white hover:bg-gray-100'
  }
}

export default function Board({ cells, onCellClick }: BoardProps) {
  // Zbiór kluczy pól z aktywną animacją wciśnięcia
  const [pressedCells, setPressedCells] = useState<Set<string>>(new Set())
  // Zbiór kluczy pól z aktywną animacją wybuchu (trafienie)
  const [explodingCells, setExplodingCells] = useState<Set<string>>(new Set())

  const handleClick = useCallback((row: number, col: number) => {
    const key = `${row}-${col}`
    const currentState = cells[row][col].state

    // Uruchom animację wciśnięcia dla każdego kliknięcia
    setPressedCells(prev => new Set([...prev, key]))
    setTimeout(() => {
      setPressedCells(prev => { const n = new Set(prev); n.delete(key); return n })
    }, 220)

    // Uruchom animację wybuchu przy trafieniu statku
    if (currentState === 'ship') {
      setExplodingCells(prev => new Set([...prev, key]))
      setTimeout(() => {
        setExplodingCells(prev => { const n = new Set(prev); n.delete(key); return n })
      }, 550)
    }

    onCellClick(row, col)
  }, [cells, onCellClick])

  return (
    <div className="inline-block select-none">
      {/* Nagłówek z numerami kolumn */}
      <div className="flex">
        {/* Pusty róg nad etykietami wierszy */}
        <div className="w-9 h-9" />
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="w-12 h-9 flex items-center justify-center text-sm font-semibold text-gray-400"
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* Wiersze planszy */}
      {cells.map((row, rowIndex) => (
        <div key={rowIndex} className="flex">
          {/* Etykieta wiersza (litera) */}
          <div className="w-9 h-12 flex items-center justify-center text-sm font-semibold text-gray-400">
            {ROW_LABELS[rowIndex]}
          </div>

          {/* Pola w wierszu */}
          {row.map((cell) => {
            const key = `${cell.row}-${cell.col}`
            const isPressed   = pressedCells.has(key)
            const isExploding = explodingCells.has(key)

            return (
              <button
                key={cell.col}
                onClick={() => handleClick(cell.row, cell.col)}
                className={`
                  w-12 h-12 border border-gray-600 cursor-pointer
                  transition-colors duration-100 relative
                  flex items-center justify-center
                  ${getCellClass(cell.state)}
                  ${isPressed ? 'animate-cell-press' : ''}
                `}
              >
                {/* Krzyżyk dla pudła */}
                {cell.state === 'miss' && (
                  <span className="text-gray-400 font-bold text-xl leading-none pointer-events-none">
                    ×
                  </span>
                )}

                {/* Wybuch przy trafieniu statku */}
                {isExploding && (
                  <span className="absolute inset-0 flex items-center justify-center text-2xl pointer-events-none animate-explode z-10">
                    💥
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
