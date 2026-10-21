import { createRoot } from 'react-dom/client';
import '../styles/styles.css';
import '../styles/charts.css';
import AdminApp from './AdminApp.jsx';

createRoot(document.getElementById('app')).render(<AdminApp />);
