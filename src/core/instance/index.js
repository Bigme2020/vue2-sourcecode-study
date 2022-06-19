import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue (options) {
  // 开发环境下的提示
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // Vue
  this._init(options)
}

initMixin(Vue)
/**
 * $data $props $set $delete $watch 初始化
 */
stateMixin(Vue)
/**
 * $on $once $off $emit 初始化
 */
eventsMixin(Vue)
/**
 * _update $forceUpdate $destroy 初始化
 */
lifecycleMixin(Vue)
/**
 * rederHelper $nextTick _render 初始化
 */
renderMixin(Vue)

export default Vue
