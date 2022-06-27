/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  // 标记静态节点
  markStatic(root)
  // second pass: mark static roots.
  // 标记静态根节点
  markStaticRoots(root, false)
}

function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

function markStatic (node: ASTNode) {
  // 先标记根节点是否为静态节点
  // 通过 node.static 来标识节点是否为 静态节点
  node.static = isStatic(node)
  // 若根元素为元素节点，递归其子节点进行标记
  if (node.type === 1) {
    /**
     * 不要将组件的插槽内容设置为静态节点，这样可以避免：
     *  1.组件不能改变插槽节点
     *  2.静态插槽内容在热重载时失败
     */
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      // 递归终止条件
      // 节点不是平台保留标签 && 也不是 slot 标签 && 也不是内联模板
      return
    }
    // 遍历子节点，递归调用 markStatic 来标记这些子节点的 static 属性
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      // 如果子节点不是静态节点，则将父节点更新为非静态节点
      if (!child.static) {
        node.static = false
      }
    }
    // 循环 node.children 后还不算把所有子节点都遍历完
    // 因为如果当前节点的子节点中有标签带有v-if、v-else-if、v-else等指令时
    // 这些子节点在每次渲染时都只渲染一个，所以其余没有被渲染的肯定不在 node.children中
    // 而是存在于 node.ifConditions，所以我们还要把 node.ifConditions循环一遍
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

/**
 * 进一步标记静态根，一个节点要成为静态根节点，需要具体以下条件：
 * 节点本身是静态节点，而且有子节点，而且子节点不只是一个文本节点，则标记为静态根
 * 静态根节点不能只有静态文本的子节点，因为这样收益太低，这种情况下始终更新它就好了
 * @param {*} node 当前节点
 * @param {*} isInFor 当前节点是否被包裹在 v-for 指令所在的节点内
 * @returns 
 */
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    // 一个节点想要成为静态根节点，它必须满足以下要求：
    //  1.节点本身必须是静态节点
    //  2.必须拥有子节点 children
    //  3.子节点不能只是只有一个文本节点
    // 否则的话，对它的优化成本将大于优化后带来的收益
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      // 节点本身是静态节点，而且有子节点，而且子节点不只是一个文本节点
      // 则标记为静态根 => node.staticRoot = true，否则为非静态根
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    // 遍历子节点，递归寻找静态根节点
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    // 如果节点存在 v-if、v-else-if、v-else 指令
    // 则为 block 节点标记静态根
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

/**
 * 判断节点是否为静态节点：
 *  通过自定义的 node.type 来判断，2：表达式 => 动态，3：文本 => 静态
 *  凡是有 v-bind、v-if、v-for 等指令的都属于动态节点
 *  组件为动态节点
 *  父节点为含有 v-for 指令的 template 标签，则为动态节点
 * @param {*} node 
 * @returns boolean
 */
function isStatic (node: ASTNode): boolean {
  if (node.type === 2) { // expression
    // 比如：{{msg}}
    return false
  }
  if (node.type === 3) { // text
    return true
  }
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in
    isPlatformReservedTag(node.tag) && // not a component
    !isDirectChildOfTemplateFor(node) &&
    Object.keys(node).every(isStaticKey)
  ))
}

function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
