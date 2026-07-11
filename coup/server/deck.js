const CHARACTERS = ['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa'];
const COPIES_PER_CHARACTER = 3;

function buildDeck() {
  const deck = [];
  for (const character of CHARACTERS) {
    for (let i = 0; i < COPIES_PER_CHARACTER; i++) {
      deck.push(character);
    }
  }
  return shuffle(deck);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { CHARACTERS, buildDeck, shuffle };
