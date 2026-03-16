import { useState } from 'react'
import Board from './components/Board'
import type { Cell, CellState } from './components/Board'

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

// Tworzy planszę z testowym statkiem na polach B2–B4
function createTestBoard(): Cell[][] {
  const board = createEmptyBoard()
  // Testowy statek – trzy pola w pionie
  board[1][1].state = 'ship'
  board[1][2].state = 'ship'
  board[1][3].state = 'ship'
  return board
}

export default function App() {
  const [cells, setCells] = useState<Cell[][]>(createTestBoard)

  // Obsługa kliknięcia w pole planszy
  function handleCellClick(row: number, col: number) {
    setCells((prev) => {
      const next = prev.map((r) => r.map((c) => ({ ...c })))
      const cell = next[row][col]

      // Trafienie statku lub pudło
      if (cell.state === 'ship') {
        cell.state = 'hit'
      } else if (cell.state === 'empty') {
        cell.state = 'miss'
      }

      return next
    })
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-10 relative overflow-hidden"
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

      {/* Plansza w ozdobnym panelu */}
      <div
        className="relative z-10 p-5 rounded-2xl"
        style={{
          background: 'rgba(6, 20, 45, 0.85)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          boxShadow: '0 0 40px rgba(56,189,248,0.08), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <Board cells={cells} onCellClick={handleCellClick} />
      </div>

      {/* Legenda */}
      <div className="relative z-10 flex gap-6 text-xs text-slate-400">
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-pink-300 inline-block" /> Woda
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-gray-400 inline-block" /> Statek
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Trafiony
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-white inline-block" /> Pudło
        </span>
      </div>
    </div>
  )
}
