const K_FACTOR = 32;

function expectedScore(rating, opponent) {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

// whiteScore: 1 win, 0.5 draw, 0 loss
function newRatings(white, black, whiteScore) {
  return {
    white: Math.round(white + K_FACTOR * (whiteScore - expectedScore(white, black))),
    black: Math.round(black + K_FACTOR * (1 - whiteScore - expectedScore(black, white))),
  };
}

module.exports = { newRatings, expectedScore };
