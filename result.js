// 1 coin. Set this to "head" or "tail".
export const result = "head";

// 4 coins, in order: first, second, third, fourth.
// Each value is "head" or "tail".
export const results = ["head", "tail", "tail", "head"];

// 4 coins: where the coins land on the plate. The game plays
// result_(1 + n % 5), where n comes from the server with the result, so only
// layouts 1 to 5 are used. Set 1-5 to fix one, or null to pick one at random
// each round like the server.
export const layout = null;
