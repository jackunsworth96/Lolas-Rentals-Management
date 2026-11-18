import { randomUUID } from 'node:crypto';
import { Employee, DomainError, type ConfigRepository, type EmployeeRepository } from '@lolas/domain';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { saveUser } from './save-user.js';

export interface CreateAccessAccountInput {
  fullName: string;
  personType: 'owner' | 'developer' | 'counter';
  username: string;
  pin: string;
  roleId: string;
  /** Counter tablets book for one store, so they are linked to that store only. */
  storeId?: string;
}

const ROLE_LABEL = { owner: 'Owner', developer: 'Developer', counter: 'Counter tablet' } as const;

export interface CreateAccessAccountDeps {
  configRepo: ConfigRepository;
  employeeRepo: EmployeeRepository;
}

/**
 * A login that is not staff (an owner, a developer, or the reception counter tablet). Every login
 * needs an employee row for attribution, so this creates one with no pay. Owners and developers
 * get every active store; a counter tablet gets only its own store.
 */
export async function createAccessAccount(deps: CreateAccessAccountDeps, input: CreateAccessAccountInput) {
  const sb = getSupabaseClient();
  const username = input.username.trim();

  const exact = username.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: taken, error: takenErr } = await sb.from('users').select('id').ilike('username', exact).limit(1);
  if (takenErr) throw new Error(`Failed to check username: ${takenErr.message}`);
  if ((taken ?? []).length > 0) throw new DomainError('Username already exists. Choose a different username.');

  const { data: stores, error: storeErr } = await sb.from('stores').select('id').eq('is_active', true).order('id');
  if (storeErr) throw new Error(`Failed to load stores: ${storeErr.message}`);
  const activeStoreIds = (stores ?? []).map((s) => String(s.id));
  if (activeStoreIds.length === 0) throw new DomainError('There are no active stores to give this account access to.');
  let storeIds = activeStoreIds;
  if (input.personType === 'counter') {
    if (!input.storeId || !activeStoreIds.includes(input.storeId)) {
      throw new DomainError('Choose the store this tablet sits in.');
    }
    storeIds = [input.storeId];
  }
  const homeStoreId = storeIds.find((id) => id !== 'company') ?? storeIds[0];

  const now = new Date();
  const employee = Employee.create({
    id: randomUUID(),
    storeId: homeStoreId,
    storeIds,
    fullName: input.fullName.trim(),
    role: ROLE_LABEL[input.personType],
    status: 'Active',
    personType: input.personType,
    birthday: null,
    emergencyContactName: null,
    emergencyContactNumber: null,
    startDate: null,
    probationEndDate: null,
    rateType: null,
    basicRate: 0,
    overtimeRate: 0,
    ninePmBonusRate: 0,
    commissionRate: 0,
    paidAs: null,
    defaultPaymentMethod: 'cash',
    monthlyBikeAllowance: 0,
    bikeAllowanceUsed: 0,
    bikeAllowanceAccrued: 0,
    availableBalance: 0,
    thirteenthMonthAccrued: 0,
    currentCashAdvance: 0,
    holidayAllowance: 0,
    holidayUsed: 0,
    sickAllowance: 0,
    sickUsed: 0,
    sssNo: null,
    philhealthNo: null,
    pagibigNo: null,
    tin: null,
    sssDeductionAmt: 0,
    philhealthDeductionAmt: 0,
    pagibigDeductionAmt: 0,
    createdAt: now,
    updatedAt: now,
  });
  await deps.employeeRepo.save(employee);

  try {
    const { error: linkErr } = await sb.from('employee_stores').insert(storeIds.map((sid) => ({ employee_id: employee.id, store_id: sid })));
    if (linkErr) throw new Error(`Failed to link stores: ${linkErr.message}`);

    const user = await saveUser({ configRepo: deps.configRepo }, {
      username,
      pin: input.pin,
      employeeId: employee.id,
      roleId: input.roleId,
      isActive: true,
    });
    return { user, employee };
  } catch (err) {
    await sb.from('employee_stores').delete().eq('employee_id', employee.id);
    await sb.from('employees').delete().eq('id', employee.id);
    throw err;
  }
}
