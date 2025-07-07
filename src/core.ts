type ComponentState = Record<string, any>;
type BindingType = 'attribute' | 'event' | 'property' | 'text';
type EventHandler = (event: Event) => void;

interface Binding {
  index: number;
  eventHandler?: EventHandler;
  key: string;
  node: Node;
  type: BindingType;
  value: any;
}

const DOM_EVENTS = new Set([
  'onblur',
  'onchange',
  'onclick',
  'oncontextmenu',
  'ondblclick',
  'onfocus',
  'oninput',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onload',
  'onmousedown',
  'onmousemove',
  'onmouseout',
  'onmouseover',
  'onmouseup',
  'onresize',
  'onscroll',
  'onsubmit',
  'onunload'
]);

const DOM_PROPS = new Set([
  'checked',
  'defaultChecked',
  'defaultSelected',
  'defaultValue',
  'disabled',
  'hidden',
  'innerHTML',
  'innerText',
  'readOnly',
  'required',
  'selected',
  'textContent',
  'value'
]);

export class Component<T extends Record<string, any> = {}> {
  private _container: Element | null = null;
  private _state: ComponentState;
  private _props: T;
  private _mounted = false;

  constructor(selector: string, initialState: ComponentState = {}, props: T) {
    this._state = initialState;
    this._props = props;
    this.mount(selector);
  }

  get state(): ComponentState {
    return this._state;
  }

  get props(): T {
    return this._props;
  }

  render(): Node {
    throw new Error('render() Method Must Be Implemented');
  }

  /* Component LifeCycle */
  onMounted() {}
  onUpdated(_prevState: ComponentState, _nextState: ComponentState) {}
  onUnmounted() {}

  setState(newState: Partial<Record<string, any>>) {
    const prevState = this._state;
    this._state = { ...prevState, ...newState };

    if (this._mounted) {
      this.update();
      this.onUpdated(prevState, this._state);
    }
  }

  private mount(selector: string) {
    const element = document.querySelector(selector);
    if (!element) throw new Error('Element Not Found');

    const rendered = this.render();
    element.appendChild(rendered);

    this._container = element;
    this._mounted = true;
    this.onMounted();
  }

  private update() {
    if (!this._container) {
      console.warn('No "Container" Found');
      return;
    }

    this._container.innerHTML = '';
    const rendered = this.render();
    this._container.appendChild(rendered);
  }

  // @ts-ignore
  private unmount() {
    if (!this._container) {
      console.warn('No "Container" Found');
      return;
    }

    this.onUnmounted();
    this._container.innerHTML = '';
    this._mounted = false;
  }
}

const _getBindingType = (attrName: string): BindingType => {
  if (DOM_EVENTS.has(attrName)) return 'event';
  if (DOM_PROPS.has(attrName)) return 'property';
  return 'attribute';
};

const _isEventType = (bindingType: BindingType) => bindingType === 'event';

const createBindings = (rootNode: Node) => {
  let bindings: Binding[] = [];

  const walkNodes = (node: Node) => {
    if (node.nodeType === Node.COMMENT_NODE && node.nodeValue?.startsWith('binding-')) {
      const matches = node.nodeValue.match(/^binding-(\d+)$/);
      if (matches) {
        const [_, indexStr] = matches;
        bindings = [
          ...bindings,
          {
            index: Number(indexStr),
            key: '',
            node,
            type: 'text',
            value: undefined
          }
        ];
      }
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const attributes = [...(node as Element).attributes];
      attributes.forEach(attr => {
        if (attr.value.startsWith('<!--binding-') && attr.value.endsWith('-->')) {
          const matches = attr.value.match(/<!--binding-(\d+)-->/);
          if (matches) {
            const [_, indexStr] = matches;
            const bindingType = _getBindingType(attr.name);
            const bindingKey = _isEventType(bindingType) ? attr.name.slice(2) : attr.name;

            bindings = [
              ...bindings,
              {
                index: Number(indexStr),
                key: bindingKey,
                node,
                type: bindingType,
                value: undefined
              }
            ];
          }
        }
      });
    }

    for (let child of node.childNodes) {
      walkNodes(child);
    }
  };

  walkNodes(rootNode);

  bindings.sort((a, b) => a.index - b.index);
  return bindings;
};

const _applyAttributeBinding = (binding: Binding, value: any) => {
  const element = binding.node as Element;
  element.setAttribute(binding.key, String(value));
  binding.value = value;
};

const _applyEventBinding = (binding: Binding, value: any) => {
  const element = binding.node as Element;

  if (binding.eventHandler) {
    element.removeEventListener(binding.key, binding.eventHandler);
  }

  if (typeof value === 'function') {
    const listener = (event: Event) => {
      value(event);
    };

    element.addEventListener(binding.key, listener);
    binding.eventHandler = listener;
  }

  binding.value = value;
};

const _isBooleanProperty = (key: string) => {
  return ['checked', 'disabled', 'hidden', 'readOnly', 'required', 'selected'].includes(key);
};

const _applyPropertyBinding = (binding: Binding, value: any) => {
  const element = binding.node as Element;
  let propertyValue = value;

  if (_isBooleanProperty(binding.key)) {
    propertyValue = Boolean(value);
  }

  // @ts-ignore
  element[binding.key] = propertyValue;
  binding.value = value;
};

const _applyTextBinding = (binding: Binding, value: any) => {
  const textNode = document.createTextNode(String(value));

  if (binding.node.parentNode) {
    binding.node.parentNode.replaceChild(textNode, binding.node);
  }

  binding.value = value;
};

const applyBindings = (bindings: Binding[], values: any[]) => {
  bindings.forEach(binding => {
    const value = values[binding.index];

    switch (binding.type) {
      case 'attribute':
        return _applyAttributeBinding(binding, value);
      case 'event':
        return _applyEventBinding(binding, value);
      case 'property':
        return _applyPropertyBinding(binding, value);
      case 'text':
        return _applyTextBinding(binding, value);
    }
  });
};

const templateCache = new Map<TemplateStringsArray, Node>();

export function html(template: TemplateStringsArray, ...values: any[]): Node {
  let prevTemplate = templateCache.get(template);

  if (!prevTemplate) {
    const htmlString = template.reduce((acc, str, idx) => {
      const binding = idx < values.length ? `<!--binding-${idx}-->` : '';
      return acc + str + binding;
    }, '');

    const tpl = document.createElement('template');
    tpl.innerHTML = htmlString;

    prevTemplate = tpl.content.cloneNode(true);
    templateCache.set(template, prevTemplate);
  }

  const rootNode = prevTemplate.cloneNode(true);
  const bindings = createBindings(rootNode);

  applyBindings(bindings, values);
  return rootNode;
}
