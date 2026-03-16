import { useState, useEffect, useMemo, useCallback } from 'react'
import Board from './components/Board'
import ShipPanel from './components/ShipPanel'
import Lobby from './components/Lobby'
import GameScreen from './components/GameScreen'
import type { Cell, CellState } from './components/Board'
import { INITIAL_FLEET } from './components/ShipPanel'
import type { ShipType } from './components/ShipPanel'
import type { PlacedShip } from './types/game'
import { supabase } from './lib/supabase'

// ─── Pomocnicze funkcje ──────────────────────────────────────────────────────

function createEmptyBoard(): Cell[][] {
  return Array.from({ length: 10 }, (_, row) =>
    Array.from({ length: 10 }, (_, col) => ({ row, col, state: 'empty' as CellState }))
  )
}

function computePreviewCells(origin: { row: number; col: number }, size: number, orientation: 'h' | 'v') {
  return Array.from({ length: size }, (_, i) => ({
    row: orientation === 'v' ? origin.row + i : origin.row,
    col: orientation === 'h' ? origin.col + i : origin.col,
  }))
}

function isPlacementValid(previewCells: { row: number; col: number }[], board: Cell[][]): boolean {
  return previewCells.every(
    ({ row, col }) => row >= 0 && row < 10 && col >= 0 && col < 10 && board[row][col].state === 'empty'
  )
}

// ─── Typy ────────────────────────────────────────────────────────────────────

type GamePhase = 'lobby' | 'placement' | 'waiting' | 'battle'

type GameContext = {
  gameId: string
  playerId: string
  username: string
}

// ─── Komponent główny ────────────────────────────────────────────────────────

