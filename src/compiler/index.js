/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
/**
 * 
 */
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 执行 baseCompile 之前的所有事情，只有一个目的，就是构造最终的编译配置

  // 核心
  // 整体渲染流程：
  //   1.模板编译阶段：将一堆模板字符串用正则等方式解析成 AST 语法树
  //   2.优化阶段：遍历 AST，找出其中的静态节点，并打上标记 
  //   3.代码生成阶段：将 AST 语法树转换成 render 渲染函数
  // 解析，将 html 模板字符串解析为 ast 对象
  const ast = parse(template.trim(), options)
  // 优化，遍历 ast，标记静态节点和静态根节点
  if (options.optimize !== false) {
    optimize(ast, options)
  }
  // 代码生成，将 ast 转换成可执行的 render 函数的字符串形式
  const code = generate(ast, options)
  return {
    ast,
    render: code.render, // 动态渲染函数
    staticRenderFns: code.staticRenderFns // 静态渲染函数
  }
})
