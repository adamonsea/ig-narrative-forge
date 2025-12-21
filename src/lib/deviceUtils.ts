// Device performance tier detection for iOS and Android optimizations
// Applies graceful degradation based on device capabilities

export type DevicePerformanceTier = 
  | 'modern-ios' 
  | 'mid-range-ios' 
  | 'old-ios' 
  | 'modern-android' 
  | 'mid-range-android' 
  | 'legacy-android' 
  | 'desktop';

interface PerformanceOptimizations {
  shouldUseVirtualWindowing: boolean;
  shouldUseCSSCarousel: boolean;
  shouldAggressivelyLazyLoadImages: boolean;
  shouldReduceMotion: boolean;
}

export interface AnimationPresets {
  dragElastic: number;
  spring: {
    stiffness: number;
    damping: number;
    mass: number;
  };
  dragTransition: {
    power: number;
    timeConstant: number;
  };
  // Device-tier visual complexity
  enablePageCurl: boolean;
  enableDynamicShadows: boolean;
  enableHaptics: boolean;
  // Velocity-responsive thresholds
  swipeVelocityMultiplier: number;
}

/**
 * Detects iOS version from user agent
 */
function getIOSVersion(): number | null {
  const ua = navigator.userAgent;
  const match = ua.match(/OS (\d+)_/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Detects Android version from user agent
 */
function getAndroidVersion(): number | null {
  const ua = navigator.userAgent;
  const match = ua.match(/Android (\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Detects if device is iOS
 */
function isIOSDevice(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/**
 * Detects if device is Android
 */
function isAndroidDevice(): boolean {
  return /Android/.test(navigator.userAgent);
}

/**
 * Estimates device generation based on memory and iOS version
 */
function estimateDeviceGeneration(iosVersion: number): 'modern' | 'mid-range' | 'old' {
  const deviceMemory = (navigator as any).deviceMemory;
  
  // Modern devices: iOS 15+ with good memory (iPhone 13+)
  if (iosVersion >= 15 && deviceMemory && deviceMemory >= 4) {
    return 'modern';
  }
  
  // Mid-range devices: iOS 14-15 or lower memory (iPhone 12, X/11)
  if (iosVersion >= 14 && iosVersion < 15) {
    return 'mid-range';
  }
  
  // Old devices: iOS 13 or below, or very low memory
  if (iosVersion < 14 || (deviceMemory && deviceMemory < 3)) {
    return 'old';
  }
  
  // Default to mid-range for safety
  return 'mid-range';
}

/**
 * Estimates Android device generation based on version, memory, and hardware concurrency
 * Note: deviceMemory is capped at 8GB in Chrome, and some browsers don't report it at all
 */
function estimateAndroidGeneration(androidVersion: number): 'modern' | 'mid-range' | 'legacy' {
  const deviceMemory = (navigator as any).deviceMemory;
  const hardwareConcurrency = navigator.hardwareConcurrency || 0;
  
  // Debug logging for device classification
  if (import.meta.env.DEV) {
    console.log('[DeviceUtils] Android classification:', {
      androidVersion,
      deviceMemory,
      hardwareConcurrency,
    });
  }
  
  // Legacy: Android 7 or below, or confirmed low memory
  if (androidVersion < 8 || (deviceMemory && deviceMemory < 3)) {
    return 'legacy';
  }
  
  // Mid-range: Android 8-9
  if (androidVersion >= 8 && androidVersion < 10) {
    return 'mid-range';
  }
  
  // Modern Android 10+: Check for high-end signals
  // deviceMemory may be undefined/capped, so use hardwareConcurrency as fallback
  // Pixel 8 Pro has 8+ cores, most modern flagships have 6+ cores
  if (androidVersion >= 10) {
    // If deviceMemory is available and good, it's modern
    if (deviceMemory && deviceMemory >= 4) {
      return 'modern';
    }
    // If no deviceMemory but high core count, assume modern (Pixel 8, etc.)
    if (hardwareConcurrency >= 6) {
      return 'modern';
    }
    // Android 12+ without memory info is likely modern (most legacy devices stuck on older OS)
    if (androidVersion >= 12) {
      return 'modern';
    }
  }
  
  // Default Android 10-11 without clear signals to mid-range for safety
  return 'mid-range';
}

/**
 * Gets the device performance tier
 */
export function getDevicePerformanceTier(): DevicePerformanceTier {
  // Check for iOS
  if (isIOSDevice()) {
    const iosVersion = getIOSVersion();
    
    // Can't detect iOS version, assume mid-range for safety
    if (!iosVersion) {
      return 'mid-range-ios';
    }
    
    const generation = estimateDeviceGeneration(iosVersion);
    
    switch (generation) {
      case 'modern':
        return 'modern-ios';
      case 'mid-range':
        return 'mid-range-ios';
      case 'old':
        return 'old-ios';
    }
  }
  
  // Check for Android
  if (isAndroidDevice()) {
    const androidVersion = getAndroidVersion();
    
    // Can't detect Android version, assume mid-range for safety
    if (!androidVersion) {
      return 'mid-range-android';
    }
    
    const generation = estimateAndroidGeneration(androidVersion);
    
    switch (generation) {
      case 'modern':
        return 'modern-android';
      case 'mid-range':
        return 'mid-range-android';
      case 'legacy':
        return 'legacy-android';
    }
  }
  
  // Desktop or other devices
  return 'desktop';
}

/**
 * Gets recommended optimizations for the current device
 */
export function getDeviceOptimizations(): PerformanceOptimizations {
  const tier = getDevicePerformanceTier();
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  switch (tier) {
    case 'modern-ios':
    case 'modern-android':
      // Modern devices don't need most optimizations
      return {
        shouldUseVirtualWindowing: false,
        shouldUseCSSCarousel: false,
        shouldAggressivelyLazyLoadImages: false,
        shouldReduceMotion: prefersReducedMotion,
      };
      
    case 'mid-range-ios':
    case 'mid-range-android':
      // Mid-range needs some help with memory and rendering
      return {
        shouldUseVirtualWindowing: true,
        shouldUseCSSCarousel: false,
        shouldAggressivelyLazyLoadImages: true,
        shouldReduceMotion: prefersReducedMotion,
      };
      
    case 'old-ios':
    case 'legacy-android':
      // Old/legacy devices need all the help they can get
      return {
        shouldUseVirtualWindowing: true,
        shouldUseCSSCarousel: true,
        shouldAggressivelyLazyLoadImages: true,
        shouldReduceMotion: true, // Always reduce motion
      };
      
    case 'desktop':
      // Desktop devices use default behavior
      return {
        shouldUseVirtualWindowing: false,
        shouldUseCSSCarousel: false,
        shouldAggressivelyLazyLoadImages: false,
        shouldReduceMotion: prefersReducedMotion,
      };
  }
}

/**
 * Gets device-specific animation presets for smooth swiping
 * Tailored to each device's performance capabilities
 */
export function getAnimationPresets(): AnimationPresets {
  const tier = getDevicePerformanceTier();
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // If user prefers reduced motion, use gentlest settings with no visual effects
  if (prefersReducedMotion) {
    return {
      dragElastic: 0.05,
      spring: { stiffness: 180, damping: 30, mass: 1.3 },
      dragTransition: { power: 0.4, timeConstant: 200 },
      enablePageCurl: false,
      enableDynamicShadows: false,
      enableHaptics: false,
      swipeVelocityMultiplier: 0.8,
    };
  }
  
  switch (tier) {
    case 'modern-ios':
      // Modern iOS: high elasticity, light springs for responsive finger-following
      return {
        dragElastic: 0.55,
        spring: { stiffness: 350, damping: 26, mass: 0.65 },
        dragTransition: { power: 0.35, timeConstant: 180 },
        enablePageCurl: true,
        enableDynamicShadows: true,
        enableHaptics: true,
        swipeVelocityMultiplier: 1.4,
      };
      
    case 'modern-android':
      // Modern Android: high elasticity, slightly more damped
      return {
        dragElastic: 0.50,
        spring: { stiffness: 330, damping: 28, mass: 0.68 },
        dragTransition: { power: 0.32, timeConstant: 190 },
        enablePageCurl: true,
        enableDynamicShadows: true,
        enableHaptics: true,
        swipeVelocityMultiplier: 1.4,
      };
      
    case 'mid-range-ios':
    case 'mid-range-android':
      // Mid-range: moderate elasticity, balanced springs
      return {
        dragElastic: 0.35,
        spring: { stiffness: 300, damping: 28, mass: 0.80 },
        dragTransition: { power: 0.28, timeConstant: 200 },
        enablePageCurl: false,
        enableDynamicShadows: false,
        enableHaptics: false,
        swipeVelocityMultiplier: 1.2,
      };
      
    case 'old-ios':
    case 'legacy-android':
      // Old/legacy: conservative settings to prevent jank
      return {
        dragElastic: 0.08,
        spring: { stiffness: 200, damping: 28, mass: 1.2 },
        dragTransition: { power: 0.38, timeConstant: 220 },
        enablePageCurl: false,
        enableDynamicShadows: false,
        enableHaptics: false,
        swipeVelocityMultiplier: 0.8,
      };
      
    case 'desktop':
      // Desktop: good elasticity, smooth feel
      return {
        dragElastic: 0.45,
        spring: { stiffness: 340, damping: 28, mass: 0.85 },
        dragTransition: { power: 0.30, timeConstant: 200 },
        enablePageCurl: true,
        enableDynamicShadows: true,
        enableHaptics: false,
        swipeVelocityMultiplier: 1.0,
      };
  }
}

/**
 * Triggers haptic feedback on supported devices
 */
export function triggerHaptic(type: 'light' | 'medium' | 'heavy' = 'light'): void {
  // Check for iOS-style haptic feedback
  if ('vibrate' in navigator) {
    const duration = type === 'light' ? 10 : type === 'medium' ? 20 : 30;
    navigator.vibrate(duration);
  }
}

/**
 * Hook to get device optimizations (for use in React components)
 */
export function useDeviceOptimizations(): PerformanceOptimizations {
  // Memoize to avoid recalculating on every render
  const [optimizations] = React.useState(() => getDeviceOptimizations());
  return optimizations;
}

// For backward compatibility, export mobile device checks
export function useIsIOS(): boolean {
  const tier = getDevicePerformanceTier();
  return tier.includes('ios');
}

export function useIsAndroid(): boolean {
  const tier = getDevicePerformanceTier();
  return tier.includes('android');
}

export function useIsMobile(): boolean {
  const tier = getDevicePerformanceTier();
  return tier !== 'desktop';
}

// React import for the hook
import * as React from 'react';