export default function App() {
  const [gamePhase, setGamePhase]   = useState<GamePhase>('lobby')
  const [gameCtx, setGameCtx]       = useState<GameContext | null>(null)
  const [gamesCount, setGamesCount] = useState<number | null>(null)

  // Stan planszy i floty
  const [cells, setCells]               = useState<Cell[][]>(createEmptyBoard)
  const [fleet, setFleet]               = useState<ShipType[]>(INITIAL_FLEET)
  const [placedShipDetails, setPlacedShipDetails] = useState<PlacedShip[]>([])
  const [selectedShipId, setSelectedShipId] = useState<string | null>('carrier')
  const [orientation, setOrientation]   = useState<'h' | 'v'>('h')
  const [hoverCell, setHoverCell]       = useState<{ row: number; col: number } | null>(null)

  // Test połączenia z Supabase
  useEffect(() => {
    supabase
      .from('games')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (error) console.error('Błąd połączenia z Supabase:', error.message)
        else setGamesCount(count ?? 0)
      })
  }, [])

  // Callback z Lobby – gra gotowa, przechodzimy do ustawiania statków
  const handleGameReady = useCallback((gameId: string, playerId: string, username: string) => {
    setGameCtx({ gameId, playerId, username })
    setGamePhase('placement')
  }, [])

  // Powrót do lobby – reset całego stanu gry
  const handleReturnToLobby = useCallback(() => {
    setGamePhase('lobby')
    setGameCtx(null)
    setCells(createEmptyBoard())
    setFleet(INITIAL_FLEET)
    setPlacedShipDetails([])
    setSelectedShipId('carrier')
    setOrientation('h')
    setHoverCell(null)
  }, [])

  // Regrywka z tym samym przeciwnikiem – reset planszy, nowe gameId, wróć do placement
  const handleRematch = useCallback((newGameId: string) => {
    setGameCtx(prev => prev ? { ...prev, gameId: newGameId } : null)
    setCells(createEmptyBoard())
    setFleet(INITIAL_FLEET)
    setPlacedShipDetails([])
    setSelectedShipId('carrier')
    setOrientation('h')
    setHoverCell(null)
    setGamePhase('placement')
  }, [])

  // ─── Logika ustawiania statków ───────────────────────────────────────────

  const selectedShip = useMemo(
    () => fleet.find(s => s.id === selectedShipId && s.placed < s.count) ?? null,
    [fleet, selectedShipId]
  )

  const previewCells = useMemo(
    () => selectedShip && hoverCell ? computePreviewCells(hoverCell, selectedShip.size, orientation) : [],
    [selectedShip, hoverCell, orientation]
  )

  const previewValid = useMemo(
    () => previewCells.length > 0 && isPlacementValid(previewCells, cells),
    [previewCells, cells]
  )

  const placementError = useMemo(() => {
    if (!selectedShip || !hoverCell || previewCells.length === 0 || previewValid) return null
    if (previewCells.some(({ row, col }) => row < 0 || row >= 10 || col < 0 || col >= 10))
      return 'Statek wykracza poza planszę'
    if (previewCells.some(({ row, col }) => row >= 0 && row < 10 && col >= 0 && col < 10 && cells[row][col].state !== 'empty'))
      return 'Statki nie mogą się nakładać'
    return 'Nieprawidłowa pozycja'
  }, [selectedShip, hoverCell, previewValid, previewCells, cells])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'r' || e.key === 'R') setOrientation(o => o === 'h' ? 'v' : 'h')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  function handleCellClick(row: number, col: number) {
    if (!selectedShip) return
    const cells_ = computePreviewCells({ row, col }, selectedShip.size, orientation)
    if (!isPlacementValid(cells_, cells)) return

    setCells(prev => {
      const next = prev.map(r => r.map(c => ({ ...c })))
      cells_.forEach(({ row: r, col: c }) => { next[r][c].state = 'ship' })
      return next
    })
    setFleet(prev => prev.map(s => s.id === selectedShip.id ? { ...s, placed: s.placed + 1 } : s))

    // Zapisz szczegóły statku (potrzebne przy zapisie do Supabase)
    setPlacedShipDetails(prev => [...prev, {
      shipId: selectedShip.id,
      name: selectedShip.name,
      size: selectedShip.size,
      cells: cells_,
    }])
  }

  useEffect(() => {
    const current = fleet.find(s => s.id === selectedShipId)
    if (current && current.placed >= current.count) {
      const next = fleet.find(s => s.placed < s.count)
      setSelectedShipId(next?.id ?? null)
    }
  }, [fleet, selectedShipId])

  // ─── Obsługa przycisku "Gotowy" ──────────────────────────────────────────

  async function handleReady() {
    if (!gameCtx) return
    setGamePhase('waiting')

    // Zapisz planszę z rozstawionymi statkami do Supabase
    await supabase.from('boards').upsert({
      game_id: gameCtx.gameId,
      player_id: gameCtx.playerId,
      ships: placedShipDetails,
      is_ready: true,
    }, { onConflict: 'game_id,player_id' })

    // Sprawdź czy oba plansze są już gotowe
    const { data: boards } = await supabase
      .from('boards').select('is_ready').eq('game_id', gameCtx.gameId)

    if (boards?.length === 2 && boards.every(b => b.is_ready)) {
      // Oboje gotowi – załaduj grę i rozpocznij bitwę
      const { data: game } = await supabase
        .from('games').select('player1_id').eq('id', gameCtx.gameId).single()

      await supabase.from('games')
        .update({ status: 'battle', current_turn: game?.player1_id })
        .eq('id', gameCtx.gameId)
        .eq('status', 'placement') // zabezpieczenie przed warunkiem wyścigu
    }
  }

  // Subskrypcja Realtime w fazie oczekiwania – czeka na status 'battle'
  useEffect(() => {
    if (gamePhase !== 'waiting' || !gameCtx) return

    const channel = supabase
      .channel(`waiting:${gameCtx.gameId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCtx.gameId}` },
        (payload) => {
          if ((payload.new as { status: string }).status === 'battle') setGamePhase('battle')
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gamePhase, gameCtx])

  // ─── Renderowanie ─────────────────────────────────────────────────────────

  if (gamePhase === 'lobby') return <Lobby onGameReady={handleGameReady} />

  if (gamePhase === 'battle' && gameCtx) {
    return (
      <GameScreen
        gameId={gameCtx.gameId}
        myPlayerId={gameCtx.playerId}
        myShips={placedShipDetails}
        onReturnToLobby={handleReturnToLobby}
        onRematch={handleRematch}
      />
    )
  }

  const bgStyle = { background: 'radial-gradient(ellipse at 50% 40%, #0d2244 0%, #060e22 55%, #020810 100%)' }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 relative overflow-hidden" style={bgStyle}>

      {/* Badge połączenia z Supabase */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
        style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.2)' }}>
        <span className={`w-2 h-2 rounded-full ${gamesCount !== null ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
        <span className="text-slate-400">{gamesCount === null ? 'Łączenie…' : `Supabase OK · ${gamesCount} gier`}</span>
      </div>

      {/* Nick gracza */}
      {gameCtx && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
          style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.2)' }}>
          <span className="text-cyan-400">⚓</span>
          <span className="text-slate-300 font-medium">{gameCtx.username}</span>
        </div>
      )}

      {/* Tło sonaru */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" />
      </div>

      {/* Tytuł */}
      <div className="relative z-10 flex flex-col items-center gap-2">
        <p className="text-cyan-500 text-sm font-semibold tracking-[0.3em] uppercase">⚓ Gra morska</p>
        <h1 className="title-glow text-5xl font-black tracking-tight text-white">
          STATKI<span className="text-cyan-400"> · </span>MULTIPLAYER
        </h1>
        <p className="text-slate-400 text-sm mt-1 tracking-wide">Zatop flotę przeciwnika zanim on zatopi twoją</p>
      </div>

      {/* Obszar gry (placement) */}
      {gamePhase === 'placement' && (
        <>
          <div className="relative z-10 flex gap-5 items-start">
            <div className="p-5 rounded-2xl" style={{
              background: 'rgba(6,20,45,0.85)',
              border: '1px solid rgba(56,189,248,0.2)',
              boxShadow: '0 0 40px rgba(56,189,248,0.08), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}>
              <Board
                cells={cells}
                onCellClick={handleCellClick}
                onCellHover={(row, col) => setHoverCell({ row, col })}
                onBoardLeave={() => setHoverCell(null)}
                previewCells={previewCells}
                previewValid={previewValid}
              />
            </div>
            <ShipPanel
              fleet={fleet}
              selectedShipId={selectedShipId}
              orientation={orientation}
              placementError={placementError}
              onSelectShip={setSelectedShipId}
              onRotate={() => setOrientation(o => o === 'h' ? 'v' : 'h')}
              onReady={handleReady}
            />
          </div>
          <p className="relative z-10 text-slate-600 text-xs">
            Kliknij statek w panelu → ustaw na planszy · klawisz R obraca
          </p>
        </>
      )}

      {/* Ekran oczekiwania na przeciwnika */}
      {gamePhase === 'waiting' && (
        <div className="relative z-10 flex flex-col items-center gap-3 px-10 py-6 rounded-2xl"
          style={{ background: 'rgba(6,20,45,0.9)', border: '1px solid rgba(56,189,248,0.3)', boxShadow: '0 0 40px rgba(56,189,248,0.12)' }}>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-cyan-400"
                style={{ animation: `sonar 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
          <p className="text-cyan-300 font-semibold text-sm tracking-wide">Czekam aż przeciwnik ustawi flotę…</p>
          <p className="text-slate-600 text-xs">Gra rozpocznie się automatycznie</p>
        </div>
      )}
    </div>
  )
}
