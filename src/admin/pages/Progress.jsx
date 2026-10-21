import { useEffect, useState } from 'react';
import { useApp, useUi, permissions } from '../context.js';
import { Button, Check, Empty, Field, Heading, Modal, SelectField, Stat, Table, TextArea } from '../ui.jsx';
import { memberOptions } from './Routines.jsx';
import { memberName } from './Classes.jsx';
import { rpc } from '../../lib/supabase.js';
import { date } from '../../lib/format.js';
import { imageDataUrl } from '../../lib/image.js';

const fields = [['Peso (kg)', 'weight'], ['Altura (cm)', 'height'], ['Cintura (cm)', 'waist'], ['Brazo (cm)', 'arm'], ['Pecho (cm)', 'chest'], ['Pierna (cm)', 'leg'], ['Grasa corporal (%)', 'body_fat']];

function WeightChart({ measures }) {
  const points = measures.filter(m => Number(m.weight) > 0).slice(-12);
  if (points.length < 2) return <Empty message="Registrá al menos dos mediciones de peso para ver la evolución." />;
  const values = points.map(m => Number(m.weight));
  const min = Math.floor(Math.min(...values) - 2);
  const max = Math.ceil(Math.max(...values) + 2);
  const W = 650, H = 210, padX = 40, padY = 24;
  const x = i => padX + i * (W - 2 * padX) / Math.max(1, points.length - 1);
  const y = value => H - padY - (value - min) / (max - min) * (H - 2 * padY);
  const coords = points.map((m, i) => `${x(i)},${y(m.weight)}`).join(' ');
  return <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución de peso en kilogramos">
    <defs><linearGradient id="weight-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#ec7958" stopOpacity="0.2" /><stop offset="100%" stopColor="#ec7958" stopOpacity="0" /></linearGradient></defs>
    {[min, (min + max) / 2, max].map(v => <g key={v}><line x1={padX} x2={W - padX} y1={y(v)} y2={y(v)} stroke="#ebeae7" /><text x="0" y={y(v) + 4} fontSize="11" fill="#849094">{v.toFixed(0)} kg</text></g>)}
    <polygon points={`${padX},${H - padY} ${coords} ${W - padX},${H - padY}`} fill="url(#weight-fill)" />
    <polyline points={coords} fill="none" stroke="#ec7958" strokeWidth="3" strokeLinejoin="round" />
    {points.map((m, i) => <g key={m.id}><circle cx={x(i)} cy={y(m.weight)} r="4" fill="#ec7958"><title>{`${date(m.date)}: ${m.weight} kg`}</title></circle><text x={x(i)} y={H - 3} textAnchor="middle" fontSize="10" fill="#849094">{date(m.date).slice(0, 5)}</text></g>)}
  </svg>;
}

function MeasurementModal({ measurement: m, memberId }) {
  const { data, ui, toast } = useApp();
  async function save(fd, form) {
    const values = Object.fromEntries([...fd].filter(([key]) => !['photo_upload', 'remove_photo'].includes(key)));
    for (const [, key] of fields) values[key] = fd.get(key) === '' ? null : Number(fd.get(key));
    const file = form.querySelector('[name="photo_upload"]')?.files[0];
    if (file) values.photo = await imageDataUrl(file);
    else if (fd.has('remove_photo')) values.photo = '';
    if (!fields.some(([, key]) => values[key]) && !file && !m?.has_photo) throw new Error('Ingresá al menos una medida o una foto.');
    await rpc('save_measurement', { p_id: m?.id || null, p: values });
    ui.progressMember = values.member_id;
    toast('Medición guardada.');
  }
  return <Modal title={m ? 'Editar medición' : 'Registrar medición'} wide onSubmit={save}>
    <div className="form-grid">
      <SelectField label="Socio" name="member_id" defaultValue={m?.member_id || memberId || ui.progressMember} options={memberOptions(data)} />
      <Field label="Fecha de medición" name="date" type="date" defaultValue={m?.date || data.today} required />
      {fields.map(([label, key]) => <Field key={key} label={label} name={key} type="number" defaultValue={m?.[key] ?? ''} min="0.1" step="0.1" max={key === 'body_fat' ? 100 : 600} />)}
      <label className="field"><span>Foto de progreso · cámara o galería</span><input name="photo_upload" type="file" accept="image/*" capture="environment" /></label>
      {m?.has_photo && <Check label="Quitar la foto actual" name="remove_photo" />}
      <TextArea label="Observaciones" name="notes" className="full" defaultValue={m?.notes} />
    </div>
  </Modal>;
}

