/**
 * @file Act is another reactive frontend framework, but with fine-grained architecture.
 * Inspired by Lit and Solid, this framework uses a Signals system
 * to update the DOM effectively and straightforwardly.
 */

/* --- Reactive System --- */
export type Signal<T> = () => T;

type Subscriber = () => void;
type Cleanup = () => void;

interface EffectContext {
  subscriber: Subscriber;
  cleanup: Cleanup | null;
}

/**
 * Creates a reactive signal with getter and setter
 *
 * @template T The type of the stored value
 * @param {T} initialValue The initial value of the signal
 * @returns {[(Signal<T>, (val: T) => void]} Getter and setter as tuple
 *
 * @example
 * ```ts
 * const [count, setCount] = createSignal(0);
 * console.log(count()); // 0
 * setCount(42);
 * console.log(count()); // 42
 * ```
 */
export function createSignal<T>(initialValue: T): [Signal<T>, (val: T) => void] {
  let value = initialValue;
  const subscribers = new Set<Subscriber>();

  const getter = () => {
    const activeEffect = getActiveEffect();
    if (activeEffect) subscribers.add(activeEffect);
    return value;
  };

  const setter = (nextValue: T) => {
    if (value !== nextValue) {
      value = nextValue;
      subscribers.forEach(fn => fn());
    }
  };

  return [getter, setter];
}

/**
 * Creates a computed value that automatically updates
 * when its dependencies change
 *
 * @template T The type of the computed value
 * @param {() => T} fn Function to compute the value
 * @returns {Signal<T>} Getter for the computed value
 *
 * @example
 * ```ts
 * const [count, setCount] = createSignal(21);
 * const doubleCount = createComputed(() => count() * 2);
 * console.log(count()); // 21
 * console.log(doubleCount()); // 42
 * ```
 */
export function createComputed<T>(fn: () => T): Signal<T> {
  let cachedValue: T;
  const [get, set] = createSignal<T>(fn());

  createEffect(() => {
    cachedValue = fn();
    set(cachedValue);
  });

  return get;
}

const effectStack: EffectContext[] = [];

/**
 * Creates a reactive effect that automatically re-executes
 * when its dependencies change
 *
 * @param {Subscriber} fn Function to execute, can return a cleanup function
 *
 * @example
 * ```ts
 * const [count, setCount] = createSignal(0);
 *
 * createEffect(() => {
 *   const value = count();
 *   console.log('Count is', value);
 *
 *   return () => {
 *     console.log('Count was', value);
 *   };
 * });
 * ```
 */
export function createEffect(fn: Subscriber) {
  const ctx: EffectContext = {
    subscriber: fn,
    cleanup: null
  };

  const wrapped = () => {
    if (ctx.cleanup) {
      ctx.cleanup();
      ctx.cleanup = null;
    }

    effectStack.push(ctx);
    const cleanup = fn();

    if (typeof cleanup === 'function') {
      ctx.cleanup = cleanup;
    }

    effectStack.pop();
  };

  ctx.subscriber = wrapped;
  wrapped();
}

// Get the active reactive effect from the top of the effect stack
function getActiveEffect(): Subscriber | null {
  if (effectStack.length === 0) return null;
  return effectStack[effectStack.length - 1].subscriber;
};

// --- Template System ---
type BindingType = 'attribute' | 'event' | 'property' | 'text';

interface Binding {
  index: number;
  key: string;
  type: BindingType;
  node: Node;
  eventHandler?: EventListener;
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

// Determines if an attribute is a DOM event
const isEventAttribute = (attr: string): boolean => DOM_EVENTS.has(attr);
// Determines if an attribute is a DOM property
const isPropAttribute = (attr: string): boolean => DOM_PROPS.has(attr);

/**
 * Determines the binding type based on the attribute name
 *
 * @param {string} attr Attribute name
 * @returns {BindingType} Corresponding binding type
 */
function getBindingType(attr: string): BindingType {
  if (isEventAttribute(attr)) return 'event';
  if (isPropAttribute(attr)) return 'property';
  return 'attribute';
}

/**
 * Traverses a DOM tree to find all bindings
 * Bindings are identified by HTML comments of the form <!--binding-x-->
 *
 * @param {Node} root Root node to traverse
 * @returns {Binding[]} List of found bindings, sorted by index
 */
function createBindings(root: Node): Binding[] {
  let bindings: Binding[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.COMMENT_NODE && node.nodeValue?.startsWith('binding-')) {
      const [_, indexStr] = node.nodeValue.split('-');
      bindings = [
        ...bindings,
        {
          index: Number(indexStr),
          key: '',
          node,
          type: 'text'
        }
      ];
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const attributes = [...(node as Element).attributes];
      for (const attr of attributes) {
        const matches = attr.value.match(/<!--binding-(\d+)-->/);
        if (matches) {
          const [_, indexStr] = matches;
          const type = getBindingType(attr.name);
          const key = type === 'event' ? attr.name.slice(2) : attr.name;

          bindings = [
            ...bindings,
            {
              index: Number(indexStr),
              key,
              node,
              type
            }
          ];
        }
      }
    }

    for (const child of node.childNodes) {
      walk(child);
    }
  };

