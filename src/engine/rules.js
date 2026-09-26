// Knotenpunkt - Regelkonstanten und Grundfunktionen.
// Alles hier ist rein deterministisch: kein Zufall, keine Zeitabhaengigkeit.

export const TYPES = ['reiter', 'bogen', 'schild'];

export const TYPE_INFO = {
  reiter: { key: 'reiter', name: 'Reiter', short: 'R', beats: 'bogen' },
  bogen:  { key: 'bogen',  name: 'Bogen',  short: 'B', beats: 'schild' },
  schild: { key: 'schild', name: 'Schild', short: 'S', beats: 'reiter' },
};

/** Schere-Stein-Papier: schlaegt Typ a den Typ b? */
export function beats(a, b) {
  return TYPE_INFO[a] !== undefined && TYPE_INFO[a].beats === b;
}

export const CONFIG = {
  rings: 3,            // Ringe um den Knotenpunkt (Ring 3 = Basisring)
  startEnergy: 2,      // Startenergie jedes Spielers
  buildCost: 2,        // Energie pro neuer Einheit
  incomeEarly: 1,      // Energie pro Quelle, Runde 1..lateRound-1
  incomeLate: 2,       // Energie pro Quelle ab lateRound (gegen Endlosschleifen)
  lateRound: 11,
  maxRounds: 15,       // danach entscheiden Punkte
  holdRoundsToWin: 2,  // Mehrheit muss so viele Runden in Folge gehalten werden
};

/**
 * Wie viele Runden in Folge die Mehrheit gehalten werden muss.
 *
 * Zu zweit eine Runde mehr als sonst. Der Grund steckt im Kraefteverhaeltnis:
 * Wer die Mehrheit erreicht, hat im Duell etwa gleich viele Figuren wie sein
 * Gegner (gemessen 3,42 zu 3,15). Um eine Quelle zurueckzuholen, muss der
 * Gegner also einen Kampf bei Gleichstand gewinnen - das gelingt nur in 14 %
 * der Anlaeufe, die Partie ist nach 5,2 Runden vorbei. Ab drei Gegnern steht
 * der Fuehrende 1:1,5 bzw. 1:1,9 und kann nicht mehr alles decken; dort
 * scheitern schon 40 % bzw. 50 % der Anlaeufe, eine Runde genuegt.
 *
 * Mit einer zweiten Verteidigungsrunde steigt die Quote im Duell auf 29 %,
 * die Partie dauert 6,7 statt 5,2 Runden - und es bleibt bei 100 % Siegen
 * durch Eroberung. Ab drei Spielern waere dieselbe Aenderung schaedlich:
 * bei vier Spielern faellt der Anteil der Eroberungssiege von 50 % auf
 * 31 %, der Rest endet am Rundenlimit mit Punktezaehlen.
 */
export function holdRoundsNeeded(playerCount) {
  return playerCount === 2 ? 3 : 2;
}

/** Mehrheit der Quellen, die sofort gewinnt. */
export function majorityNeeded(sourceCount) {
  return Math.floor(sourceCount / 2) + 1;
}

/** Energie pro kontrollierter Quelle in dieser Runde. */
export function incomePerSource(round, config = CONFIG) {
  return round >= config.lateRound ? config.incomeLate : config.incomeEarly;
}

export const PLAYER_COLORS = [
  '#e4572e', // rot
  '#2e86ab', // blau
  '#3fa34d', // gruen
  '#d9a404', // gold
  '#8e5ea2', // violett
  '#00a6a6', // tuerkis
];

export const PLAYER_NAMES = ['Rot', 'Blau', 'Grün', 'Gold', 'Violett', 'Türkis'];
