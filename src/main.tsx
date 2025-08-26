// Temporarily bypassing React to test if the issue is with React DOM
const rootElement = document.getElementById('root');
if (rootElement) {
  rootElement.innerHTML = `
    <div style="padding: 20px; font-family: Arial, sans-serif;">
      <h1>eeZee News - Debugging Mode</h1>
      <p>React DOM appears to be corrupted. This is a plain HTML fallback.</p>
      <p>The error suggests a build system issue with React DOM dependencies.</p>
      <button onclick="location.reload()" style="padding: 10px; margin-top: 10px;">
        Refresh Page
      </button>
    </div>
  `;
} else {
  document.body.innerHTML = '<div>Root element not found</div>';
}
