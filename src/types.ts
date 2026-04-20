/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Vector2D {
  x: number;
  y: number;
}

export interface Piece {
  id: string;
  type: 'striker' | 'white' | 'black' | 'queen';
  position: Vector2D;
  radius: number;
  mass: number;
  isPocketed: boolean;
}

export interface ShotPrediction {
  points: Vector2D[];
  collisionPoint: Vector2D | null;
  reflectionLines: Vector2D[][];
  targetPieceId?: string;
  pocketIndex?: number;
  score: number;
}

export const BOARD_SIZE = 740; // Standard carrom board is 74cm
export const POCKET_RADIUS = 40;
export const STRIKER_RADIUS = 20.65; // ~41.3mm diameter
export const COIN_RADIUS = 15.1; // ~30.2mm diameter
export const STRIKER_MASS = 15;
export const COIN_MASS = 5;

export const POCKETS: Vector2D[] = [
  { x: POCKET_RADIUS, y: POCKET_RADIUS },
  { x: BOARD_SIZE - POCKET_RADIUS, y: POCKET_RADIUS },
  { x: POCKET_RADIUS, y: BOARD_SIZE - POCKET_RADIUS },
  { x: BOARD_SIZE - POCKET_RADIUS, y: BOARD_SIZE - POCKET_RADIUS },
];
