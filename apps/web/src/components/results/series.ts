export const SERIES = Array.from({ length: 10 }, (_, i) => `var(--color-chart-${i + 1})`);

const RANK = [0, 1, 2, 6, 4, 5, 7, 8, 9, 3];

export const rankColor = (rank: number) => (rank === 0 ? "var(--color-accent)" : SERIES[RANK[rank % RANK.length]]);
