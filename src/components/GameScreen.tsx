import { useState, useEffect, useCallback, useRef } from 'react'
import Board from './Board'
import type { Cell, CellState } from './Board'
import { supabase } from '../lib/supabase'
import type { PlacedShip, ShotRecord, GameRow } from '../types/game'
import { playShoot, playHit, playMiss, playSunk, playWin, playLose } from '../lib/sounds'
import ChatPanel from './ChatPanel'

const TURN_SECONDS = 30

type GameScreenProps = {
  gameId: string
  myPlayerId: string
  myUsername: string
  myShips: PlacedShip[]
  onReturnToLobby: () => void
  onRematch: (newGameId: string) => void
}

// ─── Pomocnicze funkcje budowania planszy ───────────────────────────────────

function createEmptyBoard(): Cell[][] {
  return Array.from({ length: 10 }, (_, row) =>
    Array.from({ length: 10 }, (_, col) => ({ row, col, state: 'empty' as CellState }))
  )
}

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

function buildEnemyBoard(myShots: ShotRecord[]): Cell[][] {
  const board = createEmptyBoard()
  myShots.forEach(shot => {
    board[shot.row][shot.col].state = shot.result === 'miss' ? 'miss' : 'hit'
  })
  return board
}

// ─── Fleet Tracker: status statków przeciwnika ──────────────────────────────
// Pokazuje tylko czy statek jest zatopiony – nie zdradza gdzie są nieodkryte statki

