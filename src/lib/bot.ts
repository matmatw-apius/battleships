import type { PlacedShip } from '../types/game'
import { INITIAL_FLEET } from '../components/ShipPanel'

// Sprawdza czy pole mieści się w granicach planszy 10x10
function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 10 && col >= 0 && col < 10
}

// Sprawdza czy dane pole sąsiaduje (8 kierunków) z jakimś zajętym polem
function hasAdjacentShip(grid: boolean[][], row: number, col: number): boolean {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = row + dr
      const nc = col + dc
      if (inBounds(nr, nc) && grid[nr][nc]) return true
    }
  }
  return false
}

// Losowo rozstawia całą flotę na planszy 10x10
export function placeShipsRandomly(): PlacedShip[] {
  const grid: boolean[][] = Array.from({ length: 10 }, () => Array(10).fill(false))
  const placed: PlacedShip[] = []

  for (const shipType of INITIAL_FLEET) {
    // Dla każdej sztuki statku w flocie
    for (let n = 0; n < shipType.count; n++) {
      let success = false
      let attempts = 0

      while (!success && attempts < 500) {
        attempts++
        // Losowa orientacja i pozycja startowa
        const orientation: 'h' | 'v' = Math.random() < 0.5 ? 'h' : 'v'
        const row = Math.floor(Math.random() * 10)
        const col = Math.floor(Math.random() * 10)

        // Wygeneruj komórki statku
        const cells: { row: number; col: number }[] = []
        let valid = true

        for (let i = 0; i < shipType.size; i++) {
          const r = orientation === 'v' ? row + i : row
          const c = orientation === 'h' ? col + i : col

          if (!inBounds(r, c) || grid[r][c] || hasAdjacentShip(grid, r, c)) {
            valid = false
            break
          }
          cells.push({ row: r, col: c })
        }

        // Dodatkowa weryfikacja – żadna komórka nie sąsiaduje z już postawionymi
        if (valid) {
          // Sprawdź sąsiedztwo dla całego zestawu komórek razem
          const cellSet = new Set(cells.map(c => `${c.row}-${c.col}`))
          for (const { row: r, col: c } of cells) {
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue
                const nr = r + dr
                const nc = c + dc
                if (inBounds(nr, nc) && grid[nr][nc] && !cellSet.has(`${nr}-${nc}`)) {
                  valid = false
                }
              }
            }
          }
        }

        if (valid) {
          // Zaznacz pola w siatce
          for (const { row: r, col: c } of cells) {
            grid[r][c] = true
          }
          placed.push({
            shipId: `${shipType.id}_${n}`,
            name: shipType.name,
            size: shipType.size,
            cells,
          })
          success = true
        }
      }
    }
  }

  return placed
}

// Typy pomocnicze dla strzelca bota
type ShotResult = 'hit' | 'miss' | 'sunk'

// Tworzy obiekt strzelca bota z algorytmem hunt/target
export function createBotShooter() {
  // Siatka strzałów: true = już strzelano
  const shotGrid: boolean[][] = Array.from({ length: 10 }, () => Array(10).fill(false))

  // Kolejka celów (tryb target – po trafieniu)
  let targetQueue: { row: number; col: number }[] = []

  // Historia ostatnich trafień w serii (do wyznaczenia kierunku)
  let hitStreak: { row: number; col: number }[] = []

  // Tryb bota: 'hunt' = szachownica, 'target' = po trafieniu
  let mode: 'hunt' | 'target' = 'hunt'

  // Wyznacz następny strzał
  function nextShot(): { row: number; col: number } {
    // Tryb target – strzelaj z kolejki
    if (mode === 'target' && targetQueue.length > 0) {
      // Wybierz pierwszą dostępną pozycję z kolejki
      while (targetQueue.length > 0) {
        const next = targetQueue.shift()!
        if (!shotGrid[next.row][next.col]) return next
      }
      // Kolejka wyczerpana – wróć do huntera
      mode = 'hunt'
      hitStreak = []
    }

    // Tryb hunt – wzorzec szachownicy
    const candidates: { row: number; col: number }[] = []
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (!shotGrid[r][c] && (r + c) % 2 === 0) {
          candidates.push({ row: r, col: c })
        }
      }
    }

    // Jeśli brak kandydatów w szachownicy – strzelaj gęściej
    if (candidates.length === 0) {
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          if (!shotGrid[r][c]) candidates.push({ row: r, col: c })
        }
      }
    }

    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  // Zarejestruj wynik strzału
  function registerResult(row: number, col: number, result: ShotResult) {
    shotGrid[row][col] = true

    if (result === 'sunk') {
      // Statek zatopiony – wyczyść kolejkę, wróć do huntera
      targetQueue = []
      hitStreak = []
      mode = 'hunt'
      return
    }

    if (result === 'hit') {
      hitStreak.push({ row, col })
      mode = 'target'

      if (hitStreak.length >= 2) {
        // Mamy 2+ trafień – ustal kierunek i kontynuuj
        const first = hitStreak[0]
        const last  = hitStreak[hitStreak.length - 1]
        const dr = last.row - first.row
        const dc = last.col - first.col
        // Normalizuj do kroku jednostkowego
        const step = Math.max(Math.abs(dr), Math.abs(dc))
        const unitDr = step > 0 ? dr / step : 0
        const unitDc = step > 0 ? dc / step : 0

        // Dodaj kolejne pole w tym samym kierunku
        const ahead = { row: last.row + unitDr, col: last.col + unitDc }
        const behind = { row: first.row - unitDr, col: first.col - unitDc }

        targetQueue = []
        if (inBounds(ahead.row, ahead.col) && !shotGrid[ahead.row][ahead.col]) {
          targetQueue.push(ahead)
        }
        if (inBounds(behind.row, behind.col) && !shotGrid[behind.row][behind.col]) {
          targetQueue.push(behind)
        }
      } else {
        // Pierwsze trafienie – dodaj sąsiadów poziomo i pionowo
        const neighbors = [
          { row: row - 1, col },
          { row: row + 1, col },
          { row, col: col - 1 },
          { row, col: col + 1 },
        ]
        targetQueue = neighbors.filter(n => inBounds(n.row, n.col) && !shotGrid[n.row][n.col])
      }
    } else {
      // Pudło – jeśli kolejka pusta, wróć do huntera
      if (targetQueue.length === 0 && hitStreak.length === 0) {
        mode = 'hunt'
      }
    }
  }

  return { nextShot, registerResult }
}
