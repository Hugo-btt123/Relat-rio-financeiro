import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './index.css'
import App from './App.jsx'
import { ProvedorAutenticacao } from './context/AuthContext.jsx'
import { ProvedorToast } from './context/ToastContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ProvedorToast>
        <ProvedorAutenticacao>
          <App />
        </ProvedorAutenticacao>
      </ProvedorToast>
    </BrowserRouter>
  </React.StrictMode>
)
