#include "GameX/Rules.hpp"

namespace gamex {

bool beats(UnitType a, UnitType b) {
  switch (a) {
    case UnitType::Reiter: return b == UnitType::Bogen;
    case UnitType::Bogen: return b == UnitType::Schild;
    case UnitType::Schild: return b == UnitType::Reiter;
  }
  return false;
}

int holdRoundsNeeded(int playerCount) {
  return playerCount == 2 ? 3 : 2;
}

int majorityNeeded(int sourceCount) {
  return sourceCount / 2 + 1;
}

int incomePerSource(int round, const Config& config) {
  return round >= config.lateRound ? config.incomeLate : config.incomeEarly;
}

}  // namespace gamex
