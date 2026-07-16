import type { ComponentType } from 'react';
import {
    LayoutDashboard, Calculator, ScanLine, Boxes, Repeat, Settings, type LucideIcon,
} from 'lucide-react';
import { DashboardScreen } from './DashboardScreen';
import { CalculatorScreen } from './CalculatorScreen';
import { ScannerScreen } from './ScannerScreen';
import { InventoryScreen } from './InventoryScreen';
import { RotationScreen } from './RotationScreen';
import { SettingsScreen } from './SettingsScreen';

export interface ScreenDef {
    id: string;
    label: string;
    icon: LucideIcon;
    section: 'primary' | 'system';
    /** Maps to a `useGameUI` category id when the screen is game-driven. */
    category?: string;
    component: ComponentType;
}

/**
 * The full set of shell screens. `primary` screens appear in the top of the nav
 * rail (Dashboard is always shown; the game-driven ones are filtered by the
 * active game's categories). `system` screens (Settings) sit at the bottom.
 */
export const SCREENS: ScreenDef[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'primary', component: DashboardScreen },
    { id: 'calculator', label: 'Calculator', icon: Calculator, section: 'primary', category: 'calculator', component: CalculatorScreen },
    { id: 'scanner', label: 'Scanner', icon: ScanLine, section: 'primary', category: 'scanner', component: ScannerScreen },
    { id: 'inventory', label: 'Inventory', icon: Boxes, section: 'primary', category: 'inventory', component: InventoryScreen },
    { id: 'rotation', label: 'Rotation', icon: Repeat, section: 'primary', category: 'rotation', component: RotationScreen },
    { id: 'settings', label: 'Settings', icon: Settings, section: 'system', component: SettingsScreen },
];

export function getScreen(id: string): ScreenDef | undefined {
    return SCREENS.find((s) => s.id === id);
}
