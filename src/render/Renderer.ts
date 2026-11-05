import * as THREE from 'three';

export class Renderer {
  readonly three: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private onResizeCallbacks: Array<(w: number, h: number) => void> = [];
  /** Quality setting: devicePixelRatio is capped at this (GDD §22). */
  private pixelCap = 2;

  constructor(container: HTMLElement) {
    this.three = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelCap));
    this.three.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.three.domElement;
    this.canvas.className = 'game-canvas';
    container.appendChild(this.canvas);

    const resize = () => this.resize();
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    this.resize();
  }

  /** Pixel-ratio cap from the quality setting (at most 2). */
  setPixelCap(cap: number): void {
    this.pixelCap = Math.min(cap, 2);
    this.resize();
  }

  /** Draw calls and triangles of the last frame (debug readout). */
  get stats(): { calls: number; triangles: number } {
    return this.three.info.render;
  }

  onResize(cb: (w: number, h: number) => void): void {
    this.onResizeCallbacks.push(cb);
    cb(this.width, this.height);
  }

  get width(): number {
    return window.innerWidth;
  }

  get height(): number {
    return window.innerHeight;
  }

  private resize(): void {
    // Pixel ratio can change when moving between screens or zoom levels on desktop.
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelCap));
    this.three.setSize(this.width, this.height, true);
    for (const cb of this.onResizeCallbacks) cb(this.width, this.height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.three.render(scene, camera);
  }
}
