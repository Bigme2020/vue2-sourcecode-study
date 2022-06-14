/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

export function initProvide (vm: Component) {
  const provide = vm.$options.provide
  if (provide) {
    vm._provided = typeof provide === 'function'
      ? provide.call(vm)
      : provide
  }
}

/**
 * 解析 inject 选项
 * 
 * 1. 得到 { key: val } 形式的配置对象
 * 2. 对解析结果做响应式处理
 */
export function initInjections (vm: Component) {
  const result = resolveInject(vm.$options.inject, vm)
  if (result) {
    toggleObserving(false)
    Object.keys(result).forEach(key => {
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
            `overwritten whenever the provided component re-renders. ` +
            `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        // 做响应式处理，将每个 result 的值代理到 vue 实例上
        defineReactive(vm, key, result[key])
      }
    })
    toggleObserving(true)
  }
}

/**
 * 
 * @param {*} inject
 * @param {*} vm 
 * @returns 
 */
export function resolveInject (inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    const keys = hasSymbol
      ? Reflect.ownKeys(inject)
      : Object.keys(inject)

    // 遍历 inject 选项中 key 组成的数组
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // #6574 in case the inject object is observed...
      if (key === '__ob__') continue
      // 获取 from 属性（注意这里已经在 mergeOptions 中进行过标准化处理了）
      const provideKey = inject[key].from
      let source = vm
      // 从祖代组件的配置项中找到 provide 选项，从而找到对应 key 的值
      while (source) {
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey]
          break
        }
        source = source.$parent
      }
      if (!source) {
        // 若没找到，查看 inject 选项中是否配置了默认值
        if ('default' in inject[key]) {
          const provideDefault = inject[key].default
          result[key] = typeof provideDefault === 'function'
            ? provideDefault.call(vm)
            : provideDefault
        } else if (process.env.NODE_ENV !== 'production') {
          // 没有默认值，报错
          warn(`Injection "${key}" not found`, vm)
        }
      }
    }
    // 最终返回解析结果 key-value 对象形式
    return result
  }
}