function MeasurementView({ measurement: m }) {
  const { data } = useApp();
  const [photo, setPhoto] = useState('');
  useEffect(() => { if (m.has_photo) rpc('measurement_photo', { p_id: m.id }).then(value => setPhoto(value || '')).catch(() => {}); }, [m.id]);
  return <Modal title={`Progreso · ${memberName(data, m.member_id)}`} wide>
    <p className="muted">Medición del {date(m.date)}</p>
    <div className="detail-grid">{[['Peso', 'weight', 'kg'], ['Altura', 'height', 'cm'], ['Cintura', 'waist', 'cm'], ['Brazo', 'arm', 'cm'], ['Pecho', 'chest', 'cm'], ['Pierna', 'leg', 'cm'], ['Grasa corporal', 'body_fat', '%']].map(([label, key, unit]) => <div key={key}><span className="muted">{label}</span><strong>{m[key] ? `${m[key]} ${unit}` : '—'}</strong></div>)}</div>
    {photo && <img className="progress-photo" src={photo} alt={`Foto de progreso de ${memberName(data, m.member_id)}`} />}
    {m.has_photo && !photo && <p className="muted">Cargando foto…</p>}
    {m.notes && <p>{m.notes}</p>}
  </Modal>;
}

export default function Progress() {
  const { data, user, openModal, toast } = useApp();
  const trainer = permissions(user).trainer;
  const members = memberOptions(data);
  const [selected, setSelected] = useUi('progressMember');
  const memberId = members.some(m => m.value === selected) ? selected : members[0]?.value || '';
  const measures = data.measurements.filter(m => m.member_id === memberId).sort((a, b) => a.date.localeCompare(b.date));
  const last = measures.at(-1);
  const first = measures.find(m => Number(m.weight) > 0);
  const latestWeight = [...measures].reverse().find(m => Number(m.weight) > 0);
  const bmi = last?.weight && last?.height ? (Number(last.weight) / (Number(last.height) / 100) ** 2).toFixed(1) : null;
  const difference = latestWeight && first ? (Number(latestWeight.weight) - Number(first.weight)).toFixed(1) : null;
  const create = () => members.length ? openModal(<MeasurementModal memberId={memberId} />) : toast('Registrá un socio antes de cargar medidas.', 'error');

  return <>
    <Heading title="Cada avance cuenta" sub="Medidas, fotos y evolución de tus socios." actions={trainer && <Button className="btn-primary" icon="plus" onClick={create}>Registrar medición</Button>} />
    <div className="toolbar"><div className="progress-member-filter"><SelectField label="Ver progreso de" name="progress_member" value={memberId} onChange={e => setSelected(e.target.value)} options={members} /></div>{last && <span className="muted">Última medición: {date(last.date)}</span>}</div>
    <div className="stats-grid">
      <Stat title="Peso actual" value={latestWeight ? <>{latestWeight.weight} <small>kg</small></> : '—'} note={latestWeight ? `Medido el ${date(latestWeight.date)}` : 'Sin mediciones'} icon="activity" />
      <Stat title="Cambio registrado" value={difference !== null ? <>{Number(difference) > 0 ? '+' : ''}{difference} <small>kg</small></> : '—'} note="Desde la primera medición de peso" icon="trending-up" />
      <Stat title="Altura" value={last?.height ? <>{last.height} <small>cm</small></> : '—'} note="Última medición" icon="ruler" />
      <Stat title="IMC" value={bmi || '—'} note="Peso / altura² · indicador de referencia" icon="heart" />
    </div>
    <div className="card"><div className="card-head"><h3 className="card-title">Evolución del peso</h3><span className="muted">Últimas 12 mediciones</span></div><WeightChart measures={measures} /></div>
    <div className="card"><div className="card-head"><h3 className="card-title">Historial de medidas</h3></div>
      <Table headers={['Fecha', 'Peso', 'Cintura', 'Brazo', 'Pecho', 'Pierna', 'Grasa', '']} empty="Este socio todavía no tiene mediciones registradas." rows={[...measures].reverse().map(m => <tr key={m.id}>
        <td>{date(m.date)}</td><td>{m.weight ? `${m.weight} kg` : '—'}</td><td>{m.waist ? `${m.waist} cm` : '—'}</td><td>{m.arm ? `${m.arm} cm` : '—'}</td><td>{m.chest ? `${m.chest} cm` : '—'}</td><td>{m.leg ? `${m.leg} cm` : '—'}</td><td>{m.body_fat ? `${m.body_fat}%` : '—'}</td>
        <td><Button className="btn-secondary btn-sm" onClick={() => openModal(<MeasurementView measurement={m} />)}>Ver</Button>{trainer && <Button className="btn-secondary btn-sm" onClick={() => openModal(<MeasurementModal measurement={m} />)}>Editar</Button>}</td>
      </tr>)} /></div>
  </>;
}
