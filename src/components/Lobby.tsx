import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Klucze sessionStorage
const KEY_USERNAME  = 'bs_username'
const KEY_PLAYER_ID = 'bs_player_id'

// Pobiera lub generuje unikalny identyfikator sesji gracza
function getOrCreatePlayerId(): string {
  let id = sessionStorage.getItem(KEY_PLAYER_ID)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(KEY_PLAYER_ID, id)
  }
  return id
}

// Pierwsze 8 znaków UUID jako czytelny kod pokoju
function toRoomCode(gameId: string): string {
  return gameId.replace(/-/g, '').substring(0, 8).toUpperCase()
}

type LobbyView = 'menu' | 'waiting'

type LobbyProps = {
  onGameReady: (gameId: string, playerId: string, username: string) => void
}

export default function Lobby({ onGameReady }: LobbyProps) {
  const [username, setUsername] = useState(() => sessionStorage.getItem(KEY_USERNAME) ?? '')
  const [view, setView]         = useState<LobbyView>('menu')
  const [gameId, setGameId]     = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const [copied, setCopied]     = useState(false)

  const playerId = getOrCreatePlayerId()

  // Zapis pseudonimu w sessionStorage przy każdej zmianie
  function handleUsernameChange(val: string) {
    setUsername(val)
    sessionStorage.setItem(KEY_USERNAME, val)
  }

  // Tworzenie nowej gry w Supabase
  async function handleCreateGame() {
    if (!username.trim()) { setError('Wpisz pseudonim przed utworzeniem gry'); return }
    setError(null)
    setLoading(true)

    const { data, error: err } = await supabase
      .from('games')
      .insert({ player1_id: playerId, status: 'waiting' })
      .select()
      .single()

    setLoading(false)
    if (err || !data) { setError('Nie udało się utworzyć gry – spróbuj ponownie'); return }

    setGameId(data.id)
    setView('waiting')
  }

  // Dołączanie do gry po 8-znakowym kodzie pokoju
  async function handleJoinGame() {
    if (!username.trim()) { setError('Wpisz pseudonim przed dołączeniem'); return }
    if (joinCode.trim().length < 6) { setError('Wpisz kod pokoju'); return }
    setError(null)
    setLoading(true)

    // Szukamy gry po prefiksie UUID (bez myślników)
    const prefix = joinCode.trim().toLowerCase().replace(/[^a-f0-9]/g, '')
    const { data: found, error: findErr } = await supabase
      .from('games')
      .select()
      .ilike('id', `${prefix}%`)
      .eq('status', 'waiting')
      .limit(1)

    if (findErr || !found?.length) {
      setLoading(false)
      setError('Nie znaleziono pokoju – sprawdź kod i spróbuj ponownie')
      return
    }

    const game = found[0]

    if (game.player1_id === playerId) {
      setLoading(false)
      setError('Nie możesz dołączyć do własnej gry')
      return
    }

    // Dołącz jako player2 i zmień status na placement (wyzwoli Realtime u creatora)
    const { error: updateErr } = await supabase
      .from('games')
      .update({ player2_id: playerId, status: 'placement' })
      .eq('id', game.id)
      .eq('status', 'waiting')

    setLoading(false)
    if (updateErr) { setError('Nie udało się dołączyć do gry'); return }

    onGameReady(game.id, playerId, username.trim())
  }

  // Subskrypcja Realtime – creator czeka aż player2 dołączy
  const handleGameReady = useCallback(
    (gId: string) => onGameReady(gId, playerId, username.trim()),
    [onGameReady, playerId, username]
  )

  useEffect(() => {
    if (view !== 'waiting' || !gameId) return

    const channel = supabase
      .channel(`lobby:${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          const game = payload.new as { status: string }
          if (game.status === 'placement') handleGameReady(gameId)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [view, gameId, handleGameReady])

  // Kopiowanie kodu pokoju do schowka
  async function handleCopy() {
    await navigator.clipboard.writeText(toRoomCode(gameId))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #0d2244 0%, #060e22 55%, #020810 100%)' }}
    >
      {/* Tło – animowane kółka sonaru */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="sonar-ring w-64 h-64" />
        <div className="sonar-ring w-64 h-64" />
        <div className="sonar-ring w-64 h-64" />
      </div>

      {/* Tytuł */}
      <div className="relative z-10 flex flex-col items-center gap-1">
        <p className="text-cyan-500 text-sm font-semibold tracking-[0.3em] uppercase">⚓ Gra morska</p>
        <h1 className="title-glow text-5xl font-black tracking-tight text-white">
          STATKI<span className="text-cyan-400"> · </span>MULTIPLAYER
        </h1>
      </div>

      {/* Karta lobby */}
      <div
        className="relative z-10 w-full max-w-sm flex flex-col gap-4 p-7 rounded-2xl"
        style={{
          background: 'rgba(6, 20, 45, 0.9)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          boxShadow: '0 0 40px rgba(56,189,248,0.08), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {view === 'menu' && (
          <>
            {/* Pole pseudonimu */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-cyan-500 tracking-widest uppercase">
                Twój pseudonim
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateGame()}
                placeholder="Wpisz nick..."
                maxLength={20}
                className="w-full px-4 py-2.5 rounded-xl text-white placeholder-slate-600
                  text-sm font-medium outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(56,189,248,0.2)',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(56,189,248,0.6)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(56,189,248,0.2)')}
              />
            </div>

            {/* Przycisk tworzenia gry */}
            <button
              onClick={handleCreateGame}
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-bold text-white
                transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #0e7490 0%, #0369a1 100%)',
                boxShadow: '0 0 20px rgba(56,189,248,0.25), 0 4px 12px rgba(0,0,0,0.4)',
                border: '1px solid rgba(56,189,248,0.4)',
              }}
            >
              {loading ? 'Tworzenie…' : '🎮 Stwórz nową grę'}
            </button>

            {/* Separator */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-slate-600 text-xs">lub dołącz do gry</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Pole kodu pokoju + przycisk dołączenia */}
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinGame()}
                placeholder="Kod pokoju…"
                maxLength={12}
                className="flex-1 px-4 py-2.5 rounded-xl text-white placeholder-slate-600
                  text-sm font-mono font-medium outline-none transition-all tracking-widest"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(56,189,248,0.2)',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(56,189,248,0.6)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(56,189,248,0.2)')}
              />
              <button
                onClick={handleJoinGame}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-cyan-300
                  border border-cyan-800/50 hover:border-cyan-500/50 hover:bg-cyan-950/50
                  transition-all duration-150 disabled:opacity-50 whitespace-nowrap"
              >
                Dołącz →
              </button>
            </div>

            {/* Komunikat błędu */}
            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-950/60 border border-red-700/40">
                <span className="text-red-400 text-sm mt-0.5">⚠</span>
                <p className="text-red-300 text-xs leading-snug">{error}</p>
              </div>
            )}
          </>
        )}

        {view === 'waiting' && (
          <>
            {/* Potwierdzenie utworzenia gry */}
            <div className="text-center flex flex-col gap-1">
              <p className="text-green-400 text-xs font-semibold tracking-widest uppercase">Gra utworzona!</p>
              <p className="text-slate-400 text-xs">Podaj kod znajomemu</p>
            </div>

            {/* Wyświetlenie kodu pokoju */}
            <div className="flex flex-col items-center gap-3">
              <div
                className="px-8 py-4 rounded-2xl text-center"
                style={{
                  background: 'rgba(56,189,248,0.08)',
                  border: '1px solid rgba(56,189,248,0.3)',
                }}
              >
                <p className="text-xs text-cyan-600 uppercase tracking-widest mb-1">Kod pokoju</p>
                <p className="text-3xl font-black text-cyan-300 tracking-[0.2em] font-mono">
                  {toRoomCode(gameId)}
                </p>
              </div>

              <button
                onClick={handleCopy}
                className="text-xs font-semibold transition-colors"
                style={{ color: copied ? '#4ade80' : '#64748b' }}
              >
                {copied ? '✓ Skopiowano!' : '📋 Kopiuj kod'}
              </button>
            </div>

            {/* Animacja oczekiwania */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-cyan-400"
                    style={{ animation: `sonar 1.2s ease-in-out ${i * 0.25}s infinite` }}
                  />
                ))}
              </div>
              <p className="text-slate-400 text-sm">Czekam na drugiego gracza…</p>
            </div>

            <button
              onClick={() => { setView('menu'); setGameId(''); setError(null) }}
              className="text-slate-600 text-xs hover:text-slate-400 transition-colors text-center"
            >
              ← Wróć do menu
            </button>
          </>
        )}
      </div>

      {/* Stopka */}
      <p className="relative z-10 text-slate-700 text-xs">
        Twój nick: <span className="text-slate-500">{username || '—'}</span>
      </p>
    </div>
  )
}
