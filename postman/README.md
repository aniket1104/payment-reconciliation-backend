# Postman Collection - Payment Reconciliation Engine

This folder contains Postman collection and environment files for testing the Payment Reconciliation Engine API.

## Files

| File | Description |
|------|-------------|
| `Payment_Reconciliation_Engine.postman_collection.json` | Full API collection with all endpoints |
| `Payment_Reconciliation_Engine.postman_environment.json` | Environment variables for local development |
| `sample_bank_transactions.csv` | Sample CSV file for testing uploads |

## How to Import

1. Open Postman
2. Click **Import** button (top-left)
3. Drag and drop both JSON files, or click **Upload Files**
4. Select the imported environment from the environment dropdown (top-right)

## Endpoints Overview

### Health
- `GET /health` - Server health check

### Reconciliation (Batch Management)
- `POST /reconciliation/upload` - Upload bank transactions CSV
- `GET /reconciliation/:batchId` - Get batch status & progress
- `GET /reconciliation/:batchId/transactions` - Get transactions (cursor-based pagination)
- `GET /reconciliation/:batchId/summary` - Get batch statistics

### Transactions (Admin Actions)
- `GET /transactions/:id` - Get transaction details
- `GET /transactions/:id/audit` - Get audit history
- `POST /transactions/:id/confirm` - Confirm a match
- `POST /transactions/:id/reject` - Reject a match
- `POST /transactions/:id/match` - Manual match to invoice
- `POST /transactions/:id/external` - Mark as external
- `POST /transactions/bulk-confirm` - Bulk confirm AUTO_MATCHED

### Invoices (Search)
- `GET /invoices/search` - Search invoices (q, amount, status)
- `GET /invoices/candidates` - Get candidates for amount
- `GET /invoices/by-number/:invoiceNumber` - Lookup by invoice number
- `GET /invoices/:id` - Lookup by UUID

## Testing Workflow

### 1. Start the Server
```bash
npm run dev
```

### 2. Seed the Database (if not done)
```bash
npm run db:seed
```

### 3. Test Health
Run `Health Check` request to verify server is running.

### 4. Upload CSV
1. Open `Reconciliation > Upload CSV`
2. Click on "file" field and select `sample_bank_transactions.csv`
3. Send the request
4. The `batchId` is automatically saved to variables

### 5. Check Progress
Run `Get Batch Status` to see processing progress.

### 6. Browse Transactions
Run `Get Batch Transactions` to see matched transactions.
- Use `status` filter to see specific categories
- Use `cursor` for pagination

### 7. Admin Actions
- **Confirm**: For AUTO_MATCHED or NEEDS_REVIEW transactions
- **Reject**: To unset a match
- **Manual Match**: To assign a different invoice
- **External**: For payments without invoices

### 8. Search Invoices
Use the invoice search endpoints to find invoices for manual matching.

## Auto-Saved Variables

The collection automatically saves IDs from responses:

| Variable | Saved From |
|----------|------------|
| `batchId` | Upload CSV response |
| `transactionId` | First transaction in list |
| `invoiceId` | First invoice in search results |
| `cursor` | Pagination cursor from transactions |

## Cursor-Based Pagination

The transactions endpoint uses cursor-based pagination:

```
GET /reconciliation/:batchId/transactions?limit=50&cursor=<cursor>
```

Response:
```json
{
  "data": [...],
  "nextCursor": "eyJjcmVhdGVkQXQiOi...",
  "hasMore": true
}
```

To get next page, pass `nextCursor` as `cursor` parameter.

## Status Values

### Transaction Status
- `pending` - Not yet processed
- `auto_matched` - System matched with high confidence
- `needs_review` - System matched but needs admin review
- `unmatched` - No match found
- `confirmed` - Admin confirmed the match
- `external` - Admin marked as external payment

### Invoice Status
- `draft` - Invoice created but not sent
- `sent` - Invoice sent to customer
- `paid` - Invoice has been paid
- `overdue` - Past due date, not paid

