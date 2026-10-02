#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

namespace gamex {

enum class UnitType { Reiter, Bogen, Schild };

inline const char* typeKey(UnitType t) {
  switch (t) {
    case UnitType::Reiter: return "reiter";
    case UnitType::Bogen: return "bogen";
    case UnitType::Schild: return "schild";
  }
  return "schild";
}

inline std::optional<UnitType> parseType(const std::string& s) {
  if (s == "reiter") return UnitType::Reiter;
  if (s == "bogen") return UnitType::Bogen;
  if (s == "schild") return UnitType::Schild;
  return std::nullopt;
}

struct Config {
  int rings = 3;
  int startEnergy = 2;
  int buildCost = 2;
  int incomeEarly = 1;
  int incomeLate = 2;
  int lateRound = 11;
  int maxRounds = 15;
  int holdRoundsToWin = 2;
};

struct Node {
  std::string id;
  int ring = 0;
  int spoke = 0;
  double x = 0;
  double y = 0;
  bool isSource = false;
  std::optional<int> base; // player index
  std::vector<std::string> neighbors;
};

struct Board {
  int playerCount = 0;
  int rings = 0;
  int spokes = 0;
  std::unordered_map<std::string, Node> nodes;
  std::vector<std::string> order;
  std::vector<std::string> sources;
  std::vector<std::string> bases;
  double radius = 0;
};

struct Player {
  int id = 0;
  std::string name;
  std::string color;
  int team = 0;
  bool isBot = false;
  std::string botLevel = "normal";
  int energy = 0;
  int score = 0;
  bool eliminated = false;
};

struct Unit {
  std::string id;
  int owner = 0;
  UnitType type = UnitType::Schild;
  std::string node;
};

struct Winner {
  std::vector<int> teams;
  std::string reason;
  int need = 0;
  int held = 0;
  int score = 0;
};

struct GameState {
  int version = 1;
  Config config;
  Board board;
  std::vector<Player> players;
  std::unordered_map<std::string, Unit> units;
  std::unordered_map<std::string, std::optional<int>> control; // source -> owner
  int round = 1;
  std::unordered_map<int, int> majorityStreak;
  std::string phase = "orders"; // orders | finished
  std::optional<Winner> winner;
  int nextUnitId = 1;
  // history omitted in core runtime compare; optional later
};

enum class OrderAction { Hold, Move, Support };

struct Order {
  OrderAction action = OrderAction::Hold;
  std::optional<std::string> target;
  bool invalid = false;
};

struct OrdersInput {
  std::unordered_map<std::string, Order> unitOrders;
  std::unordered_map<int, std::optional<std::string>> builds; // player -> type key
};

struct Event {
  std::string type;
  std::unordered_map<std::string, std::string> fields;
};

struct ResolveResult {
  GameState state;
  std::vector<Event> events;
  std::unordered_map<std::string, Order> orders;
};

}  // namespace gamex
