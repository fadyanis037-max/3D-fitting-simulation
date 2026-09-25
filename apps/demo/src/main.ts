import { POSE_MODEL, VtoEngine } from "@vto/engine";

const videoQuery = document.querySelector<HTMLVideoElement>("#video");
const canvasQuery = document.querySelector<HTMLCanvasElement>("#canvas");
const startButtonQuery = document.querySelector<HTMLButtonElement>("#start");
const previewButtonQuery = document.querySelector<HTMLButtonElement>("#preview");
const statusQuery = document.querySelector<HTMLParagraphElement>("#status");
const placeholderQuery = document.querySelector<HTMLParagraphElement>("#placeholder");
const fpsQuery = document.querySelector<HTMLSpanElement>("#fps");
const skeletonQuery = document.querySelector<HTMLInputElement>("#skeleton");
const stageQuery = document.querySelector<HTMLDivElement>("#stage");

if (
  !videoQuery ||
  !canvasQuery ||
  !startButtonQuery ||
  !previewButtonQuery ||
  !statusQuery ||
  !placeholderQuery ||
  !fpsQuery ||
  !skeletonQuery ||
  !stageQuery
) {
  throw new Error("Demo page is missing an element.");
}

const video: HTMLVideoElement = videoQuery;
const canvas: HTMLCanvasElement = canvasQuery;
const startButton: HTMLButtonElement = startButtonQuery;
const previewButton: HTMLButtonElement = previewButtonQuery;
const status: HTMLParagraphElement = statusQuery;
const placeholder: HTMLParagraphElement = placeholderQuery;
const fps: HTMLSpanElement = fpsQuery;
const skeleton: HTMLInputElement = skeletonQuery;
const stage: HTMLDivElement = stageQuery;

let stream: MediaStream | null = null;
let engine: VtoEngine | null = null;
let previewing = false;

function setStatus(text: string): void {
  status.textContent = text;
}

function fit(): void {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height || !engine) return;
  const chrome = 190;
  const scale = Math.min(window.innerWidth / width, (window.innerHeight - chrome) / height, 1);
  const cssWidth = Math.max(1, Math.round(width * scale));
  const cssHeight = Math.max(1, Math.round(height * scale));
  stage.style.width = `${cssWidth}px`;
  stage.style.height = `${cssHeight}px`;
  engine.setViewport(cssWidth, cssHeight, width / height);
}

function cameraError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Camera permission was blocked. Allow the camera in the browser bar, then try again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No camera was found on this computer.";
  }
  return error instanceof Error ? error.message : "Could not open the camera.";
}

function ensureEngine(): VtoEngine {
  engine ??= new VtoEngine({
    canvas,
    video,
    onReady: () => setStatus("Step back until your shoulders and hips are in the picture."),
    onError: (message) => setStatus(message),
    onTracking: (visible) => {
      if (previewing) return;
      setStatus(
        visible
          ? "White dots should sit on your shoulders, elbows, hips, knees, and ankles. The face is not tracked."
          : "Step back until your shoulders and hips are in the picture.",
      );
    },
    onStats: (stats) => {
      if (!stream) return;
      fps.textContent = `${POSE_MODEL.name} · ${Math.round(stats.renderFps)} fps · pose ${Math.round(stats.poseFps)}`;
    },
  });
  engine.setShowSkeleton(skeleton.checked);
  return engine;
}

function showPreview(): void {
  if (previewing) {
    engine?.stop();
    previewing = false;
    placeholder.hidden = false;
    previewButton.textContent = "Preview jacket";
    fps.textContent = "";
    setStatus("Camera is off");
    return;
  }
  if (stream) stop();
  const current = ensureEngine();
  const cssWidth = Math.min(960, Math.max(1, window.innerWidth - 32));
  const cssHeight = Math.max(1, Math.round((cssWidth * 9) / 16));
  stage.style.width = `${cssWidth}px`;
  stage.style.height = `${cssHeight}px`;
  current.setViewport(cssWidth, cssHeight, 16 / 9);
  current.startPreview();
  placeholder.hidden = true;
  previewing = true;
  previewButton.textContent = "Hide preview";
  setStatus("This is the jacket on a standing pose. Start the camera to wear it.");
}
async function start(): Promise<void> {
  startButton.disabled = true;
  setStatus(`Loading the ${POSE_MODEL.name} pose model…`);
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    video.srcObject = stream;
    await video.play();
    placeholder.hidden = true;
    previewing = false;
    previewButton.textContent = "Preview jacket";

    const current = ensureEngine();
    fit();
    await current.start();
    startButton.textContent = "Stop camera";
  } catch (error) {
    setStatus(cameraError(error));
    engine?.dispose();
    engine = null;
    previewing = false;
    stopTracks();
  } finally {
    startButton.disabled = false;
  }
}

function stopTracks(): void {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  placeholder.hidden = false;
  fps.textContent = "";
}

function stop(): void {
  previewing = false;
  previewButton.textContent = "Preview jacket";
  engine?.stop();
  stopTracks();
  startButton.textContent = "Start camera";
  setStatus("Camera is off");
}

startButton.addEventListener("click", () => {
  if (stream) stop();
  else void start();
});

previewButton.addEventListener("click", showPreview);

skeleton.addEventListener("change", () => {
  engine?.setShowSkeleton(skeleton.checked);
});

window.addEventListener("resize", fit);
video.addEventListener("loadedmetadata", fit);
