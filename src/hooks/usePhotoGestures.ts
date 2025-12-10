import { useRef, useCallback } from 'react';
import { PanInfo } from 'framer-motion';
import { triggerHaptic, getDevicePerformanceTier } from '@/lib/deviceUtils';

export interface GestureCallbacks {
  onTap: () => void;
  onLongPress: () => void;
  onDoubleTap: () => void;
  onFlick: (velocityX: number, velocityY: number) => void;
  onDragStart: () => void;
  onDragEnd: (x: number, y: number) => void;
}

interface GestureState {
  isDragging: boolean;
  isHolding: boolean;
  lastTapTime: number;
}

export function usePhotoGestures(callbacks: GestureCallbacks) {
  const deviceTier = getDevicePerformanceTier();
  const isLegacyDevice = deviceTier.includes('legacy') || deviceTier.includes('old');
  
  const state = useRef<GestureState>({
    isDragging: false,
    isHolding: false,
    lastTapTime: 0
  });
  
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  
  // Velocity thresholds - lower on legacy devices
  const FLICK_VELOCITY = isLegacyDevice ? 1500 : 1000;
  const DOUBLE_TAP_THRESHOLD = 300; // ms
  const LONG_PRESS_DURATION = 500; // ms
  const TAP_DISTANCE_THRESHOLD = 10; // px

  const clearPressTimer = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const handlePanStart = useCallback((event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    state.current.isDragging = true;
    dragStartPos.current = { x: info.point.x, y: info.point.y };
    
    // Start long press timer
    pressTimer.current = setTimeout(() => {
      state.current.isHolding = true;
      if (!isLegacyDevice) {
        triggerHaptic('medium');
      }
      callbacks.onLongPress();
    }, LONG_PRESS_DURATION);
    
    callbacks.onDragStart();
  }, [callbacks, isLegacyDevice]);

  const handlePanEnd = useCallback((event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    clearPressTimer();
    state.current.isDragging = false;
    
    const dx = Math.abs(info.point.x - dragStartPos.current.x);
    const dy = Math.abs(info.point.y - dragStartPos.current.y);
    const movedDistance = Math.sqrt(dx * dx + dy * dy);
    
    // Check for flick gesture (high velocity throw)
    const velocity = Math.sqrt(info.velocity.x ** 2 + info.velocity.y ** 2);
    
    if (!isLegacyDevice && velocity > FLICK_VELOCITY) {
      // Flick gesture - throw card off screen
      if (!isLegacyDevice) {
        triggerHaptic('light');
      }
      callbacks.onFlick(info.velocity.x, info.velocity.y);
      return;
    }
    
    // Check for tap (minimal movement)
    if (movedDistance < TAP_DISTANCE_THRESHOLD) {
      const now = Date.now();
      const timeSinceLastTap = now - state.current.lastTapTime;
      
      if (timeSinceLastTap < DOUBLE_TAP_THRESHOLD) {
        // Double tap detected
        state.current.lastTapTime = 0;
        callbacks.onDoubleTap();
        return;
      }
      
      state.current.lastTapTime = now;
      
      // Delay tap to check for double tap
      setTimeout(() => {
        if (Date.now() - state.current.lastTapTime >= DOUBLE_TAP_THRESHOLD - 50) {
          callbacks.onTap();
        }
      }, DOUBLE_TAP_THRESHOLD);
      return;
    }
    
    // Normal drag end
    callbacks.onDragEnd(info.point.x, info.point.y);
    
    // Reset holding state
    if (state.current.isHolding) {
      state.current.isHolding = false;
    }
  }, [callbacks, clearPressTimer, isLegacyDevice]);

  const handlePan = useCallback(() => {
    // Any pan movement cancels long press
    if (pressTimer.current) {
      clearPressTimer();
    }
  }, [clearPressTimer]);

  return {
    handlers: {
      onPanStart: handlePanStart,
      onPanEnd: handlePanEnd,
      onPan: handlePan,
    },
    state: state.current,
    isLegacyDevice
  };
}
