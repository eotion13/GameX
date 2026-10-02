#pragma once

#include "GameX/Types.hpp"

namespace gamex {

int spokesFor(int playerCount);
double ringRadius(int ring, int spokes);
std::string nodeId(int ring, int spoke);
Board createBoard(int playerCount, const Config& config = Config{});
std::vector<std::string> neighbors(const Board& board, const std::string& id);
bool areAdjacent(const Board& board, const std::string& a, const std::string& b);
std::pair<std::string, std::string> startNodes(const Board& board, int playerIndex);

}  // namespace gamex
