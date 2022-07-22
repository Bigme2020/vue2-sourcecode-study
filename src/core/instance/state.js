/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
  invokeWithErrorHandling
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

// 代理到 vm 实例上
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 数据处理，响应式原理的入口
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  // 初始化 props 主要对父组件传入的 props 数据进行管理
  // 并将值赋给 vm._props 顺便响应式处理，最后代理到了实例上
  if (opts.props) initProps(vm, opts.props)
  // 判重处理，props 优先级大于 methods 优先级
  // 将 methods 中的所有方法赋值到 vm 实例上，支持了通过 this.xxx 访问方法
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    // 判重处理，data 中的属性不能和 props 以及 methods 中的属性重复
    // 将 data 中的所有方法赋值到 vm 实例上，支持了通过 this.xxx 访问方法
    // 对 data 做响应式处理
    initData(vm)
  } else {
    // 响应式重点
    observe(vm._data = {}, true /* asRootData */)
  }
  // 初始化 computed
  // computed 是通过 watcher 来实现的，对每个 computedKey 实例化一个默认懒执行的 watcher
  // 代理，支持 this.xxx 访问
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    // 初始化 watcher
    // 对每一个 key 实例化一个 watcher 去监听 key 的变化并调用回调
    // computed 和 watch 有什么区别？
    //    1. computed 是默认懒执行且不可更改（懒执行即读到 computed 时才会执行）
    //      而 watcher 可以通过 immediate 进行配置
    //    2. 使用场景不同,computed 无法执行异步操作,watcher 可以
    initWatch(vm, opts.watch)
  }
}

// 初始化 props
// 这里的 propsOptions 已经被标准化了
function initProps (vm: Component, propsOptions: Object) {
  // propsData：父组件传入的真实 props 数据（这里简单解释一下：父组件需要在 template 中给子组件标签传递的 props 是 propsData；子组件内部配置的 props 是 propsOptions）
  const propsData = vm.$options.propsData || {}
  // _props：指向 vm._props 的指针，所有设置到 props 变量中的属性都会保存到 vm._props 中
  const props = vm._props = {}
  // _propKeys：缓存 props 对象中的 key，将来更新 props 时只需要遍历 vm.$options._propKeys 即可得到所有 key
  const keys = vm.$options._propKeys = []
  // 判断当前组件是否为根组件
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    // 校验父组件传入的 props 数据类型是否匹配 并获取到父组件传入的值
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      // 添加到 vm._props
      // 开发模式下会有 prop 禁止修改提示
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      // 添加到 vm._props
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    // 代理到 vm 实例上，支持了通过 this.xxx 访问
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

function initData (vm: Component) {
  let data = vm.$options.data
  // 保证后续处理的 data 是一个对象
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  // 若处理完还是有问题，则直接置 data 为空对象并报错提示
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    // 判重处理，data 中的属性不能和 props 以及 methods 中的属性重复
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 代理到 vm 实例上，支持了通过 this.xxx 访问
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  // 对 data 做响应式处理
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  // 遍历 computed 对象
  for (const key in computed) {
    // 拿到 key 对应的值
    const userDef = computed[key]
    // 处理 computed 的两种写法并赋值给 getter
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      // 实例化一个 watcher
      // 这里可以了解到 computed 其实就是通过 watcher 来实现的
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        // 外部不可更改的懒执行配置 { lazy: true }
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      // 主要是这儿
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      } else if (vm.$options.methods && key in vm.$options.methods) {
        warn(`The computed property "${key}" is already defined as a method.`, vm)
      }
    }
  }
}

export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  // 将 computed 配置项中的 key 代理到 vm 实例上，支持了 this.xxx 访问
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  return function computedGetter () {
    // 拿到 key 对应的 watcher
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      // 在计算属性的 watcher 刚创建时，watcher.dirty = watcher.lazy = true
      if (watcher.dirty) {
        // evaluate 执行完后，watcher.dirty = false
        // 置为 false 可以避免在页面下次更新前 可能发生的多次重复计算
        // 在下次页面更新后，watcher.update 会将 watcher.dirty 置为 true  
        watcher.evaluate()
      }
      // 此时的 Dep.target 不是 computed watcher
      // 而是 targetStack 中上一个 render watcher
      // 于是 dep 就把 render watcher 也收集进去了
      if (Dep.target) {
        watcher.depend()
      }
      // computed 和 watcher 的使用场景不同
      // computed 更倾向于对监听值的简单的读取操作
      // 而 watcher 更偏向于监听值的变化并调用回调函数进行复杂操作
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  // 判重，methods 中的 key 不能和 props 中的重复
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    // 将 methods 中的所有方法赋值到 vm 实例上，支持了通过 this.xxx 访问方法
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch (vm: Component, watch: Object) {
  // 遍历 watch 配置项
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

// 这个函数主要是处理了多种 watcher 写法
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  // 若是对象，拿到 handler
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  // 若 handler 是字符串，表示的是 methods 中的方法
  // 直接通过 this.methodKey 方式拿到函数
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  // $watch：实例方法
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  // 处理 data 数据，定义 get 方法，访问 this._data
  const dataDef = {}
  dataDef.get = function () { return this._data }
  // 处理 props 数据
  const propsDef = {}
  propsDef.get = function () { return this._props }
  // 异常提示
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  // 将 $data 和 $props 挂载到 Vue 原型链，支持通过 this.$data 和 this.$props 访问
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  // 将全局 API 放到原型上
  // 其实就是全局 API 的别名
  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function (
    expOrFn: string | Function, // key
    cb: any, // 回调函数
    options?: Object // 选项
  ): Function {
    const vm: Component = this
    // 如果从 initWatch 看下来会疑惑，之前已经对 cb 处理过了，为什么这里还要处理呢
    // 原因是用户可能手动调用 this.$watch 并传入对象
    // 所以还是要处理一波 cb 的情况，确保 cb 转换后肯定是一个函数
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    // 标记这是一个用户 watcher
    options.user = true
    // 实例化 watcher
    const watcher = new Watcher(vm, expOrFn, cb, options)
    // 存在 immediate：true，则立即执行回调函数
    if (options.immediate) {
      const info = `callback for immediate watcher "${watcher.expression}"`
      pushTarget()
      invokeWithErrorHandling(cb, vm, [watcher.value], vm, info)
      popTarget()
    }
    // 返回一个 unwatchFn 函数，供手动取消监听
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
