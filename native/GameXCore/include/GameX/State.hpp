#pragma once

#include "GameX/Types.hpp"

#include <unordered_map>
#include <vector>

namespace gamex {

struct CreateGameOpts {
  int playerCount = 3;
  std::vector<int> teams; // empty => free-for-all
};

GameState createGame(const CreateGameOpts& opts = {});
GameState cloneState(const GameState& s);

const Unit* unitAt(const GameState& s, const std::string& nodeId);
std::unordered_map<std::string, const Unit*> occupancy(const GameState& s);
std::unordered_map<std::string, Unit*> occupancyMutable(GameState& s);

int sourcesOf(const GameState& s, int playerId);
int teamSources(const GameState& s, int team);
std::vector<int> teamList(const GameState& s);
int teamScore(const GameState& s, int team);
int teamUnits(const GameState& s, int team);
int majority(const GameState& s);
bool sameTeam(const GameState& s, int a, int b);

}  // namespace gamex
