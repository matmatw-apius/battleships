import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type PlayerRow = {
  player_id: string
  username: string
  wins: number
  losses: number
}

export default function Leaderboard() {
  const [rows, setRows] = useState<PlayerRow[]>([])

  useEffect(() => {
    supabase
      .from('players')
      .select('player_id, username, wins, losses')
      .order('wins', { ascending: false })
      .limit(10)
      .then(({ data }) => { if (data) setRows(data as PlayerRow[]) })
  }, [])

  if (rows.length === 0) return null

  return (
    <div
      className="w-full max-w-sm rounded-2xl overflow-hidden"
      style={{ background: 'rgba(6,20,45,0.85)', border: '1px solid rgba(56,189,248,0.2)' }}
    >
      <div className="px-5 py-3 border-b border-white/5">
        <p className="text-xs font-bold text-cyan-500 tracking-widest uppercase">🏆 Tablica wyników</p>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 uppercase tracking-wider">
            <th className="px-4 py-2 text-left">#</th>
            <th className="px-4 py-2 text-left">Gracz</th>
            <th className="px-4 py-2 text-center">W</th>
            <th className="px-4 py-2 text-center">P</th>
            <th className="px-4 py-2 text-center">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const total = r.wins + r.losses
            const pct   = total > 0 ? Math.round((r.wins / total) * 100) : 0
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
            return (
              <tr key={r.player_id} className={`border-t border-white/5 ${i === 0 ? 'text-yellow-300' : 'text-slate-300'}`}>
                <td className="px-4 py-2">{medal}</td>
                <td className="px-4 py-2 font-semibold truncate max-w-[100px]">{r.username}</td>
                <td className="px-4 py-2 text-center text-green-400">{r.wins}</td>
                <td className="px-4 py-2 text-center text-red-400">{r.losses}</td>
                <td className="px-4 py-2 text-center text-slate-400">{pct}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
