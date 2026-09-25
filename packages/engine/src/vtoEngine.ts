import {
  AmbientLight,
  DirectionalLight,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { JointExtractor } from "./rig/joints";
import { RigSolver } from "./rig/rigSolver";
import { standingLandmarks } from "./rig/standingPose";
import { Avatar } from "./render/avatar";
import { PoseSkeleton } from "./render/poseSkeleton";
import { PoseTracker } from "./tracking/poseTracker";
import type { PoseDelegate } from "./types";

export interface EngineStats {
  renderFps: number;
  poseFps: number;
}

export interface VtoEngineOptions {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  onReady?: (delegate: PoseDelegate) => void;
  onError?: (message: string) => void;
  onTracking?: (visible: boolean) => void;
  onStats?: (stats: EngineStats) => void;
}

export class VtoEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly video: HTMLVideoElement;
  private readonly onReady?: (delegate: PoseDelegate) => void;
  private readonly onError?: (message: string) => void;
  private readonly onTracking?: (visible: boolean) => void;
  private readonly onStats?: (stats: EngineStats) => void;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: OrthographicCamera;
  private readonly avatar = new Avatar();
  private readonly skeleton = new PoseSkeleton();
  private readonly joints = new JointExtractor();
  private readonly solver = new RigSolver();
  private readonly tracker: PoseTracker;
  private readonly standing = standingLandmarks();
  private aspect = 16 / 9;
  private mode: "off" | "preview" | "camera" = "off";
  private tracking = false;
  private raf = 0;
  private renderFrames = 0;
  private statsWindowStart = 0;

  constructor(options: VtoEngineOptions) {
    this.canvas = options.canvas;
    this.video = options.video;
    this.onReady = options.onReady;
    this.onError = options.onError;
    this.onTracking = options.onTracking;
    this.onStats = options.onStats;

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.camera = new OrthographicCamera(-this.aspect, this.aspect, 1, -1, 0.01, 20);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);

    const ambient = new AmbientLight(0xffffff, 0.55);
    const key = new DirectionalLight(0xfff6ee, 1.35);
    key.position.set(0.35, 0.8, 2);
    this.scene.add(ambient, key, this.avatar.root, this.skeleton.root);

    this.tracker = new PoseTracker(
      (pose) => {
        if (this.mode !== "camera") return;
        if (!pose) {
          this.hideBody();
          this.setTracking(false);
          return;
        }
        const joints = this.joints.update(pose.landmarks, this.aspect);
        this.avatar.setVisible(false);
        this.skeleton.update(pose.landmarks, this.aspect);
        this.setTracking(joints !== null);
      },
      (message) => this.onError?.(message),
    );
  }

  async start(): Promise<void> {
    const delegate = await this.tracker.init();
    this.onReady?.(delegate);
    this.mode = "camera";
    this.ensureLoop();
  }

  /** Shows the jacket on a fixed standing body, with no camera. */
  startPreview(): void {
    this.mode = "preview";
    this.ensureLoop();
  }

  stop(): void {
    this.mode = "off";
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.hideBody();
    this.setTracking(false);
  }

  dispose(): void {
    this.stop();
    this.tracker.dispose();
    this.renderer.dispose();
  }

  setViewport(cssWidth: number, cssHeight: number, videoAspect: number): void {
    this.aspect = videoAspect;
    this.camera.left = -videoAspect;
    this.camera.right = videoAspect;
    this.camera.top = 1;
    this.camera.bottom = -1;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.skeleton.setResolution(this.canvas.width, this.canvas.height);
  }

  setShowSkeleton(show: boolean): void {
    this.skeleton.setShown(show);
  }

  private hideBody(): void {
    this.avatar.setVisible(false);
    this.skeleton.hide();
  }

  private setTracking(visible: boolean): void {
    if (visible === this.tracking) return;
    this.tracking = visible;
    this.onTracking?.(visible);
  }

  private ensureLoop(): void {
    if (this.raf !== 0) return;
    this.statsWindowStart = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private applyStandingPose(): void {
    const joints = this.joints.update(this.standing, this.aspect);
    if (!joints) return;
    this.solver.apply(this.avatar.rig, joints);
    this.avatar.updateDebug(joints);
    this.avatar.setVisible(true);
  }

  private readonly loop = (now: number): void => {
    if (this.mode === "off") return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.mode === "camera") this.tracker.submit(this.video, now);
    else this.applyStandingPose();
    this.renderer.render(this.scene, this.camera);
    this.renderFrames += 1;
    if (now - this.statsWindowStart >= 500) {
      const seconds = (now - this.statsWindowStart) / 1000;
      this.onStats?.({
        renderFps: this.renderFrames / seconds,
        poseFps: this.tracker.takeSamples() / seconds,
      });
      this.renderFrames = 0;
      this.statsWindowStart = now;
    }
  };
}
