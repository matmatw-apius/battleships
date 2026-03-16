// Pojedynczy postawiony statek z pozycjami pól na planszy
export type PlacedShip = {
  shipId: string
  name: string
  size: number
  cells: { row: number; col: number }[]
}

// Rekord strzału z bazy danych
export type ShotRecord = {
  id: string
  player_id: string
  row: number
  col: number
  result: 'hit' | 'miss' | 'sunk'
}

// Wiersz tabeli games z bazy danych
export type GameRow = {
  id: string
  player1_id: string
  player2_id: string
  status: string
  current_turn: string
  winner_id: string | null
}
