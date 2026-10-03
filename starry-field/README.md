# Starry Field — experiment 09

A walkable Starry Night–inspired nightscape with a separate frame-to-paint postprocessor. Serve `dist/` over HTTP. No external runtime dependencies. WebGL 2 required. Desktop: WASD/arrows and drag to look; touch: independent left movement and right look joysticks, with drag-to-look also available.

## Two-stage pipeline

1. **Ordinary game rendering:** the level and lighting render to an RGB texture and a depth texture. Objects have conventional flat colors. There are no surface brush strokes or painterly object textures.
2. **Painting:** `FramePainter` analyzes the flat RGB frame, advances a persistent image-space direction field, and reconstructs a painted image from its pixels. It never receives meshes, triangle normals, surface tangents, object IDs or object material colors.

The second stage has two fullscreen GPU passes: field dynamics and image reconstruction. The field has one cell per Grid spacing output pixels (default 11) in each dimension; it stores orientation, angular velocity, linear depth and smoothed RGB contrast strength in ping-pong textures. Float state is preferred, with an RGBA8 fallback. Orientation springs have inertia and damping, integrated in up to six small substeps per frame. Depth-aware neighboring springs couple orientations. Send a ripple injects a compact local angular impulse that propagates through these springs; Settle applies current targets immediately.

Smoothed RGB gradients at 3, 12 and 32 pixel radii build a color structure tensor. Strokes follow the perpendicular to its principal gradient; energy and anisotropy set confidence. Soft halos therefore steer surrounding strokes, not just sharp edges. Strong contour evidence increases target stiffness and reduces neighbor smoothing so coherent dynamics do not flatten the shape. Brush curvature follows local changes in orientation. An authored or learned artistic flow prior influences low-contrast regions. All pigment colors are sampled from the current game frame. Two jittered scales of long, broad tapered curved brush footprints, varied lengths and widths, stronger per-mark light/dark and warm/cool pigment offsets and subtle bristles reconstruct the image. Original frame, painted frame, direction field and split comparison are available.

## History and motion

Camera and depth information are used only to backward-reproject the screen-space field. Newly visible regions, depth mismatches and sky/geometry transitions reject incompatible history. Sky history uses rotational reprojection. Artistic settling is separate from camera motion. No previous painted colors are accumulated, so old pigment cannot ghost through a newly visible object.

This first implementation transports state with camera motion for static scenery. Moving objects require engine motion vectors or optical flow. Brush footprints are generated on the current screen grid; fixed mark seeds give the rotating lattice stable shapes and phases, but do not establish world-anchored individual mark identities. Return-view consistency after leaving the screen is not guaranteed. An opaque undercoat of overlapping broad marks fills gaps between detail strokes. Its coverage-weighted pigment colors are sampled at mark anchors; there is no direct/blurred source-frame background or source-image fallback. Minimum ellipse radii and bounded center jitter guarantee full coverage. The Paint undercoat view isolates this layer. Detail pigments also sample only their own anchors, so image boundaries do not vary pigment inside a stroke; bounded paint spill crosses silhouettes within an 18-pixel brush-scaled fringe. Depth still rejects distant overlap outside that fringe. Smooth spatial and temporal forcing drifts brush directions and centers; Motion controls its strength, with stronger contour evidence suppressing directional drift. Inertia and damping control the directional response. Length, width, taper, curvature and pigment offsets morph on continuous, mark-specific phases; Motion controls that clock. Direction axes use bilinear double-angle interpolation, with derivatives from the same four samples supplying curvature. RGB pigment lookups use linear filtering to avoid texel jumps. Pigment seeds are fixed to mark-grid coordinates and are not regenerated each frame. The mark lattice slowly rotates around the screen center in pixel space, at 0.014 radians/second times Motion. Its grid is overscanned so corners remain painted. Field, pigment and depth lookups map back into the current source frame, preserving scene placement and contour guidance. Rotation accumulates independently, so changing Motion changes speed without jumping its angle. Motion extends to 4. Above 1, it accelerates the drift clock while keeping directional and positional amplitudes bounded; rotation speed continues scaling with Motion. Defaults are inertia 1.00, damping 0.50, brush size 1.14 and Motion 3.03, with length 1.48, width 0.71, curvature 1.68, size variance 0.76 and texture 1.70. Adaptive detail defaults to 0.65. Neighbor coupling provides local directional coherence; this is not a wet-pigment simulation or learned painting style.

The current demo requires its depth/camera side channel for history transport. A strictly RGB-only stream would need optical flow. Painting color and structure remain image-derived in either case.

## Learned controller: scope

The 9→32→32→2 tanh MLP has 1,442 parameters. It was trained to reproduce a synthetic authored direction field, not on Van Gogh or other artwork. It supplies a screen-space flow prior, precomputed into a lookup texture when loaded; image contours still update every frame. This verifies the learned-steering interface without establishing image-conditioned model latency or painting quality. The training script and independent held-out report remain in `research/`.

```
OPENBLAS_NUM_THREADS=1 python research/train_controller.py
node research/check.mjs --render
python research/native_render.py
```

The native Mesa GLES validation compiles the actual shaders, renders the real two-stage pipeline, compares painted output with the source image, verifies GPU local ripple propagation/settling, and replaces the source RGB image to confirm immediate content-driven painting. It is not browser or phone QA. Displayed CPU time measures simulation/render submission, not GPU duration or end-to-end latency.

## Next experiment

