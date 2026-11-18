import type { DiscoveryConnectionView } from './discovery.types';
import { connectionStatus } from './connection-status';
import styles from './discovery.module.scss';

export default function ConnectionStatus({ connection, sharedSpaceEnded = false }: { connection: DiscoveryConnectionView; sharedSpaceEnded?: boolean }) {
  if (connection.state === 'PENDING' || connection.state === 'ACCEPTED') return null;
  const status = connectionStatus(connection, sharedSpaceEnded);
  return <section className={styles.card} role="status"><h2>{status.label}</h2><p>{status.description}</p></section>;
}
