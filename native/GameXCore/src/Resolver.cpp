#include "GameX/Resolver.hpp"

#include "GameX/Rules.hpp"
#include "GameX/State.hpp"

#include <algorithm>
#include <array>
#include <set>

namespace gamex {

namespace {
constexpr int MAX_ITERATIONS = 64;

Event makeEvent(std::string type) {
  Event e;
  e.type = std::move(type);
  return e;
}
}  // namespace

Order normalizeOrder(const GameState& state, const Unit& unit, const Order* order) {
  Order hold;
  hold.action = OrderAction::Hold;
  if (!order) return hold;
  const auto& node = state.board.nodes.at(unit.node);
  if (order->action == OrderAction::Move) {
    if (!order->target) {
      hold.invalid = true;
      return hold;
    }
    if (std::find(node.neighbors.begin(), node.neighbors.end(), *order->target) == node.neighbors.end()) {
      hold.invalid = true;
      return hold;
    }
    Order o;
    o.action = OrderAction::Move;
    o.target = order->target;
    return o;
  }
  if (order->action == OrderAction::Support) {
    if (!order->target) {
      hold.invalid = true;
      return hold;
    }
    if (std::find(node.neighbors.begin(), node.neighbors.end(), *order->target) == node.neighbors.end()) {
      hold.invalid = true;
      return hold;
    }
    const Unit* occ = unitAt(state, *order->target);
    if (!occ) {
      hold.invalid = true;
      return hold;
    }
    if (!sameTeam(state, occ->owner, unit.owner)) {
      hold.invalid = true;
      return hold;
    }
    Order o;
    o.action = OrderAction::Support;
    o.target = order->target;
    return o;
  }
  return hold;
}

std::vector<Order> legalOrders(const GameState& state, const Unit& unit) {
  std::vector<Order> out;
  out.push_back(Order{OrderAction::Hold, std::nullopt, false});
  auto occ = occupancy(state);
  for (const auto& nb : state.board.nodes.at(unit.node).neighbors) {
    Order m;
    m.action = OrderAction::Move;
    m.target = nb;
    out.push_back(m);
    auto it = occ.find(nb);
    if (it != occ.end() && sameTeam(state, it->second->owner, unit.owner)) {
      Order s;
      s.action = OrderAction::Support;
      s.target = nb;
      out.push_back(s);
    }
  }
  return out;
}

std::optional<Winner> checkVictory(const GameState& s) {
  const int need = majority(s);
  const int hold = s.config.holdRoundsToWin > 0 ? s.config.holdRoundsToWin : 1;
  const auto teams = teamList(s);
  std::vector<int> winners;
  for (int t : teams) {
    auto it = s.majorityStreak.find(t);
    const int streak = it == s.majorityStreak.end() ? 0 : it->second;
    if (teamSources(s, t) >= need && streak >= hold) winners.push_back(t);
  }
  if (winners.size() == 1) {
    Winner w;
    w.teams = winners;
    w.reason = "mehrheit";
    w.need = need;
    w.held = hold;
    return w;
  }

  std::vector<int> aliveTeams;
  for (int t : teams) {
    if (teamUnits(s, t) > 0 || teamSources(s, t) > 0) aliveTeams.push_back(t);
  }
  if (aliveTeams.size() == 1 && teams.size() > 1) {
    Winner w;
    w.teams = aliveTeams;
    w.reason = "letzter-uebrig";
    return w;
  }

  if (s.round >= s.config.maxRounds) {
    std::vector<int> best;
    std::optional<std::array<int, 3>> bestKey;
    auto cmpKey = [](const std::array<int, 3>& a, const std::array<int, 3>& b) {
      for (int i = 0; i < 3; i++) {
        if (a[i] != b[i]) return a[i] > b[i] ? 1 : -1;
      }
      return 0;
    };
    for (int t : teams) {
      std::array<int, 3> key{teamScore(s, t), teamUnits(s, t), teamSources(s, t)};
      if (!bestKey || cmpKey(key, *bestKey) > 0) {
        bestKey = key;
        best = {t};
      } else if (cmpKey(key, *bestKey) == 0) {
        best.push_back(t);
      }
    }
    Winner w;
    w.teams = best;
    w.reason = "punkte";
    w.score = bestKey ? (*bestKey)[0] : 0;
    return w;
  }
  return std::nullopt;
}

ResolveResult resolve(const GameState& state, const OrdersInput& ordersInput) {
  ResolveResult result;
  GameState s = cloneState(state);
  std::vector<Event>& events = result.events;
  auto byNode = occupancy(s);

  std::vector<std::string> unitIds;
  unitIds.reserve(s.units.size());
  for (const auto& [id, _] : s.units) unitIds.push_back(id);
  std::sort(unitIds.begin(), unitIds.end());

  auto mates = [&](int a, int b) { return sameTeam(s, a, b); };

  // 1. Normalize
  std::unordered_map<std::string, Order> orders;
  for (const std::string& id : unitIds) {
    const Order* in = nullptr;
    auto it = ordersInput.unitOrders.find(id);
    if (it != ordersInput.unitOrders.end()) in = &it->second;
    orders[id] = normalizeOrder(s, s.units.at(id), in);
  }

  // 2. Supports + cut
  std::unordered_map<std::string, std::vector<Unit*>> incoming;
  for (const std::string& id : unitIds) {
    if (orders[id].action == OrderAction::Move) {
      incoming[*orders[id].target].push_back(&s.units.at(id));
    }
  }

  std::unordered_map<std::string, int> supportCount;
  for (const std::string& id : unitIds) {
    if (orders[id].action != OrderAction::Support) continue;
    Unit& u = s.units.at(id);
    const auto& attackers = incoming[u.node];
    bool cut = false;
    for (Unit* a : attackers) {
      if (!mates(a->owner, u.owner)) {
        cut = true;
        break;
      }
    }
    if (cut) {
      Event e = makeEvent("supportCut");
      e.fields["unit"] = u.id;
      e.fields["owner"] = std::to_string(u.owner);
      e.fields["node"] = u.node;
      e.fields["target"] = *orders[id].target;
      events.push_back(e);
    } else {
      supportCount[*orders[id].target] += 1;
    }
  }

  auto power = [&](const Unit& u) { return 1 + (supportCount.count(u.node) ? supportCount[u.node] : 0); };
  auto winsAgainst = [&](const Unit& a, const Unit& b) {
    const int pa = power(a);
    const int pb = power(b);
    if (pa != pb) return pa > pb;
    return beats(a.type, b.type);
  };

  // 3. Fixpoint moves
  std::vector<Unit*> movers;
  for (const std::string& id : unitIds) {
    if (orders[id].action == OrderAction::Move) movers.push_back(&s.units.at(id));
  }
  std::unordered_map<std::string, bool> succeeds;
  for (Unit* u : movers) succeeds[u->id] = true;

  auto headToHeadOpponent = [&](Unit* u) -> Unit* {
    const std::string& dest = *orders[u->id].target;
    auto it = byNode.find(dest);
    if (it == byNode.end()) return nullptr;
    Unit* occ = const_cast<Unit*>(it->second);
    const Order& oo = orders[occ->id];
    if (oo.action == OrderAction::Move && oo.target && *oo.target == u->node) return occ;
    return nullptr;
  };

  auto dominatesRivals = [&](Unit* u) {
    const std::string& dest = *orders[u->id].target;
    for (Unit* other : incoming[dest]) {
      if (other->id == u->id) continue;
      const int po = power(*other);
      const int pu = power(*u);
      if (po > pu) return false;
      if (po == pu) {
        if (mates(other->owner, u->owner)) return false;
        if (!beats(u->type, other->type)) return false;
      }
    }
    return true;
  };

  auto passesDefense = [&](Unit* u) {
    Unit* h2h = headToHeadOpponent(u);
    if (h2h) {
      if (mates(h2h->owner, u->owner)) return false;
      return winsAgainst(*u, *h2h);
    }
    const std::string& dest = *orders[u->id].target;
    auto it = byNode.find(dest);
    if (it == byNode.end()) return true;
    Unit* occ = const_cast<Unit*>(it->second);
    if (orders[occ->id].action == OrderAction::Move && succeeds[occ->id]) return true;
    if (mates(occ->owner, u->owner)) return false;
    return winsAgainst(*u, *occ);
  };

  auto evaluate = [&](Unit* u) { return dominatesRivals(u) && passesDefense(u); };

  for (int iter = 0; iter < MAX_ITERATIONS; iter++) {
    bool changed = false;
    for (Unit* u : movers) {
      const bool val = evaluate(u);
      if (val != succeeds[u->id]) {
        succeeds[u->id] = val;
        changed = true;
      }
    }
    if (!changed) break;
    if (iter == MAX_ITERATIONS - 1) {
      for (Unit* u : movers) succeeds[u->id] = false;
    }
  }

  // 4. Apply
  std::set<std::string> destroyed;
  std::unordered_map<std::string, Unit*> leadAttacker;
  for (Unit* u : movers) {
    if (dominatesRivals(u)) leadAttacker[*orders[u->id].target] = u;
  }

  for (Unit* u : movers) {
    const std::string& dest = *orders[u->id].target;
    if (succeeds[u->id]) {
      auto it = byNode.find(dest);
      Unit* occ = it == byNode.end() ? nullptr : const_cast<Unit*>(it->second);
      const bool vacating =
          occ && orders[occ->id].action == OrderAction::Move && succeeds[occ->id];
      if (occ && !vacating) {
        destroyed.insert(occ->id);
        Event e = makeEvent("destroyed");
        e.fields["unit"] = occ->id;
        e.fields["owner"] = std::to_string(occ->owner);
        e.fields["unitType"] = typeKey(occ->type);
        e.fields["node"] = dest;
        e.fields["by"] = u->id;
        e.fields["byOwner"] = std::to_string(u->owner);
        e.fields["byType"] = typeKey(u->type);
        e.fields["cause"] = "verteidiger-geschlagen";
        events.push_back(e);
      }
      Event mv = makeEvent("move");
      mv.fields["unit"] = u->id;
      mv.fields["owner"] = std::to_string(u->owner);
      mv.fields["unitType"] = typeKey(u->type);
      mv.fields["from"] = u->node;
      mv.fields["to"] = dest;
      events.push_back(mv);
      continue;
    }

    if (leadAttacker[dest] != u) {
      Event e = makeEvent("bounce");
      e.fields["unit"] = u->id;
      e.fields["owner"] = std::to_string(u->owner);
      e.fields["from"] = u->node;
      e.fields["to"] = dest;
      e.fields["cause"] = "patt";
      events.push_back(e);
      continue;
    }

    Unit* h2h = headToHeadOpponent(u);
    if (h2h && !mates(h2h->owner, u->owner) && winsAgainst(*h2h, *u)) {
      destroyed.insert(u->id);
      Event e = makeEvent("destroyed");
      e.fields["unit"] = u->id;
      e.fields["owner"] = std::to_string(u->owner);
      e.fields["unitType"] = typeKey(u->type);
      e.fields["node"] = u->node;
      e.fields["by"] = h2h->id;
      e.fields["byOwner"] = std::to_string(h2h->owner);
      e.fields["byType"] = typeKey(h2h->type);
      e.fields["cause"] = "platztausch-verloren";
      events.push_back(e);
      continue;
    }

    auto it = byNode.find(dest);
    Unit* occ = it == byNode.end() ? nullptr : const_cast<Unit*>(it->second);
    const bool vacating =
        occ && orders[occ->id].action == OrderAction::Move && succeeds[occ->id];
    if (occ && !vacating && !mates(occ->owner, u->owner) && winsAgainst(*occ, *u)) {
      destroyed.insert(u->id);
      Event e = makeEvent("destroyed");
      e.fields["unit"] = u->id;
      e.fields["owner"] = std::to_string(u->owner);
      e.fields["unitType"] = typeKey(u->type);
      e.fields["node"] = u->node;
      e.fields["by"] = occ->id;
      e.fields["byOwner"] = std::to_string(occ->owner);
      e.fields["byType"] = typeKey(occ->type);
      e.fields["cause"] = "angriff-gescheitert";
      events.push_back(e);
      continue;
    }

    Event e = makeEvent("bounce");
    e.fields["unit"] = u->id;
    e.fields["owner"] = std::to_string(u->owner);
    e.fields["from"] = u->node;
    e.fields["to"] = dest;
    e.fields["cause"] = "patt";
    events.push_back(e);
  }

  for (Unit* u : movers) {
    if (succeeds[u->id] && !destroyed.count(u->id)) {
      s.units[u->id].node = *orders[u->id].target;
    }
  }
  for (const auto& id : destroyed) s.units.erase(id);

  // 5. Build
  auto occAfter = occupancy(s);
  for (const Player& pref : s.players) {
    Player& p = s.players[pref.id];
    auto bit = ordersInput.builds.find(p.id);
    if (bit == ordersInput.builds.end() || !bit->second) continue;
    const std::string& typeStr = *bit->second;
    auto typeOpt = parseType(typeStr);
    if (!typeOpt) {
      Event e = makeEvent("buildFailed");
      e.fields["owner"] = std::to_string(p.id);
      e.fields["reason"] = "unbekannter-typ";
      events.push_back(e);
      continue;
    }
    const std::string& baseNode = s.board.bases[p.id];
    if (p.energy < s.config.buildCost) {
      Event e = makeEvent("buildFailed");
      e.fields["owner"] = std::to_string(p.id);
      e.fields["reason"] = "energie";
      events.push_back(e);
      continue;
    }
    if (occAfter.count(baseNode)) {
      Event e = makeEvent("buildFailed");
      e.fields["owner"] = std::to_string(p.id);
      e.fields["reason"] = "basis-besetzt";
      events.push_back(e);
      continue;
    }
    const std::string id = "u" + std::to_string(s.nextUnitId++);
    Unit nu;
    nu.id = id;
    nu.owner = p.id;
    nu.type = *typeOpt;
    nu.node = baseNode;
    s.units[id] = nu;
    occAfter[baseNode] = &s.units[id];
    p.energy -= s.config.buildCost;
    Event e = makeEvent("built");
    e.fields["owner"] = std::to_string(p.id);
    e.fields["unit"] = id;
    e.fields["unitType"] = typeStr;
    e.fields["node"] = baseNode;
    events.push_back(e);
  }

  // 6. Sources
  auto finalOcc = occupancy(s);
  for (const auto& nodeId : s.board.sources) {
    auto it = finalOcc.find(nodeId);
    if (it != finalOcc.end()) {
      const int owner = it->second->owner;
      auto cit = s.control.find(nodeId);
      const std::optional<int> previous = cit == s.control.end() ? std::nullopt : cit->second;
      if (!previous || *previous != owner) {
        s.control[nodeId] = owner;
        Event e = makeEvent("sourceCaptured");
        e.fields["node"] = nodeId;
        e.fields["owner"] = std::to_string(owner);
        e.fields["from"] = previous ? std::to_string(*previous) : "null";
        events.push_back(e);
      }
    }
  }

  // 7. Economy
  const int rate = incomePerSource(s.round, s.config);
  for (Player& p : s.players) {
    int n = 0;
    for (const auto& [nid, owner] : s.control) {
      if (owner && *owner == p.id) n++;
    }
    p.energy += n * rate;
    p.score += n;
  }

  // 8. Elimination
  for (Player& p : s.players) {
    bool hasUnits = false;
    for (const auto& [id, u] : s.units) {
      if (u.owner == p.id) {
        hasUnits = true;
        break;
      }
    }
    bool hasSources = false;
    for (const auto& [nid, owner] : s.control) {
      if (owner && *owner == p.id) {
        hasSources = true;
        break;
      }
    }
    if (!hasUnits && !hasSources && p.energy < s.config.buildCost && !p.eliminated) {
      p.eliminated = true;
      Event e = makeEvent("eliminated");
      e.fields["owner"] = std::to_string(p.id);
      events.push_back(e);
    }
  }

  // 9. Majority streak
  const int need = majority(s);
  for (int t : teamList(s)) {
    s.majorityStreak[t] = teamSources(s, t) >= need ? (s.majorityStreak[t] + 1) : 0;
  }

  // 10. Victory (history not stored in C++ mirror for now)
  auto outcome = checkVictory(s);
  if (outcome) {
    s.winner = outcome;
    s.phase = "finished";
    Event e = makeEvent("gameOver");
    e.fields["reason"] = outcome->reason;
    events.push_back(e);
  } else {
    s.round += 1;
  }

  result.state = std::move(s);
  result.orders = std::move(orders);
  return result;
}

}  // namespace gamex
