import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiDir = resolve(__dirname, '..');
const monorepoRoot = resolve(__dirname, '../..');
[monorepoRoot, apiDir, process.cwd()].forEach((dir) => config({ path: resolve(dir, '.env') }));

import express from 'express';
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

const app = express();

app.use(cors());
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
  leaveBalancePort: null as any,
  payrollPort: null as any,
  pawCardPort: null as any,
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', routes);
// Return JSON 404 for unmatched /api routes (e.g. wrong path or method)
app.use('/api', (req, res) => {
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
