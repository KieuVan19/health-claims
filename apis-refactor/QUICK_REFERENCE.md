# Quick Reference Guide

At-a-glance summary of all refactoring items.

---

## 🔴 High Priority (4 items, ~35-43 hours)

| # | Item | What | Why | Effort | Files |
|---|------|------|-----|--------|-------|
| **1** | Consolidate claim actions | Merge `/approve`, `/reject`, etc. into `/actions` dispatcher | Cleaner state machine, auditable intent | 20-30h | claims.ts |
| **2** | Standardize pagination | All list endpoints return `{data, pagination}` | Consistency, easier client code | 8-10h | response.ts + 8 routes |
| **3** | Ownership middleware | Move access checks to middleware | Less duplication, clearer RBAC | 4-6h | ownership.ts + 4 routes |
| **4** | Centralize enums | Move `CLAIM_STATUSES`, `USER_ROLES` to constants | Single source of truth | 1-2h | enums.ts + 10 routes |

**Status:** ⬜⬜⬜⬜ (0/4 done)

**Do this first.** Unblocks medium priority; highest impact with lowest risk.

---

## 🟡 Medium Priority (5 items, ~30-40 hours)

| # | Item | What | Why | Effort | Files |
|---|------|------|-----|--------|-------|
| **5** | Extract filters | Pull date/search logic into utils | DRY, consistent filtering | 4h | filters.ts + 6 routes |
| **6** | Transactions | Wrap state changes in `prisma.$transaction()` | Data integrity, atomic changes | 12h | claims.ts + payouts.ts + overpayments.ts |
| **7** | Soft deletes | Add `deletedAt` to schema, exclude in queries | Audit trail, recovery, compliance | 8h | schema.prisma + document queries |
| **8** | Resource nesting | Fix ambiguous `:id` parameters | Clarity, consistency | 3h | all routes |
| **9** | Batch operations | Add `POST /resources/bulk-actions` pattern | Better UX for bulk workflows | 10h | batch.ts + 3 routes |

**Status:** ⬜⬜⬜⬜⬜ (0/5 done)

**Do after high priority.** Improves data integrity and consistency.

---

## 🟢 Low Priority (5 items, ~15-25 hours)

| # | Item | What | Why | Effort | Files |
|---|------|------|-----|--------|-------|
| **10** | Request IDs | Add UUID tracking per request | Debugging, tracing | 1h | middleware |
| **11** | RBAC in docs | Add role info to Swagger | Clarity for developers | 3h | JSDoc comments |
| **12** | Response schemas | Define OpenAPI schemas for responses | Clarity, client codegen | 12h | swagger.ts + JSDoc |
| **13** | Notification routes | Consolidate read/read-all into single endpoint | Fewer endpoints | 2h | notifications.ts |
| **14** | API versioning | Add `/api/v1/` prefix (optional) | Future-proof for breaking changes | 5h | index.ts + all routes |

**Status:** ⬜⬜⬜⬜⬜ (0/5 done)

**Do when you have time.** Nice-to-have improvements.

---

## 🎯 Recommended Timeline

### Week 1 (High Priority)
```
Monday-Tuesday:    Enums (#4) + Ownership middleware (#3)
Wednesday-Friday:  Pagination (#2)
```

### Week 2 (High Priority cont.)
```
Monday-Friday:     Claim actions (#1)
```

### Week 3-4 (Medium Priority)
```
Week 3:  Filters (#5) + Nesting (#8) + Transactions (#6)
Week 4:  Soft deletes (#7) + Batch ops (#9)
```

### Later (Low Priority)
```
As time permits:  Request IDs (#10), RBAC docs (#11), Schemas (#12), etc.
```

---

## 💡 Quick Start

**If starting today:**

```bash
# 1. Create feature branch
git checkout -b refactor/apis-phase-1

# 2. Start with enums (smallest change)
cd backend
touch src/constants/enums.ts

# 3. Add constants (copy from existing code)
# Edit src/constants/enums.ts

# 4. Update routes to import
# Edit src/routes/*.ts

# 5. Test
npm run tsc --noEmit
pnpm test

# 6. Commit
git add .
git commit -m "refactor: centralize status and role enums"

# 7. Push and create PR
git push -u origin refactor/apis-phase-1
```

---

## 📋 Pre-Refactor Checklist

Before starting work:
- [ ] All tests pass (`pnpm test`)
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] `main` branch is clean (no uncommitted changes)
- [ ] Create feature branch: `git checkout -b refactor/<name>`
- [ ] Read the detailed docs in HIGH_PRIORITY.md, etc.

---

## 📋 Post-Refactor Checklist

After each refactor:
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Manual testing on localhost (3001/5173)
- [ ] Swagger docs still valid
- [ ] Frontend still works (no broken API calls)
- [ ] Commit message is clear
- [ ] Push to GitHub and create PR
- [ ] Code review approval
- [ ] Merge to main

---

## 🆘 If Something Breaks

```bash
# See what changed
git diff

# Revert the last commit (not pushed yet)
git reset --hard HEAD~1

# Or revert a specific commit (if pushed)
git revert <commit-hash>

# Then investigate and fix
git log --oneline | head -5
```

---

## 📊 Effort Breakdown

```
High Priority:    43 hours
Medium Priority:  37 hours
Low Priority:     23 hours
---
TOTAL:           ~103 hours (~2-3 weeks full-time)
```

**Per week (full-time):**
- Week 1: High priority → 2-3 items done
- Week 2: High + start medium → 2-3 more items
- Week 3: Medium → 2-3 items
- Week 4: Medium + low → finish medium, start low

**Part-time (20h/week):**
- 5-6 weeks total

---

## Key Files to Update

**Backend:**
- `src/constants/enums.ts` (new)
- `src/utils/response.ts` (new)
- `src/utils/filters.ts` (new)
- `src/utils/batch.ts` (new)
- `src/middleware/ownership.ts` (new)
- `src/routes/*.ts` (all routes updated)
- `prisma/schema.prisma` (soft deletes)

**Frontend:**
- `src/api/*.ts` (all API calls updated)

**Docs:**
- `apis-refactor/` (this folder)

---

## Questions?

Refer to:
- **What & Why?** → HIGH_PRIORITY.md, MEDIUM_PRIORITY.md, LOW_PRIORITY.md
- **How do I track progress?** → IMPLEMENTATION_CHECKLIST.md
- **Which do I do first?** → README.md or this guide
- **How long does each take?** → Quick Reference table above

---

## Support

If stuck:
1. Check the detailed doc for that item
2. Look at similar patterns in existing code
3. Run `git log --oneline` to see past refactors for inspiration
4. Ask for code review early (don't wait until done)
