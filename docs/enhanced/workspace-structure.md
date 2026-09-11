# Enhanced Workspace Structure

**Version**: 1.0.0  
**Base Commit**: 80f137edaa2cf7393cdf5bbec314051174631d69  
**Created**: 2026-09-11  
**Agent**: agent-workspace-bootstrap

## Overview

The enhanced workspace provides a clean, dependency-injected architecture for adding features to Readest without modifying core reader functionality. All enhanced code lives under `enhanced/` with clear import boundaries enforced via ESLint.

## Directory Structure

```
enhanced/
├── core/                  # Frozen contracts (ports & models)
│   ├── ports.ts          # Port interface definitions
│   ├── models.ts         # Domain models
│   └── contract-index.md # Contract documentation
├── features/             # Feature implementations
│   └── index.ts         # Placeholder for future features
├── adapters/            # Upstream adapters
│   ├── readest/        # ONLY place that can import Readest internals
│   │   └── index.ts   # Placeholder for port implementations
│   └── index.ts       # Adapters module entry
├── storage/            # Persistence layer
│   └── index.ts       # Placeholder for storage implementations
├── ui/                # UI components
│   └── index.ts       # Placeholder for UI implementations
├── bootstrap.ts       # Lifecycle management & DI container
└── .eslintrc.json    # Import boundary enforcement
```

## Architecture Principles

### 1. Hexagonal Architecture (Ports & Adapters)

The enhanced workspace follows hexagonal architecture:

- **Core** (`enhanced/core/`): Domain models and port interfaces with zero external dependencies
- **Features** (`enhanced/features/`): Business logic implementing use cases
- **Adapters** (`enhanced/adapters/`): Bridge between core and external systems
- **Infrastructure** (`enhanced/storage/`, `enhanced/ui/`): Technical implementations

### 2. Import Boundaries

Import restrictions are enforced via ESLint to maintain architectural integrity:

#### Core Layer (`enhanced/core/`)
**Allowed imports**: None (zero dependencies)  
**Forbidden imports**: React, DOM APIs, Tauri, Readest internals

The core layer defines pure TypeScript interfaces and types that can be implemented by any deployment strategy.

#### Features Layer (`enhanced/features/`)
**Allowed imports**: `enhanced/core/`, `enhanced/adapters/`  
**Forbidden imports**: Readest internals (must use `adapters/readest/`)

Features implement business logic by consuming ports from core and using adapters to access external systems.

#### Readest Adapter (`enhanced/adapters/readest/`)
**Allowed imports**: Everything (ONLY exception to the rule)  
**Responsibility**: Implement port interfaces by wrapping Readest internal objects

This is the single point of coupling to Readest internals. All other enhanced code must go through these adapters.

#### Other Adapters (`enhanced/adapters/`)
**Allowed imports**: `enhanced/core/`, external libraries  
**Forbidden imports**: Readest internals

Adapters for external services (translation APIs, Eudic, etc.) can import their respective SDKs but not Readest code.

### 3. Dependency Injection

The `bootstrap.ts` module provides a lightweight DI container:

```typescript
// Initialize with port implementations
await initializeEnhanced({
  features: {
    importPlatform: true,
    eudic: false,
  },
  ports: {
    reader: new ReaderPortImpl(),
    library: new LibraryPortImpl(),
  },
});

// Access registered ports
const readerPort = getPort('reader');

// Register cleanup handlers
registerCleanup(() => {
  // Cancel subscriptions, clear timers, etc.
});

// Shutdown and release resources
await shutdownEnhanced();
```

## Lifecycle Management

### Initialization

`initializeEnhanced(config)` performs:
1. Register port implementations in DI container
2. Initialize enabled features based on feature flags
3. Set up cleanup handlers for resource management

Throws if already initialized - call `shutdownEnhanced()` first.

### Cleanup

`shutdownEnhanced()` performs:
1. Execute all registered cleanup handlers in reverse order
2. Cancel subscriptions and event listeners
3. Clear timers and intervals
4. Release port implementations
5. Reset DI container

Safe to call multiple times. Never throws - logs errors but continues cleanup.

## Feature Flags

Feature flags control which enhancements are active:

```typescript
{
  features: {
    importPlatform: boolean,  // Cross-platform import
    eudic: boolean,          // Eudic API integration
    translate: boolean,      // Translation services
    tts: boolean,           // Enhanced TTS
  }
}
```

