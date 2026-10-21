import { createRoot } from 'react-dom/client';
import '../styles/site.css';
import '../styles/portal.css';
import PortalApp from './PortalApp.jsx';

createRoot(document.getElementById('portal')).render(<PortalApp />);
