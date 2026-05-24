# Health Claims Portal — Handbook

A plain-language reference for understanding the domain concepts behind this system.

---

## Contents

- [ICD-10 Diagnosis Codes (HC-014)](#icd-10-diagnosis-codes-hc-014)

---

## ICD-10 Diagnosis Codes (HC-014)

### What are ICD-10 codes?

Every possible illness, injury, or medical condition has a unique shorthand label. ICD-10 is the worldwide agreed-upon list of those labels — about 72,000 of them. Doctors and insurance systems use these codes instead of writing out full descriptions, because a 5-character code is much easier to process automatically than "patient had pneumonia complicated by pre-existing diabetes."

`J18.9` means "pneumonia, unspecified." A doctor writes it on a claim form, the insurance system reads it, and both sides instantly know what condition was treated.

### Why does insurance care?

When you submit a claim saying "I went to the hospital and it cost $3,200 — please reimburse me," the insurance company needs to know *why* you went:

- Some treatments are only covered if they're for a covered condition
- Government programs (like Medicare) legally require diagnosis codes on every claim
- Clearinghouses (companies that route claims between hospitals and insurers) won't accept a claim without them

Without a diagnosis code, the claim is essentially: "I spent money on something medical." That's not enough to process.

### The "primary first" rule

You can have up to 12 codes on one claim because a patient might have multiple conditions at once. The **first code always has to be the main reason for the visit**.

Example — a $3,200 hospital stay:

```json
{
  "totalAmount": 3200,
  "diagnosisCodes": ["J18.9", "E11.9"],
  "description": "3-day inpatient stay for pneumonia"
}
```

| Position | Code | Meaning |
|---|---|---|
| Primary (`[0]`) | `J18.9` | Pneumonia — why the patient was admitted |
| Secondary (`[1]`) | `E11.9` | Type 2 diabetes — pre-existing complication |

If you flip them, a claims processor might think the patient came in *for diabetes* and pneumonia was a side note. That can change what gets covered and how much.

### Code format

ICD-10 codes follow the pattern: one uppercase letter + two digits + optional dot + 1–4 alphanumeric characters.

| Code | Meaning |
|---|---|
| `J18.9` | Pneumonia, unspecified |
| `E11.9` | Type 2 diabetes without complications |
| `S52.501A` | Fracture of radius, initial encounter |
| `Z00.00` | Routine general exam |

The system rejects codes that don't match this format (e.g. `j18.9` in lowercase, or plain text like `pneumonia`) with a 400 error before the claim is saved.

### What HC-014 builds

Before HC-014, patients submitted claims with just a dollar amount and a description. After HC-014, a diagnosis code field is added to the submission form.

**Before:** "My hospital visit cost $3,200."

**After:** "My hospital visit cost $3,200. Diagnosis: J18.9 (pneumonia), secondary E11.9 (diabetes)."

Existing claims that predate this change are treated as legacy — they show an empty code list rather than being retroactively flagged as invalid.

**Related tickets:** HC-015 (CPT procedure codes), HC-019 (837 EDI segment ordering)
