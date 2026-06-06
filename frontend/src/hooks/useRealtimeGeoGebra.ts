import { useState, useCallback, useRef } from 'react';
import type { Step } from '@/types';

/**
 * 从流式内容中提取有效的 GeoGebra 命令
 * 支持增量提取，只返回新解析出的命令
 */
export function useRealtimeGeoGebra() {
  const [commands, setCommands] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [parsedData, setParsedData] = useState<{
    geogebra: string;
    conditions: string[];
    goal: string;
    solution: Step[];
  } | null>(null);
  
  const lastCommandsRef = useRef<string[]>([]);
  const bufferRef = useRef('');

  /**
   * 检查字符串是否是有效的 GeoGebra 命令行
   */
  const isValidCommand = useCallback((line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    
    // 排除 JSON 相关的行
    if (trimmed.startsWith('{') || trimmed.startsWith('}')) return false;
    if (trimmed.startsWith('"geogebra"') || trimmed.startsWith('"conditions"')) return false;
    if (trimmed.startsWith('"goal"') || trimmed.startsWith('"solution"')) return false;
    if (trimmed.startsWith('[') || trimmed === ']') return false;
    if (trimmed === '"' || trimmed === '",') return false;
    
    // 必须是赋值语句或函数调用格式
    // 例如: A = (0, 0), s = Segment(A, B), SetColor(A, "Red"), α = Angle(A, B, C)
    const commandPattern = /^[\p{L}_][\p{L}\p{N}_]{0,99}\s*=\s*\S.*|^[\p{L}_][\p{L}\p{N}_]{0,99}\s*\(/u;
    return commandPattern.test(trimmed);
  }, []);

  /**
   * 从内容中提取 GeoGebra 命令
   */
  const extractCommands = useCallback((content: string): string[] => {
    const lines = content.split('\n');
    const validCommands: string[] = [];
    
    for (const line of lines) {
      if (isValidCommand(line)) {
        // 清理行尾的逗号
        const cleaned = line.trim().replace(/,$/, '');
        if (cleaned) {
          validCommands.push(cleaned);
        }
      }
    }
    
    return validCommands;
  }, [isValidCommand]);

  /**
   * 尝试解析完整的 JSON 数据
   */
  const tryParseJson = useCallback((content: string) => {
    try {
      // 尝试找到 JSON 部分
      let jsonStr = content;
      
      // 如果内容包含 markdown 代码块，提取其中的 JSON
      const codeBlockMatch = content.match(/```json\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }
      
      // 尝试解析
      const parsed = JSON.parse(jsonStr);
      
      if (parsed.geogebra && typeof parsed.geogebra === 'string') {
        // 统一为 Step[]，兼容旧数据字符串数组
        const rawSolution = parsed.solution || [];
        const normalizedSolution: Step[] = Array.isArray(rawSolution)
          ? rawSolution.map((item: unknown, index: number) => {
              if (typeof item === 'string') {
                return {
                  text: item,
                  commandIndices: [],
                } satisfies Step;
              }
              if (
                item &&
                typeof item === 'object' &&
                'text' in item &&
                typeof (item as Record<string, unknown>).text === 'string'
              ) {
                const step = item as Record<string, unknown>;
                return {
                  text: step.text as string,
                  commandIndices: Array.isArray(step.commandIndices)
                    ? step.commandIndices.filter((v): v is number => typeof v === 'number')
                    : [],
                  explanation:
                    typeof step.explanation === 'string' ? step.explanation : undefined,
                } satisfies Step;
              }
              return {
                text: `步骤 ${index + 1}`,
                commandIndices: [],
              } satisfies Step;
            })
          : [];

        setParsedData({
          geogebra: parsed.geogebra,
          conditions: parsed.conditions || [],
          goal: parsed.goal || '',
          solution: normalizedSolution,
        });
        setIsComplete(true);
        return true;
      }
    } catch {
      // JSON 解析失败，可能是内容还不完整
    }
    return false;
  }, []);

  /**
   * 处理新的流式内容
   * @returns 本次处理新增的命令数组
   */
  const processStreamContent = useCallback((content: string): string[] => {
    // 更新缓冲区
    bufferRef.current = content;

    // 尝试解析完整 JSON（直接尝试解析，不依赖首尾字符判断）
    tryParseJson(content);

    // 提取命令（只提取新增的部分）
    const allCommands = extractCommands(content);

    // 找出新增的命令（使用内容对比而非索引，避免重复或遗漏）
    const newCommands: string[] = [];
    const prevLen = lastCommandsRef.current.length;
    if (allCommands.length > prevLen) {
      for (let i = prevLen; i < allCommands.length; i++) {
        newCommands.push(allCommands[i]);
      }
    }

    // 如果有新命令，更新状态
    if (newCommands.length > 0) {
      lastCommandsRef.current = allCommands;
      setCommands(prev => [...prev, ...newCommands]);
    }

    return newCommands;
  }, [extractCommands, tryParseJson]);

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    setCommands([]);
    setIsComplete(false);
    setParsedData(null);
    lastCommandsRef.current = [];
    bufferRef.current = '';
  }, []);

  /**
   * 获取当前所有命令的字符串形式
   */
  const getCommandsString = useCallback(() => {
    return commands.join('\n');
  }, [commands]);

  return {
    commands,
    isComplete,
    parsedData,
    processStreamContent,
    reset,
    getCommandsString,
  };
}

export default useRealtimeGeoGebra;
