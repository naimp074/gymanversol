import { useApp } from './context.js';
import { Avatar, Confirm } from './ui.jsx';
import { MemberDetail, MemberForm, PaymentForm, WhatsappDraft, Credential } from './modals/members.jsx';

// Acciones que se abren desde varias pantallas.
export function useActions() {
  const { openModal } = useApp();
  return {
    memberDetail: id => openModal(<MemberDetail id={id} />),
    memberForm: id => openModal(<MemberForm id={id} />),
    payment: id => openModal(<PaymentForm id={id} />),
    whatsapp: (id, type = 'recordatorio') => openModal(<WhatsappDraft id={id} type={type} />),
    credential: id => openModal(<Credential id={id} />),
    confirm: (title, message, onConfirm, submitLabel) => openModal(<Confirm title={title} message={message} onConfirm={onConfirm} submitLabel={submitLabel} />)
  };
}

export function MemberCell({ member: m }) {
  const { memberDetail } = useActions();
  return <button type="button" className="member-cell" onClick={() => m.id && memberDetail(m.id)}>
    <Avatar person={m} /><span><strong>{m.name}</strong><small>Socio #{m.number}</small></span>
  </button>;
}
