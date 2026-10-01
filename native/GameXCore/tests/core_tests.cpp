#include "GameX/Board.hpp"
#include "GameX/Resolver.hpp"
#include "GameX/Rules.hpp"
#include "GameX/State.hpp"

#include <cassert>
#include <iostream>
#include <string>

using namespace gamex;

static int gFails = 0;

#define CHECK(cond) do { \
  if (!(cond)) { \
    std::cerr << "FAIL " << __FILE__ << ":" << __LINE__ << " " << #cond << "\n"; \
    gFails++; \
  } \
} while (0)

static void emptyPlace(GameState& s) {
  s.units.clear();
  s.nextUnitId = 1;
  for (auto& [id, c] : s.control) c = std::nullopt;
  for (auto& p : s.players) {
    p.energy = s.config.startEnergy;
    p.score = 0;
    p.eliminated = false;
  }
  s.round = 1;
  s.phase = "orders";
  s.winner = std::nullopt;
  s.majorityStreak.clear();
}

static Unit& place(GameState& s, int owner, UnitType type, const std::string& node) {
  Unit u;
  u.id = "u" + std::to_string(s.nextUnitId++);
  u.owner = owner;
  u.type = type;
  u.node = node;
  s.units[u.id] = u;
  return s.units[u.id];
}

static void testBoardSymmetry() {
  for (int p = 2; p <= 6; p++) {
    Board b = createBoard(p);
    CHECK(static_cast<int>(b.bases.size()) == p);
    CHECK(b.spokes % p == 0);
    CHECK(!b.sources.empty());
  }
}

static void testBeats() {
  CHECK(beats(UnitType::Reiter, UnitType::Bogen));
  CHECK(beats(UnitType::Bogen, UnitType::Schild));
  CHECK(beats(UnitType::Schild, UnitType::Reiter));
  CHECK(!beats(UnitType::Reiter, UnitType::Schild));
}

static void testSimpleMove() {
  GameState s = createGame({2});
  emptyPlace(s);
  Unit& a = place(s, 0, UnitType::Schild, s.board.bases[0]);
  place(s, 1, UnitType::Schild, s.board.bases[1]); // Gegner bleibt am Leben (kein Sofortsieg)
  const std::string dest = s.board.nodes.at(a.node).neighbors.front();
  OrdersInput in;
  Order o;
  o.action = OrderAction::Move;
  o.target = dest;
  in.unitOrders[a.id] = o;
  auto r = resolve(s, in);
  CHECK(r.state.units.at(a.id).node == dest);
  CHECK(r.state.round == 2);
  CHECK(r.state.phase == "orders");
}

static void testRpsCombat() {
  GameState s = createGame({2});
  emptyPlace(s);
  std::string n0 = s.board.order[1];
  std::string n1 = s.board.nodes.at(n0).neighbors.front();
  Unit& attacker = place(s, 0, UnitType::Reiter, n0);
  Unit& defender = place(s, 1, UnitType::Bogen, n1);
  // Extra unit so defeating one does not end the match immediately
  place(s, 1, UnitType::Schild, s.board.bases[1]);
  OrdersInput in;
  Order o;
  o.action = OrderAction::Move;
  o.target = n1;
  in.unitOrders[attacker.id] = o;
  auto r = resolve(s, in);
  CHECK(r.state.units.count(defender.id) == 0);
  CHECK(r.state.units.at(attacker.id).node == n1);
}

static void testDeterminism() {
  GameState s = createGame({3});
  OrdersInput in; // all hold
  auto a = resolve(s, in);
  auto b = resolve(s, in);
  CHECK(a.state.round == b.state.round);
  CHECK(a.state.units.size() == b.state.units.size());
  for (const auto& [id, u] : a.state.units) {
    CHECK(b.state.units.at(id).node == u.node);
  }
}

static void testHoldRounds() {
  CHECK(holdRoundsNeeded(2) == 3);
  CHECK(holdRoundsNeeded(3) == 2);
  CHECK(holdRoundsNeeded(4) == 2);
}

int main() {
  testBeats();
  testHoldRounds();
  testBoardSymmetry();
  testSimpleMove();
  testRpsCombat();
  testDeterminism();
  if (gFails) {
    std::cerr << gFails << " checks failed\n";
    return 1;
  }
  std::cout << "gamex_core_tests: all passed\n";
  return 0;
}
