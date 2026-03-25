import { useState } from 'react';
import { Modal } from '../../components/common/Modal.js';
import { Button } from '../../components/common/Button.js';
import { Select } from '../../components/common/Select.js';
import { DatePicker } from '../../components/common/DatePicker.js';
import { useCreateTask } from '../../api/todo.js';
import { useConfigEmployees, useTaskCategories } from '../../api/config.js';
import { useFleet } from '../../api/fleet.js';

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  defaultAssignee?: string;
}

export function CreateTaskModal({ open, onClose, storeId, defaultAssignee }: CreateTaskModalProps) {
  const create = useCreateTask();
  const { data: employees = [] } = useConfigEmployees();
  const { data: categories = [] } = useTaskCategories();
  const { data: vehicles = [] } = useFleet(storeId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState(defaultAssignee ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');
  const [vehicleId, setVehicleId] = useState('');

  const reset = () => {
    setTitle('');
    setDescription('');
    setAssignedTo(defaultAssignee ?? '');
    setCategoryId('');
    setPriority('Medium');
    setDueDate('');
    setVehicleId('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        storeId,
        title: title.trim(),
        description: description.trim() || null,
        categoryId: categoryId ? Number(categoryId) : null,
        assignedTo,
        vehicleId: vehicleId || null,
        priority,
        dueDate: dueDate || null,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  };

  const storeEmployees = employees.filter(
    (e) => !e.storeId || e.storeId === storeId,
  );
  const activeCategories = categories.filter((c) => c.isActive);
  const vehicleList = Array.isArray(vehicles) ? vehicles as Array<{ id: string; name: string; plateNumber: string | null }> : [];

  return (
    <Modal open={open} onClose={onClose} title="New Task" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="What needs to be done?"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Additional details..."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Assigned To *"
            options={storeEmployees.map((e) => ({ value: e.id, label: e.fullName }))}
            placeholder="Select employee"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            required
          />

          <Select
            label="Priority"
            options={[
              { value: 'Low', label: 'Low' },
              { value: 'Medium', label: 'Medium' },
              { value: 'High', label: 'High' },
              { value: 'Urgent', label: 'Urgent' },
            ]}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Category"
            options={activeCategories.map((c) => ({ value: String(c.id), label: c.name }))}
            placeholder="None"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          />

          <DatePicker
            label="Due Date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <Select
          label="Linked Vehicle"
          options={vehicleList.map((v) => ({
            value: v.id,
            label: `${v.name}${v.plateNumber ? ` (${v.plateNumber})` : ''}`,
          }))}
          placeholder="None"
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!title.trim() || !assignedTo}>
            Create Task
          </Button>
        </div>
      </form>
    </Modal>
  );
}
