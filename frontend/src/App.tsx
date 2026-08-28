import { AuthGate } from './features/auth/AuthGate';

/**
 * The app is a page with a creature living in it.
 *
 * Everything below this line is ordinary React; the PixiJS world is mounted
 * inside one framed component (`PetHabitat`) and never shares a tree with the
 * interface (/Docs/project-overview.md §10).
 */
function App() {
  return <AuthGate />;
}

export default App;
