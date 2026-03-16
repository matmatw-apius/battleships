import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

type Message = { from: 'me' | 'them'; text: string; ts: number }

type ChatPanelProps = {
  gameId: string
  myPlayerId: string
  myUsername: string
}

export default function ChatPanel({ gameId, myPlayerId, myUsername }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [open, setOpen]         = useState(false)
  const [unread, setUnread]     = useState(0)
  const endRef  = useRef<HTMLDivElement>(null)
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    const channel = supabase.channel(`chat:${gameId}`)
    chanRef.current = channel

    channel
      .on('broadcast', { event: 'msg' }, ({ payload }: { payload: { pid: string; text: string; ts: number } }) => {
        if (payload.pid === myPlayerId) return // własne wiadomości już dodane lokalnie
        setMessages(prev => [...prev, { from: 'them', text: payload.text, ts: payload.ts }])
        setUnread(u => u + 1)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId, myPlayerId])

  // Przewiń na dół przy nowych wiadomościach
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  // Wyzeruj unread przy otwarciu
  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  async function send() {
    const text = input.trim()
    if (!text) return
    setInput('')
    const ts = Date.now()
    setMessages(prev => [...prev, { from: 'me', text, ts }])
    await chanRef.current?.send({
      type: 'broadcast', event: 'msg',
      payload: { pid: myPlayerId, username: myUsername, text, ts },
    })
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Panel wiadomości */}
      {open && (
        <div
          className="flex flex-col w-72 rounded-2xl overflow-hidden"
          style={{ background: 'rgba(6,18,40,0.97)', border: '1px solid rgba(56,189,248,0.25)', boxShadow: '0 0 30px rgba(0,0,0,0.6)' }}
        >
          {/* Nagłówek */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
            <span className="text-xs font-bold text-cyan-400 tracking-widest uppercase">Czat</span>
            <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
          </div>

          {/* Lista wiadomości */}
          <div className="flex flex-col gap-2 p-3 h-52 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-slate-600 text-xs text-center mt-8">Brak wiadomości</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`px-3 py-1.5 rounded-xl text-xs max-w-[80%] break-words ${
                    m.from === 'me'
                      ? 'bg-cyan-600/80 text-white rounded-br-sm'
                      : 'bg-slate-700/80 text-slate-200 rounded-bl-sm'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 p-3 border-t border-white/5">
            <input
              className="flex-1 bg-slate-800/60 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none placeholder-slate-600 border border-slate-700/50 focus:border-cyan-500/40"
              placeholder="Napisz coś…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              maxLength={120}
            />
            <button
              onClick={send}
              className="px-3 py-2 rounded-lg text-xs font-bold text-white bg-cyan-600/80 hover:bg-cyan-500/80 transition-colors"
            >
              ➤
            </button>
          </div>
        </div>
      )}

      {/* Przycisk otwierający */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all active:scale-95"
        style={{ background: 'rgba(6,18,40,0.95)', border: '1px solid rgba(56,189,248,0.3)', boxShadow: '0 0 20px rgba(56,189,248,0.15)' }}
      >
        💬
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>
    </div>
  )
}
