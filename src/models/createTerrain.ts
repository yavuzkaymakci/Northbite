import * as THREE from 'three';
import type { RectArea } from '../content/zones';
import { Palette } from '../render/Palette';
import { instanced, type InstanceTransform } from './instancing';
import { flat, mesh } from './materials';

const SLAB_DEPTH = 1.6;

/**
 * Ground slab: an ice block with a slightly raised snow layer on top.
 * The snow is inset from the water edges (east / north) so a band of bare ice shows along the shore.
 * Snow top surface is at y = 0.
 */
export function createGround(area: RectArea, shoreInset: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ground';

  const w = area.maxX - area.minX;
  const d = area.maxZ - area.minZ;
  const ice = mesh(new THREE.BoxGeometry(w, SLAB_DEPTH, d), flat(Palette.ice, { roughness: 0.6 }));
  ice.position.set(area.minX + w / 2, -0.06 - SLAB_DEPTH / 2, area.minZ + d / 2);
  group.add(ice);

  const sw = w - shoreInset;
  const sd = d - shoreInset;
  const snow = mesh(new THREE.BoxGeometry(sw, 0.2, sd), flat(Palette.snow));
  snow.position.set(area.minX + sw / 2, -0.1, area.maxZ - sd / 2);
  group.add(snow);
  return group;
}

/** Irregular ice blocks along the water edge. */
export function createShoreBlocks(transforms: readonly InstanceTransform[]): THREE.InstancedMesh {
  return instanced(new THREE.BoxGeometry(1, 1, 1), flat(Palette.iceDark, { roughness: 0.5 }), transforms);
}

/** Flat hexagonal patches of glossy ice on the snow. */
export function createIcePatches(transforms: readonly InstanceTransform[]): THREE.InstancedMesh {
  return instanced(new THREE.CylinderGeometry(1, 1, 0.02, 6), flat(Palette.ice, { roughness: 0.35 }), transforms);
}

export interface Water {
  mesh: THREE.Mesh;
  update(time: number): void;
}

/** Large faceted water plane with a gentle vertex wave (displacement done on the GPU). */
export function createWater(size: number, segments: number, waveHeight: number, waveSpeed: number): Water {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  const material = new THREE.MeshStandardMaterial({
    color: Palette.deepWater,
    roughness: 0.35,
    metalness: 0.05,
    flatShading: true,
  });
  const uniforms = { uTime: { value: 0 }, uWaveHeight: { value: waveHeight } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWaveHeight = uniforms.uWaveHeight;
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWaveHeight;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float wave = sin(position.x * 0.45 + uTime) * 0.6 + sin(position.y * 0.62 - uTime * 1.3) * 0.4
                   + sin((position.x + position.y) * 0.9 + uTime * 0.7) * 0.25;
        transformed.z += wave * uWaveHeight;`,
      );
  };

  const water = new THREE.Mesh(geometry, material);
  water.rotation.x = -Math.PI / 2;
  water.name = 'water';
  return {
    mesh: water,
    update(time: number) {
      uniforms.uTime.value = time * waveSpeed;
    },
  };
}
