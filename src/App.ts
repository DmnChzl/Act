import { html, Component } from './core';
import './App.css';

interface IncrementButtonProps {
  onClick: () => void;
  value: string;
}

class IncrementButton extends Component<IncrementButtonProps> {
  constructor(selector: string, props: IncrementButtonProps) {
    super(selector, {}, props);
  }

  render(): Node {
    return html`<button onclick="${() => this.props.onClick()}">count is ${this.props.value}</button>`;
  }
}

interface CounterProps {
  defaultValue: number;
}

export default class App extends Component<CounterProps> {
  constructor(selector: string, props: CounterProps) {
    super(selector, { count: props.defaultValue }, props);
  }

  onMounted() {
    new IncrementButton('#increment', {
      onClick: () => this.increment(),
      value: this.state.count
    });
  }

  onUpdated() {
    new IncrementButton('#increment', {
      onClick: () => this.increment(),
      value: this.state.count
    });
  }

  increment = () => {
    this.setState({ count: this.state.count + 1 });
  };

  render() {
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
        <div id="increment"></div>
        <p>Edit <code>src/App.ts</code> and save to test HMR</p>
      </div>
      <p class="read-the-docs">Click on the Vite and Act logos to learn more</p>
    `;
  }
}
