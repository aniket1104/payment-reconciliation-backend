# Payment Reconciliation Engine — Backend

## Overview

This backend implements a **payment reconciliation engine** that automatically matches **bank transactions** with **invoices**, flags uncertain matches for **human review**, and provides **auditable admin controls** for final decisions.

The system is designed to be:

- **Conservative** — avoid false positives in financial data
- **Explainable** — every match can be justified
- **Scalable** — handles large CSV uploads efficiently
- **Auditable** — no silent or irreversible actions

The implementation strictly follows the requirements described in the **Round 2 BRD**.

---

## High-Level Architecture


---

## Core Design Principles

### 1. Financial Safety First

In financial systems, **false positives are more dangerous than false negatives**.

Therefore:
- Only **very high confidence matches (≥ 95%)** are auto-matched
- Ambiguous cases are explicitly flagged for review
- Nothing is silently confirmed

This mirrors how real-world accounting and reconciliation systems behave.

---

### 2. Clear Separation of Concerns

Each layer has a single, well-defined responsibility:

| Layer | Responsibility |
|-----|---------------|
| API Layer | HTTP handling, validation, orchestration |
| Matching Engine | Pure scoring and decision logic |
| Worker | Background CSV processing |
| Redis | Performance optimization only |
| Database | Source of truth |
| Audit Logs | Immutable decision history |

This separation improves:
- Maintainability
- Testability
- Reasoning about correctness

---

## Technology Stack & Rationale

### Node.js + TypeScript
- Strong typing for financial data
- Safer refactoring and correctness
- Commonly used in production backends

---

### Express
- Minimal abstraction
- Predictable request lifecycle
- Easy to reason about and explain

---

### PostgreSQL (Primary Database)
Chosen for:
- ACID guarantees
- Strong indexing and query planning
- Suitability for financial and relational data

All **authoritative state** lives in PostgreSQL.

---

### Prisma ORM
- Type-safe database access
- Explicit schema modeling
- Safe migrations
- Easy to read and reason about

Business logic remains in services, not inside ORM abstractions.

---

### Redis (Optional Support Layer)

Redis is used **only as a performance optimization**, never as a source of truth.

Used for:
1. Invoice lookup caching (read-heavy data)
2. Reconciliation progress tracking

> The system functions correctly even if Redis is unavailable.

This ensures:
- No correctness dependency on Redis
- Safe degradation during failures

---

## Data Model Design

### Invoice
Represents expected payments.

- Seeded once from CSV
- Paid invoices are excluded during matching
- Indexed on amount, status, and due date

---

### BankTransaction
Represents a single row from the bank CSV.

Stores:
- Match result
- Confidence score
- Detailed explanation of the match decision

Each transaction belongs to a reconciliation batch.

---

### ReconciliationBatch
Represents one CSV upload session.

Tracks:
- Total rows
- Processed rows
- Match counts by category
- Lifecycle status

This enables:
- Progress tracking
- Safe retries
- Admin visibility

---

### MatchAuditLog
An **immutable audit log** of every decision.

Each entry records:
- Previous and new invoice (if applicable)
- Action taken
- Who performed it (system or admin)
- Optional reason

This provides full traceability and safety.

---

## Matching Engine Design (Core Logic)

### Why a Pure Matching Engine?

The matching engine is:
- Pure
- Deterministic
- Side-effect free
- Unit-testable
- Framework-agnostic

It has:
- No database access
- No HTTP logic
- No shared state

This makes it easy to test, reason about, and evolve.

---

### Matching Strategy

#### 1. Amount-Based Filtering
Only invoices with **exact amount matches** are considered.

This drastically reduces false positives and search space.

---

#### 2. Name Normalization
Bank descriptions are noisy and inconsistent.

Normalization includes:
- Uppercasing
- Removing punctuation
- Removing noise words (PAYMENT, DEP, CHK, etc.)
- Collapsing whitespace

---

#### 3. Name Similarity (Primary Signal)
**Jaro–Winkler similarity** is used because:
- It is designed for short human names
- Handles reordered names well
- Tolerates initials and abbreviations

This performs better than Levenshtein for this domain.

---

#### 4. Date Proximity (Secondary Signal)
Payments closer to the invoice due date receive a small confidence boost.

