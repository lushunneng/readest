/**
 * Readest Adapter Module
 *
 * This is the ONLY module allowed to import Readest internal paths.
 * All other enhanced modules must go through these adapters.
 *
 * Responsibilities:
 * - Wrap Readest internal objects (Book, View, EventDispatcher, etc.)
 * - Implement Port interfaces from enhanced/core/ports.ts
 * - Handle platform differences (Tauri vs Web)
 * - Convert between Readest types and core models
 *
 * Currently empty - implementations will be provided by port implementation agents.
 */

export {};
