/**
 * Policy module public API.
 *
 * Consumers should import from this module rather than directly from
 * engine.js or config.js to insulate them from internal restructuring.
 *
 * Exports:
 *   evaluate    — run all 7 rules against a dependency delta, return { results, allAdmitted }
 *   loadPolicy  — read and validate .depfencerc.json, return PolicyConfig
 */

export { evaluate } from './engine.js';
export { loadPolicy } from './config.js';
