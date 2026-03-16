import { useState, useEffect, useMemo } from 'react'
import Board from './components/Board'
import ShipPanel from './components/ShipPanel'
import type { Cell, CellState } from './components/Board'
import { INITIAL_FLEET } from './components/ShipPanel'
import type { ShipType } from './components/ShipPanel'
import { supabase } from './lib/supabase'

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

// Fazy gry
type GamePhase = 'placement' | 'ready'

export default function App() {
  const [cells, setCells]               = useState<Cell[][]>(createEmptyBoard)
  const [fleet, setFleet]               = useState<ShipType[]>(INITIAL_FLEET)
  const [selectedShipId, setSelectedShipId] = useState<string | null>('carrier')
  const [orientation, setOrientation]   = useState<'h' | 'v'>('h')
  const [hoverCell, setHoverCell]       = useState<{ row: number; col: number } | null>(null)
  const [gamePhase, setGamePhase]       = useState<GamePhase>('placement')
  const [gamesCount, setGamesCount]     = useState<number | null>(null)

  // Test połączenia z Supabase – pobierz liczbę rekordów z tabeli games
  useEffect(() => {
    supabase
      .from('games')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (error) console.error('Błąd połączenia z Supabase:', error.message)
        else setGamesCount(count ?? 0)
      })
  }, [])

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

  // Powód, dla którego nie można postawić statku w danym miejscu
  const placementError = useMemo(() => {
    if (!selectedShip || !hoverCell || previewCells.length === 0 || previewValid) return null

    const outOfBounds = previewCells.some(
      ({ row, col }) => row < 0 || row >= 10 || col < 0 || col >= 10
    )
    if (outOfBounds) return 'Statek wykracza poza planszę'

    const overlaps = previewCells.some(
      ({ row, col }) =>
        row >= 0 && row < 10 && col >= 0 && col < 10 &&
        cells[row][col].state !== 'empty'
    )
    if (overlaps) return 'Statki nie mogą się nakładać'

    return 'Nieprawidłowa pozycja'
  }, [selectedShip, hoverCell, previewValid, previewCells, cells])

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
      {/* Badge połączenia z Supabase */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
        style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.2)' }}
      >
        <span className={`w-2 h-2 rounded-full ${gamesCount !== null ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
        <span className="text-slate-400">
          {gamesCount === null ? 'Łączenie…' : `Supabase OK · ${gamesCount} gier`}
        </span>
      </div>

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
          placementError={placementError}
          onSelectShip={setSelectedShipId}
          onRotate={() => setOrientation((o) => (o === 'h' ? 'v' : 'h'))}
          onReady={() => setGamePhase('ready')}
        />
      </div>

      {/* Podpowiedź sterowania lub ekran oczekiwania */}
      {gamePhase === 'placement' ? (
        <p className="relative z-10 text-slate-600 text-xs">
          Kliknij statek w panelu → ustaw na planszy · klawisz R obraca
        </p>
      ) : (
        <div
          className="relative z-10 flex flex-col items-center gap-3 px-10 py-6 rounded-2xl"
          style={{
            background: 'rgba(6, 20, 45, 0.9)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            boxShadow: '0 0 40px rgba(56,189,248,0.12)',
          }}
        >
          {/* Animowana ikona ładowania */}
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-cyan-400"
                style={{ animation: `sonar 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
          <p className="text-cyan-300 font-semibold text-sm tracking-wide">
            Czekam na przeciwnika…
          </p>
          <button
            onClick={() => setGamePhase('placement')}
            className="text-slate-500 text-xs hover:text-slate-300 transition-colors underline underline-offset-2"
          >
            Wróć i zmień ustawienie floty
          </button>
        </div>
      )}
    </div>
  )
}
