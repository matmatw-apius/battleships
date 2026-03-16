import { useState, useEffect, useRef, useCallback } from 'react'
import Board from './Board'
import type { Cell, CellState } from './Board'
import type { PlacedShip } from '../types/game'
import { placeShipsRandomly, createBotShooter } from '../lib/bot'
import { playShoot, playHit, playMiss, playSunk, playWin, playLose } from '../lib/sounds'

const TURN_SECONDS = 30

type BotGameProps = {
  myShips: PlacedShip[]
  myUsername: string
  skin: 'ocean' | 'arctic' | 'lava'
  onReturnToLobby: () => void
}

// ─── Pomocnicze funkcje planszy ──────────────────────────────────────────────

function createEmptyBoard(): Cell[][] {
  return Array.from({ length: 10 }, (_, row) =>
    Array.from({ length: 10 }, (_, col) => ({ row, col, state: 'empty' as CellState }))
  )
}

function buildMyBoard(myShips: PlacedShip[], botShots: { row: number; col: number; result: 'hit' | 'miss' | 'sunk' }[]): Cell[][] {
  const board = createEmptyBoard()
  myShips.forEach(ship =>
    ship.cells.forEach(({ row, col }) => { board[row][col].state = 'ship' })
  )
  botShots.forEach(shot => {
    board[shot.row][shot.col].state = shot.result === 'miss' ? 'miss' : 'hit'
  })
  return board
}

function buildEnemyBoard(myShots: { row: number; col: number; result: 'hit' | 'miss' | 'sunk' }[]): Cell[][] {
  const board = createEmptyBoard()
  myShots.forEach(shot => {
    board[shot.row][shot.col].state = shot.result === 'miss' ? 'miss' : 'hit'
  })
  return board
}

// ─── Fleet Tracker ───────────────────────────────────────────────────────────

