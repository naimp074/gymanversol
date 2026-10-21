import { useState } from 'react';
import { useApp, useUi } from '../context.js';
import { Badge, Empty, Icon } from '../ui.jsx';
import { MemberCell, useActions } from '../actions.jsx';
import { isBirthday } from './shared.jsx';
import { messageFor, messageTemplates, openWhatsApp } from '../messages.js';

export default function Communications() {
  const { data, toast } = useApp();
  const actions = useActions();
  const [type, setType] = useUi('communicationType');
  const [memberId, setMemberId] = useState(data.members[0]?.id || '');
  const member = data.members.find(m => m.id === memberId);
  const [message, setMessage] = useState(member ? messageFor(member, type, data.settings.gym_name) : '');
  const birthdays = data.members.filter(m => isBirthday(m, data.today));

  function update(nextMember, nextType) {
    const m = data.members.find(x => x.id === nextMember);
    if (m) setMessage(messageFor(m, nextType, data.settings.gym_name));
  }
  function submit(e) {
    e.preventDefault();
    try {
      if (!member) throw new Error('Elegí un socio.');
      openWhatsApp(member.whatsapp || member.phone, message);
    } catch (error) { toast(error.message, 'error'); }
  }

  return <>
    <div className="message-banner"><span className="soft-icon mint"><Icon name="message" size={28} /></span><div><h2>Una comunidad también se entrena cerca.</h2><p>Elegí un mensaje, revisalo y abrilo en WhatsApp para enviarlo.</p></div><Badge tone="green">Envío manual</Badge></div>
    <div className="grid-2">
      <section className="card">
        <div className="card-head"><div><h2>Preparar un mensaje</h2><p className="muted">Los mensajes se abren como borradores.</p></div></div>
        <form className="padded-form" onSubmit={submit}>
          <label className="field"><span>Socio</span><select value={memberId} onChange={e => { setMemberId(e.target.value); update(e.target.value, type); }}>{data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label className="field"><span>Tipo de mensaje</span><select value={type} onChange={e => { setType(e.target.value); update(memberId, e.target.value); }}>{Object.entries(messageTemplates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Mensaje</span><textarea rows={7} value={message} onChange={e => setMessage(e.target.value)} /></label>
          <button className="btn btn-primary" type="submit"><Icon name="message" size={18} />Abrir en WhatsApp</button>
          <p className="muted small">WhatsApp requiere Internet. El envío lo confirmás vos.</p>
        </form>
      </section>
      <section className="card">
        <div className="card-head"><div><h2>Cumpleaños de hoy</h2><p className="muted">Un saludo que suma</p></div><span className="soft-icon peach"><Icon name="gift" size={24} /></span></div>
        {birthdays.length ? birthdays.map(m => <div key={m.id} className="due-row"><MemberCell member={m} /><button type="button" className="btn btn-sm btn-secondary" onClick={() => actions.whatsapp(m.id, 'cumpleanos')}>Saludar <Icon name="arrow" size={15} /></button></div>) : <Empty message="Hoy no hay cumpleaños. Los próximos saludos aparecerán acá." />}
        <div className="info-box"><Icon name="message" /><p>Las campañas y los envíos automáticos requieren una integración con WhatsApp Business. Los recordatorios individuales ya están disponibles.</p></div>
      </section>
    </div>
  </>;
}
