import 'dotenv/config'
import { app } from '../app.js'

const PORT = Number(process.env.PORT) || 8888

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
})
