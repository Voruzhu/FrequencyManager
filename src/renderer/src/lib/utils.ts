import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes without conflicts.
 * Combines clsx (conditional) + tailwind-merge (dedupe).
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}