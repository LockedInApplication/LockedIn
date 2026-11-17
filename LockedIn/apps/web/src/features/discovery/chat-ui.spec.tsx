import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ConnectionStatus from './ConnectionStatus';
import MessageActions from './MessageActions';
import { connectionStatus } from './connection-status';
import type { DiscoveryConnectionView } from './discovery.types';

describe('connection state labels', () => {
  it.each([
    ['ACCEPTED', 'Open chat'], ['CLOSED', 'Connection closed'], ['DECLINED', 'Invitation ended'],
    ['WITHDRAWN', 'Invitation withdrawn'], ['EXPIRED', 'Invitation expired'], ['PROMOTED', 'Shared space opened'],
  ] as const)('distinguishes %s from other connection records', (state, label) => {
    expect(connectionStatus({ state, inviter: 'self' }).label).toBe(label);
  });
  it('distinguishes received invitations from outgoing ones', () => {
    expect(connectionStatus({ state: 'PENDING', inviter: 'partner' }).label).toBe('Invitation to review');
    expect(connectionStatus({ state: 'PENDING', inviter: 'self' }).label).toBe('Waiting for acceptance');
  });
  it.each(['CLOSED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'PROMOTED'] as const)('explains why %s cannot show chat', state => {
    const connection = { state, inviter: 'self' } as DiscoveryConnectionView;
    const html = renderToStaticMarkup(<ConnectionStatus connection={connection}/>);
    expect(html).toContain('role="status"');
    expect(html).toContain(connectionStatus(connection).label);
    expect(html).toMatch(/Messaging|messaging/);
  });
  it.each(['PENDING', 'ACCEPTED'] as const)('does not label a %s connection as ended', state => {
    expect(renderToStaticMarkup(<ConnectionStatus connection={{ state } as DiscoveryConnectionView}/>)).toBe('');
  });
});

describe('compact message actions', () => {
  it('keeps reporting inside a closed native disclosure, not a visible standalone button', () => {
    const html = renderToStaticMarkup(<MessageActions busy={false} onReport={() => {}}/>);
    expect(html).toContain('<details');
    expect(html).not.toMatch(/<details[^>]*\bopen/);
    expect(html).toContain('aria-label="Message actions"');
    expect(html).toContain('Report message');
    expect(html.indexOf('<summary')).toBeLessThan(html.indexOf('Report message'));
  });
  it('labels opening-message actions and disables the report action while busy', () => {
    const html = renderToStaticMarkup(<MessageActions opening busy onReport={() => {}}/>);
    expect(html).toContain('Opening message actions');
    expect(html).toContain('Report opening message');
    expect(html).toContain('disabled=""');
  });
});
