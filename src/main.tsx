import React from 'react'
import { createRoot } from 'react-dom/client'

const App = () => React.createElement('div', { 
  style: { padding: '20px' } 
}, React.createElement('h1', null, 'eeZee News - Testing'));

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(React.createElement(App));
}
