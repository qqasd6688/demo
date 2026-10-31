# Local rendering runtime

Three.js 0.185.0, copied from the repository's existing local runtime. MIT license: `three/LICENSE`.

Includes the core, OrbitControls, RoundedBoxGeometry, RoomEnvironment, BufferGeometryUtils and the EffectComposer / GTAOPass / OutputPass rendering chain with their official shader and math dependencies. Addons use relative imports of the same local core in development and in the published static site. No CDN or network font dependency.
