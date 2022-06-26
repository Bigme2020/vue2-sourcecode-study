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

// 对 $mount 做备份
const mount = Vue.prototype.$mount
// 覆写 $mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 得到挂载点
  el = el && query(el)

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
   * 如果用户提供了 render 配置项，则直接跳过编译阶段，否则进入编译阶段
   *  解析 template 和 el，并转换成 render 函数
   *  优先级：render > template > el
   */
  if (!options.render) {
    let template = options.template
    if (template) {
      if (typeof template === 'string') {
        // 这里能说明这个东西是 id 选择器 比如 template: '#app'
        if (template.charAt(0) === '#') {
          // 返回这个元素的 innerHTML，将其作为 template 模板
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        // 如果 template 是一个正常的元素，也获取其 innerHTML 作为模板
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 没有 template 走 el
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

      // 编译模板，得到 动态渲染函数 和 静态渲染函数
      // createCompiler => createCompilerCreator => createCompileToFunctionFn => compileToFunctions
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
