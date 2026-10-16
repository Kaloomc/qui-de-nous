import { CODE_LENGTH, usePath } from './lib.js';
import Home from './pages/Home.jsx';
import Host from './pages/Host.jsx';
import Player from './pages/Player.jsx';
import { RecapPage } from './recap.jsx';

/** Version du build (voir vite.config.js), discrète en bas à gauche de tous les écrans. */
const Version = () => <span className="app-version">{__APP_VERSION__}</span>;

const codeRoute = (prefix) => new RegExp(`^/${prefix}/([A-Za-z]{${CODE_LENGTH}})/?$`);

export default function App() {
  const path = usePath();
  return (
    <>
      {route(path)}
      <Version />
    </>
  );
}

function route(path) {
  const host = codeRoute('host').exec(path);
  if (host) {
    const code = host[1].toUpperCase();
    return <Host key={code} code={code} />;
  }

  const join = codeRoute('join').exec(path);
  if (join) {
    const code = join[1].toUpperCase();
    return <Player key={code} code={code} />;
  }

  const recap = codeRoute('recap').exec(path);
  if (recap) {
    const code = recap[1].toUpperCase();
    return <RecapPage key={code} code={code} />;
  }

  return <Home />;
}
