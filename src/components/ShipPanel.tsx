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
  onSelectShip: (id: string) => void
  onRotate: () => void
}

export default function ShipPanel({
  fleet,
  selectedShipId,
  orientation,
  onSelectShip,
  onRotate,
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
              {/* Wizualne bloki reprezentujące rozmiar statku */}
              <div className="flex gap-0.5">
                {Array.from({ length: ship.size }, (_, i) => (
                  <div
                    key={i}
                    className={`h-4 flex-1 rounded-sm transition-colors ${
                      isSelected
                        ? 'bg-cyan-400'
                        : isFullyPlaced
                        ? 'bg-green-500/60'
                        : 'bg-gray-400'
                    }`}
                  />
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

      {/* Separator */}
      <div className="h-px bg-cyan-900/60" />

      {/* Przycisk obrotu statku */}
      <button
        onClick={onRotate}
        className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-cyan-300
          border border-cyan-800/50 hover:border-cyan-500/50 hover:bg-cyan-950/50
          transition-all duration-150 flex items-center justify-center gap-2"
      >
        <span className="text-base leading-none">⟳</span>
        Obróć — {orientation === 'h' ? 'poziomo →' : 'pionowo ↓'}
      </button>

      {/* Komunikat po rozmieszczeniu całej floty */}
      {allPlaced && (
        <div className="text-center text-xs text-green-400 font-semibold animate-pulse">
          Flota gotowa do walki!
        </div>
      )}
    </div>
  )
}
