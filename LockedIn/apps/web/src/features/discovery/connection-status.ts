import type { DiscoveryConnectionView } from './discovery.types';

export function connectionStatus(connection: Pick<DiscoveryConnectionView, 'state' | 'inviter'>) {
  switch (connection.state) {
    case 'PENDING': return { label: connection.inviter === 'partner' ? 'Invitation to review' : 'Waiting for acceptance', description: 'Messaging opens once this invitation is accepted.' };
    case 'ACCEPTED': return { label: 'Open chat', description: 'You can message each other in this connection.' };
    case 'CLOSED': return { label: 'Connection closed', description: 'This connection is closed. Messaging is no longer available.' };
    case 'DECLINED': return { label: 'Invitation ended', description: 'This invitation did not become a connection. Messaging is unavailable.' };
    case 'WITHDRAWN': return { label: 'Invitation withdrawn', description: 'This invitation was withdrawn. Messaging is unavailable.' };
    case 'EXPIRED': return { label: 'Invitation expired', description: 'This invitation expired before it was accepted. Messaging is unavailable.' };
    case 'PROMOTED': return { label: 'Shared space opened', description: 'You both chose to build together. Continue in your shared space; messaging here has ended.' };
  }
}
