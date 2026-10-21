import { useApp, useUi, permissions } from '../context.js';
import { Badge, Empty, Heading, Icon, Table } from '../ui.jsx';
import { fullDate } from '../../lib/format.js';

export default function Audit() {
  const { data, user } = useApp();
  const [search, setSearch] = useUi('auditSearch');
  if (!permissions(user).audit) return <Empty message="Tu perfil no tiene acceso a esta sección." />;
  const query = search.toLocaleLowerCase('es');
  const logs = data.audit.filter(a => `${a.user_name} ${a.action} ${a.detail}`.toLocaleLowerCase('es').includes(query));
  return <>
    <Heading title="Cada cambio deja una huella" sub="Registro de operaciones del sistema y de las personas que las realizaron." />
    <div className="card">
      <div className="toolbar"><label className="search-field"><Icon name="search" size={18} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por usuario, acción o detalle…" aria-label="Buscar en auditoría" /></label><span className="muted">{logs.length} registros</span></div>
      <Table headers={['Fecha y hora', 'Usuario', 'Acción', 'Detalle']} empty={search ? 'No hay eventos que coincidan con esa búsqueda.' : 'Las operaciones quedarán registradas automáticamente.'} rows={logs.map(a => <tr key={a.id}>
        <td className="nowrap">{fullDate(a.date)}</td><td><strong>{a.user_name || 'Sistema'}</strong></td><td><Badge>{a.action}</Badge></td><td className="audit-detail">{a.detail}</td>
      </tr>)} />
    </div>
  </>;
}
