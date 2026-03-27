import type { Employee } from '../entities/employee.js';

export interface EmployeeRepository {
  findById(id: string): Promise<Employee | null>;
  findAll(): Promise<Employee[]>;
  findByStore(storeId: string): Promise<Employee[]>;
  findActive(storeId: string): Promise<Employee[]>;
  save(employee: Employee): Promise<void>;
}
