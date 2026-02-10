/**
 * @Author wei
 * @Date 2026-02-10
 * @Description Combobox 组件，支持下拉选择和手动输入
 **/

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  /** 当前值 */
  value: string;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 可选项列表 */
  options: ComboboxOption[];
  /** 占位文本 */
  placeholder?: string;
  /** 自定义类名 */
  className?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * Combobox 组件
 * 同时支持下拉选择和手动输入
 */
const Combobox = React.forwardRef<HTMLDivElement, ComboboxProps>(
  ({ value, onChange, options, placeholder = "选择或输入...", className, disabled }, _ref) => {
    // 下拉列表是否展开
    const [isOpen, setIsOpen] = React.useState(false);
    // 输入框的引用
    const inputRef = React.useRef<HTMLInputElement>(null);
    // 容器的引用
    const containerRef = React.useRef<HTMLDivElement>(null);
    // 过滤后的选项
    const [filteredOptions, setFilteredOptions] = React.useState<ComboboxOption[]>(options);

    // 当 options 变化时更新过滤列表
    React.useEffect(() => {
      setFilteredOptions(options);
    }, [options]);

    // 处理输入变化
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      // 直接使用输入值作为新值（允许用户手动输入任意模型名称）
      onChange(inputValue);

      // 过滤选项
      if (inputValue.trim()) {
        const filtered = options.filter(opt =>
          opt.label.toLowerCase().includes(inputValue.toLowerCase()) ||
          opt.value.toLowerCase().includes(inputValue.toLowerCase())
        );
        setFilteredOptions(filtered);
      } else {
        setFilteredOptions(options);
      }

      // 有输入时展开下拉列表
      setIsOpen(true);
    };

    // 处理选项选择
    const handleSelect = (optionValue: string) => {
      onChange(optionValue);
      setIsOpen(false);
      inputRef.current?.focus();
    };

    // 处理点击外部关闭
    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, []);

    // 处理键盘事件
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      } else if (e.key === 'Enter' && isOpen && filteredOptions.length > 0) {
        e.preventDefault();
        // 如果当前输入值与某个选项完全匹配，不做处理
        const exactMatch = filteredOptions.find(opt => opt.value === value);
        if (!exactMatch && filteredOptions.length > 0) {
          handleSelect(filteredOptions[0].value);
        } else {
          setIsOpen(false);
        }
      }
    };

    // 获取当前显示值（如果值在选项中，显示标签；否则显示原始值）
    const displayValue = React.useMemo(() => {
      const matched = options.find(opt => opt.value === value);
      return matched ? matched.label : value;
    }, [options, value]);

    return (
      <div ref={containerRef} className={cn("relative", className)}>
        {/* 输入框 */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={displayValue}
            onChange={handleInputChange}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm ring-offset-background",
              "placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          />
          {/* 下拉箭头按钮 */}
          <button
            type="button"
            onClick={() => {
              if (!disabled) {
                setIsOpen(!isOpen);
                inputRef.current?.focus();
              }
            }}
            disabled={disabled}
            className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 opacity-50 transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </button>
        </div>

        {/* 下拉列表 */}
        {isOpen && filteredOptions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-md">
            <ul className="max-h-60 overflow-auto py-1">
              {filteredOptions.map((option) => (
                <li
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                    option.value === value && "bg-accent text-accent-foreground"
                  )}
                >
                  {option.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 无匹配选项时显示提示 */}
        {isOpen && filteredOptions.length === 0 && value.trim() && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-md">
            <div className="px-3 py-2 text-sm text-muted-foreground">
              将使用自定义模型: <span className="font-medium text-foreground">{value}</span>
            </div>
          </div>
        )}
      </div>
    );
  }
);

Combobox.displayName = "Combobox";

export { Combobox };
