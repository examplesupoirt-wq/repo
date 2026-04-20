/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector2D, Piece, BOARD_SIZE, POCKETS, POCKET_RADIUS, ShotPrediction } from './types';

export function distance(p1: Vector2D, p2: Vector2D): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

export function normalize(v: Vector2D): Vector2D {
  const d = Math.sqrt(v.x ** 2 + v.y ** 2);
  if (d === 0) return { x: 0, y: 0 };
  return { x: v.x / d, y: v.y / d };
}

export function multiply(v: Vector2D, s: number): Vector2D {
  return { x: v.x * s, y: v.y * s };
}

export function add(v1: Vector2D, v2: Vector2D): Vector2D {
  return { x: v1.x + v2.x, y: v1.y + v2.y };
}

export function subtract(v1: Vector2D, v2: Vector2D): Vector2D {
  return { x: v1.x - v2.x, y: v1.y - v2.y };
}

export function dot(v1: Vector2D, v2: Vector2D): number {
  return v1.x * v2.x + v1.y * v2.y;
}

// Ray-Circle Intersection
export function rayCircleIntersection(
  origin: Vector2D,
  direction: Vector2D,
  center: Vector2D,
  radius: number
): number | null {
  const f = subtract(origin, center);
  const a = dot(direction, direction);
  const b = 2 * dot(f, direction);
  const c = dot(f, f) - radius ** 2;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
  const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);

  if (t1 >= 0.01) return t1;
  if (t2 >= 0.01) return t2;
  return null;
}

// Ray-Wall Intersection
export function rayWallIntersection(
  origin: Vector2D,
  direction: Vector2D,
  padding: number
): { t: number; normal: Vector2D } | null {
  let minT = Infinity;
  let minNormal: Vector2D | null = null;

  // Left
  if (direction.x < 0) {
    const t = (padding - origin.x) / direction.x;
    if (t > 0 && t < minT) {
      minT = t;
      minNormal = { x: 1, y: 0 };
    }
  }
  // Right
  if (direction.x > 0) {
    const t = (BOARD_SIZE - padding - origin.x) / direction.x;
    if (t > 0 && t < minT) {
      minT = t;
      minNormal = { x: -1, y: 0 };
    }
  }
  // Top
  if (direction.y < 0) {
    const t = (padding - origin.y) / direction.y;
    if (t > 0 && t < minT) {
      minT = t;
      minNormal = { x: 0, y: 1 };
    }
  }
  // Bottom
  if (direction.y > 0) {
    const t = (BOARD_SIZE - padding - origin.y) / direction.y;
    if (t > 0 && t < minT) {
      minT = t;
      minNormal = { x: 0, y: -1 };
    }
  }

  return minNormal ? { t: minT, normal: minNormal } : null;
}

export function predictFullShot(
  strikerPos: Vector2D,
  strikerDir: Vector2D,
  pieces: Piece[],
  maxWallBounces: number = 7
): ShotPrediction {
  const piecesToTest = pieces.filter(p => p.type !== 'striker' && !p.isPocketed);
  const striker = pieces.find(p => p.type === 'striker')!;
  
  let currentPos = { ...strikerPos };
  let currentDir = normalize(strikerDir);
  const strikerPath: Vector2D[] = [currentPos];
  
  let firstPieceCollision: { piece: Piece; t: number; point: Vector2D } | null = null;
  let wallBounces = 0;

  // Step 1: Trace striker until it hits a piece or reaches max bounces
  while (wallBounces <= maxWallBounces) {
    let closestT = Infinity;
    let hitPiece: Piece | null = null;

    // Check pieces
    for (const piece of piecesToTest) {
      // Sum of radii for collision check
      const combinedRadius = striker.radius + piece.radius;
      const t = rayCircleIntersection(currentPos, currentDir, piece.position, combinedRadius);
      if (t !== null && t < closestT) {
        closestT = t;
        hitPiece = piece;
      }
    }

    // Check walls
    const wallHit = rayWallIntersection(currentPos, currentDir, striker.radius);
    
    if (hitPiece && closestT < (wallHit?.t || Infinity)) {
      // Hits a piece!
      const collisionPoint = add(currentPos, multiply(currentDir, closestT));
      strikerPath.push(collisionPoint);
      firstPieceCollision = { piece: hitPiece, t: closestT, point: collisionPoint };
      break;
    } else if (wallHit) {
      // Hits a wall
      const hitPoint = add(currentPos, multiply(currentDir, wallHit.t));
      strikerPath.push(hitPoint);
      
      currentDir = getReflection(currentDir, wallHit.normal);
      currentPos = hitPoint;
      wallBounces++;
    } else {
      break;
    }
  }

  const prediction: ShotPrediction = {
    points: strikerPath,
    collisionPoint: firstPieceCollision?.point || null,
    reflectionLines: [strikerPath],
    score: 0
  };

  // Step 2: If we hit a piece, predict where the piece goes
  if (firstPieceCollision) {
    const { piece, point } = firstPieceCollision;
    prediction.targetPieceId = piece.id;

    // The piece moves in the direction from the striker center at collision to the piece center
    // Wait, physics: the piece moves along the line connecting the centers at the moment of impact
    const pieceDir = normalize(subtract(piece.position, point));
    
    // Trace piece path (limit to 1 bounce or pocket)
    const piecePath: Vector2D[] = [piece.position];
    let pPos = piece.position;
    let pDir = pieceDir;
    
    // Check if piece hits pocket directly
    let bestPocketDist = Infinity;
    let bestPocketIdx = -1;
    for (let i = 0; i < POCKETS.length; i++) {
      const p = POCKETS[i];
      // Distance from piece path to pocket
      const toPocket = subtract(p, pPos);
      const dist = distance(p, pPos);
      const angle = dot(normalize(toPocket), pDir);
      
      if (angle > 0.99 && dist < 400) { // Nearly direct
        if (dist < bestPocketDist) {
          bestPocketDist = dist;
          bestPocketIdx = i;
        }
      }
    }

    if (bestPocketIdx !== -1) {
      piecePath.push(POCKETS[bestPocketIdx]);
      prediction.pocketIndex = bestPocketIdx;
      prediction.score = 1000 - bestPocketDist;
    } else {
      // Just check wall hit for piece
      const pWall = rayWallIntersection(pPos, pDir, piece.radius);
      if (pWall) {
        piecePath.push(add(pPos, multiply(pDir, pWall.t)));
      } else {
        piecePath.push(add(pPos, multiply(pDir, 200)));
      }
    }
    prediction.reflectionLines.push(piecePath);

    // Step 3: Predict where the striker goes after impact
    // Striker moves perpendicular to the hit direction (tangential)
    const hitNormal = normalize(subtract(point, piece.position));
    const strikerPostDir = subtract(currentDir, multiply(hitNormal, dot(currentDir, hitNormal)));
    const strikerPostPath: Vector2D[] = [point, add(point, multiply(normalize(strikerPostDir), 150))];
    prediction.reflectionLines.push(strikerPostPath);
  }

  return prediction;
}

export function getReflection(dir: Vector2D, normal: Vector2D): Vector2D {
  const d = dot(dir, normal);
  return subtract(dir, multiply(normal, 2 * d));
}

export function isBallInPocket(pos: Vector2D): boolean {
  for (const pocket of POCKETS) {
    if (distance(pos, pocket) < POCKET_RADIUS) return true;
  }
  return false;
}
