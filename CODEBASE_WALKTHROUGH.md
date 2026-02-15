# Cube Shots — Codebase Walkthrough (React + Three) + Original Babylon Reference

This document explains, in detail, how the current React/Three.js codebase is structured and how it relates to the original Babylon.js implementation in `index 2.html`.

It’s written so you can:
- Understand how “click a face → camera spins/zooms → cube expands/fades” works.
- Understand how the scripted “Play Demo” sequence works (for video recording).
- Compare the current Three/R3F approach to the original Babylon camera + picking logic.

---

## 1) What’s In This Repo

### Primary entrypoints
- `index.html`: Vite entry that mounts the React app.
- `src/main.jsx`: React bootstrap (`createRoot(...).render(<App />)`).
- `src/App.jsx`: The main app. All interaction, animation, camera, and demo logic live here.

### Historical / reference implementations
- `index 2.html`: Original Babylon.js implementation (works as the reference baseline).
- `index-three.html`: A non-React Three.js prototype (helpful as an intermediate reference).
- `src/main.js`: Another non-React Three.js version (prototype/variant).

---

## 2) High-Level Behavior (What You See)

The app is a 3D Rubik-style cube (GLB) with many smaller “block” meshes.

### User interaction features
- Clicking a face triggers:
  - Camera motion (spin to face) and zoom-in animation.
  - Cube “expand” behavior (clicked cube grows, others shrink).
  - Face fade behavior (clicked face stays bright, others fade).
- Clicking the same cube again toggles back to default:
  - All cubes return to normal scale and faces return to full opacity.
  - Camera returns to the default pose (spin back) and zooms out to the default zoom.
- Clicking the special “home” cube (`top_block_5`) resets everything:
  - Same reset behavior as above.

### Video/demo mode features
- A “Play Demo” button runs a scripted sequence.
- While the demo is running:
  - Orbit controls are disabled.
  - Scene clicks are ignored.
  - The Leva UI is blocked by an invisible overlay.
  - A visible “demo cursor” marker shows where the demo is “clicking”.

---

## 3) React + Three (R3F) Architecture (`src/App.jsx`)

The current implementation uses:
- `@react-three/fiber` (R3F) for the render loop and scene lifecycle.
- `@react-three/drei` helpers:
  - `OrbitControls`
  - `Environment`, `Lightformer`
  - `ContactShadows`
  - `useGLTF`
- `leva` to provide a UI for camera, lighting, intro timings, etc.

### 3.1 Component layout

`App` renders:
- `<Leva />`: the control UI.
- A fixed overlay UI:
  - “Play Demo” button.
  - A full-screen pointer-events overlay that blocks interactions during demo.
  - A “demo cursor” visual indicator showing scripted clicks.
- `<Canvas>`: the R3F 3D renderer
  - `<CameraRig />`: continuously enforces the “Leva camera” pose (when enabled).
  - `<OrbitControls />`: user orbit controls (disabled during demo).
  - `<BabylonConstraints />`: keeps controls within Babylon-like limits in Babylon mode.
  - `<StudioLights />`: lighting based on the “logo lighting” setup.
  - `<Model />`: loads/clones the GLB and attaches `onPointerUp`.
  - `<ContactShadows />`: ground contact shadow.
  - `<Animator />`: frame-based animation runner for opacity/scale/camera/intro.

---

## 4) Data Model: What State Exists and Why

### 4.1 “Lookup” state (`interactionRef`)

`interactionRef` is a ref-based state store so it can be mutated without rerenders:
- `cubesByName: Map<string, Object3D>`
  - One entry per cube block name in `cubeNames`.
- `cubeFacesByName: Map<string, Mesh[]>`
  - For each cube block, a list of face meshes (non-body meshes).
- `allFaceMeshes: Mesh[]`
  - Flat list of all face meshes for quick fading.
- `bodyMaterialUUIDs: Set<string>`
  - Materials considered “body/non-face” so we can ignore them when clicking.
- `currentlyExpandedCubeName: string | null`
- `currentlyClickedFace: Mesh | null`

This matches the intent of the Babylon version:
- “Which cube is expanded?”
- “Which face is selected?”

### 4.2 Animation state (`animRef`)

`animRef` stores active tweens:
- `opacity: Map<uuid, tween>`
- `scale: Map<uuid, tween>`
- `camera: tween | null`
- `center: tween | null` (intro fly-in animation)

The `Animator` component consumes this and updates values every frame.

### 4.3 Default pose (`defaultPoseRef`)

`defaultPoseRef` stores the “default camera pose” you want to return to whenever the scene resets.

Important: this “default pose” is captured from the current Leva values so you can tune the intro pose and have resets always return to it.

### 4.4 Demo state

- `isDemoRunning: boolean`
  - Gates user input and Leva manipulation.
- `demoCursor: { visible, x, y, pulse, label }`
  - The overlay that visually indicates a scripted click point.

