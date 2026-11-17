import type { DiscoveryConnectionView } from './discovery.types';
import { connectionStatus } from './connection-status';
import styles from './discovery.module.scss';

export default function ConnectionStatus({ connection }: { connection: DiscoveryConnectionView }) {
  if (connection.state === 'PENDING' || connection.state === 'ACCEPTED') return null;
  const status = connectionStatus(connection);
  return <section className={styles.card} role="status"><h2>{status.label}</h2><p>{status.description}</p></section>;
}
