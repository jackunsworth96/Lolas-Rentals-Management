import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLoloChatWidget } from '../src/hooks/useLoloChatWidget.js';

function Probe() {
  useLoloChatWidget();
  return null;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
    </MemoryRouter>,
  );

const widgetScript = () => document.getElementById('lolodesk-web-chat-script');
const hideStyle = () => document.getElementById('lolodesk-web-chat-hidden');

afterEach(() => {
  cleanup();
  widgetScript()?.remove();
  hideStyle()?.remove();
});

describe('Lolo chat widget', () => {
  it.each(['/dashboard', '/orders/inbox', '/partner/dashboard'])('is not loaded on %s', (path) => {
    renderAt(path);
    expect(widgetScript()).toBeNull();
    expect(hideStyle()).not.toBeNull();
  });

  it.each(['/', '/book', '/book/reserve'])('loads on the customer page %s', (path) => {
    renderAt(path);
    expect(widgetScript()?.getAttribute('src')).toContain('lolodesk.lolasrentals.com/widget/web-chat.js');
    expect(hideStyle()).toBeNull();
  });
});
