import React from 'react'
import { createRoot } from 'react-dom/client'

const App = () => {
  return React.createElement('div', null, 'Hello eeZee News');
};

try {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(React.createElement(App));
  } else {
    console.error('Root element not found');
  }
} catch (error) {
  console.error('Error mounting app:', error);
  document.body.innerHTML = '<div style="padding: 20px;">Error loading app: ' + error + '</div>';
}