---

## 5) Loading the GLB and Classifying Face Meshes

### 5.1 Model loading (`Model`)

`Model` uses `useGLTF(GLB_URL)` and clones `scene` so it can be safely mutated (opacity/material cloning, etc.).

It calls `onReady(root)` once the clone is ready. `root` is the top-level `Object3D` for the GLB.

### 5.2 Building cube and face lists (`onModelReady`)

In `onModelReady`:
1) Compute the model bounds center (`modelCenterRef`), used as the camera target.
2) Build `cubesByName` by looking up each `cubeNames` entry inside the GLB.
3) Determine which materials are “common across all cubes” and select a subset as body materials.
4) For each cube, traverse its hierarchy:
   - include meshes that are NOT body material → these become “faces”
5) Prepare face materials for opacity fades by cloning materials and enabling transparency.

### Why “body” materials matter

In the GLB, the “black plastic body” is often a mesh/material shared by all cube blocks.
If raycasting hits that mesh first, it is **not a sticker face** and should not trigger a “face click”.

The code therefore:
- Prefers intersections that are not body material.
- Builds “faces” by excluding body materials.

This parallels the Babylon approach, where you attached click handlers directly to each face mesh (`cube.getChildMeshes()`).

---

## 6) Clicking a Face: The Interaction Pipeline

### 6.1 Pointer event entry (`onModelPointerUp`)

The GLB root (`<Model />`) has `onPointerUp`.

On pointer up:
1) Ignore if demo is running.
2) Ignore if drag distance is too large (`e.delta > 6`).
3) Use `e.intersections` to select the closest hit that:
   - belongs to a known cube block (has an ancestor in `cubesByName`)
   - is not body material
4) Delegate the actual behavior to `applyFaceSelection(mesh, ...)`.

This “intersection selection” is the key difference vs the original Babylon code:
- Babylon attaches handlers to each face directly, so it never “hits the wrong mesh”.
- In R3F you get ray intersections and must pick the correct mesh from them.

### 6.2 The shared interaction function (`applyFaceSelection`)

`applyFaceSelection(clickedMesh, options)` is the single “source of truth” for:
- Camera move + zoom
- Cube expand/shrink
- Face fade
- Reset logic (toggle off, home)

It performs:
1) Identify which cube this face belongs to (walk up the parent chain).
2) Ignore if clicked mesh uses a body material.
3) Camera motion:
   - Compute camera pose from the clicked mesh (see next section).
   - Trigger the camera tween via `animateCameraToPreset(...)`.
4) Home reset:
   - If cube is `top_block_5`, do a full reset and return.
5) Toggle and selection logic:
   - Same cube, different face → only change opacity focus.
   - Same cube, same face (already expanded) → reset everything + return to default pose.
   - Different cube → expand that cube, shrink others, fade faces.

---

## 7) Camera Math and Animation (Three/R3F)

### 7.1 “Spin to face” pose computation (`getCameraPoseForMesh`)

The original Babylon implementation used *hard-coded alpha/beta presets* derived from mesh name characters.

In the React/Three version, the camera target pose is derived from geometry:
- Use the face mesh’s world position.
- Compute a direction from the model target → face position.
- Convert that direction into spherical angles:
  - `azimuth` (theta) and `polar` (phi)
- Use a desired distance (for click zoom vs default distance).

This makes “spin to face” robust even if mesh naming differs or the raycast hits child meshes inconsistently.

### 7.2 Camera tweening (`animateCameraToPreset` + `Animator`)

`animateCameraToPreset`:
- Captures current OrbitControls angles (`getAzimuthalAngle`, `getPolarAngle`) and distance (`getDistance`).
- Computes shortest angular delta for azimuth so the rotation takes the shortest path.
- Writes a camera tween into `animRef.current.camera`.

`Animator`:
- On each frame, if `animRef.current.camera` exists:
  - interpolates azimuth/polar/distance using an ease-in-out curve.
  - writes camera position using `THREE.Spherical`.
  - keeps `controls.target` and camera `lookAt(target)` consistent.

### 7.3 Zoom-in / zoom-out behavior

You wanted:
- Zoom in when a face is clicked.
- Zoom out only on reset (toggle-off, home, idle reset).

This is implemented as an **animated FOV** change during camera tween:
- On face click:
  - `toFov` is set to a smaller FOV (zoom in).
- On resets:
  - `toFov` is set back to `values.cameraFov` (zoom out).

This is intentionally separate from camera distance:
- Distance can remain at your chosen click distance (currently `babylonClickDistance`).
- FOV provides a more dramatic zoom that’s clearly visible in video.

---

## 8) Scripted “Play Demo” Sequence (Video Automation)

### 8.1 Goals

The demo is designed for recording:
- Deterministic.
- Obvious transitions.
- No accidental user interaction mid-sequence.
- Visible click indicator (demo cursor).

