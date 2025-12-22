# Running the Test Suite

## Quick Start

```bash
# Install dependencies (if not already done)
pnpm install

# Run all tests
pnpm test

# Run tests with coverage report
pnpm coverage

# Run tests in watch mode (for development)
pnpm vitest --watch
```

## Test Execution by Module

### DNA API Tests
```bash
cd externals/dna-api
pnpm test
```

### Main Application Tests
```bash
# From root directory
pnpm vitest src/
```

### Data Model Tests
```bash
pnpm vitest src/data/tests/
```

### Store Tests
```bash
pnpm vitest src/store/
```

## Individual Test Files

```bash
# DNA API core functionality
pnpm vitest externals/dna-api/test/index.test.ts

# DNA API utilities
pnpm vitest externals/dna-api/test/utils.test.ts

# DNA API response handling
pnpm vitest externals/dna-api/test/response.test.ts

# Utility functions
pnpm vitest src/util.test.ts

# Login entry point
pnpm vitest src/login.test.ts

# Mihan notification store
pnpm vitest src/store/mihan.test.ts

# LeveledMod data model
pnpm vitest src/data/tests/LeveledMod.test.ts
```

## Test Output

Expected output includes:
- ✓ Test file name
- ✓ Test suite name
- ✓ Individual test results (pass/fail)
- ✓ Total tests run
- ✓ Time taken
- ✓ Coverage report (if using --coverage flag)

Example: