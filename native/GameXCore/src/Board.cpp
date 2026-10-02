#include "GameX/Board.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace gamex {

namespace {
constexpr double KNOTEN_R = 0.3;
constexpr double MIN_LUFT = 0.16;

double round4(double v) {
  return std::round(v * 10000.0) / 10000.0;
}
}  // namespace

int spokesFor(int playerCount) {
  return (std::max)(6, playerCount * 2);
}

double ringRadius(int ring, int spokes) {
  if (ring == 0) return 0;
  const double noetig = (2 * KNOTEN_R + MIN_LUFT) / (2 * std::sin(3.141592653589793 / spokes));
  return (std::max)(1.0, noetig) + (ring - 1);
}

std::string nodeId(int ring, int spoke) {
  if (ring == 0) return "k";
  return "r" + std::to_string(ring) + "s" + std::to_string(spoke);
}

Board createBoard(int playerCount, const Config& config) {
  if (playerCount < 2 || playerCount > 6) {
    throw std::runtime_error("Spielerzahl muss zwischen 2 und 6 liegen");
  }
  Board board;
  board.playerCount = playerCount;
  board.rings = config.rings;
  const int K = spokesFor(playerCount);
  board.spokes = K;

  auto addNode = [&](int ring, int spoke) {
    const std::string id = nodeId(ring, spoke);
    const double angle = (static_cast<double>(spoke) / K) * 3.141592653589793 * 2 - 3.141592653589793 / 2;
    const double radius = ringRadius(ring, K);
    Node n;
    n.id = id;
    n.ring = ring;
    n.spoke = spoke;
    n.x = round4(std::cos(angle) * radius);
    n.y = round4(std::sin(angle) * radius);
    n.isSource = ring <= 1;
    board.nodes[id] = n;
    board.order.push_back(id);
    return id;
  };

  addNode(0, 0);
  for (int r = 1; r <= config.rings; r++) {
    for (int s = 0; s < K; s++) addNode(r, s);
  }

  auto link = [&](const std::string& a, const std::string& b) {
    if (a == b) return;
    auto& na = board.nodes[a].neighbors;
    auto& nb = board.nodes[b].neighbors;
    if (std::find(na.begin(), na.end(), b) == na.end()) na.push_back(b);
    if (std::find(nb.begin(), nb.end(), a) == nb.end()) nb.push_back(a);
  };

  for (int s = 0; s < K; s++) link("k", nodeId(1, s));
  for (int r = 1; r <= config.rings; r++) {
    for (int s = 0; s < K; s++) {
      link(nodeId(r, s), nodeId(r, (s + 1) % K));
      if (r < config.rings) link(nodeId(r, s), nodeId(r + 1, s));
    }
  }

  const int step = K / playerCount;
  for (int p = 0; p < playerCount; p++) {
    const std::string id = nodeId(config.rings, p * step);
    board.nodes[id].base = p;
    board.bases.push_back(id);
  }

  for (const auto& id : board.order) {
    if (board.nodes[id].isSource) board.sources.push_back(id);
  }
  board.radius = round4(ringRadius(config.rings, K));
  return board;
}

std::vector<std::string> neighbors(const Board& board, const std::string& id) {
  return board.nodes.at(id).neighbors;
}

bool areAdjacent(const Board& board, const std::string& a, const std::string& b) {
  auto it = board.nodes.find(a);
  if (it == board.nodes.end()) return false;
  const auto& nbs = it->second.neighbors;
  return std::find(nbs.begin(), nbs.end(), b) != nbs.end();
}

std::pair<std::string, std::string> startNodes(const Board& board, int playerIndex) {
  const int step = board.spokes / board.playerCount;
  const int spoke = playerIndex * step;
  return {nodeId(board.rings, spoke), nodeId(board.rings - 1, spoke)};
}

}  // namespace gamex
