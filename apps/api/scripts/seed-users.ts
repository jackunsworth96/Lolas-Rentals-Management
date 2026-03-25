/**
 * Seed script: creates a test store, Admin and Staff roles with permissions,
 * two employees, and two users (admin + staff) for testing login.
 *
 * Run from repo root: npm run seed -w apps/api
 * Or from apps/api: npx tsx scripts/seed-users.ts
 *
 * .env is loaded from (first found wins):
 *   1. Monorepo root:  <repo>/.env
 *   2. API package:    apps/api/.env
 *   3. Current directory (process.cwd())/.env
 *
 * Test credentials after running:
 *   Admin:  username = admin   PIN = 1234
 *   Staff:  username = staff   PIN = 5678
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const apiDir = resolve(__dirname, '..');
const monorepoRoot = resolve(__dirname, '../..');

[monorepoRoot, apiDir, process.cwd()].forEach((dir) => {
  config({ path: resolve(dir, '.env') });
});

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';
import { ALL_PERMISSIONS } from '@lolas/shared';

const SALT_ROUNDS = 12;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in .env or the environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const STORE_LOLAS_ID = 'store-lolas';
const STORE_BASS_ID = 'store-bass';
const ROLE_ADMIN_ID = 'role-admin';
const ROLE_STAFF_ID = 'role-staff';
const EMPLOYEE_ADMIN_ID = 'emp-admin-1';
const EMPLOYEE_STAFF_ID = 'emp-staff-1';

/** Staff can view and submit timesheets/todo/expenses/cashup/orders but not edit accounts, approve timesheets, or override cashup */
const STAFF_PERMISSIONS = [
  'can_view_inbox',
  'can_view_active',
  'can_view_completed',
  'can_view_fleet',
  'can_view_maintenance',
  'can_view_transfers',
  'can_view_cardsettlements',
  'can_view_expenses',
  'can_view_timesheets',
  'can_submit_timesheets',
  'can_view_todo',
  'can_view_lostopportunity',
  'can_view_cashup',
  'can_view_uierrors',
  'can_view_miscsales',
  'can_view_accounts',
];

async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

async function main() {
  console.log('Seeding stores, roles, employees, and users...\n');

  const stores = [
    { id: STORE_LOLAS_ID, name: "Lola's Rentals", location: 'General Luna, Siargao', is_active: true },
    { id: STORE_BASS_ID, name: 'Bass Bikes', location: 'General Luna, Siargao', is_active: true },
  ];
  const { error: storeErr } = await supabase.from('stores').upsert(stores, { onConflict: 'id' });
  if (storeErr) {
    console.error('Stores:', storeErr.message);
  } else {
    console.log("✓ Stores: Lola's Rentals, Bass Bikes");
  }

  const { error: rolesErr } = await supabase.from('roles').upsert(
    [
      { id: ROLE_ADMIN_ID, name: 'Admin' },
      { id: ROLE_STAFF_ID, name: 'Staff' },
    ],
    { onConflict: 'id' },
  );
  if (rolesErr) {
    console.error('Roles:', rolesErr.message);
  } else {
    console.log('✓ Roles: Admin, Staff');
  }

  const adminPerms = ALL_PERMISSIONS.map((p) => ({ role_id: ROLE_ADMIN_ID, permission: p }));
  const staffPerms = STAFF_PERMISSIONS.map((p) => ({ role_id: ROLE_STAFF_ID, permission: p }));

  const { error: rpErr } = await supabase.from('role_permissions').upsert(
    [...adminPerms, ...staffPerms],
    { onConflict: 'role_id,permission' },
  );
  if (rpErr) {
    console.error('Role permissions:', rpErr.message);
  } else {
    console.log('✓ Role permissions: Admin (all), Staff (limited)');
  }

  const employees = [
    {
      id: EMPLOYEE_ADMIN_ID,
      store_id: STORE_LOLAS_ID,
      full_name: 'Test Admin',
      role: 'Admin',
      status: 'Active',
      rate_type: 'monthly',
      basic_rate: 0,
      overtime_rate: 0,
      nine_pm_bonus_rate: 0,
      commission_rate: 0,
      paid_as: 'monthly',
      monthly_bike_allowance: 0,
      bike_allowance_used: 0,
      bike_allowance_accrued: 0,
      available_balance: 0,
      thirteenth_month_accrued: 0,
      current_cash_advance: 0,
      holiday_allowance: 5,
      holiday_used: 0,
      sick_allowance: 5,
      sick_used: 0,
      sss_deduction_amt: 0,
      philhealth_deduction_amt: 0,
      pagibig_deduction_amt: 0,
    },
    {
      id: EMPLOYEE_STAFF_ID,
      store_id: STORE_BASS_ID,
      full_name: 'Test Staff',
      role: 'Staff',
      status: 'Active',
      rate_type: 'daily',
      basic_rate: 0,
      overtime_rate: 0,
      nine_pm_bonus_rate: 0,
      commission_rate: 0,
      paid_as: 'daily',
      monthly_bike_allowance: 0,
      bike_allowance_used: 0,
      bike_allowance_accrued: 0,
      available_balance: 0,
      thirteenth_month_accrued: 0,
      current_cash_advance: 0,
      holiday_allowance: 5,
      holiday_used: 0,
      sick_allowance: 5,
      sick_used: 0,
      sss_deduction_amt: 0,
      philhealth_deduction_amt: 0,
      pagibig_deduction_amt: 0,
    },
  ];

  const { error: empErr } = await supabase.from('employees').upsert(employees, { onConflict: 'id' });
  if (empErr) {
    console.error('Employees:', empErr.message);
  } else {
    console.log('✓ Employees: Test Admin, Test Staff');
  }

  const adminPinHash = await hashPin('1234');
  const staffPinHash = await hashPin('5678');

  const users = [
    {
      username: 'admin',
      pin_hash: adminPinHash,
      employee_id: EMPLOYEE_ADMIN_ID,
      role_id: ROLE_ADMIN_ID,
      is_active: true,
    },
    {
      username: 'staff',
      pin_hash: staffPinHash,
      employee_id: EMPLOYEE_STAFF_ID,
      role_id: ROLE_STAFF_ID,
      is_active: true,
    },
  ];

  for (const u of users) {
    const { error: userErr } = await supabase.from('users').upsert(u, {
      onConflict: 'username',
    });
    if (userErr) {
      console.error(`User ${u.username}:`, userErr.message);
    } else {
      console.log(`✓ User: ${u.username}`);
    }
  }

  console.log('\nDone. Test login with:');
  console.log('  Admin:  username = admin   PIN = 1234');
  console.log('  Staff:  username = staff   PIN = 5678');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