Features can be controlled via:
- Environment variables (e.g., `ENHANCED_EUDIC=true`)
- Configuration files
- Runtime parameters

Feature-specific agents will implement their flag checking logic as they add initialization code to `bootstrap.ts`.

## Port Implementations

Ports are defined in `enhanced/core/ports.ts` and implemented in `enhanced/adapters/readest/`:

- **ReaderPort**: Text selection, CFI positioning, navigation
- **LibraryPort**: Book import, metadata access
- **SpeechPort**: TTS playback control
- **LearningRepository**: Vocabulary management (Eudic bridge)

Each port implementation:
1. Wraps Readest internal objects (Book, View, TTSController, etc.)
2. Converts between Readest types and core models
3. Handles platform differences (Tauri vs Web)
4. Provides consistent error handling with PortError

## Testing Strategy

### Unit Tests

Test business logic in isolation with mock port implementations:

```typescript
const mockReader: ReaderPort = {
  getTextSelection: jest.fn().mockResolvedValue({
    text: 'sample',
    cfi: 'epubcfi(...)',
    index: 0,
    page: 1,
  }),
  // ... other methods
};

await initializeEnhanced({
  ports: { reader: mockReader },
});
```

### Integration Tests

Test port implementations against real Readest objects in a test harness.

### Lifecycle Tests

Verify resource cleanup:
1. Initialize with mock ports
2. Register cleanup handlers
3. Call shutdown
4. Verify all cleanups executed

## Build Verification

The workspace structure is verified via:

```bash
# Type checking
cd apps/readest-app
source $HOME/.cargo/env
npx tsc --noEmit

# Linting (import boundaries)
pnpm lint

# Build
pnpm build
```

All verification must pass before feature implementation begins.

## Gate Compliance

This workspace satisfies all three bootstrap gate conditions:

1. ✅ **Directory skeleton exists**: All directories created with index.ts placeholders
2. ✅ **Bootstrap lifecycle works**: Initialize/shutdown functions implemented with cleanup tracking
3. ✅ **Feature flags disabled by default**: `isFeatureEnabled()` returns false, ensuring no impact on existing reader behavior

## Integration with Readest

### Minimal Hook Points

Enhanced features require minimal integration:

1. **App initialization**: Call `initializeEnhanced()` at app startup
2. **App shutdown**: Call `shutdownEnhanced()` at app teardown
3. **Port registration**: Provide port implementations that wrap existing Readest services

Example integration in `apps/readest-app/src/App.tsx`:

```typescript
import { initializeEnhanced, shutdownEnhanced } from '@/enhanced/bootstrap';
import { createPorts } from '@/enhanced/adapters/readest';

// On mount
useEffect(() => {
  const ports = createPorts();
  initializeEnhanced({
    features: {
      importPlatform: process.env.ENHANCED_IMPORT === 'true',
      eudic: process.env.ENHANCED_EUDIC === 'true',
    },
    ports,
  }).catch(console.error);

  return () => {
    shutdownEnhanced().catch(console.error);
  };
}, []);
```

### Zero Impact When Disabled

With all feature flags off:
- No enhanced code is executed
- No resources are allocated
- No event listeners are registered
- Bundle size impact: minimal (tree-shaking removes unused features)
- Reading behavior: unchanged

## Future Agent Handoff

Downstream agents should:

1. **Never modify `enhanced/core/`** - contracts are frozen
2. **Implement ports in `enhanced/adapters/readest/`** - wrap Readest objects
3. **Add features to `enhanced/features/<feature-name>/`** - organize by feature
4. **Update `bootstrap.ts` initialization** - add feature initialization logic
5. **Register cleanup handlers** - ensure resources are released
6. **Document integration points** - update this file with feature-specific details

## Constraints

- Only `enhanced/adapters/readest/` can import Readest internals
- Core layer has zero dependencies (no React, DOM, Tauri, or Readest)
- Features must gracefully degrade when feature flag is disabled
- All async resources must register cleanup handlers
- Port implementations must handle both Tauri and Web platforms

## Next Steps

1. **agent-platform-foundation**: Implement import-platform feature
2. **agent-v1-audio**: Implement SpeechPort and enhanced TTS
3. **agent-v2-learn**: Implement LearningRepository and Eudic bridge
4. **agent-v3-translate**: Implement translation services
5. **Integration agent**: Wire up ports and test end-to-end

---

**Status**: Bootstrap complete, ready for feature implementation
