/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
const modules = platformModules.concat(baseModules)

/**
 * 工厂函数：为其传入平台特有的一些操作，然后返回一个 patch 函数
 * nodeOps：dom api
 * modules：平台特有的一些操作，比如：attr、class、style、event 等
 * 还有核心的 directive 和 ref，它们会向外暴露一些特有的方法，比如：create、activate、update、remove、destroy
 * 这些方法在 patch 阶段时会被调用，从而做相应的操作，比如 创建 attr、指令等。这部分内容太多了，这里就不一一列举了
 * 在阅读 patch 的过程中如有需要可回头深入阅读，比如操作节点的属性的时候，就去读 attr 相关的代码。
 */
export const patch: Function = createPatchFunction({ nodeOps, modules })
