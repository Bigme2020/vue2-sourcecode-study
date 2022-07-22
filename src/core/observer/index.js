/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    // Observer 实例的 dep 是给对象或数组用的
    // defineReactive中的 dep 是给对象中每个 key 用的
    this.dep = new Dep()
    this.vmCount = 0
    // __ob__标记已进行过响应式的同时
    // 附上 this 方便后续对实例属性和方法的调用
    def(value, '__ob__', this)
    if (Array.isArray(value)) {
      // 处理数组响应式
      // 判断 window 是否有 __proto__ 属性，对老版本 ie 做兼容
      // obj.__proto__ 访问对象的原型链
      // caniuse 中可以查看属性的兼容性
      if (hasProto) {
        // 用增强好的数组原型方法对象覆盖默认的原型方法
        protoAugment(value, arrayMethods)
      } else {
        // 直接给数组对象定义方法去实现
        copyAugment(value, arrayMethods, arrayKeys)
      }
      // 对数组中每项进行响应式处理
      this.observeArray(value)
    } else {
      // 处理对象响应式
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   * 对数组中的每个元素进行响应式处理
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  // 用增强好的数组原型方法对象覆盖默认的原型方法
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 * // 直接给数组对象定义方法去实现
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 * 响应式处理的入口
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    // 有 __ob__ 表示此数据已经经过响应式处理了,直接返回,避免重复操作
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    // 进行响应式处理
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 实例化一个 dep,一个 key 对应一个 dep
  const dep = new Dep()
  console.log('injectionReactive', Dep.target);

  // 获取属性描述符,若 configurable 为 false 则不进行响应式处理
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 通过递归的方式处理 val 为对象的情况,如果 childOb 有值说明当前 key 对应的是一个对象
  let childOb = !shallow && observe(val)
  // 拦截 obj.key,进行依赖收集以及返回最新的值
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        // 读取时进行双向依赖收集,将 dep 添加到 watcher,将 watcher 添加到 dep 中
        dep.depend()
        if (childOb) {
          // 对这个对象进行双向依赖收集
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    // 拦截 obj.key = newVal 的操作
    set: function reactiveSetter (newVal) {
      // 首先获取老值
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      // 如果老值和新值一样，不做处理
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      // 有 getter 没有 setter 说明只是只读属性，不做处理
      if (getter && !setter) return
      // 新值替换老值
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 新值如果是对象，也要重新做响应式处理
      childOb = !shallow && observe(newVal)
      // 当响应式数据改变，通知所有收集的 watcher，进入异步更新阶段
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 * {
 *  data() {
 *    return {
 *      key1: xxx, 定义好的是有响应式的
 *      “key2：xxx”, 而如果这个 key2 是在运行时动态添加的
 *       不用 set 是没法获得响应式的
 *      arr: [1,2,3,{key:value}]
 *    }
 *  }，
 *  // 例如如下方法的设置
 *  methods: {
 *    change() {
 *      this.key2 = 'val' 这样子是不具有响应式的，因为根数据对象上的动态添加没法响应式处理
 *      Vue.set(this, 'key2', 'val') 报错，不能这么做，源码中也写了会直接报错提示
 *      this.arr[0] = 4 这样子不具有响应式，因为数组中元素除了对象都没有经过响应式处理，
 *                      必须用 7 个重写的方法才有响应式
 *      Vue.set(this.arr, 0, 111)
 *      this.arr[3] = 'new' 这样子是可以的，因为这个是指向对象，而对象是被响应式处理过的
 *    }
 *  }
 * }
 */
// 通过 Vue.set 或者 this.$set 方法给 target 的指定 key 设置值 val
// 如果 target 是对象，并且 key 原本不存在，则为新 key 设置响应式，然后执行依赖通知
export function set (target: Array<any> | Object, key: any, val: any): any {
  // 异常处理
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // 处理数组，Vue.set(arr, idx, val)
  // 上面写法是将 val 添加到 arr[idx] 的位置
  // 原理就是通过数组的 splice 方法实现的
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  // 处理对象的情况
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  // 异常提示
  // 不能向 Vue 实例或者 $data 动态添加响应式属性，vmCount 的用处之一
  // this.$data 的 ob.vmCount = 1，表示根数据，其他的都是 0
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  // 若 target 不是响应式对象，新属性会被设置，但是不会做响应式处理
  if (!ob) {
    target[key] = val
    return val
  }
  // 对新属性设置 getter 和 setter，读取时收集依赖，更新时通知依赖更新
  defineReactive(ob.value, key, val)
  // 直接通知依赖更新
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // 数组依旧用 splice 方法删除元素
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  // 处理对象 若对象没有 key 直接返回
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  // 触发通知依赖更新
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
// 处理数组的响应式
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    // 对数组中为对象的进行依赖收集
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