Train an image-conditioned network to steer this field through a differentiable screen-space brush renderer, optimizing style, content preservation and sequence consistency. The existing synthetic prior is a baseline. Add per-pixel motion vectors and stronger transport of mark identity before measuring animation coherence. Compare quality and GPU cost against a direct image model using the same recorded camera journey.

## Attribution

Inspired by Vincent van Gogh, *The Starry Night* (1889). The procedural level is an interpretation, not a reconstruction. Original reference: https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg

## Brush controls

Studio → Brush shape exposes length and width multipliers, curvature, per-mark size variance and procedural texture strength. Variance blends uniform nominal dimensions with fixed mark-specific dimensions; morphing phases remain independent. Texture combines bristle relief, irregular edges, fine pigment grain and canvas tooth. Enlarged/curved footprints use a larger candidate neighborhood, with an early footprint rejection before field/color lookups. Large widths and cross-stroke bend are bounded to keep the neighborhood finite; extreme shape settings can cost more GPU time.

## Adaptive detail

Multi-scale RGB gradient energy supplies contrast strength, independent of the directional tensor's anisotropy. It reuses the state texture's alpha channel; contrast is reprojected and exponentially eased at 8/second. Existing four-sample axis interpolation also interpolates contrast. Adaptive detail shrinks marks near contrast, suppresses coarse coverage there and fades in an additional fine lattice. Quiet regions retain the broad treatment. The opaque brush undercoat always covers the image. At zero, the extra layer is disabled and the previous size behavior returns. The parameter increases painting GPU work mainly around contrasting features.

Grid spacing (6–24 rendering pixels) changes vector resolution and the base mark-lattice density. Smaller values yield more, smaller marks and higher GPU work. Changing spacing rebuilds only the field textures and resets field history; the source RGB/depth targets are preserved. Adaptive detail then allocates finer marks locally within that base treatment.

## Edge fitting

Studio → Edge fitting (0–1, default 0.70) independently fits both ends of each curved detail stroke. Six probes per end measure RGB disagreement with the pigment anchor and relative depth discontinuities. Cumulative disagreement keeps a stroke from extending through a sampled contrasting region even if the far endpoint returns to the same color. Width also narrows when either side meets a contrasting region. The control blends continuously toward fitted dimensions; zero disables the probe work and restores the preceding brush shapes. Probe colors only determine the footprint: pigment remains anchored to the mark, and the broad painted undercoat stays opaque. Fitting is evaluated from the current frame; it does not accumulate old pigment. Six finite probes are an approximation and can miss features thinner than their spacing. Broad undercoat marks deliberately retain some edge mixing.

Empty footprint pixels are rejected before the probes. Maximum fitting adds current-frame RGB/depth reads to surviving detail candidates; mobile GPU performance remains device dependent. GPU tests isolate a concave RGB corner with controlled horizontal brush axes, verify reduced spill, and verify unchanged brushwork on a uniform RGB/depth input.

## Town expansion

The nightscape includes 49 additional detailed buildings and 38 connected street/path routes. Artisan lanes, a market square, waterfront inns, hillside quarters, gardens, the existing lakeside hamlet, an observatory, a gazebo, and vine-covered ruins provide destinations. Five bridges connect the neighborhoods and outer circuit. A ridge aqueduct, stone gateways, terraced vines, outlying cottages, and a lantern cloister make the outskirts worth exploring. The lake landing has explicit deck support and a water-collision exemption bounded to its real decking. Building placement reserves street corridors; doors, windows, shutters, balconies, awnings, chimneys, lanterns, benches, pots, stalls, and boats provide ordinary geometry for the image-space painter. Buildings have solid exterior footprints; interiors are not implemented. The guided camera journey crosses the eastern gateway before visiting the town and hills. Desktop geometry is 64,560 triangles per repeating cell, shared by spatial batches rather than duplicated in memory.

The recording adapter validates every marked street and every guided tour segment, walks across all five bridges and onto the landing, checks blocked water immediately beside the deck, and bounds town geometry. Native GLES renders validate twenty viewpoints with raw/paint pairs, including both sides of the gateways, a diagonal seam crossing, and the new destinations. These checks do not establish performance or browser behavior on a physical phone.

## Continuous landscape

The world repeats every 166 units horizontally and 182 units vertically. Camera positions remain continuous through x = ±83 and z = −66 / 116; only terrain and collision queries use canonical coordinates. Periodic terrain, smooth vertex normals, ground colors, river banks, and matching path exits join the cells. Terrain hills form the distant skyline. Neighboring scenery is visible before the player reaches it, and brush history continues through the crossing without a reset.

One shared geometry buffer contains 66 spatial batches. Conservative sphere/frustum tests draw visible batches in the current and neighboring cells, and scenery fades into the horizon between 65 and 150 units. The base renderer and field-history uniforms use camera-relative positions; global camera differences are computed in JavaScript before GPU float conversion so a long walk does not lose subpixel precision.

Native GPU checks compare identical views translated by either period and by ten thousand cells, then compare movement across east/west, north/south, and diagonal seams. Both the source RGB frames and transported field history match after large translations. Run `node research/check.mjs --render` followed by `python research/native_render.py --seams-only` for the focused checks; `--scene-only` renders all twenty viewpoints. `node research/check.mjs --mobile` also validates the coarser mobile terrain.

The original tall cypress stands in the dry meadow at (−6, 22). Thirty-six additional cypresses bring the total to 61 across the town, hills, and outer paths. Placement keeps crowns off river/lake water and new trees clear of street corridors and building footprints.
