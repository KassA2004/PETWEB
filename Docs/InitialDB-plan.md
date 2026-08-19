# Initial Database Schema

This document outlines the structured database for the digital pet simulation application, optimized for a **PostgreSQL + Prisma** stack.

## 1. Tables & Fields

### **User**
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Unique identifier for the user |
| `username` | String | User's display name |
| `email` | String | User's email address |

### **Pet**
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Unique identifier for the pet |
| `ownerId` | UUID (FK) | References `User.id` |
| `environmentId` | UUID (FK) | References `Environment.id` |
| `name` | String | Name of the pet |
| `species` | String | Base species of the pet |
| `appearanceData` | JSON | Stores visual traits (e.g., `{ "body": "blob_03", "eyes": "sleepy_02", "tail": "cloud_01" }`) |
| `personalityData` | JSON | Stores personality attributes and modifiers |
| `stateData` | JSON | Current live state (e.g., `{ "mood": "happy", "energy": 72, "activity": "playing" }`) |
| `createdAt` | DateTime | Timestamp of pet creation |

### **Environment**
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Unique identifier for the environment |
| `ownerId` | UUID (FK) | References `User.id` |
| `name` | String | Name of the environment (e.g., "Kass's Room") |

### **ObjectDefinition**
*Defines what an object fundamentally is, independent of where it is placed or who owns it.*
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Unique identifier for the object definition |
| `type` | String | Object category (e.g., "Moon Lamp", "Mushroom Chair") |
| `appearanceData` | JSON | Visual asset mapping and styling for the object |

### **EnvironmentObject**
*Defines a specific instance of an object placed within an environment.*
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Unique identifier for the placed object instance |
| `environmentId` | UUID (FK) | References `Environment.id` |
| `objectId` | UUID (FK) | References `ObjectDefinition.id` |
| `x` | Float | X-coordinate in the 2D space |
| `y` | Float | Y-coordinate in the 2D space |
| `rotation` | Float | Rotation angle of the object |
| `scale` | Float | Size multiplier of the object |

### **Memory**
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Unique identifier for the memory entry |
| `ownerId` | UUID (FK) | References `User.id` (helps with quick authorization checks) |
| `petId` | UUID (FK) | References `Pet.id` |
| `type` | String | Category of memory |
| `title` | String | Short title of the event |
| `description` | String | Detailed account of the memory |
| `imageUrl` | String | Path/URL to an image snapshot |
| `createdAt` | DateTime | Timestamp of when the memory occurred |

### **InventoryItem**
*Tracks the quantity of an object definition owned by a user.*
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Unique identifier for the inventory record |
| `ownerId` | UUID (FK) | References `User.id` |
| `objectId` | UUID (FK) | References `ObjectDefinition.id` |
| `quantity` | Int | Total number of this specific object owned |

### **Goal**
*(Inferred from the relationship map)*
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Unique identifier for the goal |
| `ownerId` | UUID (FK) | References `User.id` |
| `description`| String | The goal details |

---

## 2. Relationship Map

```text
                    USER
                  /  |  \
                 /   |   \
               PET  GOALS INVENTORY
                |          |
                |          |
             MEMORY    OBJECT DEFINITION
                |          |
                |          |
                └─── ENVIRONMENT OBJECT
                         |
                    ENVIRONMENT
```