function FleetTracker({ opponentShips, myShots }: { opponentShips: PlacedShip[], myShots: ShotRecord[] }) {
  const hitCells = new Set(
    myShots.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`)
  )

  return (
    <div
      className="flex flex-wrap gap-4 p-4 rounded-2xl"
      style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.2)' }}
    >
      <p className="w-full text-xs font-semibold text-cyan-500 tracking-widest uppercase mb-1">
        Flota przeciwnika
      </p>
      {opponentShips.map(ship => {
        // Statek zatopiony tylko gdy WSZYSTKIE jego pola są trafione
        const isSunk = ship.cells.every(c => hitCells.has(`${c.row}-${c.col}`))
        return (
          <div key={ship.shipId} className="flex flex-col gap-1">
            {/* Bloki: szare = nieznany status, czerwone = zatopiony */}
            <div className="flex gap-0.5">
              {Array.from({ length: ship.size }, (_, i) => (
                <div
                  key={i}
                  className={`h-3.5 w-5 rounded-sm transition-colors ${
                    isSunk ? 'bg-red-500' : 'bg-gray-600'
                  }`}
                />
              ))}
            </div>
            <span className={`text-xs ${isSunk ? 'text-red-400 line-through' : 'text-slate-500'}`}>
              {isSunk ? `${ship.name} ✓` : '???'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Główny komponent ekranu gry ─────────────────────────────────────────────

type Toast = { text: string; type: 'info' | 'success' | 'error' }

export default function GameScreen({ gameId, myPlayerId, myUsername, myShips, onReturnToLobby, onRematch }: GameScreenProps) {
  const [myBoard, setMyBoard]             = useState<Cell[][]>(() => buildMyBoard(myShips, []))
  const [enemyBoard, setEnemyBoard]       = useState<Cell[][]>(createEmptyBoard)
  const [opponentShips, setOpponentShips] = useState<PlacedShip[]>([])
  const [allShots, setAllShots]           = useState<ShotRecord[]>([])
  const [currentTurn, setCurrentTurn]     = useState('')
  const [opponentId, setOpponentId]       = useState('')
  const [gameStatus, setGameStatus]       = useState('battle')
  const [winnerId, setWinnerId]           = useState<string | null>(null)
  const [toast, setToast]                 = useState<Toast | null>(null)
  const [loading, setLoading]             = useState(true)
  const [timeLeft, setTimeLeft]           = useState(TURN_SECONDS)
  // timerVersion – zmiana wartości wymusza reset timera (np. po trafieniu bez zmiany tury)
  const [timerVersion, setTimerVersion]   = useState(0)
  // Stan przycisku regrywki
  const [rematchState, setRematchState]   = useState<'idle' | 'waiting'>('idle')

  // Ref do interwału timera – pozwala anulować go przed strzałem
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Ref do kanału Realtime używanego do sygnalizacji regrywki
  const rematchChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  // Guard przed podwójnym tworzeniem regrywki
  const rematchCreatedRef = useRef(false)

  const isMyTurn = currentTurn === myPlayerId
  const myShots  = allShots.filter(s => s.player_id === myPlayerId)

  function showToast(text: string, type: Toast['type'] = 'info') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── Inicjalizacja: ładowanie danych gry ──────────────────────────────────

  useEffect(() => {
    async function init() {
      const { data: game } = await supabase
        .from('games').select().eq('id', gameId).single()
      if (!game) return

      const g = game as GameRow
      const oppId = g.player1_id === myPlayerId ? g.player2_id : g.player1_id
      setCurrentTurn(g.current_turn)
      setOpponentId(oppId)
      setGameStatus(g.status)
      setWinnerId(g.winner_id)

      // Statki przeciwnika – potrzebne do obliczania trafień i win condition
      const { data: oppBoard } = await supabase
        .from('boards').select('ships').eq('game_id', gameId).eq('player_id', oppId).single()
      if (oppBoard) setOpponentShips(oppBoard.ships as PlacedShip[])

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

  // ─── Timer tury – resetuje się przy każdej zmianie tury LUB po strzale ────
  // timerVersion zmienia się po każdym strzale (hit/miss), currentTurn – po missie/auto-pass

  useEffect(() => {
    if (gameStatus !== 'battle' || !opponentId) return

    setTimeLeft(TURN_SECONDS)
    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Czas minął – jeśli moja tura, automatycznie przekaż ją dalej
          if (currentTurn === myPlayerId) {
            supabase.from('games').update({ current_turn: opponentId }).eq('id', gameId)
            showToast('Czas minął! Tura przeszła do przeciwnika.', 'info')
          }
          return TURN_SECONDS
        }
        return prev - 1
      })
    }, 1000)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // timerVersion w deps = efekt restartuje timer po każdym strzale
  }, [currentTurn, gameStatus, opponentId, gameId, myPlayerId, timerVersion])

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
          // Reset timera u obu graczy po każdym strzale
          setTimerVersion(v => v + 1)

          if (shot.player_id === myPlayerId) {
            // Mój strzał – zaktualizuj planszę przeciwnika (toast pokazany w handleShoot)
            setEnemyBoard(prev => {
              const next = prev.map(r => r.map(c => ({ ...c })))
              next[shot.row][shot.col].state = shot.result === 'miss' ? 'miss' : 'hit'
              return next
            })
          } else {
            // Strzał przeciwnika – zaktualizuj moją planszę
            setMyBoard(prev => {
              const next = prev.map(r => r.map(c => ({ ...c })))
              next[shot.row][shot.col].state = shot.result === 'miss' ? 'miss' : 'hit'
              return next
            })
            // Powiadomienie z nazwą statku jeśli zatopiony
            if (shot.result === 'sunk') {
              playSunk()
              const sunkShip = myShips.find(ship =>
                ship.cells.some(c => c.row === shot.row && c.col === shot.col)
              )
              showToast(`💥 Twój ${sunkShip?.name ?? 'statek'} został zatopiony!`, 'error')
            } else if (shot.result === 'hit') {
              playHit()
              showToast('🎯 Przeciwnik trafił twój statek!', 'error')
            } else {
              playMiss()
            }
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId, myPlayerId, opponentId, myShips])

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

  // ─── Realtime: oczekiwanie na zaproszenie do regrywki ────────────────────
  // Subskrybujemy INSERT na games gdzie player2_id = my ID (opponent stworzył rematch)

  useEffect(() => {
    if (gameStatus !== 'finished' || !opponentId) return

    // Wspólny deterministyczny kanał broadcast dla obu graczy
    const channelName = `rematch:${[myPlayerId, opponentId].sort().join(':')}`
    const channel = supabase.channel(channelName)
    rematchChannelRef.current = channel

    channel
      .on('broadcast', { event: 'rematch' }, ({ payload }: { payload: { gameId: string } }) => {
        // Guard – ignorujemy jeśli sami już stworzyliśmy regrywkę
        if (!rematchCreatedRef.current) {
          rematchCreatedRef.current = true
          onRematch(payload.gameId)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameStatus, opponentId, myPlayerId, onRematch])

  // ─── Logika strzału ───────────────────────────────────────────────────────

  const handleShoot = useCallback(async (row: number, col: number) => {
    if (gameStatus !== 'battle') return
    if (!isMyTurn) { showToast('Nie twoja tura!', 'error'); return }

    const alreadyShot = allShots.some(
      s => s.player_id === myPlayerId && s.row === row && s.col === col
    )
    if (alreadyShot) { showToast('To pole było już strzelane', 'info'); return }

    // Zatrzymaj timer natychmiast – strzał już wykonany
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }

    playShoot()

    // Wyznacz wynik strzału na podstawie ukrytych statków przeciwnika
    const hitShip = opponentShips.find(ship =>
      ship.cells.some(c => c.row === row && c.col === col)
    )

    let result: 'hit' | 'miss' | 'sunk' = 'miss'
    if (hitShip) {
      const hitCells = new Set([
        ...allShots.filter(s => s.player_id === myPlayerId && s.result !== 'miss').map(s => `${s.row}-${s.col}`),
        `${row}-${col}`
      ])
      result = hitShip.cells.every(c => hitCells.has(`${c.row}-${c.col}`)) ? 'sunk' : 'hit'
    }

    // Pokaż feedback od razu (nie czekając na Realtime)
    if (result === 'sunk') {
      playSunk()
      showToast(`💥 ${hitShip!.name} zatopiony!`, 'success')
    } else if (result === 'hit') {
      playHit()
      showToast('🎯 Trafiony! Strzelasz ponownie!', 'success')
    } else {
      playMiss()
    }

    await supabase.from('shots').insert({ game_id: gameId, player_id: myPlayerId, row, col, result })

    // Zresetuj timer po każdym strzale (hit lub miss)
    setTimerVersion(v => v + 1)

    if (result === 'miss') {
      await supabase.from('games').update({ current_turn: opponentId }).eq('id', gameId)
    } else if (result === 'sunk') {
      // Sprawdź warunek wygranej
      const hitCells = new Set([
        ...allShots.filter(s => s.player_id === myPlayerId && s.result !== 'miss').map(s => `${s.row}-${s.col}`),
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

  // ─── Regrywka: tworzenie nowej gry z tym samym przeciwnikiem ─────────────

  async function handleCreateRematch() {
    if (rematchCreatedRef.current) return
    rematchCreatedRef.current = true
    setRematchState('waiting')

    const { data } = await supabase
      .from('games')
      .insert({ player1_id: myPlayerId, player2_id: opponentId, status: 'placement' })
      .select()
      .single()

    if (data && rematchChannelRef.current) {
      // Wyślij broadcast do przeciwnika z ID nowej gry
      await rematchChannelRef.current.send({
        type: 'broadcast',
        event: 'rematch',
        payload: { gameId: data.id },
      })
      onRematch(data.id)
    }
  }

  // ─── Dźwięk + aktualizacja statystyk gracza po zakończeniu gry ──────────

  useEffect(() => {
    if (gameStatus !== 'finished' || !opponentId) return
    const won = winnerId === myPlayerId
    won ? playWin() : playLose()

    // Inkrementuj wins/losses w tabeli players dla obu graczy
    supabase.rpc('increment_player_stat', { pid: myPlayerId, col: won ? 'wins' : 'losses' })
    supabase.from('players').update({ last_played: new Date().toISOString() }).eq('player_id', myPlayerId)
  }, [gameStatus, winnerId, myPlayerId, opponentId])

  // ─── Rendering ────────────────────────────────────────────────────────────

  const bgStyle = { background: 'radial-gradient(ellipse at 50% 40%, #0d2244 0%, #060e22 55%, #020810 100%)' }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={bgStyle}>
        <p className="text-cyan-300 text-sm animate-pulse">Ładowanie gry…</p>
      </div>
    )
  }

  // ─── Ekran końca gry ──────────────────────────────────────────────────────

  if (gameStatus === 'finished') {
    const won = winnerId === myPlayerId
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={bgStyle}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" />
        </div>
        <div
          className="relative z-10 flex flex-col items-center gap-5 px-16 py-10 rounded-2xl text-center"
          style={{
            background: 'rgba(6,20,45,0.95)',
            border: `1px solid ${won ? 'rgba(74,222,128,0.4)' : 'rgba(239,68,68,0.4)'}`,
            boxShadow: `0 0 60px ${won ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)'}`,
          }}
        >
          <p className="text-6xl">{won ? '🏆' : '💀'}</p>
          <div className="flex flex-col gap-1">
            <h2 className={`text-3xl font-black ${won ? 'text-green-400' : 'text-red-400'}`}>
              {won ? 'Wygrałeś!' : 'Przegrałeś!'}
            </h2>
            <p className="text-slate-400 text-sm">
              {won ? 'Zatopiłeś całą flotę przeciwnika' : 'Twoja flota została zatopiona'}
            </p>
          </div>

          {/* Przyciski akcji */}
          <div className="flex flex-col gap-3 w-full mt-2">
            {rematchState === 'waiting' ? (
              <div className="flex items-center justify-center gap-2 py-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-cyan-400"
                    style={{ animation: `sonar 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
                <span className="text-cyan-300 text-sm ml-1">Oczekuję na przeciwnika…</span>
              </div>
            ) : (
              <button
                onClick={handleCreateRematch}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #0e7490 0%, #0369a1 100%)',
                  boxShadow: '0 0 20px rgba(56,189,248,0.25), 0 4px 12px rgba(0,0,0,0.4)',
                  border: '1px solid rgba(56,189,248,0.4)',
                }}
              >
                🔄 Zagraj ponownie
              </button>
            )}

            <button
              onClick={onReturnToLobby}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-400
                hover:text-slate-200 transition-colors border border-slate-700/50 hover:border-slate-500/50"
            >
              ← Wróć do lobby
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Kolor i skala timera
  const timerPct    = (timeLeft / TURN_SECONDS) * 100
  const timerColor  = timeLeft > 20 ? '#22d3ee' : timeLeft > 10 ? '#fb923c' : '#ef4444'
  const isUrgent    = timeLeft <= 10

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 relative overflow-hidden py-6"
      style={bgStyle}
    >
      {/* Tło sonaru */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" />
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg ${
          toast.type === 'success' ? 'bg-green-500/90 text-white' :
          toast.type === 'error'   ? 'bg-red-500/90 text-white'   :
                                     'bg-slate-700/90 text-slate-200'
        }`}>
          {toast.text}
        </div>
      )}

      {/* Przycisk powrotu do lobby */}
      <button
        onClick={onReturnToLobby}
        className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
          text-slate-500 hover:text-slate-300 transition-colors"
        style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.15)' }}
      >
        ← Lobby
      </button>

      {/* Wskaźnik tury + timer */}
      <div className="relative z-10 flex flex-col items-center gap-1.5">
        <div
          className="px-6 py-2.5 rounded-full flex items-center gap-3 transition-all"
          style={{
            background: 'rgba(6,20,45,0.9)',
            border: `1px solid ${isMyTurn ? 'rgba(56,189,248,0.5)' : 'rgba(100,116,139,0.3)'}`,
          }}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${isMyTurn ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className={`text-sm font-semibold ${isMyTurn ? 'text-cyan-300' : 'text-slate-500'}`}>
            {isMyTurn ? 'Twoja tura — strzelaj!' : 'Tura przeciwnika…'}
          </span>
          {/* Licznik czasu */}
          <span
            className={`text-sm font-black font-mono ml-1 ${isUrgent ? 'animate-pulse' : ''}`}
            style={{ color: timerColor }}
          >
            {timeLeft}s
          </span>
        </div>

        {/* Pasek postępu timera */}
        <div className="w-64 h-1 rounded-full bg-slate-800/60 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${timerPct}%`, background: timerColor }}
          />
        </div>
      </div>

      {/* Dwie plansze */}
      <div className="relative z-10 flex gap-6 items-start">

        {/* Moja plansza – tylko podgląd, nie można klikać */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-400 text-center tracking-widest uppercase">
            Twoja plansza
          </p>
          <div className="p-4 rounded-2xl" style={{
            background: 'rgba(6,20,45,0.85)',
            border: '1px solid rgba(56,189,248,0.12)',
          }}>
            <Board cells={myBoard} onCellClick={() => {}} interactive={false} />
          </div>
        </div>

        {/* Plansza przeciwnika – klikalna podczas mojej tury */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-400 text-center tracking-widest uppercase">
            Plansza przeciwnika
          </p>
          <div className="p-4 rounded-2xl transition-all" style={{
            background: 'rgba(6,20,45,0.85)',
            border: `1px solid ${isMyTurn ? 'rgba(56,189,248,0.4)' : 'rgba(56,189,248,0.1)'}`,
            boxShadow: isMyTurn ? '0 0 30px rgba(56,189,248,0.12)' : 'none',
          }}>
            <Board
              cells={enemyBoard}
              onCellClick={handleShoot}
              isEnemy
              interactive={isMyTurn}
            />
          </div>
        </div>

      </div>

      {/* Fleet tracker */}
      <div className="relative z-10 w-full max-w-2xl px-4">
        <FleetTracker opponentShips={opponentShips} myShots={myShots} />
      </div>

      {/* Czat – pływający widget w prawym dolnym rogu */}
      <ChatPanel gameId={gameId} myPlayerId={myPlayerId} myUsername={myUsername} />
    </div>
  )
}
