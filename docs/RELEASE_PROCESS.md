# Release Process

This document outlines the standard process for fixing issues and releasing new features in the reloaderoo project.

## Overview

We follow a **branch-based workflow** with **logical commits** and **explicit permission** for all pushes to ensure code quality and proper review processes.

## Core Principles

1. **Never work directly on `main`** - Always create feature branches
2. **Logical, atomic commits** - Each commit should represent a single logical change
3. **Explicit push permission** - Always ask before pushing to remote
4. **Comprehensive PR descriptions** - Include root cause, solution, testing, and impact
5. **Automated review integration** - Use `cursor review` for additional bug detection

## Standard Workflow

### 1. Branch Creation

**✅ Correct Approach (Always do this):**
```bash
# Start from clean main branch
git checkout main
git pull origin main

# Create feature branch with descriptive name
git checkout -b fix/cli-entry-point-bug
# or
git checkout -b feature/add-new-inspection-tool
```

**Branch Naming Conventions:**
- `fix/` - Bug fixes (e.g., `fix/cli-entry-point-bug`)
- `feature/` - New features (e.g., `feature/add-websocket-support`)
- `refactor/` - Code refactoring (e.g., `refactor/simplify-proxy-logic`)
- `docs/` - Documentation updates (e.g., `docs/update-api-reference`)

### 2. Development & Commits

Make your changes and create **logical, atomic commits**:

```bash
# Stage specific files (not git add .)
git add src/bin/reloaderoo.ts src/cli/commands/proxy.ts

# Create descriptive commit with comprehensive message
git commit -m "$(cat <<'EOF'
Fix CLI entry point bug and implement intuitive dual-mode behavior

## Problem Solved
### Root Cause
[Detailed explanation of what was broken and why]

### Solution Implemented
[What changes were made and how they solve the problem]

## Files Changed
- src/bin/reloaderoo.ts: Fixed entry point + dual-mode logic
- src/cli/commands/proxy.ts: Added CLI usage hints

## Testing Completed
- All existing tests pass (121 unit + 19 integration + 11 CLI tests)
- Manual verification of both MCP server and CLI modes
- Cross-platform testing (npm link, npx, direct execution)

## Impact
[What this change means for users and the project]
EOF
)"
```

**Commit Message Structure:**
- **Title**: Concise summary (50 chars or less)
- **Problem Solved**: Root cause analysis and context
- **Solution**: What was implemented and how
- **Files Changed**: List of modified files with brief explanations
- **Testing**: Verification steps taken
- **Impact**: User-facing and project impact

### 3. Pre-Push Checklist

Before requesting push permission, ensure:

```bash
# Build successfully
npm run build

# All tests pass
npm test

# Code linting passes
npm run lint

# Manual testing completed
# (Test the specific functionality you changed)
```

### 4. Request Push Permission

**Always ask explicitly before pushing:**

> "May I push the commit to the remote repository so we can create a PR?"
> 
> The commit is ready locally:
> - `abc1234 Fix CLI entry point bug and implement intuitive dual-mode behavior`
> - Contains [brief summary of changes]
> - Includes comprehensive commit message with root cause, solution, and testing details

**Wait for explicit "Yes" before proceeding.**

### 5. Push and Create PR

Once permission is granted:

```bash
# Push feature branch
git push origin fix/cli-entry-point-bug

# Create PR with comprehensive description
gh pr create --title "Fix CLI entry point bug and implement intuitive dual-mode behavior" --body "$(cat <<'EOF'
[Comprehensive PR description - see template below]
EOF
)"
```

### 6. Trigger Automated Review

Add cursor review to get additional bug detection:

```bash
gh pr comment [PR_NUMBER] --body "cursor review"
```

## PR Description Template

Use this template for all PRs:

```markdown
## 🐛 [Bug Fix/Feature/Refactor] + Brief Description

[One-sentence summary of what this PR accomplishes]

## 🔍 Root Cause Analysis / Background

[For bug fixes: detailed explanation of what was broken and why]
[For features: context and motivation for the new functionality]

## ✅ Solution Implemented

### [Numbered list of key changes]

[Detailed explanation of the approach taken and implementation details]

## 📁 Files Changed

- **`file1.ts`** - [What changed and why]
- **`file2.ts`** - [What changed and why]

## 🧪 Testing Completed

### ✅ [Category 1] Testing
- [Specific test case] ✓ [Result]
- [Specific test case] ✓ [Result]

### ✅ [Category 2] Testing
- [Specific test case] ✓ [Result]

### ✅ Regression Testing
- All existing tests pass ([number] unit + [number] integration + [number] CLI tests)
- No breaking changes to existing functionality
- Maintains full backward compatibility

## 🎯 Impact

[Clear explanation of how this affects users and the project]

### Before this PR:
```bash
[Example of old behavior]
```

### After this PR:
```bash
[Example of new behavior]
```

## 🏷️ Priority: [Critical/High/Medium/Low]

[Justification for priority level]

---

**Commit:** `[hash]` - [commit title]
```

