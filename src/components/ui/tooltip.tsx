/**
 * @Author wei
 * @Date 2026-02-07
 * @Description Tooltip 组件，用于显示提示信息
 **/

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  /** 提示内容 */
  content: React.ReactNode;
  /** 子元素 */
  children: React.ReactNode;
  /** 位置 */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** 自定义类名 */
  className?: string;
}

/**
 * Tooltip 组件
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'bottom',
  className,
}) => {
  const [visible, setVisible] = React.useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={cn(
            'absolute z-50 px-2 py-1.5 text-xs rounded-md whitespace-nowrap',
            'bg-popover text-popover-foreground border shadow-md',
            positionClasses[position],
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
};
