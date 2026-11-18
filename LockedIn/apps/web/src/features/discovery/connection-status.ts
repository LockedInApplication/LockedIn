import type { DiscoveryConnectionView } from './discovery.types';

export function connectionStatus(connection: Pick<DiscoveryConnectionView, 'state' | 'inviter' | 'lockedIn' | 'canChat'>) {
  switch (connection.state) {
    case 'PENDING': return { label: connection.inviter === 'partner' ? 'Invitation to review' : 'Waiting for acceptance', description: 'Messaging opens once this invitation is accepted.' };
    case 'ACCEPTED': return { label: 'Open chat', description: 'You can message each other in this connection.' };
    case 'CLOSED': return { label: 'Connection closed', description: 'This connection is closed. Messaging is no longer available.' };
    case 'DECLINED': return { label: 'Invitation ended', description: 'This invitation did not become a connection. Messaging is unavailable.' };
    case 'WITHDRAWN': return { label: 'Invitation withdrawn', description: 'This invitation was withdrawn. Messaging is unavailable.' };
    case 'EXPIRED': return { label: 'Invitation expired', description: 'This invitation expired before it was accepted. Messaging is unavailable.' };
    case 'PROMOTED': return connection.lockedIn && connection.canChat
      ? { label: 'Locked in', description: 'You both chose to lock in. Discovery is paused; your existing chats remain available.' }
      : { label: 'Shared space opened', description: 'Continue in your shared space. Messaging here is unavailable.' };
  }
}