  walk(root);
  return bindings.sort((a, b) => a.index - b.index);
}

// Resolves a value that may be a function
function resolveValue(raw: any) {
  try {
    if (typeof raw === 'function') {
      const result = raw();
      if (result instanceof Node || typeof result === 'string' || typeof result === 'number') {
        return result;
      }
      return result;
    }
    return raw;
  } catch {
    return raw;
  }
}

/**
 * Applies all bindings to their respective DOM nodes
 *
 * @param {Binding[]} bindings List of bindings to apply
 * @param {Array} values Interpolated values from the template
 */
function applyAllBindings(bindings: Binding[], values: any[]) {
  bindings.forEach(binding => {
    const raw = values[binding.index];

    if (binding.type === 'text') {
      if (typeof raw === 'function') {
        createEffect(() => applyBinding(binding, resolveValue(raw)));
      } else {
        applyBinding(binding, resolveValue(raw));
      }
    } else {
      applyBinding(binding, raw);
    }
  });
}

/**
 * Applies an attribute binding
 *
 * @param {Binding} binding Binding configuration
 * @param {*} value Value to apply
 */
function applyAttributeBinding(binding: Binding, value: any) {
  const element = binding.node as Element;
  element.setAttribute(binding.key, String(value));
}

/**
 * Applies an event binding
 *
 * @param {Binding} binding Binding configuration
 * @param {*} value Event handler to apply
 */
function applyEventBinding(binding: Binding, value: any) {
  const element = binding.node as Element;
  element.removeAttribute(`on${binding.key}`);

  if (binding.eventHandler) {
    element.removeEventListener(binding.key, binding.eventHandler);
  }

  if (typeof value === 'function') {
    const handler = (event: Event) => value(event);
    element.addEventListener(binding.key, handler);
    binding.eventHandler = handler;
  }
}

/**
 * Applies a property binding
 *
 * @param {Binding} binding Binding configuration
 * @param {*} value Value to apply to the property
 */
function applyPropertyBinding(binding: Binding, value: any) {
  const element = binding.node as Element;
  // @ts-ignore
  element[binding.key] = value;
}

/**
 * Applies a text binding
 *
 * @param {Binding} binding Binding configuration
 * @param {*} value Content to insert
 */
function applyTextBinding(binding: Binding, value: any) {
  const parent = binding.node.parentNode;
  if (!parent) return;

  let node: Node;
  if (value instanceof Node) {
    node = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    node = document.createTextNode(String(value));
  } else if (value instanceof DocumentFragment) {
    const wrapper = document.createElement('span');
    wrapper.appendChild(value);
    node = wrapper;
  } else {
    node = document.createTextNode('');
  }

  parent.replaceChild(node, binding.node);
  binding.node = node;
}

/**
 * Applies a binding according to its type
 *
 * @param {Binding} binding Binding configuration
 * @param {*} value Value to apply
 */
function applyBinding(binding: Binding, value: any) {
  switch (binding.type) {
    case 'attribute':
      applyAttributeBinding(binding, value);
      break;
    case 'event':
      applyEventBinding(binding, value);
      break;
    case 'property':
      applyPropertyBinding(binding, value);
      break;
    case 'text':
      applyTextBinding(binding, value);
      break;
  }
}

const templateCache = new WeakMap<TemplateStringsArray, DocumentFragment>();

/**
 * Template literal function to create reactive DOM elements
 *
 * @param {TemplateStringsArray} template Template string array
 * @param {Array} values Values interpolated in the template
 * @returns {Node} DOM node
 *
 * @example
 * ```ts
 * const [greeting, setGreeting] = createSignal('World');
 * const element = html`<div>Hello ${greeting}!</div>`;
 * ```
 */
export function html(template: TemplateStringsArray, ...values: any[]): Node {
  if (!templateCache.has(template)) {
    const htmlString = template.reduce((acc, str, idx) => {
      return acc + str + (idx < values.length ? `<!--binding-${idx}-->` : '');
    }, '');

    const tpl = document.createElement('template');
    tpl.innerHTML = htmlString;
    templateCache.set(template, tpl.content);
  }

  const node = templateCache.get(template)?.cloneNode(true) as DocumentFragment;
  const bindings = createBindings(node);
  applyAllBindings(bindings, values);
  return node;
}