function FleetTracker({ ships, shots }: { ships: PlacedShip[]; shots: { row: number; col: number; result: string }[] }) {
  const hitCells = new Set(
    shots.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`)
  )
  return (
    <div
      className="flex flex-wrap gap-4 p-4 rounded-2xl"
      style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.2)' }}
    >
      <p className="w-full text-xs font-semibold text-cyan-500 tracking-widest uppercase mb-1">
        Flota bota
      </p>
      {ships.map(ship => {
        const isSunk = ship.cells.every(c => hitCells.has(`${c.row}-${c.col}`))
        return (
          <div key={ship.shipId} className="flex flex-col gap-1">
            <div className="flex gap-0.5">
              {Array.from({ length: ship.size }, (_, i) => (
                <div
                  key={i}
                  className={`h-3.5 w-5 rounded-sm transition-colors ${isSunk ? 'bg-red-500' : 'bg-gray-600'}`}
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

// ─── Typ strzału ─────────────────────────────────────────────────────────────

type ShotEntry = { row: number; col: number; result: 'hit' | 'miss' | 'sunk' }

type Toast = { text: string; type: 'info' | 'success' | 'error' }

// ─── Główny komponent gry vs Bot ─────────────────────────────────────────────

export default function BotGame({ myShips, myUsername, skin, onReturnToLobby }: BotGameProps) {
  // Statki bota generowane raz przy montowaniu
  const [botShips] = useState<PlacedShip[]>(() => placeShipsRandomly())
  // Strzelec bota – jeden instancja przez całą grę
  const botShooterRef = useRef(createBotShooter())

  const [myBoard, setMyBoard]     = useState<Cell[][]>(() => buildMyBoard(myShips, []))
  const [enemyBoard, setEnemyBoard] = useState<Cell[][]>(createEmptyBoard)
  const [myShots, setMyShots]     = useState<ShotEntry[]>([])
  // Historia strzałów bota – potrzebna do budowania planszy gracza
  const botShotsRef = useRef<ShotEntry[]>([])

  const [currentTurn, setCurrentTurn] = useState<'player' | 'bot'>('player')
  const [gameStatus, setGameStatus]   = useState<'battle' | 'finished'>('battle')
  const [winner, setWinner]           = useState<'player' | 'bot' | null>(null)

  const [timeLeft, setTimeLeft]     = useState(TURN_SECONDS)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Power-upy
  const [radarUsed, setRadarUsed]   = useState(false)
  const [doubleUsed, setDoubleUsed] = useState(false)
  const [doubleShot, setDoubleShot] = useState(false)
  const [doubleShotsLeft, setDoubleShotsLeft] = useState(2)

  const [toast, setToast] = useState<Toast | null>(null)

  // Flaga zabezpieczająca przed podwójnym ruchem bota
  const botTurnInProgress = useRef(false)

  function showToast(text: string, type: Toast['type'] = 'info') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── Timer tury ─────────────────────────────────────────────────────────────

  const resetTimer = useCallback(() => {
    setTimeLeft(TURN_SECONDS)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    if (gameStatus !== 'battle') return

    setTimeLeft(TURN_SECONDS)
    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Czas minął – automatyczne przekazanie tury (tylko przy turze gracza)
          if (currentTurn === 'player') {
            showToast('Czas minął! Tura przeszła do bota.', 'info')
            setCurrentTurn('bot')
          }
          return TURN_SECONDS
        }
        return prev - 1
      })
    }, 1000)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [currentTurn, gameStatus])

  // ─── Logika strzału gracza ───────────────────────────────────────────────

  const handleShoot = useCallback((row: number, col: number) => {
    if (gameStatus !== 'battle' || currentTurn !== 'player') return

    // Sprawdź czy pole było już strzelane
    const alreadyShot = myShots.some(s => s.row === row && s.col === col)
    if (alreadyShot) { showToast('To pole było już strzelane', 'info'); return }

    resetTimer()
    playShoot()

    // Wyznacz wynik strzału
    const hitShip = botShips.find(ship =>
      ship.cells.some(c => c.row === row && c.col === col)
    )

    let result: 'hit' | 'miss' | 'sunk' = 'miss'
    if (hitShip) {
      const prevHitKeys = new Set(myShots.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`))
      prevHitKeys.add(`${row}-${col}`)
      result = hitShip.cells.every(c => prevHitKeys.has(`${c.row}-${c.col}`)) ? 'sunk' : 'hit'
    }

    // Zaktualizuj strzały i planszę
    const newShot: ShotEntry = { row, col, result }
    const newMyShots = [...myShots, newShot]
    setMyShots(newMyShots)
    setEnemyBoard(buildEnemyBoard(newMyShots))

    if (result === 'sunk') {
      playSunk()
      showToast(`💥 ${hitShip!.name} zatopiony!`, 'success')
    } else if (result === 'hit') {
      playHit()
      showToast('🎯 Trafiony! Strzelasz ponownie!', 'success')
    } else {
      playMiss()
    }

    // Sprawdź warunek wygranej
    const hitKeys = new Set(newMyShots.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`))
    const allSunk = botShips.every(ship =>
      ship.cells.every(c => hitKeys.has(`${c.row}-${c.col}`))
    )
    if (allSunk) {
      setGameStatus('finished')
      setWinner('player')
      playWin()
      return
    }

    // Podwójny strzał
    if (doubleShot) {
      const newLeft = doubleShotsLeft - 1
      setDoubleShotsLeft(newLeft)
      if (newLeft <= 0 || result === 'miss') {
        // Koniec podwójnego strzału – przekaż turę
        setDoubleShot(false)
        setDoubleShotsLeft(2)
        if (result === 'miss') setCurrentTurn('bot')
        // hit/sunk i wyczerpany podwójny – przekaż turę
        if (result !== 'miss' && newLeft <= 0) setCurrentTurn('bot')
      }
      return
    }

    // Normalny ruch – miss przekazuje turę
    if (result === 'miss') {
      setCurrentTurn('bot')
    }
    // hit/sunk – gracz strzela ponownie (nie przekazuj tury)
  }, [gameStatus, currentTurn, myShots, botShips, doubleShot, doubleShotsLeft, resetTimer])

  // ─── Ruch bota ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (gameStatus !== 'battle' || currentTurn !== 'bot') return
    if (botTurnInProgress.current) return
    botTurnInProgress.current = true

    const timeout = setTimeout(() => {
      const { row, col } = botShooterRef.current.nextShot()
      playShoot()

      const hitShip = myShips.find(ship =>
        ship.cells.some(c => c.row === row && c.col === col)
      )

      // Oblicz wynik na podstawie poprzednich strzałów bota (z ref)
      const prevHitKeys = new Set(
        botShotsRef.current.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`)
      )
      prevHitKeys.add(`${row}-${col}`)
      const recalcResult: 'hit' | 'miss' | 'sunk' = hitShip
        ? hitShip.cells.every(c => prevHitKeys.has(`${c.row}-${c.col}`)) ? 'sunk' : 'hit'
        : 'miss'

      const newBotShots = [...botShotsRef.current, { row, col, result: recalcResult }]
      botShotsRef.current = newBotShots

      // Zaktualizuj planszę gracza
      setMyBoard(buildMyBoard(myShips, newBotShots))

      // Zarejestruj wynik u strzelca
      botShooterRef.current.registerResult(row, col, recalcResult)

      if (recalcResult === 'sunk') {
        playSunk()
        const sunkShip = myShips.find(s => s.cells.some(c => c.row === row && c.col === col))
        showToast(`💥 Twój ${sunkShip?.name ?? 'statek'} został zatopiony!`, 'error')
      } else if (recalcResult === 'hit') {
        playHit()
        showToast('🎯 Bot trafił twój statek!', 'error')
      } else {
        playMiss()
      }

      // Sprawdź warunek przegranej
      const hitKeys = new Set(newBotShots.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`))
      const allSunk = myShips.every(ship =>
        ship.cells.every(c => hitKeys.has(`${c.row}-${c.col}`))
      )
      if (allSunk) {
        setGameStatus('finished')
        setWinner('bot')
        playLose()
      } else if (recalcResult === 'miss') {
        setCurrentTurn('player')
      }
      // hit/sunk – bot strzela ponownie (efekt uruchomi się ponownie)

      botTurnInProgress.current = false
    }, 800)

    return () => {
      clearTimeout(timeout)
      botTurnInProgress.current = false
    }
  }, [currentTurn, gameStatus, myShips])

  // ─── Radar power-up ─────────────────────────────────────────────────────────

  function handleRadar() {
    if (radarUsed || currentTurn !== 'player') return

    // Znajdź losowe nieodkryte pole
    const unrevealed: { row: number; col: number }[] = []
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (!myShots.some(s => s.row === r && s.col === c)) {
          unrevealed.push({ row: r, col: c })
        }
      }
    }
    if (unrevealed.length === 0) return

    const target = unrevealed[Math.floor(Math.random() * unrevealed.length)]
    const colLabel = String.fromCharCode(65 + target.row)
    const cellLabel = `${colLabel}${target.col + 1}`

    const hasShip = botShips.some(ship =>
      ship.cells.some(c => c.row === target.row && c.col === target.col)
    )
    showToast(`⚡ Radar: ${cellLabel} — ${hasShip ? 'Statek' : 'Woda'}`, 'info')
    setRadarUsed(true)
  }

  // ─── Podwójny strzał power-up ────────────────────────────────────────────

  function handleDoubleShot() {
    if (doubleUsed || currentTurn !== 'player') return
    setDoubleShot(true)
    setDoubleShotsLeft(2)
    setDoubleUsed(true)
    showToast('💣 Podwójny strzał aktywny! Masz 2 strzały.', 'success')
  }

  // ─── Ekran końca gry ─────────────────────────────────────────────────────

  const bgStyle = { background: 'radial-gradient(ellipse at 50% 40%, #0d2244 0%, #060e22 55%, #020810 100%)' }

  if (gameStatus === 'finished') {
    const won = winner === 'player'
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
              {won ? 'Zatopiłeś flotę bota!' : 'Bot zatopił twoją flotę.'}
            </p>
          </div>
          <button
            onClick={onReturnToLobby}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-400
              hover:text-slate-200 transition-colors border border-slate-700/50 hover:border-slate-500/50"
          >
            ← Wróć do lobby
          </button>
        </div>
      </div>
    )
  }

  const timerPct   = (timeLeft / TURN_SECONDS) * 100
  const timerColor = timeLeft > 20 ? '#22d3ee' : timeLeft > 10 ? '#fb923c' : '#ef4444'
  const isUrgent   = timeLeft <= 10
  const isMyTurn   = currentTurn === 'player'

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

      {/* Przycisk powrotu */}
      <button
        onClick={onReturnToLobby}
        className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
          text-slate-500 hover:text-slate-300 transition-colors"
        style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.15)' }}
      >
        ← Lobby
      </button>

      {/* Badge gracza i bota */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
        style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.2)' }}>
        <span className="text-cyan-400">🤖</span>
        <span className="text-slate-400">vs Bot</span>
      </div>

      {/* Nick gracza */}
      <div className="relative z-10 text-center">
        <p className="text-cyan-500 text-xs font-semibold tracking-[0.3em] uppercase">⚓ Gra vs Bot</p>
        <p className="text-white font-bold text-lg">{myUsername}</p>
      </div>

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
            {isMyTurn ? 'Twoja tura — strzelaj!' : 'Tura bota…'}
          </span>
          <span
            className={`text-sm font-black font-mono ml-1 ${isUrgent ? 'animate-pulse' : ''}`}
            style={{ color: timerColor }}
          >
            {timeLeft}s
          </span>
        </div>
        <div className="w-64 h-1 rounded-full bg-slate-800/60 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${timerPct}%`, background: timerColor }}
          />
        </div>
      </div>

      {/* Power-upy */}
      <div className="relative z-10 flex gap-3">
        <button
          onClick={handleRadar}
          disabled={radarUsed || !isMyTurn}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            radarUsed
              ? 'opacity-40 cursor-not-allowed bg-slate-800/40 text-slate-500 border border-slate-700/40'
              : !isMyTurn
                ? 'opacity-60 cursor-not-allowed bg-slate-800/60 text-slate-400 border border-slate-700/40'
                : 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50 hover:border-cyan-500/60 hover:bg-cyan-900/80 cursor-pointer'
          }`}
        >
          🔍 Radar {radarUsed ? '(użyty)' : ''}
        </button>
        <button
          onClick={handleDoubleShot}
          disabled={doubleUsed || !isMyTurn}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            doubleUsed
              ? 'opacity-40 cursor-not-allowed bg-slate-800/40 text-slate-500 border border-slate-700/40'
              : !isMyTurn
                ? 'opacity-60 cursor-not-allowed bg-slate-800/60 text-slate-400 border border-slate-700/40'
                : doubleShot
                  ? 'bg-orange-900/80 text-orange-300 border border-orange-600/60 cursor-pointer animate-pulse'
                  : 'bg-orange-900/60 text-orange-300 border border-orange-700/50 hover:border-orange-500/60 hover:bg-orange-900/80 cursor-pointer'
          }`}
        >
          💣 Salwa ×2 {doubleShot ? `(${doubleShotsLeft} strzały)` : doubleUsed ? '(użyta)' : ''}
        </button>
      </div>

      {/* Plansze */}
      <div className="relative z-10 flex gap-6 items-start">
        {/* Moja plansza */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-400 text-center tracking-widest uppercase">
            Twoja plansza
          </p>
          <div className="p-4 rounded-2xl" style={{
            background: 'rgba(6,20,45,0.85)',
            border: '1px solid rgba(56,189,248,0.12)',
          }}>
            <Board cells={myBoard} onCellClick={() => {}} interactive={false} skin={skin} />
          </div>
        </div>

        {/* Plansza bota */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-400 text-center tracking-widest uppercase">
            Plansza bota
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
              skin={skin}
              showWave={isMyTurn}
            />
          </div>
        </div>
      </div>

      {/* Fleet tracker */}
      <div className="relative z-10 w-full max-w-2xl px-4">
        <FleetTracker ships={botShips} shots={myShots} />
      </div>
    </div>
  )
}
