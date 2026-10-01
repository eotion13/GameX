#pragma once

#include "GameX/Types.hpp"

#include <array>
#include <string>

namespace gamex {

inline constexpr std::array<const char*, 3> kTypeKeys = {"reiter", "bogen", "schild"};

bool beats(UnitType a, UnitType b);
int holdRoundsNeeded(int playerCount);
int majorityNeeded(int sourceCount);
int incomePerSource(int round, const Config& config = Config{});

inline const std::array<const char*, 6> kPlayerColors = {
    "#e4572e", "#2e86ab", "#3fa34d", "#d9a404", "#8e5ea2", "#00a6a6"};
inline const std::array<const char*, 6> kPlayerNames = {
    "Rot", "Blau", "Grün", "Gold", "Violett", "Türkis"};

}  // namespace gamex
