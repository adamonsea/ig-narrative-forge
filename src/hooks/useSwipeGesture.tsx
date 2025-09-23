import { useState, useRef, useCallback, useEffect } from 'react';

interface SwipeConfig {
  threshold?: number; // minimum distance to trigger swipe (default: 30% of container width)
  velocityThreshold?: number; // minimum velocity to trigger swipe (px/ms)
  maxDuration?: number; // maximum animation duration (ms)
  minDuration?: number; // minimum animation duration (ms)
  enableRubberBand?: boolean; // enable rubber band effect at boundaries
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  canSwipeLeft?: boolean;
  canSwipeRight?: boolean;
}

interface SpringConfig {
  tension: number;
  friction: number;
  mass: number;
}

const defaultSpringConfig: SpringConfig = {
  tension: 300,
  friction: 30,
  mass: 1,
};

export const useSwipeGesture = (config: SwipeConfig = {}) => {
  const {
    threshold = 0.3,
    velocityThreshold = 0.3,
    maxDuration = 400,
    minDuration = 200,
    enableRubberBand = true,
    onSwipeLeft,
    onSwipeRight,
    canSwipeLeft = true,
    canSwipeRight = true,
  } = config;

  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const velocityRef = useRef(0);
  const lastMoveTimeRef = useRef(0);
  const animationRef = useRef<number | undefined>(undefined);

  // Spring animation function
  const animateSpring = useCallback((
    from: number,
    to: number,
    springConfig: SpringConfig = defaultSpringConfig,
    onUpdate: (value: number) => void,
    onComplete?: () => void
  ) => {
    let startTime: number;
    let position = from;
    let velocity = velocityRef.current * 0.5; // Use 50% of gesture velocity as initial spring velocity

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;

      // Spring physics calculation
      const displacement = to - position;
      const springForce = -springConfig.tension * displacement;
      const dampingForce = -springConfig.friction * velocity;
      const acceleration = (springForce + dampingForce) / springConfig.mass;

      velocity += acceleration * 0.016; // 60fps timestep
      position += velocity * 0.016;

      onUpdate(position);

      // Check if we're close enough to the target and velocity is low
      const isCloseEnough = Math.abs(displacement) < 0.5;
      const isSlowEnough = Math.abs(velocity) < 0.5;

      if (isCloseEnough && isSlowEnough) {
        onUpdate(to);
        if (onComplete) onComplete();
        return;
      }

      // Safety timeout
      if (elapsed > maxDuration) {
        onUpdate(to);
        if (onComplete) onComplete();
        return;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [maxDuration]);

  // Calculate rubber band resistance
  const applyRubberBand = useCallback((offset: number, containerWidth: number) => {
    if (!enableRubberBand) return offset;

    const maxRubberBand = containerWidth * 0.3; // 30% of container width
    const resistance = 3; // Higher = more resistance

    if (offset > 0 && !canSwipeRight) {
      // Resist right swipe when can't swipe right
      return Math.sign(offset) * Math.min(Math.abs(offset) / resistance, maxRubberBand);
    } else if (offset < 0 && !canSwipeLeft) {
      // Resist left swipe when can't swipe left
      return Math.sign(offset) * Math.min(Math.abs(offset) / resistance, maxRubberBand);
    }

    return offset;
  }, [enableRubberBand, canSwipeLeft, canSwipeRight]);

  const handleTouchStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (isAnimating) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    touchStartRef.current = { 
      x: clientX, 
      y: clientY, 
      time: Date.now() 
    };
    
    setIsDragging(true);
    velocityRef.current = 0;
    lastMoveTimeRef.current = Date.now();

    // Add haptic feedback for mobile
    if ('vibrate' in navigator && 'touches' in e) {
      (navigator as any).vibrate(1);
    }
  }, [isAnimating]);

  const handleTouchMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    e.preventDefault(); // Prevent scrolling

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const deltaX = clientX - touchStartRef.current.x;
    const deltaY = clientY - touchStartRef.current.y;
    
    // Only process horizontal swipes (ignore if too vertical)
    if (Math.abs(deltaY) > Math.abs(deltaX) * 2) return;

    const containerWidth = containerRef.current.offsetWidth;
    const currentTime = Date.now();
    const timeDelta = currentTime - lastMoveTimeRef.current;
    
    // Calculate velocity (px/ms)
    if (timeDelta > 0) {
      velocityRef.current = deltaX / timeDelta;
    }
    
    lastMoveTimeRef.current = currentTime;
    
    // Apply rubber band effect
    const adjustedOffset = applyRubberBand(deltaX, containerWidth);
    setOffset(adjustedOffset);
  }, [isDragging, applyRubberBand]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging || !containerRef.current) return;

    setIsDragging(false);
    setIsAnimating(true);

    const containerWidth = containerRef.current.offsetWidth;
    const thresholdDistance = containerWidth * threshold;
    const absOffset = Math.abs(offset);
    const absVelocity = Math.abs(velocityRef.current);

    // Determine if swipe should trigger action
    const shouldSwipe = absOffset > thresholdDistance || absVelocity > velocityThreshold;
    const isLeftSwipe = offset < 0;
    const isRightSwipe = offset > 0;

    let targetOffset = 0;
    let triggerAction = false;

    if (shouldSwipe) {
      if (isLeftSwipe && canSwipeLeft) {
        targetOffset = -containerWidth;
        triggerAction = true;
      } else if (isRightSwipe && canSwipeRight) {
        targetOffset = containerWidth;
        triggerAction = true;
      }
    }

    // Calculate animation duration based on distance and velocity
    const distance = Math.abs(targetOffset - offset);
    const baseTime = distance / Math.max(absVelocity * 100, 100);
    const duration = Math.max(minDuration, Math.min(maxDuration, baseTime));

    // Animate to target position
    animateSpring(
      offset,
      targetOffset,
      defaultSpringConfig,
      (value) => setOffset(value),
      () => {
        setIsAnimating(false);
        setOffset(0);
        
        if (triggerAction) {
          if (isLeftSwipe && onSwipeLeft) {
            onSwipeLeft();
          } else if (isRightSwipe && onSwipeRight) {
            onSwipeRight();
          }
        }
      }
    );
  }, [isDragging, offset, threshold, velocityThreshold, canSwipeLeft, canSwipeRight, onSwipeLeft, onSwipeRight, animateSpring, minDuration, maxDuration]);

  // Mouse event handlers for desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    handleTouchStart(e);
  }, [handleTouchStart]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    handleTouchMove(e);
  }, [handleTouchMove]);

  const handleMouseUp = useCallback(() => {
    handleTouchEnd();
  }, [handleTouchEnd]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return {
    containerRef,
    offset,
    isDragging,
    isAnimating,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onMouseDown: handleMouseDown,
      onMouseMove: isDragging ? handleMouseMove : undefined,
      onMouseUp: isDragging ? handleMouseUp : undefined,
      onMouseLeave: isDragging ? handleMouseUp : undefined,
    },
    // Utility function to get transform style
    getTransformStyle: () => ({
      transform: `translate3d(${offset}px, 0, 0)`,
      willChange: isDragging || isAnimating ? 'transform' : 'auto',
    }),
  };
};