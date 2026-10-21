import { useApp, useUi, permissions } from '../context.js';
import { Badge, Button, Check, Empty, Field, Heading, Icon, Modal, Stat, Table } from '../ui.jsx';
import { exportCsv } from '../exports.js';
import { rpc } from '../../lib/supabase.js';
import { money } from '../../lib/format.js';

export const productMatches = (p, search) => `${p.name} ${p.category || ''}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'));

function ProductModal({ product: p }) {
  const { toast } = useApp();
  async function save(fd) {
    const values = Object.fromEntries(fd);
    values.active = fd.has('active');
    await rpc('save_product', { p_id: p?.id || null, p: values });
    toast('Producto guardado.');
  }
  return <Modal title={p ? 'Editar producto' : 'Nuevo producto'} wide onSubmit={save}>
    <div className="form-grid">
      <Field label="Nombre" name="name" defaultValue={p?.name} required maxLength={120} />
      <Field label="Categoría" name="category" defaultValue={p?.category} maxLength={80} />
      <Field label="Precio de venta (ARS)" name="price" type="number" defaultValue={p?.price} required min="0" step="1" />
      <Field label="Costo (ARS)" name="cost" type="number" defaultValue={p?.cost ?? 0} required min="0" step="1" />
      <Field label="Unidades en stock" name="stock" type="number" defaultValue={p?.stock ?? 0} required min="0" step="1" />
      <Field label="Stock mínimo" name="min_stock" type="number" defaultValue={p?.min_stock ?? 3} required min="0" step="1" />
      <Check label="Disponible para la venta" name="active" defaultChecked={p?.active !== false} />
      {p && <p className="muted full">Los ajustes de stock quedan registrados en la auditoría.</p>}
    </div>
  </Modal>;
}

export default function Products() {
  const app = useApp();
  const { data, user, openModal, navigate, ui } = app;
  const can = permissions(user.role);
  const [search, setSearch] = useUi('productSearch');
  if (!can.finance) return <Empty message="Tu perfil no tiene acceso a esta sección." />;
  const products = data.products;
  const active = products.filter(p => p.active !== false);
  const visible = products.filter(p => productMatches(p, search));
  const low = active.filter(p => Number(p.stock) <= Number(p.min_stock));
  const sell = p => {
    if (p.active === false || Number(p.stock) <= Number(ui.cart[p.id] || 0)) { app.toast('No queda más stock disponible de este producto.', 'error'); return; }
    ui.cart = { ...ui.cart, [p.id]: (ui.cart[p.id] || 0) + 1 };
    navigate('ventas');
  };
  return <>
    <Heading title="Tu tienda, bajo control" sub="Productos, precios y existencias del gimnasio." actions={can.stock && <Button className="btn-primary" icon="plus" onClick={() => openModal(<ProductModal />)}>Nuevo producto</Button>} />
    <div className="stats-grid">
      <Stat title="Productos activos" value={active.length} note="En el catálogo" icon="package" />
      <Stat title="Stock bajo" value={low.length} note="En mínimo o sin existencias" icon="alert-triangle" />
      <Stat title="Unidades disponibles" value={active.reduce((s, p) => s + Number(p.stock), 0)} note="Stock actual" icon="boxes" />
      {can.stock && <Stat title="Valor del stock" value={money(active.reduce((s, p) => s + Number(p.stock) * Number(p.cost || 0), 0))} note="Calculado al costo" icon="wallet" />}
    </div>
    <div className="card">
      <div className="toolbar"><label className="search-field"><Icon name="search" size={18} /><input type="search" placeholder="Buscar producto o categoría…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar productos" /></label>
        <Button className="btn-secondary btn-sm" icon="download" onClick={() => exportCsv(app, 'products')}>Exportar CSV</Button></div>
      <Table headers={['Producto', 'Precio', ...(can.stock ? ['Costo'] : []), 'Stock', 'Estado', '']} empty={search ? 'No encontramos productos con esa búsqueda.' : 'Agregá productos para comenzar a vender.'} rows={visible.map(p => <tr key={p.id}>
        <td><strong>{p.name}</strong><small className="muted">{p.category || 'General'}</small></td>
        <td className="amount">{money(p.price)}</td>
        {can.stock && <td>{money(p.cost)}</td>}
        <td><strong>{p.stock}</strong><small className="muted">Mínimo: {p.min_stock || 0}</small></td>
        <td>{p.active === false ? <Badge>Inactivo</Badge> : Number(p.stock) === 0 ? <Badge tone="red">Sin stock</Badge> : Number(p.stock) <= Number(p.min_stock) ? <Badge tone="amber">Stock bajo</Badge> : <Badge tone="green">Disponible</Badge>}</td>
        <td>{can.stock ? <Button className="btn-secondary btn-sm" icon="edit" onClick={() => openModal(<ProductModal product={p} />)}>Editar</Button> : <Button className="btn-secondary btn-sm" icon="shopping-cart" onClick={() => sell(p)}>Vender</Button>}</td>
      </tr>)} />
    </div>
  </>;
}
