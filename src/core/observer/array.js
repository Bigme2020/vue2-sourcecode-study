/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
// 创建一个新的原型是数组原型的空对象
export const arrayMethods = Object.create(arrayProto)

// 7个需要重写的方法
// 为什么是这7个方法？
// 因为只有这7个方法会改变原数组，而别的方法像 concat 都是返回一个新数组不会改变原数组
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 * 覆写（增强）数组原型方法，使其具有通知依赖更新的能力
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  // 获取 Array.prototype 上对应 method 的方法
  const original = arrayProto[method]
  // 分别在 arrayMethods 对象上定义那七个方法
  def(arrayMethods, method, function mutator (...args) {
    // 先执行原生的方法，往数组中放置新的数据
    const result = original.apply(this, args)
    const ob = this.__ob__
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    // 若执行的是 push unshift splice 操作的话
    // 对新插入的值进行响应式处理
    if (inserted) ob.observeArray(inserted)
    // notify change
    // 通知更新
    ob.dep.notify()
    return result
  })
})
