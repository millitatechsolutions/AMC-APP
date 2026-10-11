# Requirements analysis

Source: “Digital Genset AMC Management System — Vendor Technical & Functional Requirements”, United Bank Limited, uploaded PDF, 10 pages. Document requirements guide product design; vendor-response blanks and instructions in the PDF do not authorize external submissions or deployment.

## Business objective and invariants

Digitize monthly maintenance across 2,200 gensets: 700 under warranty and 1,500 out of warranty. Track technician execution, digital Field Service Reports (FSRs), branch acknowledgement, HO monitoring, exception management and finance reconciliation. The current physical collection process is approximately 40 days; the document requests a faster process without specifying a new guaranteed duration.

- Warranty visits undergo the same reporting and branch-review workflow but have zero visit charge.
- Only branch-acknowledged OOW visits are eligible at the approved applicable rate (currently PKR 3,500).
- Pending and unacknowledged visits must not enter payable totals.
- Rejection requires a reason. Every decision must retain actor, employee ID, FSR reference and timestamp.
- A payable line must be traceable to a visit, FSR and branch acknowledgement.
- No user may reach unrelated branch, vendor or technician assignments through UI or API.
- Mandatory readings and image evidence must be enforced server-side, including conditional fields.

The theoretical maximum monthly visit charge at the stated rate is **PKR 5,250,000** (1,500 × 3,500). The application calculates from actual eligible visits, never this target total.

## Requirement coverage

| Area | Current increment | Remaining delivery |
|---|---|---|
| Technician | Responsive assigned-visit form, required images, submission and rejected-report resubmission | Native Android, visit start/location consent, encrypted offline drafts and conflict-safe sync |
| Branch | Branch-scoped FSR detail, photos, acknowledge/unacknowledge, reason and audit | Native Android, reminders, delegation and production user provisioning |
| HO | Dashboard, filters, asset register, visit drill-down, warranty/OOW summaries | Import 2,200 assets, calendar, recurrence, configurable SLA and escalations, issue ageing |
| FSR | Structured source-table fields, checklist choices, computed references/PM flag, evidence and revisions | Customer-approved dictionary, supplier master, stricter range/consistency rules, true PM-history updates |
| Finance | Authoritative eligibility and rate, monthly traceable payment CSV | Approval/locking/reversal workflow, invoice links, versioned commercial rates, settlement and finance integration |
| Reports | Dashboard, visit detail, payment statement and CSV | Full FSR export, Excel/PDF, all 13 named reports, scheduled exports and authorization review |
| Security | Local demo sessions and server-side scope checks | Enterprise identity/MFA, full RBAC, secure Android storage, TLS, retention, immutable external audit and penetration review |
| Operations | Reproducible local development with persistent SQLite | Approved hosting/data residency, PostgreSQL, object storage, backup/restore tests, monitoring, HA/DR and incident SLA |

No Android, offline, notification, Here4you integration, production security or real-data scale validation is claimed by this increment.

## Decisions that need UBL clarification before production

1. **Warranty terminology:** sections 6–8 use “SLA (OOW)”, but section 12 describes “SLA (Under Warranty)”. This increment uses unambiguous internal values `Warranty` and `OOW`; commercial classification must be based on approved asset records, not guessed from installation year.
2. **FSR field count:** the document says “70 fields”, while the visible table groups several values (including three phase readings) and conditional items. The implemented dictionary has 75 entries: source-table mapping plus separate phase readings, explicit pressure unit, before/after evidence and severity. Obtain an approved numbered field dictionary before contractual acceptance; no claim of exactly 70 customer-approved fields is made.
3. **Conditional mandatory values:** “If Average”, “If Bad” and complaint number apply only in their stated conditions. “No parts”, “no fault”, missing legacy last-visit data and denied load testing need approved not-applicable reasons. The demo requires explicit text for most non-applicable items.
4. **Schedule rules:** monthly AMC and “30 days after last visit” can diverge at month boundaries. Clarify first-visit dates, the five-day grace rule, timezone, holidays and complaint/PM visits within the same month. Demo due dates are seeded independently for representative overdue cases; automatic recurrence is not implemented.
5. **PM history:** approve how acknowledged PM services update baseline date/hours, replacements reset counters, and branch denials affect technical readings. Demo PM flags use seeded baselines and never silently advance them.
6. **Commercial controls:** confirm effective rate dates, taxes, duplicate-visit policy, warranty cutoffs at service date, invoice approvals, payable reversals, closed periods and finance integration.
7. **Evidence:** confirm whether a stamped paper FSR photo remains required alongside digital acknowledgement, photo retention, consent for location capture and optional signatures.
8. **Security/hosting:** confirm identity provider, hosting and residency approval, user/role ownership, retention, audit controls, backup frequency, recovery objectives and required Android versions.
9. **SLA:** provide acknowledgement deadline, reminder intervals, escalation hierarchy, notification channels and recipients. No numerical SLA is invented.

## Proposed delivery sequence

1. **Foundation (this increment):** local working workflow, schema, API, scope checks and payment invariants.
2. **Operational MVP:** PostgreSQL migrations, real master-data import, enterprise login, native Android technician/branch apps, secure attachment storage and visit start timestamps. Deliver customer-approved FSR dictionary and API contract.
3. **Operational completeness:** offline synchronization, schedule recurrence, configurable notifications/escalation, issue management and warranty exceptions. Implement requested exports and all named reports.
4. **Finance and assurance:** invoice/statement approval, audit retention, integration, load testing for the actual fleet, device compatibility tests, security testing and backup/restore rehearsal.
5. **UAT and rollout:** customer sign-off against section 16, manuals and training, production deployment and agreed support model.

Calendar estimates and costs require approved integrations, team capacity and customer security decisions; they are not committed here.
