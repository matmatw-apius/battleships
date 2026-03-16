import { useState, useEffect, useRef, useCallback } from 'react'
import Board from './Board'
import type { Cell, CellState } from './Board'
import type { PlacedShip } from '../types/game'
import { placeShipsRandomly, createBotShooter } from '../lib/bot'
import { playShoot, playHit, playMiss, playSunk, playWin, playLose } from '../lib/sounds'
import HelpModal from './HelpModal'

const TURN_SECONDS = 30

type BotGameProps = {
  myShips: PlacedShip[]
  myUsername: string
  skin: 'ocean' | 'arctic' | 'lava'
  onReturnToLobby: () => void
}

type ShotEntry = { row: number; col: number; result: 'hit' | 'miss' | 'sunk' }
type Toast     = { text: string; type: 'info' | 'success' | 'error' }

// ─── Pomocnicze funkcje planszy ──────────────────────────────────────────────

function createEmptyBoard(): Cell[][] {
  return Array.from({ length: 10 }, (_, r) =>
    Array.from({ length: 10 }, (_, c) => ({ row: r, col: c, state: 'empty' as CellState }))
  )
}

function buildMyBoard(ships: PlacedShip[], botShots: ShotEntry[]): Cell[][] {
  const board = createEmptyBoard()
  ships.forEach(s => s.cells.forEach(({ row, col }) => { board[row][col].state = 'ship' }))
  botShots.forEach(s => { board[s.row][s.col].state = s.result === 'miss' ? 'miss' : 'hit' })
  return board
}

function buildEnemyBoard(shots: ShotEntry[]): Cell[][] {
  const board = createEmptyBoard()
  shots.forEach(s => { board[s.row][s.col].state = s.result === 'miss' ? 'miss' : 'hit' })
  return board
}

// ─── Fleet Tracker ───────────────────────────────────────────────────────────

