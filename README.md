# ScanPay - Payment Reconciliation Backend

A high-performance reconciliation engine designed to match bank transactions with invoices using advanced fuzzy matching logic and an automated workflow.

## 🏗 Architecture & Design Choices

### 1. Layered Architecture
The backend follows a strict layered architecture to ensure maintainability and scalability:
- **Routes**: Define API endpoints and apply path-specific middleware.
- **Controllers**: Handle HTTP-level logic, request validation, and response formatting.
- **Services**: Contain the core business logic (e.g., matching algorithms, batch processing).
- **Utils/Config**: Centralized configuration management and database client initialization.

### 2. Matching Engine (Core Logic)
The matching logic is designed to handle real-world data discrepancies:
- **Fuzzy Matching**: Uses string similarity (Levenshtein distance) for name and reference matching.
- **Weighted Scoring**: Combines multiple factors (Amount + Name Similarity + Date Proximity) into a single confidence score.
- **Conflict Handling**: Segregates matches into `AUTO_MATCHED` (High confidence) and `NEEDS_REVIEW` (Potential matches) to prioritize manual intervention.

### 3. Database & ORM
- **Prisma + PostgreSQL**: Chosen for type-safety and robust relationship management. 
- **Migration Strategy**: Uses Prisma Migrate to ensure schema consistency across environments.
- **Optimization**: Strategic indexing on `amount`, `status`, and `dueDate` to ensure fast lookups during reconciliation.

### 4. Resilience & Security
- **Dynamic CORS**: Mirrored origin handling to support frontend deployments on Vercel/Railway with credential support.
- **Rate Limiting**: Protects endpoints from abuse using `express-rate-limit`.
- **Security Headers**: Integrated `helmet` and `hpp` for protection against common web vulnerabilities.
- **Audit Logging**: Every matching decision (auto or manual) is recorded in a dedicated audit log table for transparency.

## 🛠 Tech Stack
- **Runtime**: Node.js (v20+)
- **Language**: TypeScript
- **Framework**: Express.js
- **ORM**: Prisma (v5.21.1)
- **Database**: PostgreSQL
- **Logging**: Winston + Morgan

---

## 🚀 How to Run Locally

### 1. Prerequisites
- Node.js v20 or higher
- PostgreSQL instance running locally or in the cloud

### 2. Environment Setup
Create a `.env` file in the `backend` directory:
```env
PORT=8080
DATABASE_URL="postgresql://user:password@localhost:5432/scanpay"
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
> [!NOTE]
> Placeholder for test result screenshots (Postman executions, Prisma Studio, or Console outputs).
> ![Backend Tests Placeholder](https://via.placeholder.com/800x400?text=Insert+Backend+Test+Results+Here)

---
