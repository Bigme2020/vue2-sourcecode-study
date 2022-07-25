/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 */
function resetSchedulerState() {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue() {
  currentFlushTimestamp = getNow()
  // flushing 置为 true，表示现在的 watcher 队列正在被刷新
  flushing = true
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 1. 保证父组件在子组件之前执行
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 2. 用户 watcher 先于渲染 watcher 去执行
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  // 3. 如果父组件执行时，子组件被销毁了，可以跳过这个子组件的 watcher 
  // 父组件 watcher id 比子组件大
  queue.sort((a, b) => a.id - b.id)

  // do not cache length because more watchers might be pushed
  // as we run existing watchers

  // 遍历，依次执行 watcher 的 run 方法
  // 这里为什么采用动态计算 queue.length 呢
  // 因为可能在 flush 的时候又有 watcher 进来了
  for (index = 0; index < queue.length; index++) {
    // 拿出当前索引的 watcher
    watcher = queue[index]
    // 先执行 before 钩子
    if (watcher.before) {
      // before 是 watcher 的可选配置
      watcher.before()
    }
    // 清空缓存，表示当前 watcher 已经被执行，当该 watcher 再次入队时就可以进来了
    id = watcher.id
    has[id] = null
    // 最主要的一步：执行 watcher.run
    console.log('run', watcher);
    watcher.run()
    // in dev build, check and stop circular updates.
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  // 这里边将 waiting 和 flushing 置为 false
  resetSchedulerState()

  // call component updated and activated hooks
  callActivatedHooks(activatedQueue)
  callUpdatedHooks(updatedQueue) // updated

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

/**
 * 调用 updated 钩子函数
 */
function callUpdatedHooks(queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated') // 调用 updated 钩子函数
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent(vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks(queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
/**
 * 1.先把 watcher 推入到 queue 中（若不在 flushing，直接推入；若正在 flushing，从小到大顺序推入）
 * 2.在一般简单场景比如有个 watch 监听，那么值被改变的话 queue 就会连续推入两个
 *   但推入第一个后，会执行到下面的 nextTick(flushSchedulerQueue)
 *   重点来了：这里的 nextTick(flushSchedulerQueue) 它并不会立即执行，因为它是异步微任务！
 *           只有在当前的同步代码都执行完后才会去执行 flushSchedulerQueue
 *           当前的同步代码就是值被改变后触发了 dep.notify => 每个 watcher.update => 每个都 queueWatcher
 *           从第二个 queueWatcher 开始后就不会再走 nextTick(flushSchedulerQueue) 了，因为已经有了，不允许有第二个
 *           所以到最后执行到 flushSchedulerQueue 的时候，所有监听值变化的 watcher 都在 queue 中等待被 flushSchedulerQueue
 */
export function queueWatcher(watcher: Watcher) {
  const id = watcher.id
  // 判重，watcher 不会重复入队
  // 在一个组件的渲染周期内，若一个响应式数据被多次更新，watcher 不会重复入队
  if (has[id] == null) {
    // 置为 true 表示该 watcher 已入队
    has[id] = true
    if (!flushing) {
      // 如果 flushing = false，表示当前 watcher 队列没有在被刷新，watcher 直接入队
      // 定义 computed 后最终会引导 render watcher 走到这里
      console.log('queue.push');
      queue.push(watcher)
    } else {
      console.log('queue.splice');
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      // 在刷新中,根据 watcher id 由小到大进行有序排列，保证 watcher 入队后，刷新中的 watcher 队列仍然时有序的
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    if (!waiting) {
      // waiting = false 走这里
      // waiting 能保证当前浏览器的异步任务队列中至多只有一个 flushSchedulerQueue
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        // 同步执行，直接去刷新 watcher 队列
        // 性能就会大打折扣
        // 这里也是兼容 SSR，SSR 需要同步执行
        flushSchedulerQueue()
        return
      }
      /**
       * 熟悉的 nextTick => vm.$nextTick、Vue.nextTick
       *    1. 将用户传入回调函数或 flushSchedulerQueue 放入 callbacks 数组
       *    2. 通过 pending 异步所控制 向浏览器任务队列中添加 flushCallbacks 函数
       */
      console.log('queueWatcher');
      nextTick(flushSchedulerQueue) // 微任务，等待当前事件循环下的所有同步代码都执行完后再执行
    }
    else {
      console.log('waiting = true', 'watcher = ', watcher);
      for (let i = 0; i< queue.length;i++) {
        console.log('queue = ', queue[i]);
      }
    }
  }
}
