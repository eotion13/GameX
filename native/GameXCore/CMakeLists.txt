cmake_minimum_required(VERSION 3.16)
project(GameXCore LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(GameXCore
  src/Rules.cpp
  src/Board.cpp
  src/State.cpp
  src/Resolver.cpp
)
target_include_directories(GameXCore PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

enable_testing()
add_executable(gamex_core_tests tests/core_tests.cpp)
target_link_libraries(gamex_core_tests PRIVATE GameXCore)
target_include_directories(gamex_core_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/third_party)
target_compile_definitions(gamex_core_tests PRIVATE
  GAMEX_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures"
)
add_test(NAME gamex_core_tests COMMAND gamex_core_tests)
