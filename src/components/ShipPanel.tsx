// Definicja typów statków floty
export type ShipType = {
  id: string
  name: string
  size: number
  count: number   // łączna liczba sztuk
  placed: number  // ile już postawiono
}

// Startowy skład floty gracza
export const INITIAL_FLEET: ShipType[] = [
  { id: 'carrier',    name: 'Lotniskowiec', size: 5, count: 1, placed: 0 },
  { id: 'battleship', name: 'Pancernik',    size: 4, count: 1, placed: 0 },
  { id: 'cruiser',    name: 'Krążownik',    size: 3, count: 2, placed: 0 },
  { id: 'destroyer',  name: 'Niszczyciel',  size: 2, count: 1, placed: 0 },
]

type ShipPanelProps = {
  fleet: ShipType[]
  selectedShipId: string | null
  orientation: 'h' | 'v'
  placementError: string | null
  onSelectShip: (id: string) => void
  onRotate: () => void
  onReady: () => void
}

export default function ShipPanel({
  fleet,
  selectedShipId,
  orientation,
  placementError,
  onSelectShip,
  onRotate,
  onReady,
}: ShipPanelProps) {
  // Sprawdzenie czy wszystkie statki zostały rozmieszczone
  const allPlaced = fleet.every((s) => s.placed >= s.count)

  return (
    <div
      className="flex flex-col gap-3 w-56 p-4 rounded-2xl"
      style={{
        background: 'rgba(6, 20, 45, 0.85)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        boxShadow: '0 0 40px rgba(56,189,248,0.08), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* Nagłówek panelu */}
      <div className="text-center">
        <p className="text-cyan-500 text-xs font-semibold tracking-widest uppercase mb-0.5">
          Twoja flota
        </p>
        <div className="h-px bg-cyan-900/60" />
      </div>

      {/* Lista statków */}
      <div className="flex flex-col gap-2">
        {fleet.map((ship) => {
          const isFullyPlaced = ship.placed >= ship.count
          const isSelected = ship.id === selectedShipId && !isFullyPlaced
          const remaining = ship.count - ship.placed

          return (
            <button
              key={ship.id}
              onClick={() => !isFullyPlaced && onSelectShip(ship.id)}
              disabled={isFullyPlaced}
              className={`
                w-full text-left p-2.5 rounded-xl transition-all duration-150
                flex flex-col gap-1.5
                ${isFullyPlaced
                  ? 'opacity-40 cursor-not-allowed'
                  : 'cursor-pointer hover:bg-white/5 active:scale-95'}
              `}
              style={isSelected ? {
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.5)',
                boxShadow: '0 0 12px rgba(56,189,248,0.15)',
              } : {
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {/* Graficzna sylwetka statku */}
              <div className="flex items-center gap-1">
                {/* Dziób */}
                <div className={`w-3 h-5 rounded-l-full rounded-r-sm transition-colors ${
                  isSelected ? 'bg-cyan-400' : isFullyPlaced ? 'bg-green-500/70' : 'bg-slate-400'
                }`} style={{ clipPath: 'polygon(0 30%, 100% 0, 100% 100%, 0 70%)' }} />
                {/* Kadłub */}
                {Array.from({ length: ship.size - 1 }, (_, i) => (
                  <div
                    key={i}
                    className={`h-5 flex-1 transition-colors relative ${
                      isSelected ? 'bg-cyan-500' : isFullyPlaced ? 'bg-green-500/60' : 'bg-slate-500'
                    }`}
                    style={{ borderRadius: i === ship.size - 2 ? '0 3px 3px 0' : '0' }}
                  >
                    {/* Iluminator */}
                    {i === Math.floor((ship.size - 2) / 2) && (
                      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-cyan-200/60' : isFullyPlaced ? 'bg-green-200/50' : 'bg-slate-300/40'
                      }`} />
                    )}
                  </div>
                ))}
              </div>

              {/* Nazwa i licznik */}
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium ${isSelected ? 'text-cyan-300' : 'text-slate-300'}`}>
                  {ship.name}
                </span>
                <span className={`text-xs font-bold ${
                  isFullyPlaced ? 'text-green-400' : isSelected ? 'text-cyan-400' : 'text-slate-500'
                }`}>
                  {isFullyPlaced ? '✓' : `${remaining}/${ship.count}`}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Komunikat błędu rozmieszczenia */}
      <div className={`overflow-hidden transition-all duration-200 ${placementError ? 'max-h-16' : 'max-h-0'}`}>
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-red-950/60 border border-red-700/40">
          <span className="text-red-400 text-sm leading-none mt-0.5">⚠</span>
          <p className="text-red-300 text-xs leading-snug">{placementError}</p>
        </div>
      </div>

      {/* Separator */}
      <div className="h-px bg-cyan-900/60" />

      {/* Przycisk obrotu statku */}
      {!allPlaced && (
        <button
          onClick={onRotate}
          className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-cyan-300
            border border-cyan-800/50 hover:border-cyan-500/50 hover:bg-cyan-950/50
            transition-all duration-150 flex items-center justify-center gap-2"
        >
          <span className="text-base leading-none">⟳</span>
          Obróć — {orientation === 'h' ? 'poziomo →' : 'pionowo ↓'}
        </button>
      )}

      {/* Przycisk gotowości do walki – pojawia się po rozstawieniu całej floty */}
      {allPlaced && (
        <button
          onClick={onReady}
          className="w-full py-3 px-3 rounded-xl text-sm font-bold text-white
            transition-all duration-200 active:scale-95 flex items-center justify-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #0e7490 0%, #0369a1 100%)',
            boxShadow: '0 0 20px rgba(56,189,248,0.35), 0 4px 12px rgba(0,0,0,0.4)',
            border: '1px solid rgba(56,189,248,0.4)',
          }}
        >
          <span className="text-base">⚔</span>
          Gotowy do walki!
        </button>
      )}
    </div>
  )
}
