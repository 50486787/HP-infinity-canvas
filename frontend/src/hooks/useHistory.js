/**
 * src/hooks/useHistory.js
 */
import { useState, useRef, useCallback } from 'react';

export const useHistory = (initialState) => {
  const historyRef = useRef([initialState]); // 历史栈
  const pointerRef = useRef(0); // 当前指针
  const [, forceUpdate] = useState({}); // 强制渲染触发器

  // 记录快照
  const takeSnapshot = useCallback((newState) => {
    const currentPointer = pointerRef.current;
    const stack = historyRef.current;
    
    // 丢弃指针之后的历史 (Branching)
    const newStack = stack.slice(0, currentPointer + 1);
    
    // 深拷贝存入 (注意：如果 state 包含 Blob URL 是安全的，string 可以 stringify)
    // 但如果包含纯 Blob 对象，JSON.stringify 会丢失，需要注意 state 里最好只存 URL
    newStack.push(JSON.parse(JSON.stringify(newState)));

    // 限制栈大小 (比如 50 步)
    if (newStack.length > 50) {
      newStack.shift();
      pointerRef.current = newStack.length - 1;
    } else {
      pointerRef.current += 1;
    }
    
    historyRef.current = newStack;
    forceUpdate({});
  }, []);

  const undo = useCallback(() => {
    if (pointerRef.current > 0) {
      pointerRef.current -= 1;
      forceUpdate({});
      return JSON.parse(JSON.stringify(historyRef.current[pointerRef.current]));
    }
    return null;
  }, []);

  const redo = useCallback(() => {
    if (pointerRef.current < historyRef.current.length - 1) {
      pointerRef.current += 1;
      forceUpdate({});
      return JSON.parse(JSON.stringify(historyRef.current[pointerRef.current]));
    }
    return null;
  }, []);

  return {
    takeSnapshot,
    undo,
    redo,
    canUndo: pointerRef.current > 0,
    canRedo: pointerRef.current < historyRef.current.length - 1
  };
};