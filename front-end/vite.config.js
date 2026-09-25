import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuração padrão do Vite para um projeto React.
// Nenhuma configuração extra é necessária por enquanto — quando o back-end
// (Node.js + Supabase) estiver pronto, um proxy de desenvolvimento pode ser
// adicionado aqui em "server.proxy" para redirecionar chamadas de /api.
export default defineConfig({
  plugins: [react()],
})
