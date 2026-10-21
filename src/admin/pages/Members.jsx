import { useApp, useUi, permissions } from '../context.js';
import { Empty, Icon, StatusBadge } from '../ui.jsx';
import { MemberCell, useActions } from '../actions.jsx';
import { exportCsv } from '../exports.js';
import { date, normalize } from '../../lib/format.js';

const pageSize = 10;

export default function Members() {
  const app = useApp();
  const { data, user } = app;
  const { memberDetail } = useActions();
  const [search, setSearch] = useUi('memberSearch');
  const [filter, setFilter] = useUi('memberFilter');
  const [page, setPage] = useUi('memberPage');
  const query = normalize(search);
  const members = data.members.filter(m => (filter === 'todos' || m.status === filter) && [m.name, m.dni, m.phone, m.whatsapp, m.email, m.number].some(v => normalize(v).includes(query)));
  const pages = Math.max(1, Math.ceil(members.length / pageSize));
  const current = Math.min(page, pages - 1);
  const pills = [['activo', 'Activos'], ['vencido', 'Vencidos'], ['suspendido', 'Suspendidos'], ['baja', 'Bajas']];

  return <>
    <div className="member-summary">
      <button type="button" className={`summary-pill ${filter === 'todos' ? 'selected' : ''}`} onClick={() => { setFilter('todos'); setPage(0); }}>Todos los socios <b>{data.members.length}</b></button>
      {pills.map(([v, t]) => <button key={v} type="button" className={`summary-pill ${filter === v ? 'selected' : ''}`} onClick={() => { setFilter(v); setPage(0); }}>{t}<b>{data.members.filter(m => m.status === v).length}</b></button>)}
    </div>
    <section className="card">
      <div className="toolbar">
        <div className="search-field"><Icon name="search" size={18} /><input placeholder="Buscar por nombre, DNI, teléfono o número…" aria-label="Buscar socios" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></div>
        <div className="toolbar-actions">{permissions(user.role).finance && <button type="button" className="btn btn-secondary" onClick={() => exportCsv(app, 'members')}><Icon name="download" size={17} />Exportar CSV</button>}</div>
      </div>
      {members.length ? <>
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Socio</th><th>DNI</th><th>Plan</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
          <tbody>{members.slice(current * pageSize, (current + 1) * pageSize).map(m => <tr key={m.id}>
            <td><MemberCell member={m} /></td><td className="muted mono">{m.dni}</td><td>{m.plan_name || 'Sin plan'}</td><td>{date(m.expires_at)}</td><td><StatusBadge member={m} /></td>
            <td><button type="button" className="icon-btn" aria-label={`Ver ficha de ${m.name}`} onClick={() => memberDetail(m.id)}><Icon name="chevron" size={18} /></button></td>
          </tr>)}</tbody>
        </table></div>
        <div className="pagination"><span>{current * pageSize + 1}–{Math.min((current + 1) * pageSize, members.length)} de {members.length} socios</span><div>
          <button type="button" className="btn btn-sm btn-secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</button>
          <span>{current + 1} / {pages}</span>
          <button type="button" className="btn btn-sm btn-secondary" disabled={(current + 1) * pageSize >= members.length} onClick={() => setPage(current + 1)}>Siguiente</button>
        </div></div>
      </> : <Empty message="No encontramos socios con esa búsqueda." />}
    </section>
  </>;
}
