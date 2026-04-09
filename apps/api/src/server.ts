import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiDir = resolve(__dirname, '..');
const monorepoRoot = resolve(__dirname, '../..');
[monorepoRoot, apiDir, process.cwd()].forEach((dir) => config({ path: resolve(dir, '.env') }));

import { z } from 'zod';

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
});

const _env = EnvSchema.safeParse(process.env);
if (!_env.success) {
  console.error('Invalid environment variables:', _env.error.flatten().fieldErrors);
  process.exit(1);
}

import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { routes } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { publicReviewsRoutes } from './routes/public-reviews.js';
import { waiverRouter } from './routes/public-waiver.js';
import { publicLimiter } from './middleware/rate-limit.js';
import { authenticate } from './middleware/authenticate.js';

import { SupabaseOrderRepository } from './adapters/supabase/order-repo.js';
import { createOrderItemRepo } from './adapters/supabase/order-item-repo.js';
import { createOrderAddonRepo } from './adapters/supabase/order-addon-repo.js';
import { createPaymentRepo } from './adapters/supabase/payment-repo.js';
import { SupabaseCustomerRepository } from './adapters/supabase/customer-repo.js';
import { SupabaseFleetRepository } from './adapters/supabase/fleet-repo.js';
import { SupabaseEmployeeRepository } from './adapters/supabase/employee-repo.js';
import { createConfigRepo } from './adapters/supabase/config-repo.js';
import { SupabaseAccountingRepository } from './adapters/supabase/accounting-repo.js';
import { createTimesheetRepo } from './adapters/supabase/timesheet-repo.js';
import { createTransferRepo } from './adapters/supabase/transfer-repo.js';
import { createMaintenanceRepo } from './adapters/supabase/maintenance-repo.js';
import { createExpenseRepo } from './adapters/supabase/expense-repo.js';
import { createTodoRepo } from './adapters/supabase/todo-repo.js';
import { createCashReconciliationRepo } from './adapters/supabase/cashup-repo.js';
import { createCardSettlementRepo } from './adapters/supabase/card-settlement-repo.js';
import { createMiscSaleRepo } from './adapters/supabase/misc-sale-repo.js';
import { createMerchandiseRepo } from './adapters/supabase/merchandise-repo.js';
import { createPaymentRoutingRepo } from './adapters/supabase/payment-routing-repo.js';
import { createLeaveBalanceAdapter } from './adapters/supabase/leave-balance-adapter.js';
import { createPayrollAdapter } from './adapters/supabase/payroll-adapter.js';
import { createPawCardAdapter } from './adapters/supabase/paw-card-adapter.js';
import { createBookingAdapter } from './adapters/supabase/booking-adapter.js';
import { createRepairsAdapter } from './adapters/supabase/repairs-adapter.js';
import { createBudgetRepo } from './adapters/supabase/budget-repo.js';

function buildCorsAllowedOrigins(): string[] {
  const origins: string[] = [
    process.env.CORS_ORIGIN ?? 'https://lolas-rentals-management-web.vercel.app',
  ];

  const fromEnv = process.env.ALLOWED_ORIGIN?.trim();
  if (fromEnv) {
    origins.push(...fromEnv.split(',').map((s) => s.trim()).filter(Boolean));
  }

  if (process.env.NODE_ENV !== 'production') {
    origins.push('http://localhost:3000', 'http://localhost:3002', 'http://localhost:3003');
  }

  return [...new Set(origins.filter(Boolean))];
}

const CORS_ALLOWED_ORIGINS = buildCorsAllowedOrigins();

const app = express();
app.set('trust proxy', process.env.TRUST_PROXY === 'false' ? false : 1);
app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || CORS_ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);
// Waiver sign payloads include base64 signature data URLs (must run before global json limit).
app.use('/api/public/waiver', express.json({ limit: '5mb' }));
app.use('/api/waiver', express.json({ limit: '5mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.locals.deps = {
  orderRepo: new SupabaseOrderRepository(),
  orderItemRepo: createOrderItemRepo(),
  orderAddonRepo: createOrderAddonRepo(),
  paymentRepo: createPaymentRepo(),
  customerRepo: new SupabaseCustomerRepository(),
  fleetRepo: new SupabaseFleetRepository(),
  employeeRepo: new SupabaseEmployeeRepository(),
  configRepo: createConfigRepo(),
  accountingPort: new SupabaseAccountingRepository(),
  timesheetRepo: createTimesheetRepo(),
  transferRepo: createTransferRepo(),
  maintenanceRepo: createMaintenanceRepo(),
  expenseRepo: createExpenseRepo(),
  todoRepo: createTodoRepo(),
  cashReconciliationRepo: createCashReconciliationRepo(),
  cardSettlementRepo: createCardSettlementRepo(),
  miscSaleRepo: createMiscSaleRepo(),
  merchandiseRepo: createMerchandiseRepo(),
  paymentRoutingRepo: createPaymentRoutingRepo(),
  leaveBalancePort: createLeaveBalanceAdapter(),
  payrollPort: createPayrollAdapter(),
  pawCardPort: createPawCardAdapter(),
  bookingPort: createBookingAdapter(),
  repairsPort: createRepairsAdapter(),
  budget: createBudgetRepo(),
};

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/api/public/reviews', publicLimiter, publicReviewsRoutes);

app.use('/api/public/waiver', waiverRouter);
app.use('/api/waiver', authenticate, waiverRouter);

app.use('/api', routes);
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Not found',
      ...(process.env.NODE_ENV !== 'production' && { path: req.originalUrl }),
    },
  });
});

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3001;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`);
  });
}

export { app };
