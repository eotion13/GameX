#pragma once

#include "GameX/Types.hpp"

#include <vector>

namespace gamex {

inline constexpr const char* ORDER_HOLD = "halten";
inline constexpr const char* ORDER_MOVE = "bewegen";
inline constexpr const char* ORDER_SUPPORT = "unterstuetzen";

Order normalizeOrder(const GameState& state, const Unit& unit, const Order* order);
std::vector<Order> legalOrders(const GameState& state, const Unit& unit);
ResolveResult resolve(const GameState& state, const OrdersInput& ordersInput = {});
std::optional<Winner> checkVictory(const GameState& s);

}  // namespace gamex
