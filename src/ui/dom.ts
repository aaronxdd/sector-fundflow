/**
 * 极简 DOM 工具
 */

/** 查询单个元素；泛型参数用于指定返回的元素类型 */
export function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(sel);
}

/** 查询多个元素，返回真数组 */
export function $$<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] {
  return [...root.querySelectorAll<T>(sel)];
}

/** 可接受的子节点：Node、字符串，或可忽略的 null / undefined / false */
export type HChild = Node | string | null | undefined | false;

/** h() 的属性表：class / text / html 走特殊通道，其余原样 setAttribute */
export interface HAttrs {
  class?: string;
  text?: string | number;
  html?: string;
  style?: string;
  title?: string;
  value?: string;
  [key: string]: string | number | boolean | null | undefined;
}

/** 创建元素：h('td', { class: 'v in', text: '+1.2亿' }, [children]) */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: HAttrs = {},
  children: HChild | HChild[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else node.setAttribute(k, String(v));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/** 清空子节点，返回原节点便于链式调用 */
export function clear<T extends Node>(node: T): T {
  while (node && node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** HTML 转义（用于拼 SVG / HTML 字符串） */
export function esc(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
