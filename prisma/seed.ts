/**
 * Seed Script for Payment Reconciliation Engine
 *
 * This script seeds the database with invoices from a CSV file.
 * Uses createMany for fast bulk inserts.
 *
 * Usage:
 *   npx prisma db seed
 */

import { createReadStream } from 'fs';
import { resolve } from 'path';
import { parse } from 'csv-parse';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient, InvoiceStatus, Prisma } from '@prisma/client';

// ============================================
// Configuration
// ============================================

const CSV_FILE_PATH = resolve(__dirname, '../invoices.csv');

// ============================================
// Prisma Client Setup
// ============================================

const createPrismaClient = (): PrismaClient => {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({ adapter });
};

const prisma = createPrismaClient();

// ============================================
// Types
// ============================================

interface CsvRow {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  amount: string;
  status: string;
  due_date: string;
  paid_at: string;
  created_at: string;
}

// ============================================
// Utility Functions
// ============================================

function parseAmount(value: string): Prisma.Decimal {
  const cleaned = value.replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) throw new Error(`Invalid amount: ${value}`);
  return new Prisma.Decimal(num.toFixed(2));
}

function parseDate(value: string): Date {
  if (!value || value.trim() === '') throw new Error('Date value is required');
  const date = new Date(value.trim());
  if (isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value || value.trim() === '' || value.toLowerCase() === 'null') return null;
  return parseDate(value);
}

function parseStatus(value: string): InvoiceStatus {
  const normalized = value.toLowerCase().trim() as InvoiceStatus;
  const validStatuses: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue'];
  if (!validStatuses.includes(normalized)) {
    throw new Error(`Invalid status: ${value}`);
  }
  return normalized;
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// ============================================
// Main Seeding Logic
// ============================================

async function readAllRows(): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CsvRow[] = [];

    createReadStream(CSV_FILE_PATH)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on('data', (row: CsvRow) => rows.push(row))
      .on('error', reject)
      .on('end', () => resolve(rows));
  });
}

async function main(): Promise<void> {
  log('='.repeat(50));
  log('Payment Reconciliation Engine - Database Seeder');
  log('='.repeat(50));

  try {
    // Step 1: Read all CSV rows into memory (fast for ~500 rows)
    log('Reading CSV file...');
    const rows = await readAllRows();
    log(`Found ${rows.length} rows in CSV`);

    // Step 2: Parse and validate all rows
    log('Parsing invoice data...');
    const invoices = rows.map((row, index) => {
      try {
        return {
          invoiceNumber: row.invoice_number.trim(),
          customerName: row.customer_name.trim(),
          customerEmail: row.customer_email.trim(),
          amount: parseAmount(row.amount),
          status: parseStatus(row.status),
          dueDate: parseDate(row.due_date),
          paidAt: parseOptionalDate(row.paid_at),
          createdAt: row.created_at ? parseDate(row.created_at) : new Date(),
        };
      } catch (error) {
        throw new Error(
          `Row ${index + 2}: ${error instanceof Error ? error.message : 'Parse error'}`
        );
      }
    });
    log(`Parsed ${invoices.length} invoices successfully`);

    // Step 3: Clear existing data
    log('Clearing existing invoices...');
    const deleted = await prisma.invoice.deleteMany({});
    log(`Deleted ${deleted.count} existing invoices`);

    // Step 4: Bulk insert all invoices in one query
    log('Inserting invoices (bulk)...');
    const result = await prisma.invoice.createMany({
      data: invoices,
      skipDuplicates: true,
    });
    log(`Inserted ${result.count} invoices`);

    // Step 5: Verify
    const total = await prisma.invoice.count();
    log('='.repeat(50));
    log(`✅ Seeding complete! Total invoices in database: ${total}`);
    log('='.repeat(50));
  } catch (error) {
    console.error('❌ Seeding failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
