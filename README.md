# Cubic Adventure

A modular 3D adventure game engine built with Three.js and Cannon.js.

## Architecture

The project follows a standard modular game loop pattern:

- **Core/**: Handles the game lifecycle.
  - `Game.js`: The central hub connecting all systems.
  - `InputManager.js`: Handles Keyboard and Pointer Lock events.
- **Physics/**: Integrates Cannon.js.
  - `PhysicsWorld.js`: Manages the physics simulation and synchronization with visual meshes.
- **Entities/**: Game objects.
  - `Player.js`: A kinematic character controller implementing WASD movement, jumping, and mouse look.
- **World/**: Environment management.
  - `World.js`: Sets up lighting, the ground plane, and test objects.

## Controls

- **WASD**: Move
- **SPACE**: Jump
- **SHIFT**: Move faster (implemented in input, player needs to use it)
- **MOUSE**: Look around
- **CLICK**: Start game / Lock cursor

## Setup

1. `npm install`
2. `npm run dev`
  
## Scalability

This foundation is designed to supports:
- **ECS Pattern**: Entities can be easily extended.
- **Chunk Loading**: The `World` class can be expanded to manage Voxel chunks.
- **Physics**: The separate `PhysicsWorld` class allows swapping the engine or optimizing steps easily.
