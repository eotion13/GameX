#include "GameX/Board.hpp"
#include "GameX/Resolver.hpp"
#include "GameX/Rules.hpp"
#include "GameX/State.hpp"

#include <nlohmann/json.hpp>

#include <fstream>
#include <iostream>
#include <string>

using namespace gamex;
using json = nlohmann::json;

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
  place(s, 1, UnitType::Schild, s.board.bases[1]);
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

static void testSupportHelps() {
  // Schild alone loses vs Reiter; with +1 support power 2 wins.
  GameState s = createGame({2});
  emptyPlace(s);
  Unit& atk = place(s, 0, UnitType::Schild, "r1s0");
  Unit& supporter = place(s, 0, UnitType::Bogen, "r1s1");
  Unit& def = place(s, 1, UnitType::Reiter, "k");
  place(s, 1, UnitType::Schild, s.board.bases[1]);
  CHECK(areAdjacent(s.board, atk.node, def.node));
  CHECK(areAdjacent(s.board, supporter.node, atk.node));

  OrdersInput in;
  Order om;
  om.action = OrderAction::Move;
  om.target = std::string("k");
  in.unitOrders[atk.id] = om;
  Order os;
  os.action = OrderAction::Support;
  os.target = atk.node;
  in.unitOrders[supporter.id] = os;

  auto r = resolve(s, in);
  CHECK(r.state.units.count(def.id) == 0);
  CHECK(r.state.units.at(atk.id).node == "k");
}

static void testBuildOnEmptyBase() {
  GameState s = createGame({2});
  emptyPlace(s);
  place(s, 0, UnitType::Schild, s.board.nodes.at(s.board.bases[0]).neighbors.front());
  place(s, 1, UnitType::Schild, s.board.bases[1]);
  s.players[0].energy = 2;
  OrdersInput in;
  in.builds[0] = std::string("bogen");
  auto r = resolve(s, in);
  bool built = false;
  for (const auto& e : r.events) if (e.type == "built") built = true;
  CHECK(built);
  CHECK(r.state.players[0].energy == sourcesOf(r.state, 0) * incomePerSource(1, r.state.config));
}

static void testSourceCapture() {
  GameState s = createGame({2});
  emptyPlace(s);
  place(s, 0, UnitType::Schild, "k");
  place(s, 1, UnitType::Schild, s.board.bases[1]);
  OrdersInput in;
  auto r = resolve(s, in);
  CHECK(r.state.control.at("k").has_value());
  CHECK(*r.state.control.at("k") == 0);
  CHECK(r.state.players[0].score >= 1);
}

static void testDeterminism() {
  GameState s = createGame({3});
  OrdersInput in;
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

static void testGoldenSmokeFixture() {
  const std::string path = std::string(GAMEX_FIXTURES_DIR) + "/golden-smoke.json";
  std::ifstream in(path);
  CHECK(in.good());
  json root;
  in >> root;
  for (const auto& f : root["fixtures"]) {
    if (f["kind"] == "board") {
      const int p = f["playerCount"];
      Board b = createBoard(p);
      CHECK(b.spokes == f["spokes"]);
      CHECK(static_cast<int>(b.order.size()) == f["nodeCount"]);
      CHECK(static_cast<int>(b.sources.size()) == f["sourceCount"]);
    }
    if (f["kind"] == "resolve") {
      GameState s = createGame({f["playerCount"].get<int>()});
      auto r = resolve(s, {});
      CHECK(r.state.round == f["roundAfter"]);
      CHECK(static_cast<int>(r.state.units.size()) == f["unitCount"]);
    }
  }
}

int main() {
  testBeats();
  testHoldRounds();
  testBoardSymmetry();
  testSimpleMove();
  testRpsCombat();
  testSupportHelps();
  testBuildOnEmptyBase();
  testSourceCapture();
  testDeterminism();
  testGoldenSmokeFixture();
  if (gFails) {
    std::cerr << gFails << " checks failed\n";
    return 1;
  }
  std::cout << "gamex_core_tests: all passed\n";
  return 0;
}
