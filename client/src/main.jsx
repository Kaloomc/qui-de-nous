import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

/** Erreur d'affichage : un message et un bouton plutôt qu'un écran blanc. Recharger reprend la partie (TV ou joueur). */
class ErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page center">
        <h1>Oups</h1>
        <p className="lead">Un souci d’affichage. Recharge la page : tu retrouves ta place dans la partie.</p>
        <button className="btn btn-primary btn-xl" onClick={() => window.location.reload()}>
          Recharger
        </button>
      </main>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
