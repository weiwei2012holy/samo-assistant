/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 样式工具函数，用于合并 Tailwind CSS 类名
 **/

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 合并 CSS 类名，支持条件类名和 Tailwind CSS 类名冲突处理
 * @param inputs - 要合并的类名
 * @returns 合并后的类名字符串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
