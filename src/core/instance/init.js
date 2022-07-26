/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  // 整个初始化过程都在这个函数中
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid
    vm._uid = uid++

    // 性能度量，阅读可忽略
    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // 处理组件配置项
    // merge options
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      // 若是子组件，走这：
      //    目的：性能优化，打平配置到 vm.$options，减少运行时的动态查找，提高执行效率
      initInternalComponent(vm, options)
    } else {
      // 若是根组件，走这：选项合并，把全局配置选项合并到根组件的局部配置上
      /*
        那么这个地方只是根组件的选项合并，那子组件呢？
        其实组件选项合并，总共发生在三个地方：
          1. Vue.component 自定义全局注册，将 Vue 内置组件例如 keep-alive 和用户自定义全局注册的组件 一起合并到了全局的 components 选项上
          2. { components: { xxx } } 局部注册组件，执行编译器生成的 render 函数时做了选项合并，会合并全局配置项到组件局部配置项上
          3. 第三步就是以下的根组件情况了
       */
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor), // parent: Vue构造函数本身的 options
        options || {}, // child: 外部传入的 options
        vm
      )
    }

    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm


    // 下面的很重要，整个初始化最重要的部分，也是核心

    // 组件关系属性的初始化，比如：$parent $root $children $refs
    initLifecycle(vm)
    // 初始化自定义事件
    // 组件上事件的监听其实是子组件自己在监听，也就是说谁触发谁监听
    // 将 <comp @click="handleClick"></comp> 上的事件通过里边的 updateListeners 转换成如下形式
    // this.$emit('click') 编译成 this.$on('click', function handleClick() {})
    initEvents(vm)
    // 初始化插槽，获取 this.$slots，定义this._c,即 createElement 方法，平时的使用的 h 函数
    initRender(vm)
    // 执行 beforeCreate 生命周期函数
    callHook(vm, 'beforeCreate')
    // 初始化 inject 选项
    initInjections(vm) // resolve injections before data/props

    // 响应式原理的核心，处理 props methods data computed watch 等选项
    initState(vm)
    // 处理 provide 选项，挂载到 vm._provided 上面
    // 其实 provide/inject 依赖注入主要就是靠子组件 inject 去找祖代组件定义的 provide
    initProvide(vm) // resolve provide after data/props
    // 执行 created 生命周期钩子函数
    callHook(vm, 'created')

    // 性能度量结束
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // 如果存在 el 选项，会自动执行 $mount
    // 相反如果不存在 el，就会像项目中 main.js 中那样去手动 mount
    if (vm.$options.el) {
      // $mount 每个平台都有不同的实现方法，比如在完整版的在 src/platforms/web/entry-runtime-with-compiler.js 而 运行时的在 src/platforms/web/runtime/index.js
      // 运行+编译的完整版的 $mount 会先解析模板再进行挂载（运行时 $mount）
      // beforeMount beforeUpdate mounted 就是在运行时的 $mount 中的 mountComponent 函数中
      vm.$mount(vm.$options.el)
    }
  }
}

// 性能优化，打平配置对象上的属性到 vm.$options，减少运行时的动态查找，提高执行效率
export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // vm.constructor 上的 options 是 initGlobalAPI这个函数中定义上去的
  // 基于构造函数上的配置对象创建 vm.$options
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  // 打平options对象（将父节点的属性和 options 的属性放到 vm.$options 中）
  // 这么做是为了减少运行时的多层的查找，提高执行效率
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  // 若有render函数，将其赋值到vm.$options
  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

// 主要解析构造函数的options
export function resolveConstructorOptions (Ctor: Class<Component>) {
  // 从vm构造函数上获取选项
  let options = Ctor.options
  if (Ctor.super) {
    // 如果有基类 递归获取到基类的选项
    const superOptions = resolveConstructorOptions(Ctor.super)
    // 缓存基类的选项
    const cachedSuperOptions = Ctor.superOptions
    // 查看基类options和缓存的是否一致
    if (superOptions !== cachedSuperOptions) {
      // 若走这里，说明基类的配置项发生了更改
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      // 找到更改的选项
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        // 将更改的选项和构造函数的 extendOptions 进行合并
        extend(Ctor.extendOptions, modifiedOptions)
      }
      // 将新的选项赋值给 options
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
