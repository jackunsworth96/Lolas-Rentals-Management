import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Permission } from '@lolas/shared';

const mocks = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn() }));

vi.mock('../src/api/access.js', () => ({
  useUpdateRole: () => ({ mutateAsync: mocks.update, isPending: false }),
  useCreateRole: () => ({ mutateAsync: mocks.create, isPending: false }),
}));

import { useAuthStore } from '../src/stores/auth-store.js';
import { RoleEditorModal } from '../src/components/settings/access/RoleEditorModal.js';
import type { AccessRole } from '../src/api/access.js';

const role: AccessRole = {
  id: 'role-staff',
  name: 'Staff',
  description: 'Frontline staff',
  isSystem: false,
  version: 4,
  updatedAt: '2026-11-01T00:00:00Z',
  userCount: 3,
  permissions: [Permission.ViewMaintenance],
};

function signInWith(permissions: string[]) {
  useAuthStore.setState({
    user: { userId: 'u1', username: 'jack', employeeId: 'e1', roleId: 'role-admin', storeIds: [], permissions },
  } as never);
}

function levelPicker(areaLabel: string) {
  return within(screen.getByRole('radiogroup', { name: `${areaLabel} access level` }));
}

function renderEditor(onSaved = vi.fn()) {
  render(<RoleEditorModal open role={role} onClose={() => {}} onSaved={onSaved} />);
  return onSaved;
}

describe('RoleEditorModal', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
  });
  beforeEach(() => {
    mocks.update.mockReset().mockResolvedValue({});
    mocks.create.mockReset().mockResolvedValue({});
  });
  afterEach(cleanup);

  it('shows the current level and counts changes as they are made', () => {
    signInWith([Permission.ViewMaintenance, Permission.EditMaintenance, Permission.ManageAccess]);
    renderEditor();
    expect(levelPicker('Maintenance').getByRole('radio', { name: 'View' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('No changes yet')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Review changes' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(levelPicker('Maintenance').getByRole('radio', { name: 'Edit' }));
    expect(screen.getByText('+1 added')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Review changes' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('reviews the diff, then saves with the version it loaded', async () => {
    signInWith([Permission.ViewMaintenance, Permission.EditMaintenance, Permission.ManageAccess]);
    const onSaved = renderEditor();
    fireEvent.click(levelPicker('Maintenance').getByRole('radio', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));

    expect(screen.getByText('Turning on')).toBeTruthy();
    expect(screen.getByText('Log and update maintenance')).toBeTruthy();
    expect(screen.getByText(/affects/).textContent).toBe('This affects 3 people in this role.');

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 'role-staff',
      expectedVersion: 4,
      permissions: expect.arrayContaining([Permission.ViewMaintenance, Permission.EditMaintenance]),
    }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('needs a reason before saving a sensitive change', () => {
    signInWith([Permission.ViewMaintenance, Permission.ViewPayroll, Permission.ManageAccess]);
    renderEditor();
    fireEvent.click(levelPicker('Payroll').getByRole('radio', { name: 'View' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));

    const save = screen.getByRole('button', { name: 'Save changes' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Store managers/), { target: { value: 'New payroll clerk' } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
  });

  it("won't let you give out a level you don't hold", () => {
    signInWith([Permission.ViewMaintenance, Permission.ManageAccess]);
    renderEditor();
    const edit = levelPicker('Maintenance').getByRole('radio', { name: 'Edit' });
    expect((edit as HTMLButtonElement).disabled).toBe(true);
    expect(edit.getAttribute('title')).toMatch(/can't give out/);
    expect((levelPicker('Maintenance').getByRole('radio', { name: 'No access' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
