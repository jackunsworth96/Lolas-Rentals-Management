import { type ConfigRepository, type AppUser } from '@lolas/domain';
import { hashPin } from '../../adapters/auth/password.js';
import { randomUUID } from 'node:crypto';

export interface SaveUserInput {
  id?: string;
  username: string;
  pin?: string;
  employeeId: string;
  roleId: string;
  isActive: boolean;
}

export interface SaveUserDeps {
  configRepo: ConfigRepository;
}

export async function saveUser(deps: SaveUserDeps, input: SaveUserInput): Promise<AppUser> {
  const { configRepo } = deps;

  let pinHash: string | undefined;
  if (input.pin) {
    pinHash = await hashPin(input.pin);
  }

  const user: AppUser = {
    id: input.id || randomUUID(),
    username: input.username,
    employeeId: input.employeeId,
    roleId: input.roleId,
    isActive: input.isActive,
    ...(pinHash ? { pinHash } : {}),
  };

  await configRepo.saveUser(user);
  return user;
}
