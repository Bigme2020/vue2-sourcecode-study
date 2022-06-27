/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) {
  // 定义 Vue.use，用来定义一个插件
  // 总结：本质就是在执行插件暴露出来的 install 方法
  Vue.use = function (plugin: Function | Object) {
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    // 这里保证了不会重复注册同一个组件
    // Vue.use(VueRouter)
    // Vue.use(VueRouter) 就比方说这里注册了两个 VueRouter，只会注册第一个
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    // 取出 Vue.use() 中第二个位置开始的参数
    const args = toArray(arguments, 1)
    // 这里传入的就是 Vue 构造函数，所以 install 方法中能接收到 Vue
    // 这里的 this 是 Vue 构造函数
    args.unshift(this)
    if (typeof plugin.install === 'function') {
      // plugin 是对象的情况，执行 plugin.install
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      // plugin 是函数
      plugin.apply(null, args)
    }
    // 将 plugin 放入已安装的插件数组中
    installedPlugins.push(plugin)
    return this
  }
}
