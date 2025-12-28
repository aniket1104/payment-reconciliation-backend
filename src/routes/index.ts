import { Router } from 'express';
import healthRoutes from './health.routes';
import reconciliationRoutes from './reconciliation.routes';
import transactionsRoutes from './transactions.routes';
import invoicesRoutes from './invoices.routes';

const router = Router();

// Health check routes
router.use('/health', healthRoutes);

// Reconciliation routes (CSV upload + batch status)
router.use('/reconciliation', reconciliationRoutes);

// Transaction admin routes (confirm, reject, match, etc.)
router.use('/transactions', transactionsRoutes);

// Invoice routes (search for manual matching)
router.use('/invoices', invoicesRoutes);

export default router;
