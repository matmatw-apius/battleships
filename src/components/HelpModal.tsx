import { useState } from 'react'

// Sekcje pomocy z ikonami i opisami
const HELP_SECTIONS = [
  {
    icon: '🎮',
    title: 'Jak grać',
    desc: 'Ustaw swoją flotę na planszy, a następnie strzelaj w planszę przeciwnika. Wygrywa ten, kto pierwszy zatopi całą flotę wroga.',
  },
  {
    icon: '⏱️',
    title: 'Timer',
    desc: 'Każda tura trwa 30 sekund. Jeśli nie strzelisz w czasie, tura automatycznie przechodzi do przeciwnika.',
  },
  {
    icon: '🔍',
    title: 'Radar',
    desc: 'Jednorazowy power-up. Odkrywa losowe nieodkryte pole i informuje czy jest tam statek czy woda. Nie zużywa tury.',
  },
  {
    icon: '💣',
    title: 'Podwójny strzał',
    desc: 'Jednorazowy power-up. Pozwala oddać 2 strzały w jednej turze. Drugi strzał automatycznie przekazuje turę.',
  },
  {
    icon: '🤖',
    title: 'Gra vs Bot',
    desc: 'Tryb dla jednego gracza. Bot używa algorytmu hunt/target – losowo szuka statków, a po trafieniu kontynuuje w tym kierunku.',
  },
  {
    icon: '💬',
    title: 'Czat',
    desc: 'Możesz wysyłać wiadomości do przeciwnika podczas gry. Kliknij ikonę czatu w prawym dolnym rogu.',
  },
  {
    icon: '🏆',
    title: 'Tablica wyników',
    desc: 'W lobby możesz zobaczyć top graczy z największą liczbą wygranych. Graj więcej żeby wskoczyć na listę!',
  },
  {
    icon: '👁️',
    title: 'Tryb widza',
    desc: 'Wpisz kod pokoju żeby oglądać rozgrywkę na żywo. Widać obie plansze ze statkami i aktualizacje w czasie rzeczywistym.',
  },
  {
    icon: '🎨',
    title: 'Skórki',
    desc: 'Zmień wygląd planszy w ekranie ustawiania statków. Dostępne: Ocean (domyślna), Arktyka i Lawa.',
  },
]

export default function HelpModal() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Pływający przycisk ? */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-40 w-10 h-10 rounded-full flex items-center justify-center
          text-cyan-300 font-bold text-lg transition-all hover:scale-110 active:scale-95"
        style={{
          background: 'rgba(6,20,45,0.9)',
          border: '1px solid rgba(56,189,248,0.4)',
          boxShadow: '0 0 20px rgba(56,189,248,0.15)',
        }}
        title="Pomoc"
      >
        ?
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setOpen(false)}
        >
          {/* Karta modalu */}
          <div
            className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl p-6 flex flex-col gap-4"
            style={{
              background: 'rgba(6,20,45,0.98)',
              border: '1px solid rgba(56,189,248,0.3)',
              boxShadow: '0 0 60px rgba(56,189,248,0.12)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Nagłówek */}
            <div className="flex items-center justify-between">
              <h2 className="text-cyan-300 font-bold text-lg tracking-wide">Pomoc</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors text-xl font-bold leading-none w-8 h-8 flex items-center justify-center"
              >
                ×
              </button>
            </div>

            <div className="h-px bg-cyan-900/60" />

            {/* Sekcje */}
            <div className="flex flex-col gap-3">
              {HELP_SECTIONS.map(section => (
                <div
                  key={section.title}
                  className="flex gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <span className="text-2xl leading-none mt-0.5 shrink-0">{section.icon}</span>
                  <div>
                    <p className="text-cyan-400 text-sm font-semibold mb-0.5">{section.title}</p>
                    <p className="text-slate-400 text-xs leading-relaxed">{section.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Stopka */}
            <div className="h-px bg-cyan-900/60" />
            <p className="text-slate-600 text-xs text-center">
              Kliknij tło lub × aby zamknąć
            </p>
          </div>
        </div>
      )}
    </>
  )
}
