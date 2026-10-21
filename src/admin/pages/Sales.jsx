import { useState } from 'react';
import { useApp, useUi, permissions, methods } from '../context.js';
import { Badge, Button, Empty, Field, Heading, Icon, Modal, Table } from '../ui.jsx';
import { exportCsv } from '../exports.js';
import { productMatches } from './Products.jsx';
import { activeCash } from './Cash.jsx';
import { rpc } from '../../lib/supabase.js';
import { money, fullDate } from '../../lib/format.js';

function VoidSale({ id }) {
  const { toast } = useApp();
  return <Modal title="Anular venta" onSubmit={async fd => { await rpc('void_sale', { p_id: id, p_reason: fd.get('reason') }); toast('Venta anulada y stock restituido.'); }}>
    <div className="notice">Se devolverán los productos al stock y se registrará la devolución en caja. La venta original permanecerá en el historial.</div>
    <Field label="Motivo de la anulación" name="reason" required minLength={3} maxLength={250} />
  </Modal>;
}

export default function Sales() {
  const app = useApp();
  const { data, user, toast, refresh, navigate, openModal } = app;
  const can = permissions(user.role);
  const [cart, setCart] = useUi('cart');
  const [search, setSearch] = useUi('saleSearch');
  const [method, setMethod] = useUi('saleMethod');
  const [busy, setBusy] = useState(false);
  if (!can.finance) return <Empty message="Tu perfil no tiene acceso a esta sección." />;
  const session = activeCash(data);
  const products = data.products.filter(p => p.active !== false && productMatches(p, search));
  const items = Object.entries(cart).map(([id, quantity]) => ({ product: data.products.find(p => p.id === id), quantity })).filter(item => item.product && item.quantity > 0);
  const sum = items.reduce((s, item) => s + item.quantity * item.product.price, 0);

  function add(id) {
    const p = data.products.find(item => item.id === id);
    if (!p || p.active === false || Number(p.stock) <= Number(cart[id] || 0)) { toast('No queda más stock disponible de este producto.', 'error'); return; }
    setCart({ ...cart, [id]: (cart[id] || 0) + 1 });
  }
  function minus(id) {
    const next = { ...cart };
    if ((next[id] || 0) <= 1) delete next[id]; else next[id]--;
    setCart(next);
  }
  async function checkout() {
    if (!items.length) return;
    setBusy(true);
    try {
      await rpc('register_sale', { p_items: items.map(({ product, quantity }) => ({ product_id: product.id, quantity })), p_method: method });
      setCart({});
      toast('Venta registrada. El stock y la caja están actualizados.');
      await refresh();
    } catch (error) { toast(error.message, 'error'); }
    setBusy(false);
  }

  return <>
    <Heading title="Punto de venta" sub="Sumá productos al carrito y registrá el cobro." actions={<Badge tone={session ? 'green' : 'amber'}>{session ? 'Caja abierta' : 'Caja cerrada'}</Badge>} />
    <div className="pos-layout">
      <section className="card">
        <div className="toolbar"><h3 className="card-title">Productos</h3><label className="search-field"><Icon name="search" size={18} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar para vender" /></label></div>
        <div className="pos-grid">{products.length ? products.map((p, i) => <button key={p.id} type="button" className="product-tile" disabled={Number(p.stock) <= Number(cart[p.id] || 0)} onClick={() => add(p.id)}>
          <span className={`product-art product-art-${i % 4}`}><Icon name={/bebida|agua/i.test(p.category + p.name) ? 'droplet' : /ropa/i.test(p.category) ? 'shirt' : 'package'} size={34} /></span>
          <small className="muted">{p.category || 'Producto'}</small><strong>{p.name}</strong>
          <div className="product-tile-footer"><b>{money(p.price)}</b><span className="muted">{p.stock} un.</span></div>
        </button>) : <Empty message="No hay productos disponibles." />}</div>
      </section>
      <aside className="card cart-card">
        <div className="card-head"><h3 className="card-title">Venta actual</h3><Badge>{items.reduce((s, i) => s + i.quantity, 0)} productos</Badge></div>
        <div className="cart-items">{items.length ? items.map(({ product: p, quantity }) => <div key={p.id} className="cart-line">
          <div><strong>{p.name}</strong><small className="muted">{money(p.price)} por unidad</small></div>
          <div className="cart-quantity"><Button className="btn-secondary btn-sm" onClick={() => minus(p.id)}>−</Button><span>{quantity}</span><Button className="btn-secondary btn-sm" onClick={() => add(p.id)}>+</Button></div>
          <strong>{money(p.price * quantity)}</strong>
        </div>) : <Empty message="Seleccioná productos para comenzar una venta." />}</div>
        <div className="cart-total"><span>Total</span><strong>{money(sum)}</strong></div>
        <label className="field"><span>Medio de pago</span><select value={method} onChange={e => setMethod(e.target.value)}>{methods.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <button type="button" className="btn btn-primary full-width" disabled={!items.length || !session || busy} onClick={checkout}><Icon name="check" size={18} /> Cobrar {money(sum)}</button>
        {items.length > 0 && <Button className="btn-secondary full-width" onClick={() => setCart({})}>Vaciar carrito</Button>}
        {!session && <><p className="muted">Abrí la caja para cobrar esta venta.</p><Button className="btn-secondary full-width" onClick={() => navigate('caja')}>Ir a caja</Button></>}
      </aside>
    </div>
    <div className="card"><div className="card-head"><h3 className="card-title">Últimas ventas</h3><Button className="btn-secondary btn-sm" icon="download" onClick={() => exportCsv(app, 'sales')}>Exportar CSV</Button></div>
      <Table headers={['Fecha', 'Productos', 'Medio', 'Total', 'Estado', '']} empty="Las ventas cobradas aparecerán acá." rows={data.sales.slice(0, 40).map(s => <tr key={s.id}>
        <td>{fullDate(s.date)}</td><td>{(s.items || []).map(i => `${i.quantity} × ${i.name || 'Producto'}`).join(', ')}</td><td>{s.method}</td><td className="amount">{money(s.total)}</td>
        <td><Badge tone={s.voided ? 'red' : 'green'}>{s.voided ? 'Anulada' : 'Cobrada'}</Badge></td>
        <td>{can.admin && !s.voided && <Button className="btn-danger btn-sm" onClick={() => openModal(<VoidSale id={s.id} />)}>Anular</Button>}</td>
      </tr>)} /></div>
  </>;
}
