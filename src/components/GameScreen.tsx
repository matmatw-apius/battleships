import { useState, useEffect, useCallback } from 'react'
import Board from './Board'
import type { Cell, CellState } from './Board'
import { supabase } from '../lib/supabase'
import type { PlacedShip, ShotRecord, GameRow } from '../types/game'

type GameScreenProps = {
  gameId: string
  myPlayerId: string
  myShips: PlacedShip[]
}

// ─── Pomocnicze funkcje budowania planszy ───────────────────────────────────

function createEmptyBoard(): Cell[][] {
  return Array.from({ length: 10 }, (_, row) =>
    Array.from({ length: 10 }, (_, col) => ({ row, col, state: 'empty' as CellState }))
  )
}

// Buduję moją planszę: moje statki + trafienia przeciwnika
function buildMyBoard(myShips: PlacedShip[], opponentShots: ShotRecord[]): Cell[][] {
  const board = createEmptyBoard()
  myShips.forEach(ship =>
    ship.cells.forEach(({ row, col }) => { board[row][col].state = 'ship' })
  )
  opponentShots.forEach(shot => {
    board[shot.row][shot.col].state = shot.result === 'miss' ? 'miss' : 'hit'
  })
  return board
}

// Buduję planszę przeciwnika: tylko moje strzały (bez widocznych statków)
function buildEnemyBoard(myShots: ShotRecord[]): Cell[][] {
  const board = createEmptyBoard()
  myShots.forEach(shot => {
    board[shot.row][shot.col].state = shot.result === 'miss' ? 'miss' : 'hit'
  })
  return board
}

// ─── Fleet Tracker: podgląd statków przeciwnika ─────────────────────────────

