← [Phase 2 Summary](Phase-2-summary.md)

# HC-009 — Provider Entity (NPI)

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | Medium |
| **Phase** | 2 — Operational Realism |
| **Labels** | data-model, schema, provider, eligibility |
| **Depends on** | — |

---

## Summary

Introduce a `Provider` entity keyed by National Provider Identifier (NPI) so that claims reference a structured treating provider record rather than free text. This is a prerequisite for in-network vs out-of-network rate differentiation (HC-010) and is required by any real clearinghouse integration.

## Background

Claims currently have no structured provider field — the treating doctor or hospital is either absent or buried in unvalidated free text. NPI is the CMS-assigned unique identifier for every US healthcare provider. Attaching NPI to claims:
- Enables network status lookups (HC-010)
- Makes the data compatible with X12 EDI interchange (Phase 3)
- Allows duplicate/fraud detection by provider pattern analysis

## Acceptance Criteria

- [ ] New `Provider` model in `prisma/schema.prisma`: `id`, `npi` (unique, 10-digit string), `name`, `providerType` (enum: `PHYSICIAN`, `HOSPITAL`, `CLINIC`, `OTHER`), `inNetwork` (boolean), `specialty` (optional string)
- [ ] `Claim` model gains an optional `providerId` FK to `Provider`
- [ ] Patient claim-submission form includes a provider search/select field (NPI or name lookup against local provider list)
- [ ] Admin UI allows creating and editing `Provider` records and toggling `inNetwork` status
- [ ] Existing claims without a provider remain valid (field is nullable during migration)
- [ ] `pnpm db:migrate` run from `backend/` after schema changes
- [ ] Unit tests cover: claim creation with and without a provider, duplicate NPI rejection

## Technical Notes

- NPI validation: exactly 10 digits, passes Luhn check (standard NPI checksum algorithm)
- Seed a small set of demo providers in `pnpm db:seed` so the rest of Phase 2 can be demoed
- A real NPI registry lookup (NPPES API) is out of scope; local DB lookup is sufficient for now
- `inNetwork` flag lives on `Provider`, not on `Claim` — the network status is a property of the provider, not of each individual claim
