import { useState, useCallback, useMemo } from 'react'

// Typy stanu pojedynczego pola planszy
export type CellState = 'empty' | 'ship' | 'hit' | 'miss'

// Struktura jednego pola
export type Cell = {
  row: number
  col: number
  state: CellState
}

type PreviewCell = { row: number; col: number }

type BoardProps = {
  cells: Cell[][]
  onCellClick: (row: number, col: number) => void
  onCellHover?: (row: number, col: number) => void
  onBoardLeave?: () => void
  previewCells?: PreviewCell[]
  previewValid?: boolean
  // Tryb planszy przeciwnika – puste pola mają neutralny kolor zamiast różowego
  isEnemy?: boolean
}

// Litery oznaczające wiersze (A–J)
const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

// Klasy Tailwind dla każdego stanu pola
function getCellClass(state: CellState, isPreview: boolean, isEnemy: boolean): string {
  // Podgląd statku nadpisuje normalny kolor pola
  if (isPreview) return ''
  switch (state) {
    case 'empty': return isEnemy
      ? 'bg-slate-700/60 hover:bg-slate-600/80'
      : 'bg-pink-300 hover:bg-pink-400'
    case 'ship':  return 'bg-gray-400 hover:bg-gray-500'
    case 'hit':   return 'bg-red-500 hover:bg-red-600'
    case 'miss':  return 'bg-white hover:bg-gray-100'
  }
}

export default function Board({
  cells,
  onCellClick,
  onCellHover,
  onBoardLeave,
  previewCells,
  previewValid,
  isEnemy = false,
}: BoardProps) {
  // Zbiór kluczy pól z aktywną animacją wciśnięcia
  const [pressedCells, setPressedCells] = useState<Set<string>>(new Set())
  // Zbiór kluczy pól z aktywną animacją wybuchu (trafienie)
  const [explodingCells, setExplodingCells] = useState<Set<string>>(new Set())

  // Przeliczenie podglądu na Set dla wydajności
  const previewSet = useMemo(
    () => new Set(previewCells?.map((p) => `${p.row}-${p.col}`) ?? []),
    [previewCells]
  )

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
    <div
      className="inline-block select-none"
      onMouseLeave={onBoardLeave}
    >
      {/* Nagłówek z numerami kolumn */}
      <div className="flex">
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
            const isPreview   = previewSet.has(key)

            return (
              <button
                key={cell.col}
                onClick={() => handleClick(cell.row, cell.col)}
                onMouseEnter={() => onCellHover?.(cell.row, cell.col)}
                className={`
                  w-12 h-12 border border-gray-600 cursor-pointer
                  transition-colors duration-100 relative
                  flex items-center justify-center
                  ${getCellClass(cell.state, isPreview, isEnemy)}
                  ${isPressed ? 'animate-cell-press' : ''}
                `}
              >
                {/* Nakładka podglądu statku */}
                {isPreview && (
                  <div className={`absolute inset-0 transition-colors ${
                    previewValid
                      ? 'bg-cyan-400/60 border border-cyan-300/50'
                      : 'bg-red-400/60 border border-red-300/50'
                  }`} />
                )}

                {/* Krzyżyk dla pudła */}
                {cell.state === 'miss' && (
                  <span className="text-gray-400 font-bold text-xl leading-none pointer-events-none z-10">
                    ×
                  </span>
                )}

                {/* Wybuch przy trafieniu statku */}
                {isExploding && (
                  <span className="absolute inset-0 flex items-center justify-center text-2xl pointer-events-none animate-explode z-20">
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
