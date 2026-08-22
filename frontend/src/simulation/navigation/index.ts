/**
 * The navigation layer's public face.
 *
 * Three files, one question each — where can I stand (`NavGrid`), how do I get
 * there (`PathFinder`), and am I getting there (`Navigator`) — and only the
 * last of them is normally used from outside. The room asks the navigator for
 * a point to walk at and tells it when something knocked the creature about;
 * everything else is internal.
 */

export { NavGrid, CELL } from './NavGrid';
export type { NavBounds, Walker, Cell } from './NavGrid';

export { findPath } from './PathFinder';
export type { Waypoint } from './PathFinder';

export { Navigator } from './Navigator';
export type { Destination, NavResult, NavStatus } from './Navigator';
