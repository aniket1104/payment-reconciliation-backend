import { Router } from 'express';
import { healthController } from '../controllers';

const router = Router();

/**
 * @route   GET /health
 * @desc    Basic health check
 * @access  Public
 */
router.get('/', healthController.getHealth);

/**
 * @route   GET /health/ready
 * @desc    Readiness check (checks all dependencies)
 * @access  Public
 */
router.get('/ready', healthController.getReadiness);

/**
 * @route   GET /health/live
 * @desc    Liveness check
 * @access  Public
 */
router.get('/live', healthController.getLiveness);

export default router;

