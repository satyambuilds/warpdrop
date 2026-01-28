import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import SendPage from './components/SendPage';
import ReceivePage from './components/ReceivePage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/send/:roomId" element={<SendPage />} />
        <Route path="/transfer/:roomId" element={<ReceivePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