function FleetTracker({ opponentShips, myShots }: { opponentShips: PlacedShip[], myShots: ShotRecord[] }) {
  const hitCells = new Set(
    myShots.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`)
  )

  return (
    <div
      className="flex flex-wrap gap-3 p-4 rounded-2xl"
      style={{
        background: 'rgba(6,20,45,0.85)',
        border: '1px solid rgba(56,189,248,0.2)',
      }}
    >
      <p className="w-full text-xs font-semibold text-cyan-500 tracking-widest uppercase mb-1">
        Flota przeciwnika
      </p>
      {opponentShips.map(ship => {
        const isSunk = ship.cells.every(c => hitCells.has(`${c.row}-${c.col}`))
        return (
          <div
            key={ship.shipId}
            className={`flex flex-col gap-1 transition-opacity ${isSunk ? 'opacity-40' : ''}`}
          >
            {/* Bloki reprezentujące komórki statku */}
            <div className="flex gap-0.5">
              {ship.cells.map((cell, i) => (
                <div
                  key={i}
                  className={`h-3.5 w-5 rounded-sm transition-colors ${
                    hitCells.has(`${cell.row}-${cell.col}`) ? 'bg-red-500' : 'bg-gray-500'
                  }`}
                />
              ))}
            </div>
            {/* Nazwa z ikoną zatopienia */}
            <span className={`text-xs ${isSunk ? 'text-green-400 line-through' : 'text-slate-400'}`}>
              {ship.name} {isSunk ? '✓' : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Główny komponent ekranu gry ─────────────────────────────────────────────

type Toast = { text: string; type: 'info' | 'success' | 'error' }

export default function GameScreen({ gameId, myPlayerId, myShips }: GameScreenProps) {
  const [myBoard, setMyBoard]           = useState<Cell[][]>(() => buildMyBoard(myShips, []))
  const [enemyBoard, setEnemyBoard]     = useState<Cell[][]>(createEmptyBoard)
  const [opponentShips, setOpponentShips] = useState<PlacedShip[]>([])
  const [allShots, setAllShots]         = useState<ShotRecord[]>([])
  const [currentTurn, setCurrentTurn]   = useState('')
  const [opponentId, setOpponentId]     = useState('')
  const [gameStatus, setGameStatus]     = useState('battle')
  const [winnerId, setWinnerId]         = useState<string | null>(null)
  const [toast, setToast]               = useState<Toast | null>(null)
  const [loading, setLoading]           = useState(true)

  const isMyTurn = currentTurn === myPlayerId
  const myShots  = allShots.filter(s => s.player_id === myPlayerId)

  function showToast(text: string, type: Toast['type'] = 'info') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 2500)
  }

  // ─── Inicjalizacja: ładowanie danych gry ──────────────────────────────────

  useEffect(() => {
    async function init() {
      // Szczegóły gry
      const { data: game } = await supabase
        .from('games').select().eq('id', gameId).single()
      if (!game) return

      const g = game as GameRow
      const oppId = g.player1_id === myPlayerId ? g.player2_id : g.player1_id
      setCurrentTurn(g.current_turn)
      setOpponentId(oppId)
      setGameStatus(g.status)
      setWinnerId(g.winner_id)

      // Statki przeciwnika (potrzebne do wykrywania trafień)
      const { data: oppBoard } = await supabase
        .from('boards').select('ships').eq('game_id', gameId).eq('player_id', oppId).single()
      if (oppBoard) setOpponentShips(oppBoard.ships as PlacedShip[])

      // Historia strzałów
      const { data: shots } = await supabase
        .from('shots').select().eq('game_id', gameId).order('created_at', { ascending: true })
      if (shots) {
        const shots_ = shots as ShotRecord[]
        setAllShots(shots_)
        setMyBoard(buildMyBoard(myShips, shots_.filter(s => s.player_id === oppId)))
        setEnemyBoard(buildEnemyBoard(shots_.filter(s => s.player_id === myPlayerId)))
      }

      setLoading(false)
    }
    init()
  }, [gameId, myPlayerId, myShips])

  // ─── Realtime: nowe strzały ───────────────────────────────────────────────

  useEffect(() => {
    if (!opponentId) return

    const channel = supabase
      .channel(`shots:${gameId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shots', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const shot = payload.new as ShotRecord
          setAllShots(prev => [...prev, shot])

          if (shot.player_id === myPlayerId) {
            // Mój strzał – zaktualizuj planszę przeciwnika
            setEnemyBoard(prev => {
              const next = prev.map(r => r.map(c => ({ ...c })))
              next[shot.row][shot.col].state = shot.result === 'miss' ? 'miss' : 'hit'
              return next
            })
            if (shot.result === 'sunk')      showToast('💥 Zatopiony!', 'success')
            else if (shot.result === 'hit')  showToast('🎯 Trafiony!', 'success')
          } else {
            // Strzał przeciwnika – zaktualizuj moją planszę
            setMyBoard(prev => {
              const next = prev.map(r => r.map(c => ({ ...c })))
              next[shot.row][shot.col].state = shot.result === 'miss' ? 'miss' : 'hit'
              return next
            })
            if (shot.result === 'sunk')     showToast('💥 Twój statek zatopiony!', 'error')
            else if (shot.result === 'hit') showToast('🎯 Trafiony!', 'error')
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId, myPlayerId, opponentId])

  // ─── Realtime: zmiany w grze (tura, koniec) ──────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`game:${gameId}:status`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          const g = payload.new as GameRow
          setCurrentTurn(g.current_turn)
          setGameStatus(g.status)
          setWinnerId(g.winner_id)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId])

  // ─── Logika strzału ───────────────────────────────────────────────────────

  const handleShoot = useCallback(async (row: number, col: number) => {
    if (gameStatus !== 'battle') return
    if (!isMyTurn) { showToast('Nie twoja tura!', 'error'); return }

    // Sprawdź czy pole już było strzelane
    const alreadyShot = allShots.some(
      s => s.player_id === myPlayerId && s.row === row && s.col === col
    )
    if (alreadyShot) { showToast('To pole było już strzelane', 'info'); return }

    // Wyznacz wynik strzału
    const hitShip = opponentShips.find(ship =>
      ship.cells.some(c => c.row === row && c.col === col)
    )

    let result: 'hit' | 'miss' | 'sunk' = 'miss'
    if (hitShip) {
      const hitCells = new Set([
        ...allShots.filter(s => s.player_id === myPlayerId && s.result !== 'miss')
          .map(s => `${s.row}-${s.col}`),
        `${row}-${col}`
      ])
      const isSunk = hitShip.cells.every(c => hitCells.has(`${c.row}-${c.col}`))
      result = isSunk ? 'sunk' : 'hit'
    }

    // Zapisz strzał w bazie (Realtime propaguje go do obu graczy)
    await supabase.from('shots').insert({ game_id: gameId, player_id: myPlayerId, row, col, result })

    if (result === 'miss') {
      // Pudło – zmień turę
      await supabase.from('games').update({ current_turn: opponentId }).eq('id', gameId)
    } else if (result === 'sunk') {
      // Sprawdź czy wszystkie statki przeciwnika zostały zatopione
      const hitCells = new Set([
        ...allShots.filter(s => s.player_id === myPlayerId && s.result !== 'miss')
          .map(s => `${s.row}-${s.col}`),
        `${row}-${col}`
      ])
      const allSunk = opponentShips.every(ship =>
        ship.cells.every(c => hitCells.has(`${c.row}-${c.col}`))
      )
      if (allSunk) {
        await supabase.from('games').update({ status: 'finished', winner_id: myPlayerId }).eq('id', gameId)
      }
    }
  }, [gameId, myPlayerId, opponentId, isMyTurn, gameStatus, allShots, opponentShips])

  // ─── Rendering ────────────────────────────────────────────────────────────

  const bgStyle = { background: 'radial-gradient(ellipse at 50% 40%, #0d2244 0%, #060e22 55%, #020810 100%)' }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={bgStyle}>
        <p className="text-cyan-300 text-sm animate-pulse">Ładowanie gry…</p>
      </div>
    )
  }

  // Ekran końca gry
  if (gameStatus === 'finished') {
    const won = winnerId === myPlayerId
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={bgStyle}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" />
        </div>
        <div
          className="relative z-10 flex flex-col items-center gap-4 px-16 py-10 rounded-2xl text-center"
          style={{ background: 'rgba(6,20,45,0.95)', border: `1px solid ${won ? 'rgba(74,222,128,0.4)' : 'rgba(239,68,68,0.4)'}` }}
        >
          <p className="text-6xl">{won ? '🏆' : '💀'}</p>
          <h2 className={`text-3xl font-black ${won ? 'text-green-400' : 'text-red-400'}`}>
            {won ? 'Wygrałeś!' : 'Przegrałeś!'}
          </h2>
          <p className="text-slate-400 text-sm">
            {won ? 'Zatopiłeś całą flotę przeciwnika' : 'Twoja flota została zatopiona'}
          </p>
        </div>
      </div>
    )
  }

  const turnBorderColor = isMyTurn ? 'rgba(56,189,248,0.5)' : 'rgba(100,116,139,0.3)'

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-5 relative overflow-hidden py-6"
      style={bgStyle}
    >
      {/* Tło sonaru */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" />
      </div>

      {/* Toast z komunikatem */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg transition-all ${
            toast.type === 'success' ? 'bg-green-500/90 text-white' :
            toast.type === 'error'   ? 'bg-red-500/90 text-white'   :
                                       'bg-slate-700/90 text-slate-200'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Wskaźnik tury */}
      <div
        className="relative z-10 px-6 py-2.5 rounded-full flex items-center gap-3 transition-all"
        style={{ background: 'rgba(6,20,45,0.9)', border: `1px solid ${turnBorderColor}` }}
      >
        <span className={`w-2.5 h-2.5 rounded-full ${isMyTurn ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
        <span className={`text-sm font-semibold ${isMyTurn ? 'text-cyan-300' : 'text-slate-500'}`}>
          {isMyTurn ? 'Twoja tura — strzelaj!' : 'Tura przeciwnika…'}
        </span>
      </div>

      {/* Dwie plansze */}
      <div className="relative z-10 flex gap-6 items-start">

        {/* Moja plansza */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-400 text-center tracking-widest uppercase">
            Twoja plansza
          </p>
          <div
            className="p-4 rounded-2xl"
            style={{
              background: 'rgba(6,20,45,0.85)',
              border: '1px solid rgba(56,189,248,0.15)',
              boxShadow: '0 0 30px rgba(56,189,248,0.05)',
            }}
          >
            <Board
              cells={myBoard}
              onCellClick={() => {}}
            />
          </div>
        </div>

        {/* Plansza przeciwnika */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-400 text-center tracking-widest uppercase">
            Plansza przeciwnika
          </p>
          <div
            className="p-4 rounded-2xl transition-all"
            style={{
              background: 'rgba(6,20,45,0.85)',
              border: `1px solid ${isMyTurn ? 'rgba(56,189,248,0.35)' : 'rgba(56,189,248,0.1)'}`,
              boxShadow: isMyTurn ? '0 0 30px rgba(56,189,248,0.12)' : 'none',
            }}
          >
            <Board
              cells={enemyBoard}
              onCellClick={handleShoot}
              isEnemy
            />
          </div>
        </div>

      </div>

      {/* Fleet tracker – statki przeciwnika */}
      <div className="relative z-10 w-full max-w-2xl px-4">
        <FleetTracker opponentShips={opponentShips} myShots={myShots} />
      </div>
    </div>
  )
}
