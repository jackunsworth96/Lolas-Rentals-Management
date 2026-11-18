import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CounterWhen, upcomingSlots } from '../src/pages/counter/CounterWhen.js';

afterEach(cleanup);

describe('partner tablet start screen', () => {
  const slot = upcomingSlots()[0]!.slots[0]!;

  it('asks which area the guest is staying in when the property area is unknown', () => {
    const onArea = vi.fn();
    const { rerender } = render(
      <CounterWhen value={slot} onChange={vi.fn()} deliverTo="Harana" areas={[{ id: 2, name: 'General Luna', fee: 100 }]} areaId={null} onArea={onArea} onContinue={vi.fn()} buttonClass="" />,
    );
    expect(screen.getByText('Which area are you staying in?')).toBeTruthy();
    expect((screen.getByText('Continue') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText('General Luna'));
    expect(onArea).toHaveBeenCalledWith(2);

    rerender(
      <CounterWhen value={slot} onChange={vi.fn()} deliverTo="Harana" areas={[{ id: 2, name: 'General Luna', fee: 100 }]} areaId={2} onArea={onArea} onContinue={vi.fn()} buttonClass="" />,
    );
    expect((screen.getByText('Continue') as HTMLButtonElement).disabled).toBe(false);
  });

  it('just says where we deliver when the property area is set', () => {
    render(<CounterWhen value={slot} onChange={vi.fn()} deliverTo="Harana" onContinue={vi.fn()} buttonClass="" />);
    expect(screen.queryByText('Which area are you staying in?')).toBeNull();
    expect(screen.getByText('Harana')).toBeTruthy();
  });
});
