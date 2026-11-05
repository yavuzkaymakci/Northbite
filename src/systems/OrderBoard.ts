import * as THREE from 'three';
import { Pages } from '../content/story';
import { t, tf, type StringKey } from '../content/strings';
import { IceShore } from '../content/zones';
import { FishingFeel, HapticsSettings, OrderFeel } from '../settings';
import type { GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import { createOrderBoard } from '../models/createBoard';
import type { Effects } from '../render/Effects';
import type { Banner } from '../ui/Banner';
import type { OrderPanel } from '../ui/OrderPanel';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import type { WorldMap } from '../world/Map';
import type { Appear } from './Appear';
import type { CarryStack } from './CarryStack';
import { deliverOrder, orderProgress, rerollOrder, updateOrders } from './OrderLogic';
import { sfx } from '../audio/AudioEngine';

const B = IceShore.board;

/**
 * Order board (GDD §20): the board next to the counter, its order timers (only while playing), the panel that opens
 * when the player walks up, delivering, swapping, and the yellow "!" over the board when an order can be delivered.
 */
export class OrderBoard {
  private built = false;
  private stand = 0;
  private wasAtBoard = false;
  private readonly mark: WorldLabel;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly state: GameState,
    private readonly player: Player,
    private readonly stack: CarryStack,
    private readonly world: WorldMap,
    private readonly fx: Effects,
    private readonly labels: WorldLabels,
    private readonly banner: Banner,
    private readonly appear: Appear,
    private readonly panel: OrderPanel,
  ) {
    this.mark = labels.create('board-mark', '!');
    this.mark.anchor.set(B.x, 2.75, B.z);
    if (state.unlocked.includes('orderBoard')) this.build(false);
  }

  get isBuilt(): boolean {
    return this.built;
  }

  build(animate: boolean): void {
    if (this.built) return;
    this.built = true;
    const board = createOrderBoard();
    board.position.set(B.x, 0, B.z);
    this.scene.add(board);
    this.world.addCollider({ kind: 'rect', minX: B.x - 0.8, maxX: B.x + 0.8, minZ: B.z - 0.15, maxZ: B.z + 0.15 });
    if (animate) this.appear.add(board);
  }

  /** Fish on the back that have landed (ones still flying in cannot be handed over yet). */
  private get visible(): number {
    return Math.max(this.state.carried.length - this.stack.hiddenTop, 0);
  }

  /** True when an order can be delivered right now (HUD red dot, "!" over the board). */
  get deliverable(): boolean {
    return this.built && this.state.orders.active.some((o) => {
      const p = orderProgress(this.state, o, this.visible);
      return p.have >= p.need;
    });
  }

  get atBoard(): boolean {
    const p = this.player.state;
    return this.built && Math.hypot(p.x - B.x, p.z - B.z) <= B.radius;
  }

  update(dt: number, locked: boolean): void {
    if (!this.built) return;
    updateOrders(this.state, dt, Math.random);
    // Walking up to the board opens the panel; walking off closes it.
    const still = this.player.state.speed01 < FishingFeel.stillSpeed;
    const at = this.atBoard;
    // A panel opened from the HUD switches to delivering when the player reaches the board (and back).
    if (this.panel.opened && at !== this.wasAtBoard) this.panel.open(at);
    this.wasAtBoard = at;
    if (at && !locked) {
      if (still) this.stand += dt;
      if (this.stand >= OrderFeel.openDelay && !this.panel.opened) this.panel.open(true);
    } else {
      if (this.stand > 0 && this.panel.opened) this.panel.close();
      this.stand = 0;
    }
    this.panel.refresh(this.state, this.visible);
    this.labels.show(this.mark, this.deliverable && !this.panel.opened);
  }

  /** The HUD icon: the orders from afar (delivering needs the board). */
  openRemote(): void {
    this.panel.open(this.atBoard);
  }

  deliver(id: number): void {
    const d = deliverOrder(this.state, id, this.visible);
    if (!d) return;
    vibrate(HapticsSettings.upgrade);
    sfx('buy');
    this.fx.sparkle(B.x, 1.6, B.z);
    let text = tf('orderDone', { c: d.coins });
    if (d.extra === 'rareBait') text += ` · ${t('orderExtraRareBait')}`;
    else if (d.extra === 'fur') text += ` · ${t('orderExtraFur')}`;
    else if (d.extra === 'decorPiece' && d.decorPiece) {
      const name = t(`unlock_${d.decorPiece}` as StringKey);
      text += ` · ${tf('orderExtraDecor', { name })}`;
    } else if (d.extra === 'pageHint') {
      const next = Pages.find((p) => !this.state.story.pages.includes(p.id));
      text += ` · ${next ? tf('orderExtraPage', { hint: t(`${next.id}Hint` as StringKey) }) : t('orderExtraPageNone')}`;
    }
    this.banner.show(text, 'good', 5);
  }

  swap(id: number): void {
    rerollOrder(this.state, id, Math.random);
  }
}
