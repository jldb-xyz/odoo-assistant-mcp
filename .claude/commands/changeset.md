# /changeset - Generate Version Changeset

Create a comprehensive changeset documenting all changes since the last release, grouped by date with major features highlighted.

## Workflow

### Phase 1: Gather Context

**Collect commit history:**
```bash
# Get current version
cat package.json | grep '"version"'

# Check existing changesets
ls .changeset/

# Get all commits with dates (chronological order)
git log --format="%ad %s" --date=short --since="<last-release-date>" | tac
```

**Determine version bump:**
- **major**: Breaking changes, major rewrites, API changes
- **minor**: New features, significant enhancements (default for feature releases)
- **patch**: Bug fixes, minor improvements, documentation

### Phase 2: Analyze Changes

**Identify major features:**
- New user-facing functionality
- Significant architectural changes
- New integrations or systems

**Group by category:**
- Features (feat:)
- Bug fixes (fix:)
- Refactoring (refactor:)
- Types (types:)
- Documentation (docs:)
- Chores (chore:)

**Group by date:**
- Most recent first in overview
- Chronological within detailed changelog

### Phase 3: Write Changeset

**File naming:** Use random memorable name (e.g., `golden-dragons-flow.md`)

**Structure:**
```markdown
---
"package-name": minor
---

# vX.Y.Z - Release Title

## Major New Features

### Feature Name (Date)
Brief description of the feature and its value to users.

---

## Detailed Changelog by Date

### Month Day, Year

#### Category Name
- Specific change description
- Another change
```

### Phase 4: Create File

```bash
# Write changeset to .changeset directory
# Use descriptive kebab-case name
```

## Changeset Format Rules

**Header section:**
- Package name must match package.json
- Version bump type: major | minor | patch

**Major Features section:**
- 3-5 sentence descriptions
- Include date in parentheses
- Focus on user value, not implementation

**Detailed Changelog:**
- Group by date (newest first)
- Subgroup by category
- Use imperative mood ("Add feature" not "Added feature")
- Be specific but concise

## Example Output

```markdown
---
"grow-tracker": minor
---

# v0.2.0 - Enhanced Dashboard Experience

## Major New Features

### Real-time Notifications (Jan 15)
Push notifications for watering reminders, stage transitions, and
environmental alerts. Configurable per-plant notification preferences.

### Multi-plant Comparison View (Jan 14)
Side-by-side comparison of multiple plants showing growth metrics,
nutrient uptake, and stage progression differences.

---

## Detailed Changelog by Date

### January 15, 2025

#### Notifications System
- Add push notification service worker
- Add notification preferences to user settings
- Add watering reminder notifications
- Add stage transition alerts

#### Bug Fixes
- Fix timezone handling in event scheduling
- Fix notification permission prompt timing

### January 14, 2025

#### Comparison Feature
- Add multi-plant selection UI
- Add comparison metrics calculations
- Add side-by-side chart visualization
```

## Flags

- `--major` - Force major version bump
- `--minor` - Force minor version bump (default)
- `--patch` - Force patch version bump
- `--since <date>` - Only include commits since date (default: last changeset)
- `--dry-run` - Show what would be generated without creating file
