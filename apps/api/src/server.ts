import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiDir = resolve(__dirname, '..');
const monorepoRoot = resolve(__dirname, '../..');
[monorepoRoot, apiDir, process.cwd()].forEach((dir) => config({ path: resolve(dir, '.env') }));

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { routes } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';

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

const DEFAULT_CORS_ORIGINS = [
  'https://lolas-rentals-management-web.vercel.app',
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3003',
] as const;

function buildCorsAllowedOrigins(): string[] {
  const fromEnv = process.env.ALLOWED_ORIGIN?.trim();
  const extra = fromEnv
    ? fromEnv.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  return [...new Set([...DEFAULT_CORS_ORIGINS, ...extra])];
}

const CORS_ALLOWED_ORIGINS = buildCorsAllowedOrigins();

const app = express();

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
app.use(express.json());

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
};

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/api', routes);
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Not found', path: req.originalUrl },
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
