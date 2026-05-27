# Task 5+6 — Memory Compression + Tool Registry Enhancement

## Summary

Two critical enhancements completed:

### Task 5: Memory Compression in Long-Term Memory
- Added `vectorCosineSimilarity()` helper (needed because `calculateSimilarity` takes strings, not number[])
- Added `compressMemories()` — semantic similarity-based compression (vs category-based `summarizeOldMemories`)
- Added `rankMemoriesByRelevance()` — 6-factor composite ranking (recency 25%, frequency 20%, importance 25%, semantic 30%, agent bonus, time window bonus)
- Added `getMemoryStats()` — comprehensive memory analytics
- File: `src/lib/memory/long-term.ts` (612 → 893 lines)

### Task 6: Tool Registry Enhancement
- Added 4 exported interfaces: `AgentCapability`, `ExecutionPolicy`, `ExecutionPolicyRule`, `ToolScopedAuth`
- Added 3 manager classes: `CapabilityManager`, `ExecutionPolicyManager`, `ToolScopedAuthManager`
- Integrated into `ToolRegistry`: 3 private fields, 5 public methods, step 2.5 in `execute()` method
- File: `src/lib/tools/registry.ts` (597 → 959 lines)

### Verification
- ESLint: zero errors
- Dev server: running normally
- All existing APIs preserved (backward compatible)
