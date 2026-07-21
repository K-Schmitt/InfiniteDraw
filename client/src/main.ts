import './ui/toolbar.css';
import { PixiApp } from './app/PixiApp';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app element');

const app = new PixiApp();
app.init(container).catch(console.error);
