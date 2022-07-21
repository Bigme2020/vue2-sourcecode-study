/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

export function initEvents (vm: Component) {
  vm._events = Object.create(null)
  vm._hasHookEvent = false
  // init parent attached events
  const listeners = vm.$options._parentListeners
  console.log('vm', vm, 'listeners', listeners);
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}

let target: any

function add (event, fn) {
  target.$on(event, fn)
}

function remove (event, fn) {
  target.$off(event, fn)
}

function createOnceHandler (event, fn) {
  const _target = target
  return function onceHandler () {
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm
  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm)
  target = undefined
}

export function eventsMixin (Vue: Class<Component>) {
  // 检测 hook 的正则
  const hookRE = /^hook:/
  // 将所有的事件和对应的回调放到 vm._events 对象对象上，格式：
  // {event1: [cb1,cb2]}
  // this.$on('custom-click', function() {xxx})
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    // 事件为数组的情况
    // this.$on([event1,event2,...], function() {xxx})
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else {
      // 一个事件可以设置多个响应函数
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      // hook event
      // <comp @hook:mounted="handleHookMounted" />
      if (hookRE.test(event)) {
        // 置为 true，标记当前组件实例存在 hook event
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    vm.$on(event, on)
    return vm
  }

  /**
   * 移除 vm._events 对象上指定事件（key）的指定回调函数
   * @param {*} event 
   * @param {*} fn 
   * @returns 
   */
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all
    // 如果没传入参数，移除所有监听器，直接将 vm._events 置为空对象
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    // 若第一个参数是数组，依次递归清除
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    // 获取指定事件的回调函数
    const cbs = vm._events[event]
    if (!cbs) {
      return vm
    }
    // 若没有传入 fn，直接全部移除
    if (!fn) {
      vm._events[event] = null
      return vm
    }
    // specific handler
    // 若指定移除某个回调，在对应的数组中遍历寻找这个回调并移除
    let cb
    let i = cbs.length
    while (i--) {
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    // 这里通过下面的提示我们知道 html 解析 @customClick 会最终变成 @customclick
    // 所以最好以后不要用驼峰，最好用连字符
    // <comp @custom-click='handleClick‘>
    // $on('custom-click', function(){}) $emit('custom-click')
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }
    // 从 vm._events 对象中获取指定事件的所有回调函数
    let cbs = vm._events[event]
    if (cbs) {
      // 数组转换，将类数组转换为数组
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      // this.$emit('custom-click', arg1, arg2)
      // 这里 args 最终得到的是 [arg1, arg2]
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`
      for (let i = 0, l = cbs.length; i < l; i++) {
        // 执行回调函数
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}
