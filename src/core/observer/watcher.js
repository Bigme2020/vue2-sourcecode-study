/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    if (isRenderWatcher) {
      vm._watcher = this
    }
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    // 这里 getter 的情况
    //   1. 实例化渲染 watcher 的 updateComponent 函数
    //   2. 用户 watcher 的 key 最终被 parsePath 转换成一个读取 this.key 的函数
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // watch 中会走这里通过 parsePath 返回一个函数给到 getter
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   * 触发 updateComponent 的执行，进行组件更新，进入 patch 阶段
   * 更新组件时先执行 render 生成 VNode，期间触发读取操作，进行依赖收集
   */
  // get 会在 run 中和 evaluate 调用
  get () {
    // Dep.target = this 对新值做依赖收集
    pushTarget(this)
    // console.log(Dep.target);
    let value
    const vm = this.vm
    try {
      // 最重要的一步（精华）
      /* computed 中干了什么
          1. 将 getter 函数中的监听项返回
          顺便执行其 get 方法，触发了依赖收集(watcher 收集了 dep，dep 收集了 watcher)
       */
      /* watch 中干了什么
          1. 用户定义的 watch 传进来的 expOrFn 是 key，那么首先 parsePath 会将其转变成函数给到 this.getter
          2. 传入 vm，这样就返回了 vm[key]，返回了监听的值
       */
      // 触发读取操作，被 getter 拦截，收集依赖
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        // 当有深度观测选项时，走 traverse
        traverse(value)
      }
      popTarget()
      // 对新老 deps 进行修改
      this.cleanupDeps()
    }
    // 将拿到的 value 返回出去
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      // watcher 的 dep 对象收集了 dep 实例
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        // 向形参 dep 中添加 watcher
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      // 如果新的 deps 中没有找到老 dep，移除老 dep
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    // 最后新 dep 会被赋给老 dep，新dep置空
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  // 当页面更新后，会调用这个方法
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      // 懒执行时会走这，比如 computed
      // 在 update 后重新将 dirty 置为 true，好让响应式数据更新后
      // 获取 computed 的时候会再次执行 computed 回调函数计算新值，并缓存到 watcher.value
      this.dirty = true
    } else if (this.sync) {
      // 同步执行时会走这
      // 比如 this.$watch() 或者 watch 选项时传递 sync 配置
      // 比如 { sync: true } 让其同步执行，不走异步更新队列
      this.run()
    } else {
      // 将当前 watcher 放入 watcher 队列，一般都是走这个分支
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
          // 用户定义的 watcher 最终会在监听到值更新时走到这里调用 callback
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(this.cb, this.vm, [value, oldValue], this.vm, info)
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  /* 懒执行的 watcher 会调用此方法，比如 computed
      this.get() 会调用传入的 expOrFn，目的是获取一下值
      使这个响应式的值添加当前 watcher 到 dep 依赖中
      然后置 dirty 为 false，目的是当页面用到了多个一样的计算属性中，
      那么本次渲染时，只有第一个计算属性会去调用 get
   */ 

  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
    console.log('watcher.depend', this.deps);
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
