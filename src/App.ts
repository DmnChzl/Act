import { createSignal, html } from './core';
import './App.css';

export default function App() {
  const [count, setCount] = createSignal(0);

  return html`
    <div>
      <a href="https://vite.dev" target="_blank">
        <img src="/vite.svg" class="logo" alt="Vite logo" />
      </a>
      <a href="https://github.com/dmnchzl/act" target="_blank">
        <img src="/favicon.svg" class="logo act" alt="Act logo" />
      </a>
    </div>
    <h1>Vite + Act</h1>
    <div class="card">
      <button onclick="${() => setCount(count() + 1)}">Count is ${count}</button>
      <p>Edit <code>src/App.ts</code> and save to test HMR</p>
    </div>
    <p class="read-the-docs">Click on the Vite and Act logos to learn more</p>
  `;
}