function FleetTracker({ ships, shots }: { ships: PlacedShip[]; shots: ShotEntry[] }) {
  const hit = new Set(shots.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`))
  return (
    <div className="flex flex-wrap gap-4 p-4 rounded-2xl"
      style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.2)' }}>
      <p className="w-full text-xs font-semibold text-cyan-500 tracking-widest uppercase mb-1">Flota bota</p>
      {ships.map(ship => {
        const sunk = ship.cells.every(c => hit.has(`${c.row}-${c.col}`))
        return (
          <div key={ship.shipId} className="flex flex-col gap-1">
            <div className="flex gap-0.5">
              {Array.from({ length: ship.size }, (_, i) => (
                <div key={i} className={`h-3.5 w-5 rounded-sm transition-colors ${sunk ? 'bg-red-500' : 'bg-gray-600'}`} />
              ))}
            </div>
            <span className={`text-xs ${sunk ? 'text-red-400 line-through' : 'text-slate-500'}`}>
              {sunk ? `${ship.name} ✓` : '???'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Pomocnicze etykiety pól ─────────────────────────────────────────────────

function cellLabel(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`
}

// ─── Główny komponent ────────────────────────────────────────────────────────

export default function BotGame({ myShips, myUsername: _myUsername, skin, onReturnToLobby }: BotGameProps) {
  const [botShips]         = useState<PlacedShip[]>(() => placeShipsRandomly())
  const botShooterRef       = useRef(createBotShooter())

  const [myBoard, setMyBoard]       = useState<Cell[][]>(() => buildMyBoard(myShips, []))
  const [enemyBoard, setEnemyBoard] = useState<Cell[][]>(createEmptyBoard)
  const [myShots, setMyShots]       = useState<ShotEntry[]>([])
  const botShotsRef                  = useRef<ShotEntry[]>([])

  const [currentTurn, setCurrentTurn] = useState<'player' | 'bot'>('player')
  const [gameStatus, setGameStatus]   = useState<'battle' | 'finished'>('battle')
  const [winner, setWinner]           = useState<'player' | 'bot' | null>(null)
  const [timeLeft, setTimeLeft]       = useState(TURN_SECONDS)
  const timerRef                       = useRef<ReturnType<typeof setInterval> | null>(null)
  // botTurnVersion – inkrementowany po każdym ruchu bota (hit/sunk), wymusza ponowne wejście w efekt
  const [botTurnVersion, setBotTurnVersion] = useState(0)
  const botBusy                        = useRef(false)

  // Power-upy
  const [radarUsed,  setRadarUsed]    = useState(false)
  const [doubleUsed, setDoubleUsed]   = useState(false)
  const [doubleShot, setDoubleShot]   = useState(false)
  const [doubleShotsLeft, setDoubleShotsLeft] = useState(2)
  const [nalotUsed,  setNalotUsed]    = useState(false)
  const [sonarUsed,  setSonarUsed]    = useState(false)

  const [toast, setToast] = useState<Toast | null>(null)
  const isMyTurn = currentTurn === 'player'

  function showToast(text: string, type: Toast['type'] = 'info') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ─── Timer tury ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (gameStatus !== 'battle') return
    setTimeLeft(TURN_SECONDS)
    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (currentTurn === 'player') {
            showToast('Czas minął! Tura bota.', 'info')
            setCurrentTurn('bot')
          }
          return TURN_SECONDS
        }
        return prev - 1
      })
    }, 1000)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [currentTurn, gameStatus, botTurnVersion])

  // ─── Ruch bota ──────────────────────────────────────────────────────────────
  // botTurnVersion w deps pozwala re-triggerować efekt po trafieniu (bez zmiany currentTurn)

  useEffect(() => {
    if (gameStatus !== 'battle' || currentTurn !== 'bot') return
    if (botBusy.current) return
    botBusy.current = true

    const timeout = setTimeout(() => {
      const { row, col } = botShooterRef.current.nextShot()
      playShoot()

      // Oblicz wynik
      const hitShip = myShips.find(s => s.cells.some(c => c.row === row && c.col === col))
      const prevHits = new Set(botShotsRef.current.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`))
      prevHits.add(`${row}-${col}`)
      const result: 'hit' | 'miss' | 'sunk' = hitShip
        ? hitShip.cells.every(c => prevHits.has(`${c.row}-${c.col}`)) ? 'sunk' : 'hit'
        : 'miss'

      const newBotShots = [...botShotsRef.current, { row, col, result }]
      botShotsRef.current = newBotShots
      setMyBoard(buildMyBoard(myShips, newBotShots))
      botShooterRef.current.registerResult(row, col, result)

      if (result === 'sunk') {
        playSunk()
        const s = myShips.find(s => s.cells.some(c => c.row === row && c.col === col))
        showToast(`💥 Twój ${s?.name ?? 'statek'} został zatopiony!`, 'error')
      } else if (result === 'hit') {
        playHit()
        showToast('🎯 Bot trafił twój statek!', 'error')
      } else {
        playMiss()
      }

      // Sprawdź przegraną
      const hitKeys = new Set(newBotShots.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`))
      const allSunk = myShips.every(s => s.cells.every(c => hitKeys.has(`${c.row}-${c.col}`)))

      botBusy.current = false

      if (allSunk) {
        setGameStatus('finished')
        setWinner('bot')
        playLose()
      } else if (result === 'miss') {
        // Pudło – przekaż turę graczowi
        setCurrentTurn('player')
      } else {
        // Trafienie/zatopienie – bot strzela ponownie
        // Inkrementuj wersję żeby re-triggerować ten efekt (currentTurn nie zmienia się)
        setBotTurnVersion(v => v + 1)
      }
    }, 900)

    return () => {
      clearTimeout(timeout)
      botBusy.current = false
    }
  }, [currentTurn, gameStatus, myShips, botTurnVersion])

  // ─── Strzał gracza ───────────────────────────────────────────────────────────

  const handleShoot = useCallback((row: number, col: number) => {
    if (gameStatus !== 'battle' || currentTurn !== 'player') return
    if (myShots.some(s => s.row === row && s.col === col)) {
      showToast('To pole było już strzelane', 'info'); return
    }

    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    playShoot()

    const hitShip = botShips.find(s => s.cells.some(c => c.row === row && c.col === col))
    const prevHits = new Set(myShots.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`))
    prevHits.add(`${row}-${col}`)
    const result: 'hit' | 'miss' | 'sunk' = hitShip
      ? hitShip.cells.every(c => prevHits.has(`${c.row}-${c.col}`)) ? 'sunk' : 'hit'
      : 'miss'

    const newShots = [...myShots, { row, col, result }]
    setMyShots(newShots)
    setEnemyBoard(buildEnemyBoard(newShots))

    if (result === 'sunk') { playSunk(); showToast(`💥 ${hitShip!.name} zatopiony!`, 'success') }
    else if (result === 'hit') { playHit(); showToast('🎯 Trafiony! Strzelasz ponownie!', 'success') }
    else { playMiss() }

    // Warunek wygranej
    const hitKeys = new Set(newShots.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`))
    if (botShips.every(s => s.cells.every(c => hitKeys.has(`${c.row}-${c.col}`)))) {
      setGameStatus('finished'); setWinner('player'); playWin(); return
    }

    // Podwójny strzał
    if (doubleShot) {
      const left = doubleShotsLeft - 1
      setDoubleShotsLeft(left)
      if (left <= 0 || result === 'miss') {
        setDoubleShot(false); setDoubleShotsLeft(2)
        if (result === 'miss') setCurrentTurn('bot')
        else setBotTurnVersion(v => v + 1) // reset timera po wyczerpaniu salwy
      }
      return
    }

    if (result === 'miss') setCurrentTurn('bot')
    // hit/sunk bez salwy – gracz strzela ponownie (timer resetuje się przez timerVersion)
  }, [gameStatus, currentTurn, myShots, botShips, doubleShot, doubleShotsLeft])

  // ─── Power-up: Radar ─────────────────────────────────────────────────────────

  function handleRadar() {
    if (radarUsed || !isMyTurn) return
    const unrevealed = []
    for (let r = 0; r < 10; r++)
      for (let c = 0; c < 10; c++)
        if (!myShots.some(s => s.row === r && s.col === c))
          unrevealed.push({ row: r, col: c })
    if (!unrevealed.length) return
    const t = unrevealed[Math.floor(Math.random() * unrevealed.length)]
    const hasShip = botShips.some(s => s.cells.some(c => c.row === t.row && c.col === t.col))
    showToast(`🔍 Radar: ${cellLabel(t.row, t.col)} — ${hasShip ? '🚢 Statek!' : '🌊 Woda'}`, 'info')
    setRadarUsed(true)
  }

  // ─── Power-up: Salwa ×2 ──────────────────────────────────────────────────────

  function handleDoubleShot() {
    if (doubleUsed || !isMyTurn) return
    setDoubleShot(true); setDoubleShotsLeft(2); setDoubleUsed(true)
    showToast('💣 Salwa aktywna! Masz 2 strzały.', 'success')
  }

  // ─── Power-up: Nalot ─────────────────────────────────────────────────────────
  // Bombarduje cały wiersz z największą liczbą nieodkrytych pól

  function handleNalot() {
    if (nalotUsed || !isMyTurn) return

    // Wybierz wiersz z największą liczbą nieodkrytych pól
    const shotSet = new Set(myShots.map(s => `${s.row}-${s.col}`))
    let bestRow = 0, bestCount = 0
    for (let r = 0; r < 10; r++) {
      const free = Array.from({ length: 10 }, (_, c) => c).filter(c => !shotSet.has(`${r}-${c}`)).length
      if (free > bestCount) { bestCount = free; bestRow = r }
    }

    const label = String.fromCharCode(65 + bestRow)
    const targets = Array.from({ length: 10 }, (_, c) => c).filter(c => !shotSet.has(`${bestRow}-${c}`))
    if (!targets.length) { showToast('Wszystkie pola w tym wierszu już strzelane!', 'info'); return }

    // Wykonaj wszystkie strzały
    const newShots = [...myShots]
    let hitsCount = 0, sunkCount = 0
    for (const col of targets) {
      const hitShip = botShips.find(s => s.cells.some(c => c.row === bestRow && c.col === col))
      const prevHits = new Set(newShots.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`))
      prevHits.add(`${bestRow}-${col}`)
      const result: 'hit' | 'miss' | 'sunk' = hitShip
        ? hitShip.cells.every(c => prevHits.has(`${c.row}-${c.col}`)) ? 'sunk' : 'hit'
        : 'miss'
      newShots.push({ row: bestRow, col, result })
      if (result === 'sunk') sunkCount++
      else if (result === 'hit') hitsCount++
    }

    setMyShots(newShots)
    setEnemyBoard(buildEnemyBoard(newShots))
    setNalotUsed(true)

    if (sunkCount > 0) { playSunk(); showToast(`✈️ Nalot na rząd ${label}! Zatopiono ${sunkCount} ${sunkCount === 1 ? 'statek' : 'statki'}!`, 'success') }
    else if (hitsCount > 0) { playHit(); showToast(`✈️ Nalot na rząd ${label}! ${hitsCount} trafień!`, 'success') }
    else { playMiss(); showToast(`✈️ Nalot na rząd ${label} — pudło!`, 'info') }

    // Sprawdź wygraną
    const hitKeys = new Set(newShots.filter(s => s.result !== 'miss').map(s => `${s.row}-${s.col}`))
    if (botShips.every(s => s.cells.every(c => hitKeys.has(`${c.row}-${c.col}`)))) {
      setGameStatus('finished'); setWinner('player'); playWin(); return
    }

    // Nalot zawsze oddaje turę
    setCurrentTurn('bot')
  }

  // ─── Power-up: Sonar ─────────────────────────────────────────────────────────
  // Skanuje losowy obszar 3×3 i podaje liczbę statków

  function handleSonar() {
    if (sonarUsed || !isMyTurn) return
    const r = 1 + Math.floor(Math.random() * 8)  // 1..8 żeby 3×3 mieściło się w planszy
    const c = 1 + Math.floor(Math.random() * 8)
    let count = 0
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++)
        if (botShips.some(s => s.cells.some(cell => cell.row === r + dr && cell.col === c + dc)))
          count++
    const area = `${cellLabel(r - 1, c - 1)}–${cellLabel(r + 1, c + 1)}`
    showToast(`🌊 Sonar [${area}]: ${count === 0 ? 'brak statków' : `${count} ${count === 1 ? 'pole ze statkiem' : 'pola ze statkami'}`}`, 'info')
    setSonarUsed(true)
  }

  // ─── Rendering ────────────────────────────────────────────────────────────────

  const bgStyle = { background: 'radial-gradient(ellipse at 50% 40%, #0d2244 0%, #060e22 55%, #020810 100%)' }

  if (gameStatus === 'finished') {
    const won = winner === 'player'
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={bgStyle}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-5 px-16 py-10 rounded-2xl text-center"
          style={{ background: 'rgba(6,20,45,0.95)', border: `1px solid ${won ? 'rgba(74,222,128,0.4)' : 'rgba(239,68,68,0.4)'}`, boxShadow: `0 0 60px ${won ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)'}` }}>
          <p className="text-6xl">{won ? '🏆' : '💀'}</p>
          <div>
            <h2 className={`text-3xl font-black ${won ? 'text-green-400' : 'text-red-400'}`}>{won ? 'Wygrałeś!' : 'Przegrałeś!'}</h2>
            <p className="text-slate-400 text-sm mt-1">{won ? 'Zatopiłeś flotę bota!' : 'Bot zatopił twoją flotę.'}</p>
          </div>
          <button onClick={onReturnToLobby}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #0e7490, #0369a1)', border: '1px solid rgba(56,189,248,0.4)' }}>
            🔄 Zagraj ponownie
          </button>
          <button onClick={onReturnToLobby}
            className="w-full py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-300 transition-colors border border-slate-700/50">
            ← Wróć do lobby
          </button>
        </div>
      </div>
    )
  }

  const timerPct   = (timeLeft / TURN_SECONDS) * 100
  const timerColor = timeLeft > 20 ? '#22d3ee' : timeLeft > 10 ? '#fb923c' : '#ef4444'

  // Pomocnicza klasa przycisku power-up
  function pwBtn(used: boolean, color: string): string {
    if (used) return 'opacity-40 cursor-not-allowed bg-slate-800/40 text-slate-500 border border-slate-700/40'
    if (!isMyTurn) return 'opacity-60 cursor-not-allowed bg-slate-800/60 text-slate-400 border border-slate-700/40'
    return `${color} cursor-pointer`
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 relative overflow-hidden py-4" style={bgStyle}>
      {/* Tło sonaru */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" /><div className="sonar-ring w-64 h-64" />
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg whitespace-nowrap ${
          toast.type === 'success' ? 'bg-green-500/90 text-white' :
          toast.type === 'error'   ? 'bg-red-500/90 text-white' :
                                     'bg-slate-700/90 text-slate-200'
        }`}>{toast.text}</div>
      )}

      {/* Nagłówek */}
      <button onClick={onReturnToLobby}
        className="absolute top-4 left-4 z-20 px-3 py-1.5 rounded-full text-xs text-slate-500 hover:text-slate-300 transition-colors"
        style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.15)' }}>
        ← Lobby
      </button>
      <div className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-full text-xs flex items-center gap-2"
        style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.2)' }}>
        <span>🤖</span><span className="text-slate-400">vs Bot</span>
      </div>

      {/* Wskaźnik tury + timer */}
      <div className="relative z-10 flex flex-col items-center gap-1.5">
        <div className="px-6 py-2.5 rounded-full flex items-center gap-3"
          style={{ background: 'rgba(6,20,45,0.9)', border: `1px solid ${isMyTurn ? 'rgba(56,189,248,0.5)' : 'rgba(100,116,139,0.3)'}` }}>
          <span className={`w-2.5 h-2.5 rounded-full ${isMyTurn ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className={`text-sm font-semibold ${isMyTurn ? 'text-cyan-300' : 'text-slate-500'}`}>
            {isMyTurn ? 'Twoja tura — strzelaj!' : 'Tura bota…'}
          </span>
          <span className={`text-sm font-black font-mono ml-1 ${timeLeft <= 10 ? 'animate-pulse' : ''}`}
            style={{ color: timerColor }}>{timeLeft}s</span>
        </div>
        <div className="w-64 h-1 rounded-full bg-slate-800/60 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${timerPct}%`, background: timerColor }} />
        </div>
      </div>

      {/* Power-upy */}
      <div className="relative z-10 flex flex-wrap gap-2 justify-center px-4">
        <button onClick={handleRadar} disabled={radarUsed || !isMyTurn}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${pwBtn(radarUsed, 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50 hover:bg-cyan-900/80')}`}>
          🔍 Radar {radarUsed ? '✓' : ''}
        </button>
        <button onClick={handleDoubleShot} disabled={doubleUsed || !isMyTurn}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${doubleShot ? 'bg-orange-900/80 text-orange-300 border border-orange-600/60 animate-pulse' : pwBtn(doubleUsed, 'bg-orange-900/60 text-orange-300 border border-orange-700/50 hover:bg-orange-900/80')}`}>
          💣 Salwa {doubleShot ? `(${doubleShotsLeft})` : doubleUsed ? '✓' : '×2'}
        </button>
        <button onClick={handleNalot} disabled={nalotUsed || !isMyTurn}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${pwBtn(nalotUsed, 'bg-red-900/60 text-red-300 border border-red-700/50 hover:bg-red-900/80')}`}>
          ✈️ Nalot {nalotUsed ? '✓' : ''}
        </button>
        <button onClick={handleSonar} disabled={sonarUsed || !isMyTurn}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${pwBtn(sonarUsed, 'bg-blue-900/60 text-blue-300 border border-blue-700/50 hover:bg-blue-900/80')}`}>
          🌊 Sonar {sonarUsed ? '✓' : ''}
        </button>
      </div>

      {/* Plansze */}
      <div className="relative z-10 flex gap-4 items-start overflow-x-auto max-w-full px-2">
        <div className="flex flex-col gap-1.5 shrink-0">
          <p className="text-xs font-semibold text-slate-400 text-center tracking-widest uppercase">Twoja plansza</p>
          <div className="p-3 rounded-2xl" style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.12)' }}>
            <Board cells={myBoard} onCellClick={() => {}} interactive={false} skin={skin} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <p className="text-xs font-semibold text-slate-400 text-center tracking-widest uppercase">Plansza bota</p>
          <div className="p-3 rounded-2xl transition-all" style={{ background: 'rgba(6,20,45,0.85)', border: `1px solid ${isMyTurn ? 'rgba(56,189,248,0.4)' : 'rgba(56,189,248,0.1)'}`, boxShadow: isMyTurn ? '0 0 30px rgba(56,189,248,0.12)' : 'none' }}>
            <Board cells={enemyBoard} onCellClick={handleShoot} isEnemy interactive={isMyTurn} skin={skin} showWave={isMyTurn} />
          </div>
        </div>
      </div>

      {/* Fleet tracker */}
      <div className="relative z-10 w-full max-w-2xl px-4">
        <FleetTracker ships={botShips} shots={myShots} />
      </div>

      <HelpModal />
    </div>
  )
}
