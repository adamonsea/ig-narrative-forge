import React from 'react'
import ReactDOM from 'react-dom'

const App = () => React.createElement('div', { 
  style: { padding: '20px' } 
}, React.createElement('h1', null, 'eeZee News - Testing Legacy Render'));

const container = document.getElementById('root');
ReactDOM.render(React.createElement(App), container);
