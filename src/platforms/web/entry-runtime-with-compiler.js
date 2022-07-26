/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

/**
 * 编译器的入口
 * 运行时的 Vue.js 包就没有这部分的代码，通过
 */

// 运行时的 $mount 会比运行时+编译器的(完整版)更加早定义
// 对运行时的 $mount 做备份
/* 
  那么为什么要做备份呢?
    完整版本和只包含运行时版本之间的差异主要在于是否有模板编译阶段，只包含运行时版本没有模板编译阶段，初始化阶段完成后直接进入挂载阶段
    而完整版本是初始化阶段完成后进入模板编译阶段，然后再进入挂载阶段。也就是说，这两个版本最终都会进入挂载阶段
    所以在完整版本的$mount方法中将模板编译完成后需要回头去调只包含运行时版本的$mount方法以进入挂载阶段
 */
const mount = Vue.prototype.$mount
// 覆写 $mount
/**
 * 1.根据传入的 el 参数获取 DOM
 * 2.在用户没有手写 render 函数的情况下获取传入的模板 template
 * 3.将获取到的 template 编译成 render 函数
 */
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 得到挂载点
  el = el && query(el) // 这里 el 可以是 string 参数也可以是节点元素

  // 挂载点不能是 <html> 或 <body> 元素
  /* istanbul ignore if */
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  // 配置选项
  const options = this.$options
  // resolve template/el and convert to render function
  // {
  //   render: () => {}
  // }
  /**
   * 如果用户提供了 render 配置项，则直接跳过编译阶段直接挂载，否则进入编译阶段
   *  解析 template 和 el，并转换成 render 函数
   *  优先级：render > template > el
   *  render (h) {
        return h('div', this.hi)
      }
   */
  if (!options.render) {
    let template = options.template
    if (template) {
      if (typeof template === 'string') { // template 是字符串且以 # 开头
        if (template.charAt(0) === '#') { // template: '#app'
          // 返回这个 id 对应的元素的 innerHTML，将其作为 template 模板
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) { // template: document.querySelector('#app')
        // 如果 template 是一个正常的元素，也获取其 innerHTML 作为模板
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) { // 没有 template 走 el
      // 获取 el 选择器的 outerHTML 作为模板
      // 举例：下面这个就是 outerHTML
      // <div id='app'>innerHTML</div>
      template = getOuterHTML(el)
    }
    if (template) {
      // 模板就绪，进入编译阶段
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      // 模板编译:(拿到模板 => 模板编译 => render函数) => 虚拟DOM:(VNode => patch => 视图)
      // 编译模板，得到 动态渲染函数 和 静态渲染函数
      // createCompilerCreator(baseComplie) => createCompiler(baseOptions) -> complie(template, options) + createCompileToFunctionFn(compile) => compileToFunctions
      const { render, staticRenderFns } = compileToFunctions(template, {
        // 标记元素在 HTML 模板字符串中的开始和结束索引位置
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        // 界定符，{{}}
        delimiters: options.delimiters,
        // 是否保留注释
        comments: options.comments
      }, this)
      // 将两个渲染函数放到 this.$options 上
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  // 执行挂载
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue
