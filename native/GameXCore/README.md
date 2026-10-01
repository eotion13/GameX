# GameXCore (C++)

Portable, deterministic rules library for Unreal / native clients.

**Source of Truth remains** `src/engine/*.js`. This library must match it.

## Build & test

```bash
npm run test:native
# or:
cmake -S . -B build -G Ninja && cmake --build build && ctest --test-dir build --output-on-failure
```

## API (mirror of JS)

- `createGame` / `createBoard`
- `normalizeOrder` / `legalOrders`
- `resolve(state, orders)` → `{ state, events, orders }`
- `checkVictory`

No RNG in `resolve`. No presentation code.