---

#### 5. Ambiguity Penalty
If multiple invoices share the same amount:
- Confidence is penalized
- The system defers to human review

This avoids unsafe auto-matching.

---

### Confidence Thresholds

| Confidence | Outcome |
|-----------|--------|
| ≥ 95 | AUTO_MATCHED |
| 60–94 | NEEDS_REVIEW |
| < 60 | UNMATCHED |

These thresholds are intentionally conservative.

---

## Background Processing

### Why Background Processing?

CSV uploads may contain **up to 10,000 rows**.

Processing them synchronously would:
- Block HTTP requests
- Freeze the UI
- Risk timeouts

---

### In-Process Worker

An in-process worker is used because:
- Batch size is finite
- Single-node deployment is sufficient
- Easier to debug and reason about

The design allows easy migration to **BullMQ** if scaling is required.

---

### Streaming CSV Processing

CSV files are processed using **streams**, not loaded into memory.

Benefits:
- Constant memory usage
- Safe handling of large files
- Predictable performance

---

## Human-in-the-Loop Admin Actions

### Explicit Admin Control

System outcomes are **suggestions**, not final decisions.

Admins must explicitly:
- Confirm matches
- Reject matches
- Manually assign invoices
- Mark transactions as external

No action is silent or automatic.

---

### Status Lifecycle

| Type | Status |
|----|------|
| System | AUTO_MATCHED, NEEDS_REVIEW, UNMATCHED |
| User | CONFIRMED, EXTERNAL |

System logic never sets user-driven statuses.

---

## Pagination & Performance

### Cursor-Based Pagination

OFFSET pagination is avoided because it degrades with large datasets.

Cursor-based pagination:
- Scales well
- Uses indexed columns
- Provides consistent performance

---

### Invoice Search

Invoice search is:
- Indexed
- Deterministic
- Fast (<200ms)

No fuzzy matching is used to avoid ambiguity in manual matching.

---

## Error Handling & Resilience

- Redis failures do not break reconciliation
- Partial progress is preserved
- Fatal errors mark batches as failed explicitly
- No silent retries or hidden failures

---

## Why This Design Works

This backend:
- Reflects real-world financial systems
- Is easy to explain and defend in interviews
- Prioritizes safety and correctness
- Scales within the given constraints
- Leaves room for future enhancements

---

## Future Improvements (Out of Scope)

- Move worker to BullMQ for horizontal scaling
- Add authentication and RBAC
- Support partial payments
- Add batch reprocessing
- Add reconciliation analytics

---

## Final Notes

This system is intentionally **conservative, explicit, and predictable** — exactly how financial backend systems should behave.

Every design choice favors:
- Safety
- Transparency
- Maintainability

---

## 🚀 How to Run Locally

### 1. Prerequisites
- **Node.js**: v20 or higher
- **PostgreSQL**: Local instance or cloud-hosted
- **Redis (Optional)**: For performance optimization

### 2. Environment Setup
Create a `.env` file in the `backend` directory:
```env
PORT=8080
DATABASE_URL="your_postgresql_connection_string"
CORS_ORIGIN="http://localhost:3000"
NODE_ENV=development
API_PREFIX=/api/v1
```

### 3. Installation & Database Setup
```bash
# Install dependencies
npm install

# Push schema to database and generate client
npx prisma db push
npx prisma generate
```

### 4. Start the Application
```bash
# Development mode
npm run dev

# Production build
npm run build
npm run start
```

## 📸 Test Results

#### Test Result for 1000 rows
<img width="592" height="661" alt="Screenshot 2025-12-29 at 10 03 27 AM" src="https://github.com/user-attachments/assets/cf3ad247-a266-47e7-b7f7-35814979fed8" />

#### Test Result for 10000 rows
<img width="572" height="570" alt="Screenshot 2025-12-29 at 10 02 00 AM" src="https://github.com/user-attachments/assets/b5ff4f42-f71c-4849-bced-f571df0dced4" />

#### Backend Unit Testing using Jest
<img width="288" height="73" alt="Screenshot 2025-12-29 at 10 19 46 AM" src="https://github.com/user-attachments/assets/1fd1943a-4521-4d0a-ad34-946e1396b9e9" />



---

