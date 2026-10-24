// Original vector emblems (not the commercial game's artwork) -- a crown for
// the Duke, a dagger for the Assassin, crossed swords for the Captain,
// a sealed letter for the Ambassador, a folding fan for the Contessa.
// Loaded as a plain script before app.js -- top-level const/function
// declarations here are visible to app.js's IIFE via the shared script scope.
const CHAR_META = {
  Duke: {
    cls: 'char-duke', symbol: '♦',
    art: `<svg class="card-art" viewBox="0 0 100 100" fill="currentColor">
      <path d="M20 70 L20 45 L32 58 L50 30 L68 58 L80 45 L80 70 Z"/>
      <rect x="18" y="70" width="64" height="10" rx="2"/>
      <circle cx="50" cy="26" r="5"/><circle cx="24" cy="42" r="4"/><circle cx="76" cy="42" r="4"/>
    </svg>`,
  },
  Assassin: {
    cls: 'char-assassin', symbol: '♠',
    art: `<svg class="card-art" viewBox="0 0 100 100" fill="currentColor">
      <circle cx="50" cy="16" r="6"/>
      <rect x="44" y="20" width="12" height="28" rx="3"/>
      <rect x="28" y="48" width="44" height="8" rx="2"/>
      <path d="M50 56 L60 60 L50 90 L40 60 Z"/>
    </svg>`,
  },
  Captain: {
    cls: 'char-captain', symbol: '♣',
    art: `<svg class="card-art" viewBox="0 0 100 100" fill="currentColor">
      <g transform="rotate(45 50 50)">
        <path d="M50 8 L44 62 L56 62 Z"/>
        <rect x="34" y="62" width="32" height="7" rx="2"/>
        <rect x="46" y="69" width="8" height="16" rx="2"/>
        <circle cx="50" cy="89" r="5"/>
      </g>
      <g transform="rotate(-45 50 50)">
        <path d="M50 8 L44 62 L56 62 Z"/>
        <rect x="34" y="62" width="32" height="7" rx="2"/>
        <rect x="46" y="69" width="8" height="16" rx="2"/>
        <circle cx="50" cy="89" r="5"/>
      </g>
    </svg>`,
  },
  Ambassador: {
    cls: 'char-ambassador', symbol: '♥',
    art: `<svg class="card-art" viewBox="0 0 100 100" fill="currentColor">
      <rect x="14" y="28" width="72" height="50" rx="4"/>
      <path d="M14 30 L50 55 L86 30 Z" fill="#100d0f"/>
      <circle cx="50" cy="55" r="10"/>
      <circle cx="50" cy="55" r="4" fill="#100d0f"/>
    </svg>`,
  },
  Contessa: {
    cls: 'char-contessa', symbol: '★',
    art: `<svg class="card-art" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
      <path d="M50 82 L18 34"/><path d="M50 82 L32 20"/><path d="M50 82 L50 16"/>
      <path d="M50 82 L68 20"/><path d="M50 82 L82 34"/>
      <path d="M18 34 Q50 6 82 34"/><circle cx="50" cy="82" r="5" fill="currentColor" stroke="none"/>
    </svg>`,
  },
};

function renderCardFace(cardName) {
  const meta = CHAR_META[cardName] || {};
  return `
    <span class="card-corner">${meta.symbol || ''}</span>
    ${meta.art || ''}
    <span class="card-name">${cardName || '?'}</span>
  `;
}
