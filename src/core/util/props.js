/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
};

// 检验父组件传入的 props 值匹配子组件中定义的 props
/**
 * 
 * @param {*} key 遍历 propOptions 拿到的每个属性名
 * @param {*} propOptions 当前实例规范化后的 props 选项 
 * @param {*} propsData  父组件传入的真实 props 数据
 * @param {*} vm 当前实例
 * @returns 
 */
export function validateProp (
  key: string,
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {
  const prop = propOptions[key] // 当前 key 对应的 propsOptions[key] 的值
  const absent = !hasOwn(propsData, key) // 当前 key 是否在 propsData 中存在，即父组件那边是否传入了对应的 props 
  let value = propsData[key] // 获取父组件传入的 props 属性值
  // getTypeIndex 用来判断 prop 的 type 中是否存在某种属性
  // 这里传入了 Boolean，就是用来判断是否有 Boolean，如果没有 booleanIndex = -1
  const booleanIndex = getTypeIndex(Boolean, prop.type)
  // 判断 prop 的 type 是否是 boolean
  if (booleanIndex > -1) {
    if (absent && !hasOwn(prop, 'default')) {
      // 当父组件未传入对应 props 且 配置中未填写默认值时，直接让值为 false
      value = false
    } else if (value === '' || value === hyphenate(key)) {
      // 当传入值为空字符串或属性值和属性名相等走这里
      const stringIndex = getTypeIndex(String, prop.type)
      // 满足以下任一条件，值就·为 true：
      //    1. 子组件 prop 选项中未定义 type:String
      //    2. 定义了多 type，但 boolean 在 string 之前，例如：type: [Boolean, String]
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true
      }
    }
  }
  // 如果不是 boolean 类型并且父组件中未传入值
  if (value === undefined) {
    // 拿到默认值并赋值给 value
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.
    // 并对 value 做响应式处理
    const prevShouldObserve = shouldObserve
    toggleObserving(true)
    observe(value)
    toggleObserving(prevShouldObserve)
  }

  // 若父组件传入了值
  // 那么通过 assertProp 判断该属性值是否与要求的类型相匹配
  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    !(__WEEX__ && isObject(value) && ('@binding' in value))
  ) {
    assertProp(prop, key, value, vm, absent)
  }

  // 将值返回
  return value
}

/**
 * 
 * @param {*} vm 当前实例
 * @param {*} prop 子组件 props 选项中每个 key 的值
 * @param {*} key 子组件 props 选项中的每个 key
 * @returns 
 */
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // 如果没有指定 default 直接返回 undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default
  // warn against non-factory defaults for Object & Array
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  if (vm && vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }
  // 到这一步，就判断如果 default 是函数 且 配置的 type 不是函数的话，那就说明这个函数是工厂函数，是用来返回别的类型的，将这个类型作为默认值返回
  // 如果 default 不是函数，就直接返回 default 的值
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * 验证父组件传入的 prop 值是否是子组件定义的 type 类型
 * @param {*} prop 
 * @param {*} name props中prop选项的key
 * @param {*} value 父组件传入的propsData中key对应的真实数据
 * @param {*} vm 
 * @param {*} absent 
 * @returns 
 */
function assertProp (
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  if (prop.required && absent) {
    warn(
      'Missing required prop: "' + name + '"',
      vm
    )
    return
  }
  if (value == null && !prop.required) {
    return
  }
  let type = prop.type
  let valid = !type || type === true
  const expectedTypes = []
  if (type) {
    if (!Array.isArray(type)) {
      // 对 type 做统一标准处理吗，转换成数组
      type = [type]
    }
    // 这里的 !valid 很奇妙，它表示如果 valid 是 true 那么直接跳出
    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i], vm)
      /* 
      {
        vaild:true,       // 表示是否校验成功
        expectedType：'Boolean'   // 表示被校验的类型
      }
       */
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }

  // 接下来就是对各种异常的警告抛出
  const haveExpectedTypes = expectedTypes.some(t => t)
  if (!valid && haveExpectedTypes) {
    warn(
      getInvalidTypeMessage(name, value, expectedTypes),
      vm
    )
    return
  }
  const validator = prop.validator
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol|BigInt)$/

function assertType (value: any, type: Function, vm: ?Component): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  const expectedType = getType(type)
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)
  } else {
    try {
      valid = value instanceof type
    } catch (e) {
      warn('Invalid prop type: "' + String(type) + '" is not a constructor', vm);
      valid = false;
    }
  }
  return {
    valid,
    expectedType
  }
}

const functionTypeCheckRE = /^\s*function (\w+)/

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
function getType (fn) {
  const match = fn && fn.toString().match(functionTypeCheckRE)
  return match ? match[1] : ''
}

function isSameType (a, b) {
  return getType(a) === getType(b)
}

function getTypeIndex (type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage (name, value, expectedTypes) {
  let message = `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  // check if we need to specify expected value
  if (
    expectedTypes.length === 1 &&
    isExplicable(expectedType) &&
    isExplicable(typeof value) &&
    !isBoolean(expectedType, receivedType)
  ) {
    message += ` with value ${styleValue(value, expectedType)}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${styleValue(value, receivedType)}.`
  }
  return message
}

function styleValue (value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

const EXPLICABLE_TYPES = ['string', 'number', 'boolean']
function isExplicable (value) {
  return EXPLICABLE_TYPES.some(elem => value.toLowerCase() === elem)
}

function isBoolean (...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
