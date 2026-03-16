import { useState, useEffect, useMemo } from 'react'
import Board from './components/Board'
import ShipPanel from './components/ShipPanel'
import type { Cell, CellState } from './components/Board'
import { INITIAL_FLEET } from './components/ShipPanel'
import type { ShipType } from './components/ShipPanel'

// Inicjalizacja pustej planszy 10x10
function createEmptyBoard(): Cell[][] {
  return Array.from({ length: 10 }, (_, row) =>
    Array.from({ length: 10 }, (_, col) => ({
      row,
      col,
      state: 'empty' as CellState,
    }))
  )
}

// Oblicza pola, które zajmie statek przy podanym kursie myszy i orientacji
function computePreviewCells(
  origin: { row: number; col: number },
  size: number,
  orientation: 'h' | 'v'
) {
  return Array.from({ length: size }, (_, i) => ({
    row: orientation === 'v' ? origin.row + i : origin.row,
    col: orientation === 'h' ? origin.col + i : origin.col,
  }))
}

// Sprawdza czy rozmieszczenie statku jest poprawne (mieści się w planszy i nie nakłada)
function isPlacementValid(
  previewCells: { row: number; col: number }[],
  board: Cell[][]
): boolean {
  return previewCells.every(
    ({ row, col }) =>
      row >= 0 && row < 10 &&
      col >= 0 && col < 10 &&
      board[row][col].state === 'empty'
  )
}

export default function App() {
  const [cells, setCells]               = useState<Cell[][]>(createEmptyBoard)
  const [fleet, setFleet]               = useState<ShipType[]>(INITIAL_FLEET)
  const [selectedShipId, setSelectedShipId] = useState<string | null>('carrier')
  const [orientation, setOrientation]   = useState<'h' | 'v'>('h')
  const [hoverCell, setHoverCell]       = useState<{ row: number; col: number } | null>(null)

  // Aktualnie wybrany statek (tylko jeśli nie w pełni postawiony)
  const selectedShip = useMemo(
    () => fleet.find((s) => s.id === selectedShipId && s.placed < s.count) ?? null,
    [fleet, selectedShipId]
  )

  // Pola podglądu statku pod kursorem
  const previewCells = useMemo(
    () => selectedShip && hoverCell
      ? computePreviewCells(hoverCell, selectedShip.size, orientation)
      : [],
    [selectedShip, hoverCell, orientation]
  )

  // Czy podgląd jest w poprawnym miejscu
  const previewValid = useMemo(
    () => previewCells.length > 0 && isPlacementValid(previewCells, cells),
    [previewCells, cells]
  )

  // Klawisz R obraca statek
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'r' || e.key === 'R') {
        setOrientation((o) => (o === 'h' ? 'v' : 'h'))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Obsługa kliknięcia w pole planszy – rozmieszczanie statku
  function handleCellClick(row: number, col: number) {
    if (!selectedShip) return
    const cells_ = computePreviewCells({ row, col }, selectedShip.size, orientation)
    if (!isPlacementValid(cells_, cells)) return

    // Umieść statek na planszy
    setCells((prev) => {
      const next = prev.map((r) => r.map((c) => ({ ...c })))
      cells_.forEach(({ row: r, col: c }) => {
        next[r][c].state = 'ship'
      })
      return next
    })

    // Zaktualizuj licznik floty
    setFleet((prev) =>
      prev.map((s) =>
        s.id === selectedShip.id ? { ...s, placed: s.placed + 1 } : s
      )
    )
  }

  // Auto-wybór kolejnego niepostawionego statku po umieszczeniu
  useEffect(() => {
    const current = fleet.find((s) => s.id === selectedShipId)
    if (current && current.placed >= current.count) {
      const next = fleet.find((s) => s.placed < s.count)
      setSelectedShipId(next?.id ?? null)
    }
  }, [fleet, selectedShipId])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #0d2244 0%, #060e22 55%, #020810 100%)',
      }}
    >
      {/* Tło – animowane kółka sonaru */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="sonar-ring w-64 h-64" />
        <div className="sonar-ring w-64 h-64" />
        <div className="sonar-ring w-64 h-64" />
      </div>

      {/* Sekcja tytułowa */}
      <div className="relative z-10 flex flex-col items-center gap-2">
        <p className="text-cyan-500 text-sm font-semibold tracking-[0.3em] uppercase">
          ⚓ Gra morska
        </p>
        <h1 className="title-glow text-5xl font-black tracking-tight text-white">
          STATKI
          <span className="text-cyan-400"> · </span>
          MULTIPLAYER
        </h1>
        <p className="text-slate-400 text-sm mt-1 tracking-wide">
          Zatop flotę przeciwnika zanim on zatopi twoją
        </p>
      </div>

      {/* Obszar gry: plansza + panel */}
      <div className="relative z-10 flex gap-5 items-start">
        {/* Panel z planszą */}
        <div
          className="p-5 rounded-2xl"
          style={{
            background: 'rgba(6, 20, 45, 0.85)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            boxShadow: '0 0 40px rgba(56,189,248,0.08), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <Board
            cells={cells}
            onCellClick={handleCellClick}
            onCellHover={(row, col) => setHoverCell({ row, col })}
            onBoardLeave={() => setHoverCell(null)}
            previewCells={previewCells}
            previewValid={previewValid}
          />
        </div>

        {/* Panel boczny z flotą */}
        <ShipPanel
          fleet={fleet}
          selectedShipId={selectedShipId}
          orientation={orientation}
          onSelectShip={setSelectedShipId}
          onRotate={() => setOrientation((o) => (o === 'h' ? 'v' : 'h'))}
        />
      </div>

      {/* Podpowiedź sterowania */}
      <p className="relative z-10 text-slate-600 text-xs">
        Kliknij statek w panelu → ustaw na planszy · klawisz R obraca
      </p>
    </div>
  )
}
