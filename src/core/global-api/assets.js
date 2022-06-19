/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   * 初始化 Vue.component、Vue.directive、Vue.filter
   */
  // 例如：Vue.component = function() {}
  // 用法：Vue.component(CompName, Comp)
  /* 
    Vue.component(CompName, Comp) 做了什么？
    负责注册全局组件，其实就是将组件配置注册到全局配置的 components 选项上（options.components）
    然后各个子组件在生成 vnode 时会将全局的 components 选项合并到局部的 components 配置项上
   */
  /* 
    Vue.directive 也是在全局 directive 中写入，在子组件生成 vnode 时会将全局 directive 合并到
    局部 directive 选项中
   */
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }
        // 组件走这
        if (type === 'component' && isPlainObject(definition)) {
          // 设置组件名称
          definition.name = definition.name || id
          // this.options._base 就是 Vue 构造函数
          // 利用 Vue.extend 基于 definition 去扩展一个新的组件子类，返回的 definition 可以直接 new 一个组件出来
          definition = this.options._base.extend(definition)
        }
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