## Recovery from Main Branch Mistakes

If you accidentally work on `main` and have uncommitted changes:

### Scenario 1: Uncommitted Changes on Main

```bash
# Stash changes
git stash

# Create feature branch
git checkout -b fix/your-feature-name

# Apply stashed changes
git stash pop

# Continue normal workflow
```

### Scenario 2: Committed Changes on Main (Recovery Process)

This is what happened in the reloaderoo CLI fix and how we resolved it:

```bash
# 1. Create branch from current state (preserves your work)
git checkout -b fix/cli-entry-point-bug

# 2. Push the feature branch
git push origin fix/cli-entry-point-bug

# 3. Switch back to main and reset it
git checkout main
git reset --hard HEAD~1  # Reset to before your commit

# 4. Force update remote main (removes your commit from main)
git push origin main --force-with-lease

# 5. Create PR from feature branch
gh pr create --head fix/cli-entry-point-bug --base main [...]
```

**⚠️ Important:** This should be the exception, not the rule. Always create feature branches first.

## Development Environment Commands

### Common Development Tasks

```bash
# Start development
git checkout main && git pull origin main
git checkout -b feature/your-new-feature

# During development
npm run build      # Build TypeScript
npm run lint       # Check code quality
npm test          # Run all tests
npm run test:unit # Run unit tests only

# Test CLI functionality
npm link                    # Link for global testing
reloaderoo --help          # Test CLI mode
reloaderoo -- node test.js # Test MCP server mode

# Test startup functionality (new)
npm run test:cli-startup    # Test CLI help commands
npm run test:server-startup # Test MCP server startup
npm run test:dual-mode      # Test mode detection logic

# Pre-push verification
npm run build && npm run lint && npm test
npm run test:cli-startup && npm run test:server-startup && npm run test:dual-mode
```

### Testing Specific Modes

```bash
# Test MCP Server Mode
reloaderoo                           # Should show usage with hints
reloaderoo -- node my-server.js     # Should start proxy server

# Test CLI Tools Mode  
reloaderoo --help                    # Should show CLI help
reloaderoo info                      # Should show system info
reloaderoo inspect --help           # Should show inspection tools
```

## Quality Gates

All PRs must pass these quality gates:

1. **✅ Build Success** - `npm run build` completes without errors
2. **✅ Test Suite** - All tests pass (`npm test`)
3. **✅ Code Quality** - Linting passes (`npm run lint`)
4. **✅ Manual Testing** - Functionality verified in relevant modes
5. **✅ No Regressions** - Existing functionality still works
6. **✅ Documentation** - Code changes are self-documenting or documented
7. **✅ Automated Review** - `cursor review` completed without critical issues

## Release Checklist

For version releases, additionally verify:

- [ ] Version bumped in `package.json`
- [ ] `CLAUDE.md` updated if workflow changes
- [ ] Breaking changes documented
- [ ] Migration guide provided (if needed)
- [ ] Release notes prepared

## Emergency Hotfix Process

For critical production issues:

1. **Create hotfix branch from main**: `git checkout -b hotfix/critical-issue`
2. **Minimal fix only** - No additional features or refactoring
3. **Expedited review** - Get immediate review and approval
4. **Direct merge** - Can merge without extended testing if critical
5. **Follow-up PR** - Address any technical debt introduced

## Best Practices

### Commit Messages
- Use imperative mood ("Fix bug" not "Fixed bug")
- Include context and impact
- Reference issues when applicable
- Keep title under 50 characters
- Use body for detailed explanation

### Branch Management
- Keep branches focused and short-lived
- Regularly rebase against main for long-running branches
- Delete merged branches promptly
- Use descriptive branch names

### Testing Philosophy
- Test both happy path and edge cases
- Verify backward compatibility
- Manual testing supplements automated tests
- Cross-platform verification when relevant

## Tools Integration

### GitHub CLI (`gh`)
- Used for PR creation and management
- Enables rich PR descriptions and automated workflows
- Allows comment-based review triggers

### Cursor BugBot
- Triggered with `cursor review` comment
- Provides automated bug detection
- Supplements human code review

### npm/Node.js
- Standard build and test pipeline
- npm link for local development testing
- Cross-platform compatibility verification

---

This process ensures high code quality, proper documentation, and smooth collaboration while maintaining the stability of the main branch.