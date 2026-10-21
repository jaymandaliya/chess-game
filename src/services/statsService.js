const Match = require('../models/Match');
const User = require('../models/User');

// Outcome of a completed match from one player's point of view
function outcomeStage(userId) {
  return [
    {
      $match: {
        status: 'COMPLETED',
        $or: [{ 'white.userId': userId }, { 'black.userId': userId }],
      },
    },
    {
      $addFields: {
        color: { $cond: [{ $eq: ['$white.userId', userId] }, 'white', 'black'] },
      },
    },
    {
      $addFields: {
        outcome: {
          $switch: {
            branches: [
              { case: { $eq: ['$result', 'DRAW'] }, then: 'draw' },
              {
                case: {
                  $or: [
                    { $and: [{ $eq: ['$color', 'white'] }, { $eq: ['$result', 'WHITE_WIN'] }] },
                    { $and: [{ $eq: ['$color', 'black'] }, { $eq: ['$result', 'BLACK_WIN'] }] },
                  ],
                },
                then: 'win',
              },
            ],
            default: 'loss',
          },
        },
      },
    },
  ];
}

function percent(part, total) {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

async function playerStats(userId) {
  const [user, groups, recent] = await Promise.all([
    User.findById(userId).select('rating peakRating'),
    Match.aggregate([
      ...outcomeStage(userId),
      {
        $group: {
          _id: { mode: '$mode', color: '$color' },
          played: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ['$outcome', 'win'] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ['$outcome', 'loss'] }, 1, 0] } },
          draws: { $sum: { $cond: [{ $eq: ['$outcome', 'draw'] }, 1, 0] } },
        },
      },
    ]),
    Match.aggregate([...outcomeStage(userId), { $sort: { endedAt: -1 } }, { $limit: 10 }, { $project: { outcome: 1 } }]),
  ]);

  const empty = () => ({ played: 0, wins: 0, losses: 0, draws: 0 });
  const total = empty();
  const byMode = {};
  const byColor = { white: empty(), black: empty() };
  for (const g of groups) {
    byMode[g._id.mode] = byMode[g._id.mode] || empty();
    for (const target of [total, byMode[g._id.mode], byColor[g._id.color]]) {
      target.played += g.played;
      target.wins += g.wins;
      target.losses += g.losses;
      target.draws += g.draws;
    }
  }
  const withRate = (s) => ({ ...s, winRate: percent(s.wins, s.played) });

  return {
    rating: user ? user.rating : null,
    peakRating: user ? user.peakRating : null,
    ...withRate(total),
    byColor: { white: withRate(byColor.white), black: withRate(byColor.black) },
    byMode: Object.fromEntries(Object.entries(byMode).map(([mode, s]) => [mode, withRate(s)])),
    recentForm: recent.map((m) => m.outcome),
  };
}

module.exports = { playerStats };
