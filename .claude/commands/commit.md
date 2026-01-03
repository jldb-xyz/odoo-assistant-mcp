# /commit - Quality-Gated Commit Workflow

Analyze all uncommitted changes, ensure quality standards, group logically, and create commits without co-author signatures.

## Workflow

### Phase 1: Quality Gates

**Run quality checks in parallel:**
```bash
yarn typecheck
yarn lint
```

**If issues found:**
1. **Fix comprehensively** - Don't just suppress warnings; address root causes
2. **Maintain strict typing** - No `any`, proper type guards, specific union types
3. **Ask user for clarity** when fixes require design decisions (e.g., "Should this be optional or have a default?")
4. **Re-run checks** after fixes until both pass cleanly

**Quality standards to enforce:**
- No TypeScript errors or `any` types introduced
- No ESLint warnings (treat warnings as errors)
- Prefer `Record<SpecificUnion, T>` over `Record<string, T>`
- Extract shared types to `src/types/`
- Use type guards over type assertions

### Phase 2: Change Analysis

**Gather change context:**
```bash
git status                    # See all modified/new files
git diff                      # Unstaged changes
git diff --cached             # Staged changes (if any)
git log --oneline -10         # Recent commit style reference
```

**Group changes by:**
1. **Feature/Domain** - Related functionality (e.g., "tracker", "schedule", "events")
2. **Type of change** - New feature, bug fix, refactor, types, config
3. **Dependency order** - Types before implementations, utils before components

**Common groupings:**
- Type definitions and interfaces → commit first
- Utility functions and helpers → commit second
- Store changes → commit before components using them
- Component changes → group by feature area
- Config/build changes → separate commit

### Phase 3: Commit Creation

**For each logical group, create a commit:**

```bash
git add <files-in-group>
git commit -m "$(cat <<'EOF'
<type>: <concise description>

<optional body explaining why, not what>
EOF
)"
```

**Commit message format:**
- **feat**: New feature or functionality
- **fix**: Bug fix
- **refactor**: Code restructuring without behavior change
- **types**: Type definitions or improvements
- **chore**: Config, deps, build changes
- **docs**: Documentation only
- **style**: Formatting, whitespace (no code change)

**Rules:**
- NO co-author signatures
- NO emoji in commit messages
- Keep subject line under 72 characters
- Use imperative mood ("Add feature" not "Added feature")
- Body explains motivation when non-obvious

### Phase 4: Verification

After all commits:
```bash
git log --oneline -<n>        # Verify commit history looks clean
git status                    # Confirm working tree is clean
```

## Decision Points (Ask User)

**Always ask before:**
- Changing public API signatures
- Removing exported functions/types (might break external usage)
- Significant architectural changes during "quick fix"
- Ambiguous type narrowing (e.g., `string | undefined` → which default?)

**Proceed without asking:**
- Adding missing types to untyped code
- Fixing obvious lint issues (unused imports, formatting)
- Strengthening types (`any` → specific type)
- Adding missing return types

## Example Workflow

```
$ /commit

Phase 1: Quality Gates
━━━━━━━━━━━━━━━━━━━━━━
Running typecheck... ❌ 3 errors

Fixing:
  • src/components/tracker/DashboardContent.tsx:45 - Missing return type
    → Added explicit `React.ReactNode` return type
  • src/utils/mixCalculator.ts:23 - Parameter implicitly has 'any' type
    → Added `nutrients: NutrientDosing[]` type
  • src/types/events.ts:12 - Type 'string' not assignable to 'EventCategory'
    → Fixed union type constraint

Re-running typecheck... ✅ Pass
Running lint... ✅ Pass

Phase 2: Change Analysis
━━━━━━━━━━━━━━━━━━━━━━━
Modified files grouped:

Group 1: Event system types
  - src/types/events.ts
  - src/data/eventDefinitions.ts

Group 2: Tracker dashboard refactor
  - src/components/tracker/DashboardContent.tsx (new)
  - src/components/tracker/index.ts
  - src/pages/tracker/DashboardView.tsx

Group 3: Mix calculator feature
  - src/utils/mixCalculator.ts (new)
  - src/components/tracker/MixCalculatorDrawer.tsx (new)

Phase 3: Commits
━━━━━━━━━━━━━━━
[1/3] types: Refine event system type definitions
[2/3] refactor: Extract DashboardContent from DashboardView
[3/3] feat: Add nutrient mix calculator

Phase 4: Verification
━━━━━━━━━━━━━━━━━━━━
✅ 3 commits created
✅ Working tree clean
```

## Flags

- `--dry-run` - Show what would be committed without committing
- `--single` - Combine all changes into one commit (ask for message)
- `--amend` - Add changes to the most recent commit (use cautiously)
