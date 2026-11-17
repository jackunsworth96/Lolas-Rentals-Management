import type { Employee } from '../entities/employee.js';

export interface EmployeeListOptions {
  /** Include owners and developers. Off by default so staff features never see them. */
  includeNonStaff?: boolean;
}

export interface EmployeeRepository {
  findById(id: string): Promise<Employee | null>;
  findAll(options?: EmployeeListOptions): Promise<Employee[]>;
  findByStore(storeId: string, options?: EmployeeListOptions): Promise<Employee[]>;
  findActive(storeId: string): Promise<Employee[]>;
  save(employee: Employee): Promise<void>;
}
