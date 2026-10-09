// Règles du mode « Qui de nous ? ». Fonctions pures, testées dans rules.test.js.

export function computeResults(playerIds, votes) {
  const counts = Object.fromEntries(playerIds.map((id) => [id, 0]));
  let totalVotes = 0;
  for (const voterId of playerIds) {
    const target = votes.get(voterId);
    if (target !== undefined && target in counts) {
      counts[target] += 1;
      totalVotes += 1;
    }
  }

  const topCount = Math.max(0, ...Object.values(counts));
  const topIds = topCount > 0 ? playerIds.filter((id) => counts[id] === topCount) : [];
  const top = new Set(topIds);

  const nonVoterIds = playerIds.filter((id) => !(votes.get(id) in counts));
  // Inclut les non-votants : ne pas avoir voté = ne pas avoir voté pour le plus voté.
  const wrongVoterIds = playerIds.filter((id) => !top.has(votes.get(id)));

  return { participantIds: playerIds, counts, totalVotes, topCount, topIds, wrongVoterIds, nonVoterIds };
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
