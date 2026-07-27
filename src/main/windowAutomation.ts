/**
 * @fileoverview Windows-only OS-level window focus + input simulation.
 * @module src/main/windowAutomation
 *
 * Backs the auto-scan feature: bring the game window to the foreground, send
 * it keystrokes/clicks, and check whether it's still focused (the "Alt+Tab
 * stops the scan" safety net). Implemented via PowerShell + Win32 P/Invoke
 * (`user32.dll`) rather than a native npm dependency — this app is already
 * Windows-only (see README), and this avoids adding a native module that
 * would need `electron-rebuild` wiring for a single feature.
 *
 * Each function spawns a fresh `powershell.exe` process (~100-200ms startup
 * overhead) — acceptable for a human-timescale menu-navigation sequence, not
 * used in a tight loop.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Shared P/Invoke declarations, re-added in every script since each
// `powershell.exe` invocation is a fresh process (Add-Type doesn't persist).
const WIN32_TYPE = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class FMWin32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint uCode, uint uMapType);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
}
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
"@
`;

/** Escapes a string for safe interpolation inside a PowerShell double-quoted `-like` pattern. */
function psQuote(s: string): string {
    return s.replace(/'/g, "''").replace(/[`$]/g, '`$&');
}

async function runPs(script: string): Promise<string> {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    return stdout.trim();
}

/** PowerShell snippet that finds the first visible top-level window whose title contains `titleHint`, storing its handle in `$found` (`$null` if not found) for the caller's own `if ($found) { ... }` block. */
function findWindowSnippet(titleHint: string): string {
    const needle = psQuote(titleHint);
    return `
$found = $null
$callback = {
    param($hWnd, $lParam)
    if ([FMWin32]::IsWindowVisible($hWnd)) {
        $sb = New-Object System.Text.StringBuilder 256
        [FMWin32]::GetWindowText($hWnd, $sb, 256) | Out-Null
        if ($sb.ToString() -like "*${needle}*") { $script:found = $hWnd; return $false }
    }
    return $true
}
[FMWin32]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null`;
}

/** Finds the first visible top-level window whose title contains `titleHint` (case-insensitive) and brings it to the foreground. Returns false if no matching window was found. */
export async function focusWindow(titleHint: string): Promise<boolean> {
    const script = `${WIN32_TYPE}${findWindowSnippet(titleHint)}
if ($found) {
    # Windows blocks SetForegroundWindow from a background process unless it
    # thinks the user just interacted with something — a harmless simulated
    # Alt tap (down+up, no target) is the standard workaround.
    [FMWin32]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    [FMWin32]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [FMWin32]::SetForegroundWindow($found) | Out-Null
    Write-Output "true"
} else {
    Write-Output "false"
}`;
    return (await runPs(script)) === 'true';
}

/** True if the current foreground window's title contains `titleHint`. */
export async function isWindowForeground(titleHint: string): Promise<boolean> {
    const needle = psQuote(titleHint);
    const script = `${WIN32_TYPE}
$h = [FMWin32]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256
[FMWin32]::GetWindowText($h, $sb, 256) | Out-Null
if ($sb.ToString() -like "*${needle}*") { Write-Output "true" } else { Write-Output "false" }`;
    return (await runPs(script)) === 'true';
}

export interface WindowRect { x: number; y: number; width: number; height: number }

/** The matching window's on-screen bounding box (OUTER bounds, incl. any title bar/border — fine for a borderless-fullscreen game, may be slightly off for a windowed one with visible chrome). Null if not found. */
export async function getWindowRect(titleHint: string): Promise<WindowRect | null> {
    const script = `${WIN32_TYPE}${findWindowSnippet(titleHint)}
if ($found) {
    $rect = New-Object RECT
    [FMWin32]::GetWindowRect($found, [ref]$rect) | Out-Null
    Write-Output "$($rect.Left),$($rect.Top),$($rect.Right - $rect.Left),$($rect.Bottom - $rect.Top)"
} else {
    Write-Output "null"
}`;
    const out = await runPs(script);
    if (out === 'null') return null;
    const [x, y, width, height] = out.split(',').map(Number);
    return { x, y, width, height };
}

// Virtual-key codes (not `SendKeys` sequences) — see below for why.
const VK: Record<string, number> = { ESC: 0x1b, C: 0x43 };

/**
 * Sends a key to whichever window currently has OS focus — call `focusWindow`
 * first. Uses `keybd_event` (the same low-level injection API the mouse click
 * uses), NOT `System.Windows.Forms.SendKeys` — `SendKeys` only generates
 * legacy WM_KEYDOWN-style window messages, which many games (particularly
 * Unreal Engine titles reading Raw Input for lower latency, and/or explicit
 * anti-macro filtering) never see at all.
 *
 * `bScan` is populated via `MapVirtualKey` rather than left at 0 — a real
 * hardware key event always carries a valid scan code, and some input
 * filtering treats a virtual-key-only event (scan code 0) as a giveaway that
 * it's synthetic. Second attempt after the first live test (2026-07-27)
 * found NEITHER the plain `keybd_event` calls NOR the `mouse_event` click had
 * any visible in-game effect at all (only the OS-level window-focus switch
 * worked) — if this doesn't change that, the next real hypothesis is
 * intentional anti-injection filtering (Kuro's Fair Gaming Policy explicitly
 * bans "macro commands"), which `keybd_event`/`mouse_event`/`SendInput` can't
 * get around no matter how they're tuned — only a virtual HID driver
 * (presents as real hardware, a much bigger addition) might.
 */
export async function sendKey(key: keyof typeof VK): Promise<void> {
    const vk = VK[key];
    const script = `${WIN32_TYPE}
$scan = [FMWin32]::MapVirtualKey(${vk}, 0)
[FMWin32]::keybd_event(${vk}, $scan, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 50
[FMWin32]::keybd_event(${vk}, $scan, 2, [UIntPtr]::Zero)`;
    await runPs(script);
}

/** Moves the cursor to (x, y) in screen coordinates and left-clicks — call `focusWindow` first. */
export async function sendClick(x: number, y: number): Promise<void> {
    const script = `${WIN32_TYPE}
[FMWin32]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
Start-Sleep -Milliseconds 50
[FMWin32]::mouse_event(0x0002, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[FMWin32]::mouse_event(0x0004, 0, 0, 0, 0)`;
    await runPs(script);
}