### 8.2 How it works (`runDemo`)

At a high level:
1) Locks input (`isDemoRunning = true`).
2) Captures the “default pose” from Leva (so “reset to default” always means your tuned intro pose).
3) Hard-resets to default pose and plays the intro.
4) Runs a sequence of scripted “clicks” and waits.

### 8.3 Demo cursor overlay

The demo cursor:
- Converts a mesh world position to screen coordinates:
  - `worldPos.project(camera)` → NDC → pixels.
- Displays a dot + ripple ring + label (e.g. `CLICK`, `HOME`).
- For the home button:
  - Computes “top-center of the yellow face” using the mesh’s bounding box, transformed to world.

### 8.4 Ensuring the HOME click is visible

To make sure the viewer can see the yellow face and the HOME click:
- The demo chooses a cube on the top layer with a “yellow-ish” face before clicking home.
- Then it “clicks” the top-center of the yellow face on `top_block_5`.

---

## 9) Original Babylon Implementation (`index 2.html`)

The Babylon version is a single HTML file that loads Babylon via CDN scripts and runs a `createScene` function.

### 9.1 Scene setup

- Creates a `BABYLON.Scene` and sets the clear color.
- Loads the GLB via `BABYLON.SceneLoader.ImportMesh(...)`.
- Uses or configures an `ArcRotateCamera`:
  - `camera.alpha`, `camera.beta`, `camera.radius` define orbit angles and distance.
  - Radius is locked by setting lower/upper radius limits.
  - Vertical motion is limited via `upperBetaLimit` and `lowerBetaLimit`.

### 9.2 Drag vs click detection

Babylon uses:
- `scene.onPointerObservable` to track pointer down/up/move.
- A flag (`onDragIndicator`) is set during movement.
- Face click handlers run only when it is not a drag.

This is conceptually equivalent to the React version’s `e.delta` threshold.

### 9.3 Click handlers are attached per face mesh

For each cube name in `cubeNames`:
- Find the cube mesh (`scene.getMeshByName`).
- For each child face mesh:
  - Assign an `ActionManager`.
  - Register an `ExecuteCodeAction` on `OnPickTrigger`.

This is why the Babylon version “just works”:
- It never has to guess which intersection is “the face”.

### 9.4 Camera animation in Babylon

Babylon’s `animateCamera(alphaTarget, betaTarget, radiusTarget)`:
- Creates 3 Babylon animations for `alpha`, `beta`, and `radius`.
- Uses an easing function (`CubicEase`).
- Uses a shortest-path alpha correction (`calculateTargetAlpha`) so the camera rotates the shortest direction.

### 9.5 Face → camera preset mapping

The Babylon click handler:
- Reads `clickedFace.name`.
- Extracts `secondCharacter = meshName.charAt(1)`.
- Chooses one of `s1Alpha/s1Beta`, `s2...`, etc.
- Calls `animateCamera(alpha, beta, 18)`.

This hard-coded mapping is preserved conceptually in the Three prototype, but the current React version moved to geometry-based camera targeting for reliability.

---

## 10) Babylon vs React/Three: Conceptual Mapping

### Camera
- Babylon: `ArcRotateCamera(alpha, beta, radius)` is the camera.
- Three/R3F: `OrbitControls` maintains the orbit:
  - `azimuthalAngle`, `polarAngle`, `distance` + a target point.

### Click picking
- Babylon: face handlers bound directly to face meshes.
- R3F: raycast intersections returned by the framework, you must pick the correct mesh.

### Animation engine
- Babylon: `BABYLON.Animation` (keyframes + easing).
- R3F/Three: a custom tween runner in `Animator` (time-based interpolation each frame).

---

## 11) Tuning Guide (For Video Recording)

### Default pose / intro pose
The “default pose” is whatever is in Leva:
- `cameraAzimuth`
- `cameraPolar`
- `cameraDistance`

The demo captures this pose at start and uses it for all “reset to default” moments.

### Click distance and zoom
- Distance used on face click: `babylonClickDistance`.
- “Zoom” feel is primarily controlled by the animated camera FOV during click vs reset:
  - Base FOV: `cameraFov`
  - Zoomed FOV (on click): derived in code as a fraction of base.

### Demo pacing
The demo uses explicit delays (`PAUSE_MS`) between major states so each state is obvious on camera.

---

## 12) Quick “Where To Look” Index

React app:
- Demo sequence: `src/App.jsx` → `runDemo`
- Click behavior: `src/App.jsx` → `onModelPointerUp` + `applyFaceSelection`
- Camera tween setup: `src/App.jsx` → `animateCameraToPreset`
- Per-frame tween execution: `src/App.jsx` → `Animator`
- GLB parsing / face list: `src/App.jsx` → `onModelReady`

Babylon reference:
- Camera + click logic: `index 2.html` → `ArcRotateCamera` config + `animateCamera` + `OnPickTrigger` handlers

