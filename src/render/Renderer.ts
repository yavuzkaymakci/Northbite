import * as THREE from 'three';

export class Renderer {
  readonly three: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private onResizeCallbacks: Array<(w: number, h: number) => void> = [];

  constructor(container: HTMLElement) {
    this.three = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.three.setSize(this.width, this.height, true);
    for (const cb of this.onResizeCallbacks) cb(this.width, this.height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.three.render(scene, camera);
  }
}
