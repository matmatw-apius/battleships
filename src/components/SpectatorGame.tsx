import { useState, useEffect } from 'react'
import Board from './Board'
import type { Cell, CellState } from './Board'
import { supabase } from '../lib/supabase'
import type { PlacedShip, ShotRecord, GameRow } from '../types/game'

type SpectatorGameProps = {
  gameId: string
  onReturnToLobby: () => void
}

// ─── Pomocnicze funkcje budowania planszy ───────────────────────────────────

function createEmptyBoard(): Cell[][] {
  return Array.from({ length: 10 }, (_, row) =>
    Array.from({ length: 10 }, (_, col) => ({ row, col, state: 'empty' as CellState }))
  )
}

function buildSpectatorBoard(ships: PlacedShip[], shots: ShotRecord[]): Cell[][] {
  const board = createEmptyBoard()
  // Pokaż wszystkie statki widoczne dla widza
  ships.forEach(ship =>
    ship.cells.forEach(({ row, col }) => { board[row][col].state = 'ship' })
  )
  // Nałóż strzały (trafienia nadpisują stan statku, pudła oznaczają miss)
  shots.forEach(shot => {
    board[shot.row][shot.col].state = shot.result === 'miss' ? 'miss' : 'hit'
  })
  return board
}

export default function SpectatorGame({ gameId, onReturnToLobby }: SpectatorGameProps) {
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)

  const [game, setGame]               = useState<GameRow | null>(null)
  const [player1Ships, setPlayer1Ships] = useState<PlacedShip[]>([])
  const [player2Ships, setPlayer2Ships] = useState<PlacedShip[]>([])
  const [allShots, setAllShots]         = useState<ShotRecord[]>([])

  // Nazwy graczy (pobrane z tabeli players)
  const [player1Name, setPlayer1Name] = useState('Gracz 1')
  const [player2Name, setPlayer2Name] = useState('Gracz 2')

  // ─── Inicjalizacja danych gry ─────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      // Pobierz wiersz gry
      const { data: gameData, error: gameErr } = await supabase
        .from('games').select().eq('id', gameId).single()

      if (gameErr || !gameData) {
        setError('Nie znaleziono gry o podanym ID')
        setLoading(false)
        return
      }

      const g = gameData as GameRow
      setGame(g)

      // Pobierz plansze obu graczy
      const { data: boards } = await supabase
        .from('boards')
        .select('player_id, ships')
        .eq('game_id', gameId)

      if (boards) {
        const p1Board = boards.find((b: { player_id: string; ships: unknown }) => b.player_id === g.player1_id)
        const p2Board = boards.find((b: { player_id: string; ships: unknown }) => b.player_id === g.player2_id)
        if (p1Board) setPlayer1Ships(p1Board.ships as PlacedShip[])
        if (p2Board) setPlayer2Ships(p2Board.ships as PlacedShip[])
      }

      // Pobierz wszystkie strzały
      const { data: shots } = await supabase
        .from('shots')
        .select()
        .eq('game_id', gameId)
        .order('created_at', { ascending: true })

      if (shots) setAllShots(shots as ShotRecord[])

      // Pobierz nazwy graczy
      const { data: players } = await supabase
        .from('players')
        .select('player_id, username')
        .in('player_id', [g.player1_id, g.player2_id])

      if (players) {
        const p1 = (players as { player_id: string; username: string }[]).find(p => p.player_id === g.player1_id)
        const p2 = (players as { player_id: string; username: string }[]).find(p => p.player_id === g.player2_id)
        if (p1) setPlayer1Name(p1.username)
        if (p2) setPlayer2Name(p2.username)
      }

      setLoading(false)
    }

    init()
  }, [gameId])

  // ─── Realtime: nowe strzały ───────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`spectator:shots:${gameId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shots', filter: `game_id=eq.${gameId}` },
        (payload) => {
          setAllShots(prev => [...prev, payload.new as ShotRecord])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId])

  // ─── Realtime: zmiany w grze (tura, status) ──────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`spectator:game:${gameId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          setGame(payload.new as GameRow)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId])

  // ─── Plansze dla obu graczy ───────────────────────────────────────────────

  // Strzały gracza 1 trafią w planszę gracza 2 i vice versa
  const shotsOnPlayer1Board = allShots.filter(s => game && s.player_id === game.player2_id)
  const shotsOnPlayer2Board = allShots.filter(s => game && s.player_id === game.player1_id)

  const board1 = buildSpectatorBoard(player1Ships, shotsOnPlayer1Board)
  const board2 = buildSpectatorBoard(player2Ships, shotsOnPlayer2Board)

  const bgStyle = { background: 'radial-gradient(ellipse at 50% 40%, #0d2244 0%, #060e22 55%, #020810 100%)' }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={bgStyle}>
        <p className="text-cyan-300 text-sm animate-pulse">Ładowanie gry…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={bgStyle}>
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={onReturnToLobby}
          className="px-4 py-2 rounded-xl text-sm text-slate-400 border border-slate-700/50 hover:text-slate-200 transition-colors"
        >
          ← Wróć do lobby
        </button>
      </div>
    )
  }

  const isFinished = game?.status === 'finished'
  const winnerId   = game?.winner_id
  const isP1Turn   = game?.current_turn === game?.player1_id

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 relative overflow-hidden py-6"
      style={bgStyle}
    >
      {/* Tło sonaru */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" />
      </div>

      {/* Przycisk powrotu */}
      <button
        onClick={onReturnToLobby}
        className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
          text-slate-500 hover:text-slate-300 transition-colors"
        style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.15)' }}
      >
        ← Lobby
      </button>

      {/* Badge WIDZ */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase"
        style={{
          background: 'rgba(6,20,45,0.9)',
          border: '1px solid rgba(168,85,247,0.5)',
          color: '#c084fc',
          boxShadow: '0 0 20px rgba(168,85,247,0.15)',
        }}
      >
        👁️ WIDZ
      </div>

      {/* Banner końca gry */}
      {isFinished && (
        <div
          className="relative z-10 px-8 py-3 rounded-full text-sm font-bold"
          style={{
            background: 'rgba(6,20,45,0.95)',
            border: '1px solid rgba(74,222,128,0.4)',
            color: '#4ade80',
            boxShadow: '0 0 30px rgba(74,222,128,0.1)',
          }}
        >
          🏆 Gra zakończona! Wygrał: {winnerId === game?.player1_id ? player1Name : player2Name}
        </div>
      )}

      {/* Wskaźnik tury */}
      {!isFinished && (
        <div className="relative z-10 flex items-center gap-3 px-6 py-2.5 rounded-full"
          style={{ background: 'rgba(6,20,45,0.9)', border: '1px solid rgba(56,189,248,0.3)' }}>
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-cyan-300 text-sm font-semibold">
            Tura: {isP1Turn ? player1Name : player2Name}
          </span>
        </div>
      )}

      {/* Plansze obu graczy */}
      <div className="relative z-10 flex gap-8 items-start">

        {/* Plansza gracza 1 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center gap-2">
            <p className="text-xs font-semibold text-slate-300 text-center tracking-widest uppercase">
              {player1Name}
            </p>
            {isP1Turn && !isFinished && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            )}
            {isFinished && winnerId === game?.player1_id && (
              <span className="text-yellow-400 text-xs">🏆</span>
            )}
          </div>
          <div className="p-4 rounded-2xl" style={{
            background: 'rgba(6,20,45,0.85)',
            border: `1px solid ${isP1Turn && !isFinished ? 'rgba(56,189,248,0.4)' : 'rgba(56,189,248,0.12)'}`,
            boxShadow: isP1Turn && !isFinished ? '0 0 20px rgba(56,189,248,0.1)' : 'none',
          }}>
            <Board cells={board1} onCellClick={() => {}} interactive={false} />
          </div>
          <p className="text-xs text-slate-600 text-center">
            Strzałów: {shotsOnPlayer1Board.length}
          </p>
        </div>

        {/* Separator */}
        <div className="flex flex-col items-center justify-center h-full pt-12 gap-2">
          <div className="w-px h-32 bg-slate-700/50" />
          <span className="text-slate-600 text-xs font-bold">VS</span>
          <div className="w-px h-32 bg-slate-700/50" />
        </div>

        {/* Plansza gracza 2 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center gap-2">
            <p className="text-xs font-semibold text-slate-300 text-center tracking-widest uppercase">
              {player2Name}
            </p>
            {!isP1Turn && !isFinished && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            )}
            {isFinished && winnerId === game?.player2_id && (
              <span className="text-yellow-400 text-xs">🏆</span>
            )}
          </div>
          <div className="p-4 rounded-2xl" style={{
            background: 'rgba(6,20,45,0.85)',
            border: `1px solid ${!isP1Turn && !isFinished ? 'rgba(56,189,248,0.4)' : 'rgba(56,189,248,0.12)'}`,
            boxShadow: !isP1Turn && !isFinished ? '0 0 20px rgba(56,189,248,0.1)' : 'none',
          }}>
            <Board cells={board2} onCellClick={() => {}} interactive={false} />
          </div>
          <p className="text-xs text-slate-600 text-center">
            Strzałów: {shotsOnPlayer2Board.length}
          </p>
        </div>
      </div>

      {/* Informacja o ID gry */}
      <p className="relative z-10 text-slate-700 text-xs mt-2">
        ID gry: <span className="font-mono text-slate-600">{gameId}</span>
      </p>
    </div>
  )
}
