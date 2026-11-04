import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { flat, mesh } from './materials';

/** Local Z where the entrance tunnel begins (shared with the collider setup). */
export function iglooTunnelStart(radius: number): number {
  return radius * 0.82 - 0.2;
}

/** Low-poly igloo with an entrance tunnel facing +Z. Origin at ground center of the dome. */
export function createIgloo(radius: number, tunnelLength: number, tunnelWidth: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'igloo';

  // Dome: icosahedron with the lower half flattened onto the ground.
  const domeGeo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = domeGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0) pos.setY(i, 0);
  }
  pos.needsUpdate = true;
  domeGeo.scale(1, 0.82, 1);
  domeGeo.computeVertexNormals();
  group.add(mesh(domeGeo, flat(Palette.snow)));

  // Ring of ice blocks around the base.
  const ringGeo = new THREE.CylinderGeometry(radius * 1.02, radius * 1.06, 0.28, 12, 1, true);
  group.add(mesh(ringGeo, flat(Palette.ice), 0, 0.14, 0));

  // Tunnel: half cylinder (theta -90°..90° covers +Z), rotated so its axis runs along Z and the arch faces up.
  const tunnelR = tunnelWidth / 2;
  const tunnelStart = iglooTunnelStart(radius);
  const tunnelGeo = new THREE.CylinderGeometry(tunnelR, tunnelR, tunnelLength, 8, 1, false, -Math.PI / 2, Math.PI);
  const tunnel = mesh(tunnelGeo, flat(Palette.snow), 0, 0, tunnelStart + tunnelLength / 2);
  tunnel.rotation.x = -Math.PI / 2;
  group.add(tunnel);

  // Dark doorway just in front of the tunnel cap.
  const doorGeo = new THREE.CylinderGeometry(tunnelR * 0.72, tunnelR * 0.72, 0.04, 8, 1, false, -Math.PI / 2, Math.PI);
  const door = mesh(doorGeo, flat(Palette.doorway), 0, 0, tunnelStart + tunnelLength + 0.02);
  door.rotation.x = -Math.PI / 2;
  group.add(door);

  return group;
}
