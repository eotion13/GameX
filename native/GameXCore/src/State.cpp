#include "GameX/State.hpp"

#include "GameX/Board.hpp"
#include "GameX/Rules.hpp"

#include <algorithm>

namespace gamex {

GameState createGame(const CreateGameOpts& opts) {
  GameState s;
  const int playerCount = opts.playerCount;
  s.config.holdRoundsToWin = holdRoundsNeeded(playerCount);
  s.board = createBoard(playerCount, s.config);

  std::vector<int> teams = opts.teams;
  if (static_cast<int>(teams.size()) != playerCount) {
    teams.resize(playerCount);
    for (int i = 0; i < playerCount; i++) teams[i] = i;
  }

  for (int i = 0; i < playerCount; i++) {
    Player p;
    p.id = i;
    p.name = kPlayerNames[i];
    p.color = kPlayerColors[i];
    p.team = teams[i];
    p.energy = s.config.startEnergy;
    s.players.push_back(p);
  }

  s.nextUnitId = 1;
  for (int i = 0; i < playerCount; i++) {
    auto [baseNode, frontNode] = startNodes(s.board, i);
    {
      Unit u;
      u.id = "u" + std::to_string(s.nextUnitId++);
      u.owner = i;
      u.type = UnitType::Schild;
      u.node = baseNode;
      s.units[u.id] = u;
    }
    {
      Unit u;
      u.id = "u" + std::to_string(s.nextUnitId++);
      u.owner = i;
      u.type = UnitType::Reiter;
      u.node = frontNode;
      s.units[u.id] = u;
    }
  }

  for (const auto& id : s.board.sources) s.control[id] = std::nullopt;
  s.round = 1;
  s.phase = "orders";
  return s;
}

GameState cloneState(const GameState& s) { return s; }

const Unit* unitAt(const GameState& s, const std::string& nodeId) {
  for (const auto& [id, u] : s.units) {
    if (u.node == nodeId) return &u;
  }
  return nullptr;
}

std::unordered_map<std::string, const Unit*> occupancy(const GameState& s) {
  std::unordered_map<std::string, const Unit*> map;
  for (const auto& [id, u] : s.units) map[u.node] = &u;
  return map;
}

std::unordered_map<std::string, Unit*> occupancyMutable(GameState& s) {
  std::unordered_map<std::string, Unit*> map;
  for (auto& [id, u] : s.units) map[u.node] = &u;
  return map;
}

int sourcesOf(const GameState& s, int playerId) {
  int n = 0;
  for (const auto& [id, owner] : s.control) {
    if (owner && *owner == playerId) n++;
  }
  return n;
}

int teamSources(const GameState& s, int team) {
  int n = 0;
  for (const auto& [id, owner] : s.control) {
    if (owner && s.players[*owner].team == team) n++;
  }
  return n;
}

std::vector<int> teamList(const GameState& s) {
  std::vector<int> seen;
  for (const auto& p : s.players) {
    if (std::find(seen.begin(), seen.end(), p.team) == seen.end()) seen.push_back(p.team);
  }
  return seen;
}

int teamScore(const GameState& s, int team) {
  int sum = 0;
  for (const auto& p : s.players) if (p.team == team) sum += p.score;
  return sum;
}

int teamUnits(const GameState& s, int team) {
  int n = 0;
  for (const auto& [id, u] : s.units) {
    if (s.players[u.owner].team == team) n++;
  }
  return n;
}

int majority(const GameState& s) {
  return majorityNeeded(static_cast<int>(s.board.sources.size()));
}

bool sameTeam(const GameState& s, int a, int b) {
  return s.players[a].team == s.players[b].team;
}

}  // namespace gamex
