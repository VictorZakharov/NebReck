/**
 * Original fiction for Nebula Reckoning. You are Wren Callis, a salvage pilot
 * in the Halcyon Drift, flying the prototype interceptor KV-7 "Kestrel" with
 * your ship AI, ECHO. The Vigil — an ancient machine fleet that once guarded
 * the Drift — has woken up wrong, and it has decided the Drift needs to be
 * "preserved": emptied of everything alive.
 */

export const GAME_TITLE = 'NEBULA RECKONING';
export const GAME_SUBTITLE = 'The Drift remembers.';

export const INTRO_LINES: string[] = [
  'The Halcyon Drift. A graveyard of empires, and the best salvage grounds in known space.',
  'Three days ago, the beacons went dark. Then the Vigil — the dead fleet every spacer swears is just a story — lit its engines.',
  'You are Wren Callis. Your ship is the KV-7 Kestrel: stolen, experimental, and the only thing in the Drift fast enough to matter.',
  'The Vigil is coming to "preserve" the Drift. Show it the Drift still has teeth.',
];

export interface CommsLine {
  speaker: string;
  text: string;
}

/**
 * Exploration story beats — fired once each, when the pilot actually
 * encounters the thing (see Game's story triggers), not on a timer.
 */
export const EXPLORE_COMMS: Record<string, CommsLine[]> = {
  'mission-start': [
    { speaker: 'ECHO', text: 'Sensors up. This pocket of the Drift is quiet — no Vigil signatures. Fuel is full: explore, or jump when ready. The war starts one sector deeper.' },
  ],
  'first-contact': [
    { speaker: 'ECHO', text: 'A Vigil wing has us on sensors. They hold grudges, Wren.' },
  ],
  'first-kill': [
    { speaker: 'WREN', text: "So that's what a ghost fleet bleeds." },
    { speaker: 'ECHO', text: 'The Vigil will notice. Every kill raises our alert signature.' },
  ],
  'first-ore': [
    { speaker: 'ECHO', text: 'Clean ion crystal. Tab into Engineering when the hold is heavy — I can work with this.' },
  ],
  'first-cave': [
    { speaker: 'ECHO', text: 'Hollow signature in that rock — there is a cavity inside. Caches love places like this. So do turrets.' },
  ],
  'first-stash': [
    { speaker: 'ECHO', text: 'Sealed prewar cache, cracked. Finders keepers is the only law left out here.' },
  ],
  'capital-sighted': [
    { speaker: 'ECHO', text: 'That silhouette… Warden-class carrier. Its batteries will not ask questions. 2,500 salvage points says we make it ask.' },
  ],
  'capital-destroyed': [
    { speaker: 'ECHO', text: 'Vigil capital signature… gone. The Drift felt that one, Wren.' },
  ],
  'planetfall': [
    { speaker: 'ECHO', text: 'Atmosphere confirmed. Vigil ground installations on scope — and their storage bunkers. Terrain masks their fire lines; use it. Point the nose at the sky and hold J when you want orbit back.' },
  ],
  'hunters-inbound': [
    { speaker: 'ECHO', text: 'Jump flare! Vigil hunter wing inbound — congratulations, we made the list.' },
  ],
};

export const DEATH_LINES: string[] = [
  'The Kestrel drifts dark. The Vigil moves on, patient as stone.',
  'Preservation complete in sector. The Drift grows quiet.',
  'ECHO\'s last log entry: "She flew like the Drift itself."',
];
