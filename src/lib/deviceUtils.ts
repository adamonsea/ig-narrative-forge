// Device performance tier detection for iOS optimizations
// Only applies optimizations to devices that actually need them

export type DevicePerformanceTier = 'modern-ios' | 'mid-range-ios' | 'old-ios' | 'non-ios';

interface PerformanceOptimizations {
  shouldUseVirtualWindowing: boolean;
  shouldUseCSSCarousel: boolean;
  shouldAggressivelyLazyLoadImages: boolean;
  shouldReduceMotion: boolean;
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
 * Detects if device is iOS
 */
function isIOSDevice(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
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
 * Gets the device performance tier
 */
export function getDevicePerformanceTier(): DevicePerformanceTier {
  if (!isIOSDevice()) {
    return 'non-ios';
  }
  
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

/**
 * Gets recommended optimizations for the current device
 */
export function getDeviceOptimizations(): PerformanceOptimizations {
  const tier = getDevicePerformanceTier();
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  switch (tier) {
    case 'modern-ios':
      // Modern devices don't need most optimizations
      return {
        shouldUseVirtualWindowing: false,
        shouldUseCSSCarousel: false,
        shouldAggressivelyLazyLoadImages: false,
        shouldReduceMotion: prefersReducedMotion, // Only if user preference
      };
      
    case 'mid-range-ios':
      // Mid-range needs some help with memory and rendering
      return {
        shouldUseVirtualWindowing: true, // Help with memory
        shouldUseCSSCarousel: false, // Can still handle JS animations
        shouldAggressivelyLazyLoadImages: true, // Reduce memory pressure
        shouldReduceMotion: prefersReducedMotion,
      };
      
    case 'old-ios':
      // Old devices need all the help they can get
      return {
        shouldUseVirtualWindowing: true,
        shouldUseCSSCarousel: true, // CSS-only for best performance
        shouldAggressivelyLazyLoadImages: true,
        shouldReduceMotion: true, // Always reduce motion
      };
      
    case 'non-ios':
      // Android and other devices use default behavior
      return {
        shouldUseVirtualWindowing: false,
        shouldUseCSSCarousel: false,
        shouldAggressivelyLazyLoadImages: false,
        shouldReduceMotion: prefersReducedMotion,
      };
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

// For backward compatibility, export a simple iOS check
export function useIsIOS(): boolean {
  const tier = getDevicePerformanceTier();
  return tier !== 'non-ios';
}

// React import for the hook
import * as React from 'react';
