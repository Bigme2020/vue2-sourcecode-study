/* @flow */
/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

// 回调队列
const callbacks = []
// 异步锁
let pending = false

/* 
  1. 将 pending = false，表示下一个 flushCallbacks 函数可以进入异步队列了
  2. 浅拷贝 callbacks 数组
  3. 执行浅拷贝数组中的所有函数
      flushSchedulerQueue
      用户自己调用 this.$nextTick 传递的回调函数
  4. 清空 callbacks 数组
 */
function flushCallbacks () {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).
let timerFunc

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:
/* istanbul ignore next, $flow-disable-line */
// 将 flushCallbacks 放入异步微任务队列
// 顺序：Promise > MutationObserver > setImmediate > setTimeout
// 宏任务耗费的时间是大于微任务的，所以在浏览器支持的情况下，优先使用微任务。
// 如果浏览器不支持微任务，使用宏任务
// 但是，各种宏任务之间也有效率的不同，需要根据浏览器的支持情况，使用不同的宏任务。
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    // 在一些场景中，Promise.then不会完全失效，但也会出现奇怪的情况，比如回调被推入到了
    // 微任务队列中后，浏览器不会去执行微任务队列直到处理了计时器，所以我们可以通过添加空计时器“强制”清空微任务队列
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (!isIE && typeof MutationObserver !== 'undefined' && (
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// 接受两个参数，回调函数和上下文
export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  // 这里为什么要包一层 try catch 不是为内部方法准备的
  // 而是为用户传入的方法准备的，用户传入的回调函数可能报错
  // 然后将 包装好的函数 放到 callbacks 数组中
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  if (!pending) {
    // pending = false时，执行 timerFunc 方法
    // 这里的 pending = true 保证了浏览器的异步队列中只会有一个 flushCallbacks 函数
    pending = true
    // 将 flushCallbacks 放入到异步队列中
    // 即异步执行每个 callback 回调函数，此回调即更新
    timerFunc()
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
